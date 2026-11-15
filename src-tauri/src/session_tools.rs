//! Workspace-contained plan, Git worktree, and skill sessions.

use crate::agent_tools::ToolOutput;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap},
    fs::{self, OpenOptions},
    hash::{Hash, Hasher},
    io::Read,
    path::{Component, Path, PathBuf},
    process::{Child, Command, Output, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone)]
struct Plan {
    path: PathBuf,
    name: String,
    kind: String,
    active: bool,
    preview: Option<String>,
}

#[derive(Clone)]
struct Worktree {
    path: PathBuf,
    branch: String,
    original_head: String,
    common_dir: PathBuf,
}

#[derive(Default)]
struct Session {
    plan: Option<Plan>,
    worktree: Option<Worktree>,
}

type SessionKey = (PathBuf, String);
static SESSIONS: OnceLock<Mutex<HashMap<SessionKey, Session>>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(0);

fn sessions() -> &'static Mutex<HashMap<SessionKey, Session>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn canonical_root(root: &Path) -> Result<PathBuf, String> {
    let path = fs::canonicalize(root).map_err(|e| format!("Workspace is unavailable: {e}"))?;
    if !path.is_dir() {
        return Err("Workspace must be a directory".into());
    }
    Ok(path)
}

fn key(root: &Path, scope: &str) -> Result<SessionKey, String> {
    if scope.trim().is_empty() {
        return Err("A chat session scope is required".into());
    }
    Ok((canonical_root(root)?, scope.into()))
}

/// Internal paths must be simple relative paths, with no links/junctions in their ancestry.
/// Checking every existing component also catches dangling links before directory creation.
fn contained(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    let mut path = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(part) = component else {
            return Err("Unsafe workspace path".into());
        };
        path.push(part);
        match fs::symlink_metadata(&path) {
            Ok(meta) => {
                if is_link(&meta) {
                    return Err(format!(
                        "Symbolic links and junctions are not allowed here: {}",
                        path.display()
                    ));
                }
                let resolved = fs::canonicalize(&path).map_err(|e| e.to_string())?;
                if !resolved.starts_with(root) {
                    return Err("Path is outside the selected workspace".into());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(path)
}

fn is_link(meta: &fs::Metadata) -> bool {
    if meta.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // Includes directory junctions and all other reparse-point redirects.
        if meta.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    false
}

fn safe_directory(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = contained(root, Path::new(relative))?;
    fs::create_dir_all(&path).map_err(|e| format!("Cannot create session directory: {e}"))?;
    contained(root, Path::new(relative))?;
    Ok(path)
}

fn slug(name: &str) -> String {
    let mut result = String::new();
    for c in name.chars().take(80) {
        if c.is_ascii_alphanumeric() {
            result.push(c.to_ascii_lowercase());
        } else if !result.is_empty() && !result.ends_with('-') {
            result.push('-');
        }
    }
    let result = result.trim_matches('-');
    if result.is_empty() {
        "session".into()
    } else {
        result.into()
    }
}

fn unique_slug(name: &str, scope: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    scope.hash(&mut hasher);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!(
        "{}-{:x}-{:x}-{:x}",
        slug(name),
        hasher.finish(),
        now,
        NEXT_ID.fetch_add(1, Ordering::Relaxed)
    )
}

fn result(text: String, artifact: Value) -> ToolOutput {
    ToolOutput { text, artifact }
}

pub fn effective_root(root: &Path, scope: &str) -> Result<PathBuf, String> {
    let key = key(root, scope)?;
    let registry = sessions()
        .lock()
        .map_err(|_| "Session registry is unavailable")?;
    match registry.get(&key).and_then(|s| s.worktree.as_ref()) {
        Some(worktree) => {
            validate_worktree(&key.0, worktree)?;
            Ok(worktree.path.clone())
        }
        None => Ok(key.0),
    }
}

pub fn is_plan_mode(root: &Path, scope: &str) -> bool {
    key(root, scope)
        .ok()
        .and_then(|key| {
            sessions().lock().ok().map(|r| {
                r.get(&key)
                    .and_then(|s| s.plan.as_ref())
                    .is_some_and(|p| p.active)
            })
        })
        .unwrap_or(false)
}

/// This check must run before dispatch of every native tool, including shell/Agent/MCP.
pub fn guard_tool(root: &Path, scope: &str, name: &str, input: &Value) -> Result<(), String> {
    let key = key(root, scope)?;
    let registry = sessions()
        .lock()
        .map_err(|_| "Session registry is unavailable")?;
    guard_session(&key.0, registry.get(&key), name, input)
}

fn guard_session(
    root: &Path,
    session: Option<&Session>,
    name: &str,
    input: &Value,
) -> Result<(), String> {
    let Some(plan) = session.and_then(|s| s.plan.as_ref()).filter(|p| p.active) else {
        return Ok(());
    };
    if matches!(
        name,
        "Read"
            | "WebSearch"
            | "WebFetch"
            | "ListFiles"
            | "Glob"
            | "Grep"
            | "LSP"
            | "ToolSearch"
            | "TaskOutput"
            | "TaskStop"
            | "StopChildTasks"
            | "Skill"
            | "EnterPlanMode"
            | "ExitPlanMode"
    ) {
        return Ok(());
    }
    if name == "Agent"
        && matches!(
            input.get("subagent_type").and_then(Value::as_str),
            Some("Explore" | "Plan")
        )
        && input.get("isolation").is_none_or(Value::is_null)
    {
        return Ok(());
    }
    if matches!(name, "Write" | "Edit") {
        let path = input
            .get("file_path")
            .and_then(Value::as_str)
            .ok_or("Missing file_path")?;
        let supplied = Path::new(path);
        if supplied
            .components()
            .any(|c| matches!(c, Component::ParentDir))
        {
            return Err("Plan paths cannot contain parent traversal".into());
        }
        let current = session
            .and_then(|s| s.worktree.as_ref())
            .map(|w| w.path.as_path())
            .unwrap_or(root);
        let candidate = if supplied.is_absolute() {
            supplied.to_path_buf()
        } else {
            current.join(supplied)
        };
        let canonical =
            fs::canonicalize(&candidate).map_err(|e| format!("Plan file is unavailable: {e}"))?;
        validate_plan_path(root, plan)?;
        if canonical == plan.path
            && !is_link(&fs::symlink_metadata(&candidate).map_err(|e| e.to_string())?)
        {
            return Ok(());
        }
    }
    Err(format!(
        "{name} is blocked in plan mode. Only read-only tools and Write/Edit to {} are allowed.",
        plan.path.display()
    ))
}

fn validate_plan_path(root: &Path, plan: &Plan) -> Result<(), String> {
    let relative = plan
        .path
        .strip_prefix(root)
        .map_err(|_| "Plan file is outside the original workspace")?;
    let checked = contained(root, relative)?;
    if fs::canonicalize(&checked).map_err(|e| format!("Plan file is unavailable: {e}"))?
        != plan.path
        || !checked.is_file()
    {
        return Err("Plan file is unavailable or moved".into());
    }
    Ok(())
}

pub async fn execute(
    name: &str,
    input: &Value,
    root: &Path,
    scope: &str,
    approved: bool,
) -> Result<ToolOutput, String> {
    let key = key(root, scope)?;
    let root = &key.0;
    // Serialize state changes with validation and Git commands, preventing two entries
    // or an approved exit racing a plan update through another session-tool call.
    let mut registry = sessions()
        .lock()
        .map_err(|_| "Session registry is unavailable")?;
    guard_session(root, registry.get(&key), name, input)?;
    if name == "EnterWorktree" && approved {
        if let Some(path) = input.get("resume_path").and_then(Value::as_str) {
            let path = fs::canonicalize(path).map_err(|e| format!("Retained worktree is unavailable: {e}"))?;
            if registry.values().any(|entry| entry.worktree.as_ref().is_some_and(|worktree| worktree.path == path)) {
                return Err("The retained worktree is still assigned to another active scope.".into());
            }
        }
    }
    let session = registry.entry(key.clone()).or_default();
    match name {
        "EnterPlanMode" => {
            if let Some(plan) = session.plan.as_ref().filter(|p| p.active) {
                validate_plan_path(root, plan)?;
                return Ok(plan_entered(plan));
            }
            let title = input
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Implementation plan")
                .trim();
            if title.is_empty() || title.len() > 500 {
                return Err("Plan name must contain 1–500 characters".into());
            }
            let kind = input.get("kind").and_then(Value::as_str).unwrap_or("Plan");
            if !matches!(kind, "Plan" | "Design Plan") {
                return Err("Plan kind must be Plan or Design Plan".into());
            }
            let current = session
                .worktree
                .as_ref()
                .map(|w| w.path.as_path())
                .unwrap_or(root);
            if let Some(w) = &session.worktree {
                validate_worktree(root, w)?;
            }
            let directory = safe_directory(current, ".taro/plans")?;
            let path = directory.join(format!("{}.md", unique_slug(title, scope)));
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
                .map_err(|e| format!("Cannot create plan file: {e}"))?;
            let plan = Plan {
                path: fs::canonicalize(path).map_err(|e| e.to_string())?,
                name: title.into(),
                kind: kind.into(),
                active: true,
                preview: None,
            };
            let output = plan_entered(&plan);
            session.plan = Some(plan);
            Ok(output)
        }
        "ExitPlanMode" => {
            let plan =
                session.plan.as_mut().filter(|p| p.active).ok_or(
                    "This chat is not in plan mode; enter plan mode and write a plan first",
                )?;
            validate_plan_path(root, plan)?;
            let markdown = read_text(&plan.path, "Plan")?;
            if markdown.trim().is_empty() {
                return Err(
                    "The plan file is empty. Write the actual plan before requesting approval."
                        .into(),
                );
            }
            if approved {
                if plan.preview.as_deref() != Some(markdown.as_str()) {
                    return Err("Plan approval requires a preview of the current file. Call ExitPlanMode without approval to show it again.".into());
                }
                plan.active = false;
                plan.preview = None;
            } else {
                plan.preview = Some(markdown.clone());
            }
            Ok(result(
                if approved {
                    "Plan approved; plan mode exited.".into()
                } else {
                    "Plan loaded from disk for approval. Plan mode remains active until the user approves this preview.".into()
                },
                json!({"kind":"plan","path":plan.path,"name":plan.name,"markdown":markdown,"planKind":plan.kind,"approvalRequired":!approved,"active":plan.active}),
            ))
        }
        "EnterWorktree" => enter_worktree(root, scope, input, approved, session),
        "ExitWorktree" => exit_worktree(root, input, approved, session),
        "Skill" => {
            let current = session
                .worktree
                .as_ref()
                .map(|w| w.path.as_path())
                .unwrap_or(root);
            if let Some(w) = &session.worktree {
                validate_worktree(root, w)?;
            }
            load_skill(current, input)
        }
        _ => Err(format!("Unknown session tool: {name}")),
    }
}

fn plan_entered(plan: &Plan) -> ToolOutput {
    result(format!("Plan mode active. Read the workspace and write your plan to {}. All other mutations are blocked.", plan.path.display()),
        json!({"kind":"plan-mode","active":true,"path":plan.path,"name":plan.name,"planKind":plan.kind}))
}

fn read_text(path: &Path, label: &str) -> Result<String, String> {
    if fs::metadata(path)
        .map_err(|e| format!("{label} is unavailable: {e}"))?
        .len()
        > 2_000_000
    {
        return Err(format!("{label} exceeds the 2 MB limit"));
    }
    fs::read_to_string(path).map_err(|e| format!("Cannot read {label}: {e}"))
}

fn git(root: &Path, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new("git");
    // Rust canonical paths use Win32 extended prefixes, which Git for Windows
    // does not accept as worktree arguments. Keep validation canonical and pass
    // the equivalent normal Windows spelling only at the process boundary.
    let args: Vec<String> = args.iter().map(|arg| git_argument(arg)).collect();
    command
        .current_dir(root)
        .args(&args)
        .env("GIT_TERMINAL_PROMPT", "0");
    let output = bounded_output(&mut command, Duration::from_secs(30), 2_000_000)
        .map_err(|e| format!("Cannot complete Git command (Git must be installed on PATH): {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "Git {} failed: {}",
            args.first().map(String::as_str).unwrap_or("command"),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    String::from_utf8(output.stdout).map_err(|_| "Git returned invalid UTF-8".into())
}

/// Use files instead of pipes: a descendant inheriting stdout cannot keep a
/// reader thread blocked after the Git process exits. The temporary directory
/// is exclusively created, and cleanup removes only the exact files we own.
struct CommandCapture {
    directory: PathBuf,
    stdout: PathBuf,
    stderr: PathBuf,
}

impl CommandCapture {
    fn new() -> Result<Self, String> {
        let directory = std::env::temp_dir().join(format!(
            "taro-git-{}-{}",
            std::process::id(),
            unique_slug("capture", "native")
        ));
        fs::create_dir(&directory)
            .map_err(|e| format!("Cannot create Git output directory: {e}"))?;
        Ok(Self {
            stdout: directory.join("stdout"),
            stderr: directory.join("stderr"),
            directory,
        })
    }

    fn redirect(&self, command: &mut Command) -> Result<(), String> {
        let stdout = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&self.stdout)
            .map_err(|e| e.to_string())?;
        let stderr = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&self.stderr)
            .map_err(|e| e.to_string())?;
        command
            .stdout(Stdio::from(stdout))
            .stderr(Stdio::from(stderr))
            .stdin(Stdio::null());
        Ok(())
    }

    fn exceeds(&self, limit: usize) -> Result<bool, String> {
        for path in [&self.stdout, &self.stderr] {
            if fs::metadata(path).map_err(|e| e.to_string())?.len() > limit as u64 {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn read(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
        let mut bytes = Vec::new();
        fs::File::open(path)
            .map_err(|e| e.to_string())?
            .take(limit as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > limit {
            return Err("Git command exceeded its output limit".into());
        }
        Ok(bytes)
    }
}

impl Drop for CommandCapture {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.stdout);
        let _ = fs::remove_file(&self.stderr);
        let _ = fs::remove_dir(&self.directory);
    }
}

struct BoundedChild {
    child: Child,
    tree: Option<CommandTree>,
}

impl Drop for BoundedChild {
    fn drop(&mut self) {
        // A successful Git parent may leave background hook descendants too.
        // Closing the job/killing the process group ends them on every path.
        self.tree.take();
        let _ = self.child.kill();
        let until = Instant::now() + Duration::from_millis(500);
        while Instant::now() < until {
            match self.child.try_wait() {
                Ok(Some(_)) | Err(_) => break,
                Ok(None) => std::thread::sleep(Duration::from_millis(5)),
            }
        }
    }
}

fn bounded_output(
    command: &mut Command,
    timeout: Duration,
    limit: usize,
) -> Result<Output, String> {
    let capture = CommandCapture::new()?;
    capture.redirect(command)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut running = BoundedChild {
        child: command
            .spawn()
            .map_err(|e| format!("Cannot start process: {e}"))?,
        tree: None,
    };
    running.tree = Some(CommandTree::new(&running.child)?);
    let deadline = Instant::now() + timeout;
    let status = loop {
        if capture.exceeds(limit)? {
            return Err("Git command exceeded its output limit".into());
        }
        if let Some(status) = running.child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if Instant::now() >= deadline {
            return Err(format!(
                "Git command timed out after {} ms; its process tree was stopped",
                timeout.as_millis()
            ));
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    drop(running);
    Ok(Output {
        status,
        stdout: CommandCapture::read(&capture.stdout, limit)?,
        stderr: CommandCapture::read(&capture.stderr, limit)?,
    })
}

#[cfg(windows)]
struct CommandTree(usize);

#[cfg(windows)]
mod command_job {
    use std::ffi::c_void;
    #[repr(C)]
    #[derive(Default)]
    pub struct BasicLimits {
        pub process_time: i64,
        pub job_time: i64,
        pub flags: u32,
        pub min: usize,
        pub max: usize,
        pub active: u32,
        pub affinity: usize,
        pub priority: u32,
        pub scheduling: u32,
    }
    #[repr(C)]
    #[derive(Default)]
    pub struct IoCounters {
        pub values: [u64; 6],
    }
    #[repr(C)]
    #[derive(Default)]
    pub struct ExtendedLimits {
        pub basic: BasicLimits,
        pub io: IoCounters,
        pub process_memory: usize,
        pub job_memory: usize,
        pub peak_process: usize,
        pub peak_job: usize,
    }
    #[link(name = "kernel32")]
    extern "system" {
        pub fn CreateJobObjectW(attributes: *const c_void, name: *const u16) -> *mut c_void;
        pub fn SetInformationJobObject(
            job: *mut c_void,
            class: i32,
            info: *const c_void,
            size: u32,
        ) -> i32;
        pub fn AssignProcessToJobObject(job: *mut c_void, process: *mut c_void) -> i32;
        pub fn CloseHandle(handle: *mut c_void) -> i32;
    }
}

#[cfg(windows)]
impl CommandTree {
    fn new(child: &Child) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        unsafe {
            let handle = command_job::CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(format!(
                    "Cannot create Git process job: {}",
                    std::io::Error::last_os_error()
                ));
            }
            let tree = Self(handle as usize);
            let mut limits = command_job::ExtendedLimits::default();
            limits.basic.flags = 0x0000_2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if command_job::SetInformationJobObject(
                handle,
                9,
                &limits as *const _ as *const _,
                std::mem::size_of_val(&limits) as u32,
            ) == 0
                || command_job::AssignProcessToJobObject(handle, child.as_raw_handle() as *mut _)
                    == 0
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
impl Drop for CommandTree {
    fn drop(&mut self) {
        unsafe {
            command_job::CloseHandle(self.0 as *mut _);
        }
    }
}

#[cfg(unix)]
struct CommandTree(u32);

#[cfg(unix)]
impl CommandTree {
    fn new(child: &Child) -> Result<Self, String> {
        Ok(Self(child.id()))
    }
}

#[cfg(unix)]
impl Drop for CommandTree {
    fn drop(&mut self) {
        unsafe {
            extern "C" {
                fn kill(pid: i32, signal: i32) -> i32;
            }
            kill(-(self.0 as i32), 9);
        }
    }
}

fn git_argument(arg: &str) -> String {
    #[cfg(windows)]
    {
        if let Some(path) = arg.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{path}");
        }
        if let Some(path) = arg.strip_prefix(r"\\?\") {
            return path.into();
        }
    }
    arg.into()
}

fn git_path(root: &Path, argument: &str) -> Result<PathBuf, String> {
    let output = git(root, &["rev-parse", "--path-format=absolute", argument])?;
    fs::canonicalize(output.trim()).map_err(|e| format!("Cannot verify Git repository path: {e}"))
}

fn validate_worktree(root: &Path, worktree: &Worktree) -> Result<(), String> {
    let relative = worktree
        .path
        .strip_prefix(root)
        .map_err(|_| "Worktree is outside the selected workspace")?;
    if !relative.starts_with(Path::new(".taro/worktrees")) || relative.components().count() != 3 {
        return Err("Refusing a worktree path not created by this session".into());
    }
    let checked = contained(root, relative)?;
    if fs::canonicalize(&checked).map_err(|e| format!("Worktree is unavailable: {e}"))?
        != worktree.path
    {
        return Err("Worktree path changed since creation".into());
    }
    if git_path(&worktree.path, "--show-toplevel")? != worktree.path
        || git_path(&worktree.path, "--git-common-dir")? != worktree.common_dir
        || git_path(root, "--git-common-dir")? != worktree.common_dir
    {
        return Err("Worktree no longer belongs to the original repository".into());
    }
    Ok(())
}

fn enter_worktree(
    root: &Path,
    scope: &str,
    input: &Value,
    approved: bool,
    session: &mut Session,
) -> Result<ToolOutput, String> {
    if !approved {
        return Err("User approval is required to create a worktree".into());
    }
    if session.worktree.is_some() {
        return Err("This chat already has an active worktree; exit it first".into());
    }
    if git_path(root, "--show-toplevel")? != root {
        return Err("Select the Git repository root before creating a worktree".into());
    }
    let original_head = git(root, &["rev-parse", "--verify", "HEAD^{commit}"])?
        .trim()
        .to_owned();
    let common_dir = git_path(root, "--git-common-dir")?;
    if let Some(value) = input.get("resume_path") {
        let requested = value.as_str().ok_or("resume_path must be an absolute worktree path")?;
        if !Path::new(requested).is_absolute() {
            return Err("resume_path must be an absolute worktree path".into());
        }
        let path = fs::canonicalize(requested).map_err(|e| format!("Retained worktree is unavailable: {e}"))?;
        let id = path.file_name().and_then(|name| name.to_str()).ok_or("Invalid retained worktree name")?;
        let branch = format!("taro/{id}");
        let worktree = Worktree { path, branch, original_head, common_dir };
        validate_worktree(root, &worktree)?;
        let active_branch = git(&worktree.path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
        if active_branch.trim() != worktree.branch {
            return Err("The retained worktree is no longer on its Taro branch.".into());
        }
        let output = result(
            format!("Reopened retained worktree at {}.", worktree.path.display()),
            json!({"kind":"worktree","action":"resume","worktreePath":worktree.path,"worktreeBranch":worktree.branch,"originalRoot":root,"originalHead":worktree.original_head,"active":true}),
        );
        session.worktree = Some(worktree);
        return Ok(output);
    }
    let name = input
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("worktree");
    let id = unique_slug(name, scope);
    let parent = safe_directory(root, ".taro/worktrees")?;
    let path = parent.join(&id);
    let branch = format!("taro/{id}");
    let path_arg = path.to_str().ok_or("Worktree path is not valid UTF-8")?;
    git(
        root,
        &[
            "worktree",
            "add",
            "-b",
            &branch,
            "--",
            path_arg,
            &original_head,
        ],
    )?;
    let worktree = Worktree {
        path: fs::canonicalize(path).map_err(|e| e.to_string())?,
        branch,
        original_head,
        common_dir,
    };
    validate_worktree(root, &worktree)?;
    let output = result(
        format!(
            "Created worktree at {} on {}. Subsequent tools in this chat use that workspace.",
            worktree.path.display(),
            worktree.branch
        ),
        json!({"kind":"worktree","action":"enter","worktreePath":worktree.path,"worktreeBranch":worktree.branch,"originalRoot":root,"originalHead":worktree.original_head,"active":true}),
    );
    session.worktree = Some(worktree);
    Ok(output)
}

fn exit_worktree(
    root: &Path,
    input: &Value,
    approved: bool,
    session: &mut Session,
) -> Result<ToolOutput, String> {
    let worktree = session
        .worktree
        .as_ref()
        .ok_or("This chat has no active worktree")?;
    let action = input
        .get("action")
        .and_then(Value::as_str)
        .ok_or("Missing action: use keep or remove")?;
    if !matches!(action, "keep" | "remove") {
        return Err("Worktree action must be keep or remove".into());
    }
    if action == "remove" && !approved {
        return Err("User approval is required to remove a worktree".into());
    }
    validate_worktree(root, worktree)?;
    let mut changed_files = 0;
    let mut commits = 0;
    if action == "remove" {
        let branch = git(
            &worktree.path,
            &["symbolic-ref", "--quiet", "--short", "HEAD"],
        )?;
        if branch.trim() != worktree.branch {
            return Err(
                "Worktree branch changed; keep the worktree and inspect it manually".into(),
            );
        }
        let status = git(
            &worktree.path,
            &[
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
                "--ignored",
            ],
        )?;
        changed_files = status.split('\0').filter(|part| !part.is_empty()).count();
        let original = git(root, &["rev-parse", "--verify", "HEAD^{commit}"])?
            .trim()
            .to_owned();
        let range = format!("{original}..{}", worktree.branch);
        commits = git(root, &["rev-list", "--count", &range])?
            .trim()
            .parse::<u64>()
            .map_err(|_| "Cannot verify unmerged worktree commits")?;
        let discard = input
            .get("discard_changes")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if (changed_files > 0 || commits > 0) && !discard {
            return Err(format!("Worktree has {changed_files} uncommitted/ignored file entries and {commits} unmerged commits. Keep it, or explicitly approve removal with discard_changes: true."));
        }
        let path_arg = worktree
            .path
            .to_str()
            .ok_or("Worktree path is not valid UTF-8")?;
        if discard {
            git(root, &["worktree", "remove", "--force", "--", path_arg])?;
        } else {
            git(root, &["worktree", "remove", "--", path_arg])?;
        }
        // Delete only the exact generated branch, after Git removed the verified worktree.
        let branch_result = if discard {
            git(root, &["branch", "-D", "--", &worktree.branch])
        } else {
            git(root, &["branch", "-d", "--", &worktree.branch])
        };
        if let Err(error) = branch_result {
            let output = result(format!("Worktree removed and original workspace restored. Its branch was preserved because cleanup failed: {error}"),
                json!({"kind":"worktree","action":action,"worktreePath":worktree.path,"worktreeBranch":worktree.branch,"originalRoot":root,"originalHead":worktree.original_head,"active":false,"branchPreserved":true,"warning":error,"discardedFiles":changed_files,"discardedCommits":commits}));
            session.worktree = None;
            return Ok(output);
        }
    }
    let output = result(
        format!(
            "Worktree {}. This chat now uses {}.",
            if action == "keep" {
                "preserved on disk with its branch"
            } else {
                "removed"
            },
            root.display()
        ),
        json!({"kind":"worktree","action":action,"worktreePath":worktree.path,"worktreeBranch":worktree.branch,"originalRoot":root,"originalHead":worktree.original_head,"active":false,"discardedFiles":changed_files,"discardedCommits":commits}),
    );
    session.worktree = None;
    Ok(output)
}

fn skill_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 120
        && name != "."
        && name != ".."
        && !name.starts_with(".import-")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

fn discover_skills(root: &Path) -> Result<BTreeMap<String, PathBuf>, String> {
    let mut found = BTreeMap::new();
    for base in [".taro/skills", ".claude/skills", ".agents/skills", ".codex/skills", ".opencode/skills"] {
        let directory = contained(root, Path::new(base))?;
        if !directory.exists() {
            continue;
        }
        let entries = fs::read_dir(&directory).map_err(|e| format!("Cannot read skills: {e}"))?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().to_string();
            if !skill_name(&name) {
                continue;
            }
            let relative = Path::new(base).join(&name).join("SKILL.md");
            // Linked skills are never discovered or followed, even if their target is local.
            if let Ok(path) = contained(root, &relative) {
                if path.is_file() {
                    found.entry(name).or_insert(path);
                }
            }
        }
    }
    Ok(found)
}

fn scalar(value: &str) -> String {
    let value = value.trim();
    if value.len() >= 2
        && ((value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\'')))
    {
        value[1..value.len() - 1].into()
    } else {
        value.into()
    }
}

fn parse_skill(source: &str) -> Result<(String, String, Vec<String>, Option<String>), String> {
    let normalized = source.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    if !normalized.starts_with("---\n") {
        return Ok((normalized, "inline".into(), Vec::new(), None));
    }
    let rest = &normalized[4..];
    let end = rest
        .find("\n---")
        .filter(|&i| rest[i + 4..].is_empty() || rest[i + 4..].starts_with('\n'))
        .ok_or("Skill frontmatter is missing its closing --- delimiter")?;
    let mut context = "inline".to_owned();
    let mut allowed = Vec::new();
    let mut model = None;
    let mut in_allowed_list = false;
    for line in rest[..end].lines() {
        if in_allowed_list && line.starts_with(char::is_whitespace) && line.trim().starts_with('-')
        {
            let tool = scalar(line.trim().trim_start_matches('-').trim());
            if !tool.is_empty() {
                allowed.push(tool);
            }
            continue;
        }
        in_allowed_list = false;
        if line.starts_with(char::is_whitespace) {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        match key.trim() {
            "context" => {
                context = scalar(value);
                if !matches!(context.as_str(), "inline" | "fork") {
                    return Err("Skill context must be inline or fork".into());
                }
            }
            "model" => {
                let value = scalar(value);
                if !value.is_empty() {
                    model = Some(value);
                }
            }
            "allowed-tools" => {
                let value = value.trim();
                if value.is_empty() {
                    in_allowed_list = true;
                } else {
                    let value = value.trim_start_matches('[').trim_end_matches(']');
                    allowed.extend(value.split(',').map(scalar).filter(|s| !s.is_empty()));
                }
            }
            _ => {}
        }
    }
    Ok((
        rest[end + 4..].trim_start_matches('\n').into(),
        context,
        allowed,
        model,
    ))
}

fn load_skill(root: &Path, input: &Value) -> Result<ToolOutput, String> {
    let name = input
        .get("skill")
        .and_then(Value::as_str)
        .unwrap_or("list")
        .trim();
    if !skill_name(name) {
        return Err(
            "Skill must be a simple workspace skill name; paths and traversal are not accepted"
                .into(),
        );
    }
    let found = discover_skills(root)?;
    if name == "list" {
        let skills: Vec<Value> = found
            .iter()
            .map(|(name, path)| json!({"skill":name,"path":path,"baseDirectory":path.parent()}))
            .collect();
        let text = if skills.is_empty() {
            "No workspace skills found. Add <skill>/SKILL.md under .taro/skills, .claude/skills, or .agents/skills.".into()
        } else {
            format!(
                "Workspace skills: {}",
                found.keys().cloned().collect::<Vec<_>>().join(", ")
            )
        };
        return Ok(result(text, json!({"kind":"skill-list","skills":skills})));
    }
    let path = found.get(name).ok_or_else(|| format!("Workspace skill '{name}' was not found. Use Skill with skill: list to discover available skills."))?;
    let source = read_text(path, "Skill")?;
    let (content, context, allowed_tools, model) = parse_skill(&source)?;
    if content.trim().is_empty() {
        return Err(format!("Workspace skill '{name}' has no instructions"));
    }
    let args = input.get("args").and_then(Value::as_str).unwrap_or("");
    let content = content.replace("$ARGUMENTS", args);
    let base_directory =
        fs::canonicalize(path.parent().ok_or("Skill base directory is unavailable")?)
            .map_err(|e| e.to_string())?;
    Ok(result(format!("Loaded skill {name} from {} (context: {context}). Tool approvals and plan-mode restrictions still apply.\n\n{content}", base_directory.display()),
        json!({"kind":"skill","skill":name,"args":args,"content":content,"baseDirectory":base_directory,"context":context,"allowedTools":allowed_tools,"model":model})))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn workspace() -> TempDir {
        tempfile::tempdir().unwrap()
    }

    #[tokio::test]
    async fn plan_requires_real_content_preview_and_approval() {
        let dir = workspace();
        let root = fs::canonicalize(dir.path()).unwrap();
        let entered = execute(
            "EnterPlanMode",
            &json!({"name":"A design","kind":"Design Plan"}),
            &root,
            "plan",
            false,
        )
        .await
        .unwrap();
        let path = PathBuf::from(entered.artifact["path"].as_str().unwrap());
        assert!(path.is_file());
        assert!(guard_tool(&root, "plan", "Write", &json!({"file_path":path})).is_ok());
        assert!(guard_tool(&root, "plan", "Write", &json!({"file_path":"other.md"})).is_err());
        for name in [
            "Bash",
            "PowerShell",
            "MCP",
            "Agent",
            "EnterWorktree",
            "NotebookEdit",
            "Unknown",
        ] {
            assert!(
                guard_tool(&root, "plan", name, &json!({})).is_err(),
                "{name}"
            );
        }
        assert!(guard_tool(&root, "plan", "Agent", &json!({"subagent_type":"Explore"})).is_ok());
        assert!(guard_tool(
            &root,
            "plan",
            "Agent",
            &json!({"subagent_type":"Plan","isolation":"worktree"})
        )
        .is_err());
        assert!(guard_tool(&root, "another-chat", "Bash", &json!({})).is_ok());
        assert!(guard_tool(&root, "plan", "TaskOutput", &json!({})).is_ok());
        assert!(guard_tool(&root, "plan", "TaskStop", &json!({})).is_ok());
        assert!(execute(
            "ExitPlanMode",
            &json!({"plan":"fake"}),
            &root,
            "plan",
            false
        )
        .await
        .is_err());
        fs::write(&path, "# Actual plan\n\nImplement the requested change.").unwrap();
        assert!(execute("ExitPlanMode", &json!({}), &root, "plan", true)
            .await
            .is_err());
        let preview = execute("ExitPlanMode", &json!({}), &root, "plan", false)
            .await
            .unwrap();
        assert_eq!(preview.artifact["kind"], "plan");
        assert_eq!(preview.artifact["planKind"], "Design Plan");
        assert_eq!(preview.artifact["approvalRequired"], true);
        assert!(guard_tool(&root, "plan", "Bash", &json!({})).is_err());
        fs::write(&path, "Changed after preview").unwrap();
        assert!(execute("ExitPlanMode", &json!({}), &root, "plan", true)
            .await
            .is_err());
        execute("ExitPlanMode", &json!({}), &root, "plan", false)
            .await
            .unwrap();
        execute("ExitPlanMode", &json!({}), &root, "plan", true)
            .await
            .unwrap();
        assert!(guard_tool(&root, "plan", "Bash", &json!({})).is_ok());
    }

    #[tokio::test]
    async fn skill_loads_frontmatter_arguments_and_rejects_traversal() {
        let dir = workspace();
        let root = fs::canonicalize(dir.path()).unwrap();
        let skill_dir = root.join(".agents/skills/review");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "---\ncontext: fork\nallowed-tools:\n  - Read\n  - Grep\nmodel: configured-model\n---\nReview $ARGUMENTS.").unwrap();
        let out = execute(
            "Skill",
            &json!({"skill":"review","args":"file.rs"}),
            &root,
            "skills",
            false,
        )
        .await
        .unwrap();
        assert_eq!(out.artifact["content"], "Review file.rs.");
        assert_eq!(out.artifact["context"], "fork");
        assert_eq!(out.artifact["allowedTools"], json!(["Read", "Grep"]));
        assert_eq!(out.artifact["model"], "configured-model");
        assert_eq!(
            out.artifact["baseDirectory"],
            json!(fs::canonicalize(skill_dir).unwrap())
        );
        for name in ["../review", "../../outside", "C:\\outside", "/review", ".."] {
            assert!(
                execute("Skill", &json!({"skill":name}), &root, "skills", false)
                    .await
                    .is_err()
            );
        }
        let list = execute("Skill", &json!({"skill":"list"}), &root, "skills", false)
            .await
            .unwrap();
        assert_eq!(list.artifact["skills"][0]["skill"], "review");
        assert!(
            execute("Skill", &json!({"skill":"missing"}), &root, "skills", false)
                .await
                .is_err()
        );
    }

    fn repository() -> TempDir {
        let dir = workspace();
        let root = dir.path();
        git(root, &["init"]).unwrap();
        git(root, &["config", "user.name", "Session tests"]).unwrap();
        git(root, &["config", "user.email", "tests@example.invalid"]).unwrap();
        fs::write(root.join("tracked.txt"), "original").unwrap();
        git(root, &["add", "tracked.txt"]).unwrap();
        git(root, &["commit", "-m", "Initial"]).unwrap();
        dir
    }

    #[tokio::test]
    async fn worktree_switches_root_and_keep_preserves_branch() {
        let dir = repository();
        let root = fs::canonicalize(dir.path()).unwrap();
        assert!(execute("EnterWorktree", &json!({}), &root, "keep", false)
            .await
            .is_err());
        let out = execute(
            "EnterWorktree",
            &json!({"name":"safe"}),
            &root,
            "keep",
            true,
        )
        .await
        .unwrap();
        let path = PathBuf::from(out.artifact["worktreePath"].as_str().unwrap());
        let branch = out.artifact["worktreeBranch"].as_str().unwrap();
        assert_eq!(
            effective_root(&root, "keep").unwrap(),
            fs::canonicalize(&path).unwrap()
        );
        assert_eq!(effective_root(&root, "another-chat").unwrap(), root);
        let resume = json!({"resume_path":path});
        assert!(execute("EnterWorktree", &resume, &root, "takeover", true).await.is_err());
        assert!(execute("EnterWorktree", &json!({}), &root, "keep", true)
            .await
            .is_err());
        execute(
            "ExitWorktree",
            &json!({"action":"keep"}),
            &root,
            "keep",
            false,
        )
        .await
        .unwrap();
        assert!(path.exists());
        assert_eq!(effective_root(&root, "keep").unwrap(), root);
        fs::write(path.join("tracked.txt"), "retained edit").unwrap();
        assert!(execute("EnterWorktree", &resume, &root, "takeover", false).await.is_err());
        let resumed = execute("EnterWorktree", &resume, &root, "takeover", true).await.unwrap();
        assert_eq!(resumed.artifact["action"], "resume");
        assert_eq!(effective_root(&root, "takeover").unwrap(), path);
        assert_eq!(fs::read_to_string(path.join("tracked.txt")).unwrap(), "retained edit");
        execute("ExitWorktree", &json!({"action":"keep"}), &root, "takeover", false).await.unwrap();
        fs::write(path.join("tracked.txt"), "original").unwrap();
        git(
            &root,
            &["show-ref", "--verify", &format!("refs/heads/{branch}")],
        )
        .unwrap();
        git(&root, &["worktree", "remove", path.to_str().unwrap()]).unwrap();
    }

    #[tokio::test]
    async fn worktree_remove_requires_approval_and_explicit_dirty_discard() {
        let dir = repository();
        let root = fs::canonicalize(dir.path()).unwrap();
        let out = execute("EnterWorktree", &json!({}), &root, "remove", true)
            .await
            .unwrap();
        let path = PathBuf::from(out.artifact["worktreePath"].as_str().unwrap());
        fs::write(path.join("untracked.txt"), "keep this").unwrap();
        assert!(execute(
            "ExitWorktree",
            &json!({"action":"remove","discard_changes":true}),
            &root,
            "remove",
            false
        )
        .await
        .is_err());
        assert!(execute(
            "ExitWorktree",
            &json!({"action":"remove"}),
            &root,
            "remove",
            true
        )
        .await
        .is_err());
        assert!(path.exists());
        execute(
            "ExitWorktree",
            &json!({"action":"remove","discard_changes":true}),
            &root,
            "remove",
            true,
        )
        .await
        .unwrap();
        assert!(!path.exists());
        assert_eq!(effective_root(&root, "remove").unwrap(), root);
    }

    #[tokio::test]
    async fn worktree_protects_new_commits() {
        let dir = repository();
        let root = fs::canonicalize(dir.path()).unwrap();
        let out = execute("EnterWorktree", &json!({}), &root, "commits", true)
            .await
            .unwrap();
        let path = PathBuf::from(out.artifact["worktreePath"].as_str().unwrap());
        fs::write(path.join("tracked.txt"), "new commit").unwrap();
        git(&path, &["add", "tracked.txt"]).unwrap();
        git(&path, &["commit", "-m", "Worktree work"]).unwrap();
        assert!(execute(
            "ExitWorktree",
            &json!({"action":"remove"}),
            &root,
            "commits",
            true
        )
        .await
        .is_err());
        execute(
            "ExitWorktree",
            &json!({"action":"remove","discard_changes":true}),
            &root,
            "commits",
            true,
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn plan_created_inside_worktree_remains_workspace_contained() {
        let dir = repository();
        let root = fs::canonicalize(dir.path()).unwrap();
        execute("EnterWorktree", &json!({}), &root, "nested-plan", true)
            .await
            .unwrap();
        let active = effective_root(&root, "nested-plan").unwrap();
        let out = execute("EnterPlanMode", &json!({}), &root, "nested-plan", false)
            .await
            .unwrap();
        let path = PathBuf::from(out.artifact["path"].as_str().unwrap());
        assert!(path.starts_with(&active));
        fs::write(&path, "# Worktree plan").unwrap();
        assert!(guard_tool(&root, "nested-plan", "Edit", &json!({"file_path":path})).is_ok());
        assert!(execute(
            "ExitWorktree",
            &json!({"action":"remove","discard_changes":true}),
            &root,
            "nested-plan",
            true
        )
        .await
        .is_err());
        execute("ExitPlanMode", &json!({}), &root, "nested-plan", false)
            .await
            .unwrap();
        execute("ExitPlanMode", &json!({}), &root, "nested-plan", true)
            .await
            .unwrap();
        execute(
            "ExitWorktree",
            &json!({"action":"remove","discard_changes":true}),
            &root,
            "nested-plan",
            true,
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn path_traversal_and_unknown_plan_kind_are_rejected() {
        let dir = workspace();
        let root = fs::canonicalize(dir.path()).unwrap();
        assert!(contained(&root, Path::new(".taro/../../outside")).is_err());
        assert!(execute(
            "EnterPlanMode",
            &json!({"kind":"Anything"}),
            &root,
            "bad-kind",
            false
        )
        .await
        .is_err());
        assert!(execute("EnterPlanMode", &json!({}), &root, "", false)
            .await
            .is_err());
        assert!(execute("ExitPlanMode", &json!({}), &root, "no-plan", true)
            .await
            .is_err());
    }

    #[test]
    fn parses_inline_tool_lists_without_granting_permissions() {
        let (body, context, tools, model) = parse_skill(
            "---\nallowed-tools: [\"Read\", 'Grep']\nmodel: 'chosen'\n---\nInstructions",
        )
        .unwrap();
        assert_eq!(body, "Instructions");
        assert_eq!(context, "inline");
        assert_eq!(tools, vec!["Read", "Grep"]);
        assert_eq!(model.as_deref(), Some("chosen"));
        assert!(parse_skill("---\ncontext: bypass\n---\nInstructions").is_err());
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn rejects_directory_junctions_for_plans_and_skills() {
        let dir = workspace();
        let outside = workspace();
        let root = fs::canonicalize(dir.path()).unwrap();
        let link = root.join(".taro");
        let output = Command::new("cmd.exe")
            .args([
                "/C",
                "mklink",
                "/J",
                &git_argument(link.to_str().unwrap()),
                outside.path().to_str().unwrap(),
            ])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            execute("EnterPlanMode", &json!({}), &root, "junction", false)
                .await
                .is_err()
        );
        assert!(
            execute("Skill", &json!({"skill":"list"}), &root, "junction", false)
                .await
                .is_err()
        );
        assert!(!outside.path().join("plans").exists());
        // Remove the junction itself, never traverse or recursively delete it.
        fs::remove_dir(link).unwrap();
    }

    fn test_process(script: &str) -> Command {
        if cfg!(windows) {
            let mut command = Command::new("powershell.exe");
            command.args(["-NoProfile", "-NonInteractive", "-Command", script]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args(["-c", script]);
            command
        }
    }

    #[test]
    fn command_deadline_interrupts_a_hanging_process() {
        let mut command = test_process(if cfg!(windows) {
            "Start-Sleep -Seconds 20"
        } else {
            "sleep 20"
        });
        let start = std::time::Instant::now();
        let error =
            bounded_output(&mut command, std::time::Duration::from_millis(250), 4096).unwrap_err();
        assert!(error.contains("timed out"), "{error}");
        assert!(start.elapsed() < std::time::Duration::from_secs(5));
    }

    #[test]
    fn command_output_is_bounded_and_stdout_stderr_are_captured() {
        let mut command = test_process(if cfg!(windows) {
            "[Console]::Write('out'); [Console]::Error.Write('err')"
        } else {
            "printf out; printf err >&2"
        });
        let output = bounded_output(&mut command, std::time::Duration::from_secs(5), 4096).unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, b"out");
        assert_eq!(output.stderr, b"err");
        let mut verbose = test_process(if cfg!(windows) {
            "[Console]::Write(('x' * 1000000))"
        } else {
            "head -c 1000000 /dev/zero"
        });
        let error =
            bounded_output(&mut verbose, std::time::Duration::from_secs(5), 4096).unwrap_err();
        assert!(error.contains("output limit"), "{error}");
    }

    #[test]
    fn command_cleanup_stops_hook_descendants_after_parent_exits() {
        let directory = workspace();
        let marker = directory.path().join("escaped.txt");
        let marker_arg = marker.to_string_lossy().replace('\'', "''");
        let script = if cfg!(windows) {
            format!("$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes(\"Start-Sleep -Seconds 2; [IO.File]::WriteAllText('{marker_arg}', 'escaped')\")); Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList '-NoProfile','-EncodedCommand',$encoded -WindowStyle Hidden; [Console]::Write('started')")
        } else {
            format!("(sleep 2; printf escaped > '{marker_arg}') & printf started")
        };
        let output =
            bounded_output(&mut test_process(&script), Duration::from_secs(5), 4096).unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, b"started");
        std::thread::sleep(Duration::from_millis(2500));
        assert!(
            !marker.exists(),
            "A descendant escaped the Git process job/group"
        );
    }
}
