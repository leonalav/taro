//! Native Git and GitHub integration. Arguments are never interpreted by a shell.
//! Behavior informed by Aider's staged/worktree distinction and OpenCode's bounded
//! Git adapter; this module is an independent implementation (no copied source).
use serde::Serialize;
use std::{
    io::Read,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

const OUTPUT_LIMIT: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub path: String,
    pub original_path: Option<String>,
    pub index: String,
    pub worktree: String,
    pub conflict: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub root: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub unborn: bool,
    pub operation: Option<String>,
    pub changes: Vec<Change>,
    pub branches: Vec<String>,
    pub remote_repository: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub sha: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

fn capture(mut pipe: impl Read + Send + 'static) -> mpsc::Receiver<Result<Vec<u8>, String>> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut result = Vec::new();
        let mut buffer = [0u8; 8192];
        let outcome = loop {
            match pipe.read(&mut buffer) {
                Ok(0) => {
                    break if result.len() > OUTPUT_LIMIT {
                        Err("Git output exceeded the 4 MiB limit; narrow the request".into())
                    } else {
                        Ok(result)
                    }
                }
                Ok(n) => {
                    if result.len() <= OUTPUT_LIMIT {
                        result.extend_from_slice(&buffer[..n]);
                    }
                }
                Err(e) => break Err(e.to_string()),
            }
        };
        let _ = tx.send(outcome);
    });
    rx
}
fn run(executable: &str, cwd: Option<&Path>, args: &[&str]) -> Result<Vec<u8>, String> {
    run_with_timeout(executable, cwd, args, Duration::from_secs(60))
}
fn run_with_timeout(
    executable: &str,
    cwd: Option<&Path>,
    args: &[&str],
    timeout: Duration,
) -> Result<Vec<u8>, String> {
    let mut command = Command::new(executable);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never");
    if let Some(path) = cwd {
        command.current_dir(path);
    }
    let redactions = remote_auth(&mut command, executable, cwd, args)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW | CREATE_SUSPENDED: containment must exist before
        // Git, a credential helper, or a hook can create any descendants.
        command.creation_flags(0x08000004);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let child = command
        .spawn()
        .map_err(|e| format!("Cannot run {executable}: {e}"))?;
    let mut running = Running { child, tree: None };
    running.tree = Some(ProcessTree::new(&running.child)?);
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        #[link(name = "ntdll")]
        extern "system" {
            fn NtResumeProcess(process: *mut std::ffi::c_void) -> i32;
        }
        let result = unsafe { NtResumeProcess(running.child.as_raw_handle() as *mut _) };
        if result < 0 {
            return Err(format!(
                "Cannot resume contained Git process: NTSTATUS {result:#x}"
            ));
        }
    }
    let child = &mut running.child;
    let out = capture(child.stdout.take().unwrap());
    let err = capture(child.stderr.take().unwrap());
    let started = Instant::now();
    let exit = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => break status,
            None if started.elapsed() > timeout => {
                return Err(format!("{executable} timed out after {} ms; its process tree was stopped. Check the repository before retrying.", timeout.as_millis()));
            }
            None => std::thread::sleep(Duration::from_millis(20)),
        }
    };
    // Hooks may have spawned background processes retaining stdout/stderr. End the
    // supervised tree on success too, before waiting for capture pipes to close.
    drop(running);
    let stdout = out
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| "Git output pipe did not close")??;
    let stderr = err
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| "Git error pipe did not close")??;
    if !exit.success() {
        // Git can include credential-bearing remote URLs in its errors. Never send them to UI.
        let mut message = String::from_utf8_lossy(&stderr).into_owned();
        for secret in redactions {
            message = message.replace(&secret, "[redacted]");
        }
        let safe = message
            .split_whitespace()
            .map(|word| {
                if word.contains("://") && word.contains('@') {
                    "[remote URL]"
                } else {
                    word
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
        return Err(if safe.is_empty() {
            format!("{executable} failed ({exit})")
        } else {
            safe.chars().take(4000).collect()
        });
    }
    Ok(stdout)
}

/// Supply HTTPS credentials through this child's environment only; no URL,
/// argv, Git config file, or askpass script ever contains the token.
#[cfg(feature = "desktop")]
fn remote_auth(
    command: &mut Command,
    executable: &str,
    cwd: Option<&Path>,
    args: &[&str],
) -> Result<Vec<String>, String> {
    use base64::Engine;
    if executable != "git" || !args.iter().any(|a| *a == "push" || *a == "pull") {
        return Ok(Vec::new());
    }
    let Some(root) = cwd else {
        return Ok(Vec::new());
    };
    let remote = git_text(root, &["remote", "get-url", "origin"])?;
    if !remote.trim().starts_with("https://github.com/")
        || github_repository(remote.trim()).is_none()
    {
        return Ok(Vec::new());
    }
    let token = keyring::Entry::new("taro", "github:token")
        .ok()
        .and_then(|entry| entry.get_password().ok());
    let Some(token) = token else {
        return Ok(Vec::new());
    };
    let encoded =
        base64::engine::general_purpose::STANDARD.encode(format!("x-access-token:{token}"));
    command
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "http.https://github.com/.extraheader")
        .env(
            "GIT_CONFIG_VALUE_0",
            format!("AUTHORIZATION: basic {encoded}"),
        )
        .env("GIT_TRACE", "0")
        .env("GIT_TRACE_CURL", "0")
        .env("GIT_CURL_VERBOSE", "0")
        .env("GIT_TRACE_PACKET", "0");
    Ok(vec![token, encoded])
}
#[cfg(not(feature = "desktop"))]
fn remote_auth(
    _command: &mut Command,
    _executable: &str,
    _cwd: Option<&Path>,
    _args: &[&str],
) -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

struct Running {
    child: std::process::Child,
    tree: Option<ProcessTree>,
}
impl Drop for Running {
    fn drop(&mut self) {
        self.tree.take();
        let _ = self.child.kill();
        let deadline = Instant::now() + Duration::from_millis(500);
        while Instant::now() < deadline {
            match self.child.try_wait() {
                Ok(Some(_)) | Err(_) => break,
                Ok(None) => std::thread::sleep(Duration::from_millis(5)),
            }
        }
    }
}
#[cfg(windows)]
struct ProcessTree(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
impl ProcessTree {
    fn new(child: &std::process::Child) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(format!(
                    "Cannot create Git process job: {}",
                    std::io::Error::last_os_error()
                ));
            }
            let tree = Self(handle);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                std::mem::size_of_val(&limits) as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle() as *mut _) == 0
            {
                return Err(format!(
                    "Cannot contain Git process tree: {}",
                    std::io::Error::last_os_error()
                ));
            }
            Ok(tree)
        }
    }
}
#[cfg(windows)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
#[cfg(unix)]
struct ProcessTree(u32);
#[cfg(unix)]
impl ProcessTree {
    fn new(child: &std::process::Child) -> Result<Self, String> {
        Ok(Self(child.id()))
    }
}
#[cfg(unix)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        unsafe {
            extern "C" {
                fn kill(pid: i32, signal: i32) -> i32;
            }
            kill(-(self.0 as i32), 9);
        }
    }
}
fn git(root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut full = vec![
        "--literal-pathspecs",
        "-c",
        "core.quotepath=false",
        "-c",
        "core.askpass=",
        "-c",
        "color.ui=false",
    ];
    full.extend_from_slice(args);
    run("git", Some(root), &full)
}
fn text(bytes: Vec<u8>) -> Result<String, String> {
    String::from_utf8(bytes).map_err(|_| {
        "This repository contains filenames or Git output that are not valid UTF-8".into()
    })
}
fn git_text(root: &Path, args: &[&str]) -> Result<String, String> {
    text(git(root, args)?)
}
fn repository(workspace: &str) -> Result<PathBuf, String> {
    if workspace.trim().is_empty() {
        return Err("Choose a workspace folder first".into());
    }
    let root = Path::new(workspace)
        .canonicalize()
        .map_err(|e| format!("Workspace unavailable: {e}"))?;
    let actual = git_text(&root, &["rev-parse", "--show-toplevel"])?;
    let actual = Path::new(actual.trim())
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if actual != root {
        return Err(
            "Choose the repository root as the workspace before using source control".into(),
        );
    }
    Ok(root)
}
fn valid_path(path: &str) -> Result<(), String> {
    if path.is_empty()
        || path.contains('\0')
        || path.contains('\\')
        || Path::new(path)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
        || path.split('/').any(|part| {
            part.eq_ignore_ascii_case(".git") || part == ".." || part == "." || part.is_empty()
        })
    {
        return Err("Only repository-relative file paths outside .git are allowed".into());
    }
    Ok(())
}
fn contained_file(root: &Path, path: &str) -> Result<(), String> {
    valid_path(path)?;
    let mut current = root.to_path_buf();
    for component in Path::new(path).components() {
        current.push(component);
        match std::fs::symlink_metadata(&current) {
            Ok(metadata) => {
                let mut linked = metadata.file_type().is_symlink();
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    linked |= metadata.file_attributes() & 0x400 != 0;
                }
                if linked {
                    return Err("Source control paths through symbolic links or junctions must be handled in your terminal".into());
                }
                if !current
                    .canonicalize()
                    .map_err(|e| e.to_string())?
                    .starts_with(root)
                {
                    return Err("Path escapes the selected repository".into());
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(error) => return Err(error.to_string()),
        }
    }
    if root.join(path).is_dir() {
        return Err("Select individual files; directory and submodule operations must be handled in your terminal".into());
    }
    Ok(())
}
fn head(root: &Path) -> Option<String> {
    git_text(root, &["rev-parse", "--verify", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
}
fn operation(root: &Path) -> Option<String> {
    for (name, label) in [
        ("MERGE_HEAD", "merge"),
        ("REVERT_HEAD", "revert"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase"),
    ] {
        if let Ok(path) = git_text(root, &["rev-parse", "--git-path", name]) {
            if root.join(path.trim()).exists() {
                return Some(label.into());
            }
        }
    }
    None
}
pub fn status(workspace: &str) -> Result<Status, String> {
    let root = repository(workspace)?;
    let raw = git_text(
        &root,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;
    let mut records = raw.split('\0').filter(|s| !s.is_empty());
    let mut changes = Vec::new();
    while let Some(item) = records.next() {
        if item.len() < 4 || !item.is_char_boundary(3) {
            return Err("Malformed Git status record".into());
        }
        let code = &item[..2];
        let original_path = if code.contains('R') || code.contains('C') {
            records.next().map(str::to_string)
        } else {
            None
        };
        changes.push(Change {
            path: item[3..].into(),
            original_path,
            index: code[..1].into(),
            worktree: code[1..2].into(),
            conflict: code.contains('U') || code == "AA" || code == "DD",
        });
    }
    let head = head(&root);
    let branch = git_text(&root, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .ok()
        .map(|s| s.trim().into());
    let branches = git_text(
        &root,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads/"],
    )?
    .lines()
    .map(str::to_string)
    .collect();
    let remote_repository = git_text(&root, &["remote", "get-url", "origin"])
        .ok()
        .and_then(|s| github_repository(s.trim()));
    Ok(Status {
        root: root.to_string_lossy().into(),
        branch,
        unborn: head.is_none(),
        head,
        changes,
        branches,
        operation: operation(&root),
        remote_repository,
    })
}
pub fn stage(workspace: &str, paths: &[String]) -> Result<(), String> {
    let root = repository(workspace)?;
    if paths.is_empty() {
        return Err("Select files to stage".into());
    }
    for path in paths {
        contained_file(&root, path)?;
    }
    let mut args = vec!["add", "--"];
    args.extend(paths.iter().map(String::as_str));
    git(&root, &args).map(|_| ())
}
pub fn unstage(workspace: &str, paths: &[String]) -> Result<(), String> {
    let root = repository(workspace)?;
    if paths.is_empty() {
        return Err("Select files to unstage".into());
    }
    for path in paths {
        contained_file(&root, path)?;
    }
    let mut args = if head(&root).is_some() {
        vec!["restore", "--staged", "--"]
    } else {
        vec!["rm", "--cached", "-f", "--ignore-unmatch", "--"]
    };
    args.extend(paths.iter().map(String::as_str));
    git(&root, &args).map(|_| ())
}
pub fn diff(workspace: &str, path: &str, staged: bool) -> Result<String, String> {
    valid_path(path)?;
    let state = status(workspace)?;
    let root = Path::new(&state.root);
    contained_file(root, path)?;
    if state
        .changes
        .iter()
        .any(|c| c.path == path && c.index == "?")
    {
        // Reading a symlink may escape the repository; preview only regular in-root files.
        let target = root.join(path);
        if std::fs::symlink_metadata(&target)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err("Symlink preview is unavailable".into());
        }
        if !target
            .canonicalize()
            .map_err(|e| e.to_string())?
            .starts_with(root)
        {
            return Err("Path escapes the repository".into());
        }
        let file = std::fs::File::open(target).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        file.take(OUTPUT_LIMIT as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > OUTPUT_LIMIT {
            return Err("File exceeds the 4 MiB preview limit".into());
        }
        return text(bytes).map(|s| format!("Untracked file: {path}\n\n{s}"));
    }
    let mut args = vec!["diff", "--no-ext-diff", "--no-textconv"];
    if staged {
        args.push("--cached");
    }
    args.extend(["--", path]);
    git_text(root, &args)
}
pub fn history(workspace: &str, page: u32) -> Result<Vec<Commit>, String> {
    let root = repository(workspace)?;
    if head(&root).is_none() {
        return Ok(Vec::new());
    }
    if page > 10000 {
        return Err("History page is out of range".into());
    }
    let skip = format!("--skip={}", page * 30);
    let raw = git_text(
        &root,
        &["log", "-30", &skip, "--format=%H%x00%s%x00%an%x00%aI%x00"],
    )?;
    let fields: Vec<_> = raw.split('\0').collect();
    Ok(fields
        .chunks(4)
        .filter(|c| c.len() == 4)
        .map(|c| Commit {
            sha: c[0].trim().into(),
            message: c[1].into(),
            author: c[2].into(),
            date: c[3].into(),
        })
        .collect())
}
pub fn commit(workspace: &str, message: &str) -> Result<String, String> {
    if message.trim().is_empty() || message.len() > 10000 {
        return Err("Enter a commit message (up to 10,000 characters)".into());
    }
    let state = status(workspace)?;
    if state.changes.iter().any(|c| c.conflict) {
        return Err("Resolve all conflicts before committing".into());
    }
    if state.operation.as_deref().is_some_and(|s| s != "merge") {
        return Err("Finish the active Git operation in your terminal first".into());
    }
    if !state
        .changes
        .iter()
        .any(|c| c.index != " " && c.index != "?")
    {
        return Err("No staged changes to commit".into());
    }
    let root = Path::new(&state.root);
    git(root, &["commit", "--no-gpg-sign", "-m", message])?;
    head(root)
        .ok_or_else(|| "Git committed but HEAD could not be read; refresh the repository".into())
}
fn require_clean(state: &Status) -> Result<(), String> {
    if state.operation.is_some() || !state.changes.is_empty() {
        return Err("Commit or stash all changes and finish active Git operations first".into());
    }
    Ok(())
}
pub fn checkout(workspace: &str, branch: &str, create: bool) -> Result<(), String> {
    let state = status(workspace)?;
    require_clean(&state)?;
    let root = Path::new(&state.root);
    git(root, &["check-ref-format", "--branch", branch])?;
    if branch.starts_with('-') || branch == "HEAD" {
        return Err("Invalid branch name".into());
    }
    let args = if create {
        vec!["switch", "-c", branch]
    } else {
        vec!["switch", "--", branch]
    };
    git(root, &args).map(|_| ())
}
pub fn discard(workspace: &str, path: &str) -> Result<(), String> {
    valid_path(path)?;
    let state = status(workspace)?;
    contained_file(Path::new(&state.root), path)?;
    let item = state
        .changes
        .iter()
        .find(|c| c.path == path)
        .ok_or("File is no longer changed; refresh first")?;
    if state.operation.is_some() || item.conflict || item.index != " " {
        return Err(
            "Discard is limited to tracked, unstaged files without staged changes or conflicts"
                .into(),
        );
    }
    git(
        Path::new(&state.root),
        &["restore", "--worktree", "--", path],
    )
    .map(|_| ())
}
pub fn revert(workspace: &str, sha: &str) -> Result<(), String> {
    if !(7..=64).contains(&sha.len()) || !sha.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid commit ID".into());
    }
    let state = status(workspace)?;
    require_clean(&state)?;
    git(
        Path::new(&state.root),
        &["-c", "commit.gpgsign=false", "revert", "--no-edit", sha],
    )
    .map(|_| ())
}
pub fn push(workspace: &str) -> Result<(), String> {
    let state = status(workspace)?;
    if state.operation.is_some() || state.changes.iter().any(|c| c.conflict) {
        return Err("Finish the active Git operation before pushing".into());
    }
    let branch = state
        .branch
        .ok_or("Create or switch to a branch before pushing")?;
    git(
        Path::new(&state.root),
        &["push", "--set-upstream", "origin", &branch],
    )
    .map(|_| ())
}
pub fn pull(workspace: &str) -> Result<(), String> {
    let state = status(workspace)?;
    require_clean(&state)?;
    if state.branch.is_none() {
        return Err("Switch to a branch before pulling".into());
    }
    git(Path::new(&state.root), &["pull", "--ff-only"]).map(|_| ())
}
pub fn valid_repository(repo: &str) -> bool {
    let parts: Vec<_> = repo.split('/').collect();
    parts.len() == 2
        && parts.iter().all(|p| {
            !p.is_empty()
                && *p != "."
                && *p != ".."
                && p.chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
        })
}
pub fn github_repository(remote: &str) -> Option<String> {
    let name = remote
        .strip_prefix("git@github.com:")
        .or_else(|| remote.strip_prefix("https://github.com/"))
        .or_else(|| remote.strip_prefix("ssh://git@github.com/"))?;
    let name = name
        .trim_end_matches('/')
        .strip_suffix(".git")
        .unwrap_or(name.trim_end_matches('/'));
    valid_repository(name).then(|| name.into())
}

#[cfg(test)]
mod process_tests {
    use super::*;
    #[cfg(windows)]
    fn background_script(directory: &Path, wait: bool) -> PathBuf {
        let child = directory.join("child.ps1");
        std::fs::write(
            &child,
            format!(
                "Start-Sleep -Milliseconds 3000\nSet-Content -LiteralPath '{}' -Value escaped\n",
                directory.join("escaped").display()
            ),
        )
        .unwrap();
        // Start the descendant from cmd rather than timing PowerShell startup;
        // concurrent Rust test binaries can otherwise consume the entire timeout
        // before the parent gets as far as launching its child.
        let parent = directory.join("parent.cmd");
        std::fs::write(&parent, format!("@echo off\r\nstart \"\" /b powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"{}\"\r\nif errorlevel 1 exit /b 2\r\necho started>\"{}\"\r\n{}", child.display(), directory.join("started").display(), if wait { "ping.exe -n 16 127.0.0.1 >nul\r\n" } else { "" })).unwrap();
        parent
    }
    #[cfg(windows)]
    #[test]
    fn timeout_stops_the_whole_process_tree() {
        let temp = tempfile::tempdir().unwrap();
        let script = background_script(temp.path(), true);
        let started = Instant::now();
        let error = run_with_timeout(
            "cmd.exe",
            Some(temp.path()),
            &["/D", "/C", script.to_str().unwrap()],
            Duration::from_millis(1800),
        )
        .unwrap_err();
        assert!(error.contains("timed out"), "{error}");
        assert!(started.elapsed() < Duration::from_secs(4));
        assert!(
            temp.path().join("started").exists(),
            "child must actually be launched for this test"
        );
        std::thread::sleep(Duration::from_millis(3500));
        assert!(!temp.path().join("escaped").exists());
    }
    #[cfg(windows)]
    #[test]
    fn successful_parent_cannot_leave_background_children() {
        let temp = tempfile::tempdir().unwrap();
        let script = background_script(temp.path(), false);
        run_with_timeout(
            "cmd.exe",
            Some(temp.path()),
            &["/D", "/C", script.to_str().unwrap()],
            Duration::from_secs(4),
        )
        .unwrap();
        assert!(temp.path().join("started").exists());
        std::thread::sleep(Duration::from_millis(3500));
        assert!(!temp.path().join("escaped").exists());
    }
}

#[cfg(feature = "desktop")]
pub mod ipc {
    use super::*;
    use serde::{de::DeserializeOwned, Deserialize};
    static MUTATION: std::sync::Mutex<()> = std::sync::Mutex::new(());
    async fn blocking<T: Send + 'static>(
        f: impl FnOnce() -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = MUTATION.lock().map_err(|_| "Source control lock failed")?;
            f()
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[tauri::command]
    pub async fn sc_status(workspace_root: String) -> Result<Status, String> {
        blocking(move || status(&workspace_root)).await
    }
    #[tauri::command]
    pub async fn sc_stage(workspace_root: String, paths: Vec<String>) -> Result<(), String> {
        blocking(move || stage(&workspace_root, &paths)).await
    }
    #[tauri::command]
    pub async fn sc_unstage(workspace_root: String, paths: Vec<String>) -> Result<(), String> {
        blocking(move || unstage(&workspace_root, &paths)).await
    }
    #[tauri::command]
    pub async fn sc_diff(
        workspace_root: String,
        path: String,
        staged: bool,
    ) -> Result<String, String> {
        blocking(move || diff(&workspace_root, &path, staged)).await
    }
    #[tauri::command]
    pub async fn sc_history(workspace_root: String, page: u32) -> Result<Vec<Commit>, String> {
        blocking(move || history(&workspace_root, page)).await
    }
    #[tauri::command]
    pub async fn sc_commit(workspace_root: String, message: String) -> Result<String, String> {
        blocking(move || commit(&workspace_root, &message)).await
    }
    #[tauri::command]
    pub async fn sc_checkout(
        workspace_root: String,
        branch: String,
        create: bool,
    ) -> Result<(), String> {
        blocking(move || checkout(&workspace_root, &branch, create)).await
    }
    #[tauri::command]
    pub async fn sc_discard(workspace_root: String, path: String) -> Result<(), String> {
        blocking(move || discard(&workspace_root, &path)).await
    }
    #[tauri::command]
    pub async fn sc_revert(workspace_root: String, sha: String) -> Result<(), String> {
        blocking(move || revert(&workspace_root, &sha)).await
    }
    #[tauri::command]
    pub async fn sc_push(workspace_root: String) -> Result<(), String> {
        blocking(move || push(&workspace_root)).await
    }
    #[tauri::command]
    pub async fn sc_pull(workspace_root: String) -> Result<(), String> {
        blocking(move || pull(&workspace_root)).await
    }

    #[derive(Debug, Serialize, Deserialize)]
    pub struct Account {
        pub login: String,
    }
    #[derive(Debug, Serialize, Deserialize)]
    pub struct Repository {
        pub full_name: String,
        pub default_branch: String,
        pub private: bool,
    }
    #[derive(Debug, Serialize, Deserialize)]
    pub struct Branch {
        pub name: String,
    }
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Page<T: Serialize> {
        pub items: Vec<T>,
        pub has_more: bool,
    }
    #[derive(Serialize, Deserialize)]
    pub struct PullRequest {
        pub html_url: String,
        pub number: u64,
    }
    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new("taro", "github:token").map_err(|e| e.to_string())
    }
    fn credential() -> Result<String, String> {
        entry()?
            .get_password()
            .map_err(|_| "Connect GitHub in Source Control settings first".into())
    }
    fn client() -> Result<reqwest::Client, String> {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Taro-desktop")
            .build()
            .map_err(|e| e.to_string())
    }
    async fn response<T: DeserializeOwned>(reply: reqwest::Response) -> Result<T, String> {
        if !reply.status().is_success() {
            return Err(format!("GitHub returned HTTP {}. Check token access, repository permissions, and rate limits.", reply.status()));
        }
        if reply
            .content_length()
            .is_some_and(|n| n > OUTPUT_LIMIT as u64)
        {
            return Err("GitHub response exceeds the size limit".into());
        }
        let mut reply = reply;
        let mut bytes = Vec::new();
        while let Some(chunk) = reply
            .chunk()
            .await
            .map_err(|_| "GitHub response interrupted")?
        {
            if bytes.len() + chunk.len() > OUTPUT_LIMIT {
                return Err("GitHub response exceeds the size limit".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| "GitHub returned an unexpected response".into())
    }
    async fn get<T: DeserializeOwned>(path: &str, token: &str) -> Result<T, String> {
        get_from_url(&format!("https://api.github.com{path}"), token).await
    }
    async fn get_from_url<T: DeserializeOwned>(url: &str, token: &str) -> Result<T, String> {
        response(
            client()?
                .get(url)
                .header("Accept", "application/vnd.github+json")
                .bearer_auth(token)
                .send()
                .await
                .map_err(|_| "Cannot reach GitHub; check your network")?,
        )
        .await
    }
    #[tauri::command]
    pub async fn sc_github_account() -> Result<Account, String> {
        get("/user", &credential()?).await
    }
    #[tauri::command]
    pub async fn sc_github_connect(token: String, use_gh: bool) -> Result<Account, String> {
        let token = if use_gh {
            text(
                blocking(|| run("gh", None, &["auth", "token", "--hostname", "github.com"]))
                    .await?,
            )?
            .trim()
            .to_string()
        } else {
            token.trim().to_string()
        };
        if token.is_empty() || token.len() > 1000 || token.chars().any(char::is_whitespace) {
            return Err("Enter a valid GitHub access token, or run gh auth login first".into());
        }
        let account: Account = get("/user", &token).await?;
        entry()?
            .set_password(&token)
            .map_err(|e| format!("Cannot save token in OS credential store: {e}"))?;
        Ok(account)
    }
    #[tauri::command]
    pub async fn sc_github_disconnect() -> Result<(), String> {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
    fn page_number(page: u32) -> Result<(), String> {
        if page == 0 || page > 10000 {
            Err("Invalid page number".into())
        } else {
            Ok(())
        }
    }
    #[tauri::command]
    pub async fn sc_github_repositories(page: u32) -> Result<Page<Repository>, String> {
        page_number(page)?;
        let items: Vec<Repository> = get(&format!("/user/repos?per_page=50&page={page}&sort=updated&affiliation=owner,collaborator,organization_member"), &credential()?).await?;
        Ok(Page {
            has_more: items.len() == 50,
            items,
        })
    }
    #[tauri::command]
    pub async fn sc_github_branches(repository: String, page: u32) -> Result<Page<Branch>, String> {
        page_number(page)?;
        if !valid_repository(&repository) {
            return Err("Invalid GitHub repository name".into());
        }
        let items: Vec<Branch> = get(
            &format!("/repos/{repository}/branches?per_page=50&page={page}"),
            &credential()?,
        )
        .await?;
        Ok(Page {
            has_more: items.len() == 50,
            items,
        })
    }
    #[tauri::command]
    pub async fn sc_github_pull_request(
        workspace_root: String,
        repository: String,
        base: String,
        title: String,
        body: String,
    ) -> Result<PullRequest, String> {
        if !valid_repository(&repository)
            || title.trim().is_empty()
            || title.len() > 256
            || body.len() > 65000
            || base.trim().is_empty()
        {
            return Err("Enter a repository, base branch and PR title".into());
        }
        let state = blocking(move || status(&workspace_root)).await?;
        require_clean(&state)?;
        if state
            .remote_repository
            .as_deref()
            .map(str::to_ascii_lowercase)
            .as_deref()
            != Some(repository.to_ascii_lowercase().as_str())
        {
            return Err(
                "Selected GitHub repository does not match this workspace's origin remote".into(),
            );
        }
        let branch = state
            .branch
            .ok_or("Switch to a branch before opening a pull request")?;
        if branch == base {
            return Err("Choose a different base branch for the pull request".into());
        }
        response(client()?.post(format!("https://api.github.com/repos/{repository}/pulls")).header("Accept", "application/vnd.github+json").bearer_auth(credential()?).json(&serde_json::json!({"title": title, "body": body, "head": branch, "base": base})).send().await.map_err(|_| "Cannot reach GitHub; check your network")?).await
    }

    #[cfg(test)]
    mod github_http_tests {
        use super::*;
        use std::{
            io::{Read, Write},
            net::TcpListener,
        };
        fn server(
            status: &str,
            body: &str,
            claimed_length: Option<usize>,
        ) -> (String, mpsc::Receiver<String>) {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let reply = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", claimed_length.unwrap_or(body.len()));
            let (tx, rx) = mpsc::channel();
            std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut request = Vec::new();
                let mut buffer = [0u8; 1024];
                while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                    let n = socket.read(&mut buffer).unwrap();
                    if n == 0 {
                        break;
                    }
                    request.extend_from_slice(&buffer[..n]);
                }
                let _ = tx.send(String::from_utf8_lossy(&request).into_owned());
                let _ = socket.write_all(reply.as_bytes());
            });
            (format!("http://{address}/user"), rx)
        }
        #[tokio::test(flavor = "current_thread")]
        async fn authenticates_over_http_and_decodes_verified_account() {
            let (url, request) = server("200 OK", r#"{"login":"verified-user"}"#, None);
            let account: Account = get_from_url(&url, "local-test-token").await.unwrap();
            assert_eq!(account.login, "verified-user");
            let request = request
                .recv_timeout(Duration::from_secs(3))
                .unwrap()
                .to_ascii_lowercase();
            assert!(request.contains("authorization: bearer local-test-token\r\n"));
            assert!(request.contains("accept: application/vnd.github+json\r\n"));
        }
        #[tokio::test(flavor = "current_thread")]
        async fn rejects_revoked_credentials_rate_limits_and_malformed_or_oversized_responses() {
            for status in ["401 Unauthorized", "403 Forbidden", "429 Too Many Requests"] {
                let (url, _) = server(status, r#"{"message":"local-test-token"}"#, None);
                let error = get_from_url::<Account>(&url, "local-test-token")
                    .await
                    .unwrap_err();
                assert!(error.contains(&status[..3]), "{error}");
                assert!(!error.contains("local-test-token"));
            }
            let (url, _) = server("200 OK", "not json", None);
            assert!(get_from_url::<Account>(&url, "token")
                .await
                .unwrap_err()
                .contains("unexpected response"));
            let (url, _) = server("200 OK", "{}", Some(OUTPUT_LIMIT + 1));
            assert!(get_from_url::<Account>(&url, "token")
                .await
                .unwrap_err()
                .contains("size limit"));
        }
    }
}
