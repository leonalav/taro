//! Native shell tasks. All task lookups require both a canonical workspace and chat scope.
use crate::agent_tools::ToolOutput;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::{Child, Command},
    time::{sleep, Instant},
};
use tokio_util::sync::CancellationToken;

const INLINE_LIMIT: usize = 100_000;
const FILE_LIMIT: usize = 4_000_000;
const MAX_TASKS: usize = 256;
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static TASKS: OnceLock<Mutex<HashMap<String, Arc<Task>>>> = OnceLock::new();

struct Task {
    id: String,
    root: PathBuf,
    cwd: PathBuf,
    scope: String,
    command: String,
    description: String,
    task_type: &'static str,
    path: PathBuf,
    cancel: CancellationToken,
    state: Mutex<State>,
}
struct State {
    status: &'static str,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    output: Vec<u8>,
    file: File,
    written: usize,
    truncated: bool,
    exit_code: Option<i32>,
    error: Option<String>,
    stop_requested: bool,
}
struct CancelForegroundOnDrop(CancellationToken);
impl Drop for CancelForegroundOnDrop {
    fn drop(&mut self) {
        self.0.cancel();
    }
}
fn registry() -> &'static Mutex<HashMap<String, Arc<Task>>> {
    TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}
fn canonical_root(root: &Path) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(|e| format!("Workspace is unavailable: {e}"))?;
    if !root.is_dir() {
        return Err("Workspace must be a directory".into());
    }
    Ok(root)
}
fn required<'a>(input: &'a Value, key: &str) -> Result<&'a str, String> {
    input
        .get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| format!("Missing or empty {key}"))
}
fn boolean(input: &Value, key: &str, default: bool) -> Result<bool, String> {
    input.get(key).map_or(Ok(default), |v| {
        v.as_bool()
            .ok_or_else(|| format!("{key} must be a boolean"))
    })
}
fn timeout_ms(input: &Value, default: u64) -> Result<u64, String> {
    let value = input.get("timeout").map_or(Ok(default), |v| {
        v.as_u64()
            .ok_or("timeout must be an integer from 0 to 600000")
    })?;
    if value > 600_000 {
        return Err("timeout must be between 0 and 600000 milliseconds".into());
    }
    Ok(value)
}
fn allowed_fields(input: &Value, fields: &[&str]) -> Result<(), String> {
    let object = input.as_object().ok_or("Tool input must be an object")?;
    for key in object.keys() {
        if !fields.contains(&key.as_str()) {
            return Err(format!("Unsupported input field: {key}"));
        }
    }
    Ok(())
}
fn create_output(root: &Path, id: &str) -> Result<(PathBuf, File), String> {
    let mut path = root.to_path_buf();
    for component in [".taro", "tasks"] {
        path.push(component);
        match fs::create_dir(&path) {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(e) => return Err(format!("Cannot create task output directory: {e}")),
        }
        let canonical = fs::canonicalize(&path).map_err(|e| e.to_string())?;
        if !canonical.starts_with(root) || !canonical.is_dir() {
            return Err("Task output directory escapes the workspace".into());
        }
        path = canonical;
    }
    path.push(format!("{id}.output"));
    // Never follow an existing output symlink or truncate another task's file.
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| format!("Cannot create task output: {e}"))?;
    Ok((path, file))
}
fn snapshot(task: &Task) -> Value {
    let state = task.state.lock().unwrap();
    json!({
        "task_id":task.id,"task_type":task.task_type,"status":state.status,
        "description":task.description,"command":task.command,"cwd":task.cwd,
        "output":String::from_utf8_lossy(&state.output),
        "stdout":String::from_utf8_lossy(&state.stdout),"stderr":String::from_utf8_lossy(&state.stderr),
        "exitCode":state.exit_code,"error":state.error,
        "output_file":task.path,"outputFile":task.path,"persistedOutputPath":task.path,
        "truncated":state.truncated,"interrupted":matches!(state.status,"stopped"|"timed_out")
    })
}

/// Read-only desktop terminal viewer. These commands deliberately expose no
/// stdin or cancellation handle; only the agent runtime owns these processes.
#[tauri::command]
pub fn agent_terminal_list(workspace_root: String) -> Result<Value, String> {
    let root = canonical_root(Path::new(&workspace_root))?;
    let tasks = registry().lock().map_err(|e| e.to_string())?;
    let mut matching: Vec<_> = tasks.values().filter(|task| task.root == root).collect();
    matching.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(Value::Array(matching.into_iter().take(64).map(|task| {
        let state = task.state.lock().unwrap();
        json!({"task_id":task.id,"task_type":task.task_type,"command":task.command,
            "description":task.description,"status":state.status,"workspaceRoot":task.root,"cwd":task.cwd,"scope":task.scope})
    }).collect()))
}

#[tauri::command]
pub fn agent_terminal_read(workspace_root: String, id: String) -> Result<Value, String> {
    let root = canonical_root(Path::new(&workspace_root))?;
    let task = registry()
        .lock()
        .map_err(|e| e.to_string())?
        .get(&id)
        .filter(|task| task.root == root)
        .cloned()
        .ok_or("Agent terminal was not found in this workspace")?;
    let mut value = snapshot(&task);
    value["workspaceRoot"] = json!(task.root);
    value["scope"] = json!(task.scope);
    Ok(value)
}
fn result(mut artifact: Value, kind: &str) -> ToolOutput {
    artifact["kind"] = json!(kind);
    let task = artifact
        .get("task")
        .filter(|value| value.is_object())
        .unwrap_or(&artifact);
    let text = if let Some(id) = task["task_id"].as_str() {
        let preview = |value: &str| {
            let mut end = value.len().min(6000);
            while !value.is_char_boundary(end) {
                end -= 1;
            }
            format!(
                "{}{}",
                &value[..end],
                if end < value.len() {
                    "\n[Preview shortened; read the output file for more.]"
                } else {
                    ""
                }
            )
        };
        // Keep control metadata ahead of verbose output: Taro bounds tool text
        // sent to a model, so a long stdout must never hide the ID or file path.
        format!("Task: {id}\nOutput file: {}\nTask status: {}\nRetrieval: {}\nExit code: {}\nInterrupted: {}\nFile truncated: {}\n\nstdout:\n{}\nstderr:\n{}{}",
            task["output_file"].as_str().unwrap_or("unavailable"),
            task["status"].as_str().unwrap_or("unknown"),
            artifact["retrieval_status"].as_str().unwrap_or("not applicable"),
            task["exitCode"],task["interrupted"],task["truncated"],
            preview(task["stdout"].as_str().unwrap_or_else(||task["output"].as_str().unwrap_or(""))),
            preview(task["stderr"].as_str().unwrap_or("")),
            task["error"].as_str().map(|error|format!("\nError: {}",preview(error))).unwrap_or_default())
    } else {
        serde_json::to_string(&artifact).unwrap_or_default()
    };
    ToolOutput { text, artifact }
}
fn lookup(root: &Path, scope: &str, id: &str) -> Result<Arc<Task>, String> {
    registry()
        .lock()
        .unwrap()
        .get(id)
        .filter(|task| {
            (task.root == root && task.scope == scope)
                || (task.root.starts_with(root)
                    && task
                        .scope
                        .strip_prefix(scope)
                        .is_some_and(|suffix| suffix.starts_with(":agent-")))
        })
        .cloned()
        .ok_or_else(|| format!("No task found with ID: {id} in this chat/workspace"))
}

/// Internal cancellation for an Agent and its descendants, independent of
/// whether a background launch result has reached the renderer yet.
pub async fn stop_scope(root: &Path, scope: &str) -> Result<ToolOutput, String> {
    let root = canonical_root(root)?;
    if scope.is_empty() {
        return Err("A task scope is required".into());
    }
    let tasks = registry()
        .lock()
        .map_err(|e| e.to_string())?
        .values()
        .filter(|task| {
            task.root.starts_with(&root)
                && (task.scope == scope
                    || task
                        .scope
                        .strip_prefix(scope)
                        .is_some_and(|suffix| suffix.starts_with(":agent-")))
        })
        .cloned()
        .collect::<Vec<_>>();
    let mut cancelled = Vec::new();
    for task in tasks {
        let mut state = task.state.lock().map_err(|e| e.to_string())?;
        if state.status == "running" {
            state.stop_requested = true;
            task.cancel.cancel();
            cancelled.push(task.clone());
        }
    }
    let deadline = Instant::now() + Duration::from_secs(15);
    for task in &cancelled {
        let remaining = deadline
            .saturating_duration_since(Instant::now())
            .as_millis() as u64;
        if !wait(task, remaining).await {
            return Err(format!(
                "Task {} has not stopped after cancellation",
                task.id
            ));
        }
    }
    Ok(result(
        json!({"stopped":cancelled.iter().map(|task|task.id.clone()).collect::<Vec<_>>()}),
        "task-stop-scope",
    ))
}
async fn wait(task: &Task, timeout: u64) -> bool {
    let deadline = Instant::now() + Duration::from_millis(timeout);
    loop {
        if task.state.lock().unwrap().status != "running" {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        sleep(Duration::from_millis(10).min(deadline.saturating_duration_since(Instant::now())))
            .await;
    }
}

#[cfg(test)]
pub async fn execute(
    name: &str,
    input: &Value,
    root: &Path,
    scope: &str,
    approved: bool,
) -> Result<ToolOutput, String> {
    execute_in_workspace(name, input, root, root, scope, approved).await
}

/// `original_root` identifies the selected workspace; `cwd` is the trusted active
/// workspace/worktree supplied by the native dispatcher, never by model input.
pub async fn execute_in_workspace(
    name: &str,
    input: &Value,
    original_root: &Path,
    cwd: &Path,
    scope: &str,
    approved: bool,
) -> Result<ToolOutput, String> {
    let root = canonical_root(original_root)?;
    if scope.trim().is_empty() {
        return Err("A chat scope is required for task execution".into());
    }
    match name {
        "PowerShell" | "Bash" => {
            if !approved {
                return Err("User approval is required for shell execution".into());
            }
            allowed_fields(
                input,
                &["command", "timeout", "description", "run_in_background"],
            )?;
            let command = required(input, "command")?;
            let description = input.get("description").map_or(Ok(command), |v| {
                v.as_str().ok_or("description must be a string")
            })?;
            let background = boolean(input, "run_in_background", false)?;
            let timeout = timeout_ms(input, 120_000)?;
            let cwd = canonical_root(cwd)?;
            let id = format!(
                "shell-{:x}-{:x}-{:x}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos(),
                NEXT_ID.fetch_add(1, Ordering::Relaxed)
            );
            let (path, file) = create_output(&root, &id)?;
            let task = Arc::new(Task {
                id: id.clone(),
                root,
                cwd: cwd.clone(),
                scope: scope.into(),
                command: command.into(),
                description: description.into(),
                task_type: if name == "PowerShell" {
                    "local_powershell"
                } else {
                    "local_bash"
                },
                path,
                cancel: CancellationToken::new(),
                state: Mutex::new(State {
                    status: "running",
                    stdout: Vec::new(),
                    stderr: Vec::new(),
                    output: Vec::new(),
                    file,
                    written: 0,
                    truncated: false,
                    exit_code: None,
                    error: None,
                    stop_requested: false,
                }),
            });
            // Reserve capacity before spawning, so a rejected request cannot leave a process behind.
            {
                let mut tasks = registry().lock().unwrap();
                if tasks.len() >= MAX_TASKS {
                    let old = tasks
                        .iter()
                        .find(|(_, t)| t.state.lock().unwrap().status != "running")
                        .map(|(id, _)| id.clone());
                    if let Some(id) = old {
                        tasks.remove(&id);
                    } else {
                        return Err("Too many running shell tasks".into());
                    }
                }
                tasks.insert(id.clone(), task.clone());
            }
            let spawned = spawn_shell(name, command, &cwd);
            let (child, tree) = match spawned {
                Ok(value) => value,
                Err(error) => {
                    registry().lock().unwrap().remove(&id);
                    return Err(error);
                }
            };
            let worker_task = task.clone();
            tokio::spawn(async move {
                supervise(
                    child,
                    tree,
                    worker_task,
                    if background { None } else { Some(timeout) },
                )
                .await;
            });
            if background {
                let mut output = snapshot(&task);
                output["backgroundTaskId"] = json!(id);
                output["backgroundedByUser"] = json!(true);
                return Ok(result(output, "terminal"));
            }
            // A cancelled native invocation drops this guard and stops the
            // foreground process. Explicit background tasks have no such guard.
            let _cancel_on_drop = CancelForegroundOnDrop(task.cancel.clone());
            wait(&task, timeout.saturating_add(15_000)).await;
            Ok(result(snapshot(&task), "terminal"))
        }
        "TaskOutput" => {
            allowed_fields(input, &["task_id", "block", "timeout"])?;
            let task = lookup(&root, scope, required(input, "task_id")?)?;
            let block = boolean(input, "block", true)?;
            let timeout = timeout_ms(input, 30_000)?;
            let done = if block {
                wait(&task, timeout).await
            } else {
                task.state.lock().unwrap().status != "running"
            };
            Ok(result(
                json!({"retrieval_status":if done { "success" } else if block { "timeout" } else { "not_ready" },"task":snapshot(&task)}),
                "task-output",
            ))
        }
        "TaskStop" => {
            allowed_fields(input, &["task_id", "shell_id"])?;
            let id = input
                .get("task_id")
                .or_else(|| input.get("shell_id"))
                .and_then(Value::as_str)
                .ok_or("Missing task_id")?;
            let task = lookup(&root, scope, id)?;
            {
                let mut state = task.state.lock().unwrap();
                if state.status != "running" || state.stop_requested {
                    return Err(format!("Task {id} is not running or is already stopping"));
                }
                state.stop_requested = true;
                task.cancel.cancel();
            }
            if !wait(&task, 15_000).await {
                return Err(format!(
                    "Cancellation requested but task {id} has not stopped yet"
                ));
            }
            Ok(result(
                json!({"message":format!("Stopped task: {id}"),"task_id":id,"task_type":task.task_type,"command":task.command,"task":snapshot(&task)}),
                "task-stop",
            ))
        }
        _ => Err(format!("Unsupported task tool: {name}")),
    }
}

fn shell_command(
    executable: impl AsRef<std::ffi::OsStr>,
    name: &str,
    command: &str,
    cwd: &Path,
) -> Command {
    let mut cmd = Command::new(executable);
    if name == "PowerShell" {
        cmd.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
        // UTF-8 makes Windows PowerShell 5 and PowerShell 7 output consistent.
        cmd.arg(format!("[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [Console]::OutputEncoding; {command}"));
    } else {
        cmd.arg("-lc").arg(command);
    }
    cmd.current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    #[cfg(unix)]
    cmd.process_group(0);
    cmd
}
fn spawn_shell(name: &str, command: &str, cwd: &Path) -> Result<(Child, ProcessTree), String> {
    let executables: Vec<PathBuf> = if name == "PowerShell" {
        if cfg!(windows) {
            vec!["pwsh.exe".into(), "powershell.exe".into()]
        } else {
            vec!["pwsh".into()]
        }
    } else {
        let mut candidates = Vec::new();
        #[cfg(windows)]
        {
            // System32/bash.exe is a WSL launcher, which cannot execute in a
            // native workspace when WSL has no configured distribution. Prefer
            // the installed native Git Bash used by Taro's original Bash tool.
            for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
                if let Some(directory) = std::env::var_os(variable) {
                    let git_bash = PathBuf::from(directory)
                        .join("Git")
                        .join("bin")
                        .join("bash.exe");
                    if git_bash.is_file() {
                        candidates.push(git_bash);
                    }
                }
            }
            if let Some(directory) = std::env::var_os("LOCALAPPDATA") {
                let git_bash = PathBuf::from(directory)
                    .join("Programs")
                    .join("Git")
                    .join("bin")
                    .join("bash.exe");
                if git_bash.is_file() {
                    candidates.push(git_bash);
                }
            }
        }
        candidates.push("bash".into());
        candidates
    };
    let mut errors = Vec::new();
    for executable in &executables {
        match shell_command(executable, name, command, cwd).spawn() {
            Ok(mut child) => match ProcessTree::new(&child) {
                Ok(tree) => return Ok((child, tree)),
                Err(error) => {
                    let _ = child.start_kill();
                    return Err(format!(
                        "Cannot establish shell process tree ownership: {error}"
                    ));
                }
            },
            Err(error) => errors.push(format!("{}: {error}", executable.display())),
        }
    }
    Err(format!(
        "{name} is unavailable. Install {} and ensure it is on PATH. {}",
        if name == "PowerShell" {
            "PowerShell (pwsh)"
        } else {
            "Bash"
        },
        errors.join("; ")
    ))
}
async fn drain<R: AsyncRead + Unpin>(mut reader: R, task: Arc<Task>, stderr: bool) {
    let mut buffer = [0u8; 8192];
    loop {
        match reader.read(&mut buffer).await {
            Ok(0) => break,
            Ok(count) => {
                let bytes = &buffer[..count];
                let mut state = task.state.lock().unwrap();
                let destination = if stderr {
                    &mut state.stderr
                } else {
                    &mut state.stdout
                };
                let keep = count.min(INLINE_LIMIT.saturating_sub(destination.len()));
                destination.extend_from_slice(&bytes[..keep]);
                let combined_keep = count.min(INLINE_LIMIT.saturating_sub(state.output.len()));
                state.output.extend_from_slice(&bytes[..combined_keep]);
                let disk_keep = count.min(FILE_LIMIT.saturating_sub(state.written));
                if let Err(error) = state
                    .file
                    .write_all(&bytes[..disk_keep])
                    .and_then(|_| state.file.flush())
                {
                    state.error = Some(format!("Cannot persist task output: {error}"));
                }
                state.written += disk_keep;
                state.truncated |= keep < count || disk_keep < count || combined_keep < count;
            }
            Err(error) => {
                task.state.lock().unwrap().error =
                    Some(format!("Cannot read shell output: {error}"));
                break;
            }
        }
    }
}
async fn supervise(mut child: Child, tree: ProcessTree, task: Arc<Task>, timeout: Option<u64>) {
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let mut stdout_task = tokio::spawn(drain(stdout, task.clone(), false));
    let mut stderr_task = tokio::spawn(drain(stderr, task.clone(), true));
    let deadline = async {
        match timeout {
            Some(ms) => sleep(Duration::from_millis(ms)).await,
            None => std::future::pending::<()>().await,
        }
    };
    let (status, exit) = tokio::select! {
        biased;
        _ = task.cancel.cancelled() => { tree.terminate(); let _ = child.start_kill(); ("stopped",child.wait().await) },
        _ = deadline => { tree.terminate(); let _ = child.start_kill(); ("timed_out",child.wait().await) },
        exit = child.wait() => ("exited",exit),
    };
    // A shell may exit while its descendants still hold redirected handles.
    // Closing our job/group ends those descendants and allows drains to finish.
    drop(tree);
    if tokio::time::timeout(Duration::from_secs(3), async {
        let _ = (&mut stdout_task).await;
        let _ = (&mut stderr_task).await;
    })
    .await
    .is_err()
    {
        stdout_task.abort();
        stderr_task.abort();
    }
    let mut state = task.state.lock().unwrap();
    state.exit_code = exit.as_ref().ok().and_then(|s| s.code());
    state.status = match status {
        "stopped" => "stopped",
        "timed_out" => "timed_out",
        _ if exit.as_ref().map(|s| s.success()).unwrap_or(false) => "completed",
        _ => "failed",
    };
    if let Err(error) = exit {
        state.error = Some(error.to_string());
    }
    let _ = state.file.flush();
}

#[cfg(windows)]
struct ProcessTree(usize);
#[cfg(windows)]
mod win {
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
        pub read_ops: u64,
        pub write_ops: u64,
        pub other_ops: u64,
        pub read_bytes: u64,
        pub write_bytes: u64,
        pub other_bytes: u64,
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
        pub fn TerminateJobObject(job: *mut c_void, code: u32) -> i32;
        pub fn CloseHandle(handle: *mut c_void) -> i32;
    }
}
#[cfg(windows)]
impl ProcessTree {
    fn new(child: &Child) -> Result<Self, String> {
        unsafe {
            let handle = win::CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(std::io::Error::last_os_error().to_string());
            }
            let tree = Self(handle as usize);
            let mut limits = win::ExtendedLimits::default();
            limits.basic.flags = 0x0000_2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if win::SetInformationJobObject(
                handle,
                9,
                &limits as *const _ as *const _,
                std::mem::size_of_val(&limits) as u32,
            ) == 0
            {
                return Err(std::io::Error::last_os_error().to_string());
            }
            let process = child
                .raw_handle()
                .ok_or("Shell process has no native handle")?;
            if win::AssignProcessToJobObject(handle, process) == 0 {
                return Err(std::io::Error::last_os_error().to_string());
            }
            Ok(tree)
        }
    }
    fn terminate(&self) {
        unsafe {
            win::TerminateJobObject(self.0 as *mut _, 1);
        }
    }
}
#[cfg(windows)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        unsafe {
            win::CloseHandle(self.0 as *mut _);
        }
    }
}

#[cfg(unix)]
struct ProcessTree(u32);
#[cfg(unix)]
impl ProcessTree {
    fn new(child: &Child) -> Result<Self, String> {
        child.id().map(Self).ok_or("Shell process has no ID".into())
    }
    fn terminate(&self) {
        unsafe {
            extern "C" {
                fn kill(pid: i32, signal: i32) -> i32;
            }
            kill(-(self.0 as i32), 9);
        }
    }
}
#[cfg(unix)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        self.terminate();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn root_chat_can_control_descendant_tasks_and_cancel_a_child_scope() {
        let root = tempfile::tempdir().unwrap();
        let child = root.path().join("child-workspace");
        fs::create_dir(&child).unwrap();
        let started = execute(
            shell(),
            &json!({"command":command("child-job",true),"run_in_background":true}),
            &child,
            "parent:agent-child",
            true,
        )
        .await
        .unwrap();
        let id = started.artifact["task_id"].as_str().unwrap();
        let query = json!({"task_id":id,"block":false});
        assert!(execute("TaskOutput", &query, root.path(), "parent", false)
            .await
            .is_ok());
        assert!(execute("TaskStop", &query, root.path(), "par", false)
            .await
            .is_err());
        let unrelated = tempfile::tempdir().unwrap();
        assert!(
            execute("TaskOutput", &query, unrelated.path(), "parent", false)
                .await
                .is_err()
        );
        stop_scope(root.path(), "parent:agent-child").await.unwrap();
        let completed = execute("TaskOutput", &query, root.path(), "parent", false)
            .await
            .unwrap();
        assert_eq!(completed.artifact["task"]["status"], "stopped");
    }
    use serde_json::json;

    fn shell() -> &'static str {
        if cfg!(windows) {
            "PowerShell"
        } else {
            "Bash"
        }
    }
    fn command(output: &str, delay: bool) -> String {
        if cfg!(windows) {
            format!(
                "Write-Output '{output}'; {}",
                if delay {
                    "Start-Sleep -Seconds 20"
                } else {
                    "[Console]::Error.WriteLine('stderr-marker'); exit 7"
                }
            )
        } else {
            format!(
                "printf '{output}\\n'; {}",
                if delay {
                    "sleep 20"
                } else {
                    "printf 'stderr-marker\\n' >&2; exit 7"
                }
            )
        }
    }

    #[tokio::test]
    async fn desktop_agent_terminal_view_is_scoped_read_only_and_uses_actual_output() {
        let root = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let output = execute(
            shell(),
            &json!({"command":command("viewer-marker", false)}),
            root.path(),
            "viewer-chat",
            true,
        )
        .await
        .unwrap();
        let id = output.artifact["task_id"].as_str().unwrap();
        let root_name = root.path().to_string_lossy().to_string();
        let listed = agent_terminal_list(root_name.clone()).unwrap();
        let task = listed
            .as_array()
            .unwrap()
            .iter()
            .find(|task| task["task_id"] == id)
            .unwrap();
        assert_eq!(task["scope"], "viewer-chat");
        assert!(
            task.get("output").is_none(),
            "Listing does not eagerly copy every terminal's output"
        );
        let page = agent_terminal_read(root_name, id.to_string()).unwrap();
        assert!(page["output"].as_str().unwrap().contains("viewer-marker"));
        assert_eq!(page["cwd"], json!(root.path().canonicalize().unwrap()));
        assert!(
            agent_terminal_read(other.path().to_string_lossy().to_string(), id.to_string())
                .is_err()
        );
        assert_eq!(
            agent_terminal_list(other.path().to_string_lossy().to_string()).unwrap(),
            json!([])
        );
    }

    #[tokio::test]
    async fn foreground_captures_real_output_and_exit_code() {
        let root = tempfile::tempdir().unwrap();
        let result = execute(
            shell(),
            &json!({"command":command("stdout-marker", false)}),
            root.path(),
            "foreground",
            true,
        )
        .await
        .unwrap();
        assert_eq!(result.artifact["exitCode"], 7);
        assert!(result.artifact["stdout"]
            .as_str()
            .unwrap()
            .contains("stdout-marker"));
        assert!(result.artifact["stderr"]
            .as_str()
            .unwrap()
            .contains("stderr-marker"));
        let path = result.artifact["output_file"].as_str().unwrap();
        assert!(std::fs::read_to_string(path)
            .unwrap()
            .contains("stdout-marker"));
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn git_bash_runs_in_the_selected_native_workspace() {
        let root = tempfile::tempdir().unwrap();
        let result = execute(
            "Bash",
            &json!({"command":"pwd; printf 'git-bash-marker\\n'"}),
            root.path(),
            "git-bash-workspace",
            true,
        )
        .await
        .unwrap();
        assert_eq!(result.artifact["exitCode"], 0, "{}", result.text);
        let stdout = result.artifact["stdout"].as_str().unwrap();
        assert!(stdout.contains("git-bash-marker"));
        assert!(stdout.contains(root.path().file_name().unwrap().to_str().unwrap()));
    }

    #[tokio::test]
    async fn background_survives_return_is_scoped_and_can_be_stopped() {
        let root = tempfile::tempdir().unwrap();
        let result = execute(
            shell(),
            &json!({"command":command("live-marker", true),"run_in_background":true}),
            root.path(),
            "owner",
            true,
        )
        .await
        .unwrap();
        let id = result.artifact["task_id"].as_str().unwrap();
        let query = json!({"task_id":id,"block":false});
        assert!(execute("TaskOutput", &query, root.path(), "other", true)
            .await
            .is_err());
        let other_root = tempfile::tempdir().unwrap();
        assert!(
            execute("TaskStop", &query, other_root.path(), "owner", true)
                .await
                .is_err()
        );
        let pending = execute("TaskOutput", &query, root.path(), "owner", true)
            .await
            .unwrap();
        assert_eq!(pending.artifact["retrieval_status"], "not_ready");
        let timed = execute(
            "TaskOutput",
            &json!({"task_id":id,"timeout":1}),
            root.path(),
            "owner",
            true,
        )
        .await
        .unwrap();
        assert_eq!(timed.artifact["retrieval_status"], "timeout");
        for _ in 0..200 {
            let output = execute("TaskOutput", &query, root.path(), "owner", true)
                .await
                .unwrap();
            if output.artifact["task"]["stdout"]
                .as_str()
                .unwrap()
                .contains("live-marker")
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        execute(
            "TaskStop",
            &json!({"task_id":id}),
            root.path(),
            "owner",
            true,
        )
        .await
        .unwrap();
        let final_output = execute("TaskOutput", &query, root.path(), "owner", true)
            .await
            .unwrap();
        assert_eq!(final_output.artifact["retrieval_status"], "success");
        assert_eq!(final_output.artifact["task"]["status"], "stopped");
        assert!(final_output.artifact["task"]["stdout"]
            .as_str()
            .unwrap()
            .contains("live-marker"));
        assert!(execute(
            "TaskStop",
            &json!({"task_id":id}),
            root.path(),
            "owner",
            true
        )
        .await
        .is_err());
    }

    #[tokio::test]
    async fn foreground_timeout_interrupts_and_approval_cannot_be_bypassed() {
        let root = tempfile::tempdir().unwrap();
        let denied = execute(
            shell(),
            &json!({"command":command("denied", false)}),
            root.path(),
            "s",
            false,
        )
        .await;
        assert!(denied.unwrap_err().contains("approval"));
        let bypass = execute(
            shell(),
            &json!({"command":"echo bypass","dangerouslyDisableSandbox":true}),
            root.path(),
            "s",
            true,
        )
        .await;
        assert!(bypass.is_err());
        let timed = execute(
            shell(),
            &json!({"command":command("before-timeout", true),"timeout":1500}),
            root.path(),
            "s",
            true,
        )
        .await
        .unwrap();
        assert_eq!(timed.artifact["status"], "timed_out");
        assert_eq!(timed.artifact["interrupted"], true);
    }

    #[tokio::test]
    async fn cancelling_foreground_future_stops_the_process() {
        let root = tempfile::tempdir().unwrap();
        let marker = root.path().join("foreground-escaped.txt");
        let marker_arg = marker.to_string_lossy().replace('\'', "''");
        let command = if cfg!(windows) {
            format!("Start-Sleep -Seconds 2; [IO.File]::WriteAllText('{marker_arg}', 'escaped')")
        } else {
            format!("sleep 2; printf escaped > '{marker_arg}'")
        };
        let root_path = root.path().to_owned();
        let call = tokio::spawn(async move {
            execute(
                shell(),
                &json!({"command":command}),
                &root_path,
                "cancel-foreground",
                true,
            )
            .await
        });
        sleep(Duration::from_millis(500)).await;
        call.abort();
        let _ = call.await;
        sleep(Duration::from_millis(2500)).await;
        assert!(
            !marker.exists(),
            "foreground process outlived caller cancellation"
        );
    }

    #[tokio::test]
    async fn background_completion_reports_success_and_output() {
        let root = tempfile::tempdir().unwrap();
        let task = execute(
            shell(),
            &json!({"command":command("finished", false),"run_in_background":true}),
            root.path(),
            "s",
            true,
        )
        .await
        .unwrap();
        let result = execute(
            "TaskOutput",
            &json!({"task_id":task.artifact["task_id"],"timeout":15000}),
            root.path(),
            "s",
            true,
        )
        .await
        .unwrap();
        assert_eq!(result.artifact["retrieval_status"], "success");
        assert_eq!(result.artifact["task"]["status"], "failed");
        assert_eq!(result.artifact["task"]["exitCode"], 7);
        assert!(result.artifact["task"]["stdout"]
            .as_str()
            .unwrap()
            .contains("finished"));
    }

    #[tokio::test]
    async fn task_scope_survives_changing_worktree_cwd() {
        let original = tempfile::tempdir().unwrap();
        let worktree = tempfile::tempdir().unwrap();
        let command = if cfg!(windows) {
            "(Get-Location).Path"
        } else {
            "pwd"
        };
        let task = execute_in_workspace(
            shell(),
            &json!({"command":command,"run_in_background":true}),
            original.path(),
            worktree.path(),
            "s",
            true,
        )
        .await
        .unwrap();
        let result = execute(
            "TaskOutput",
            &json!({"task_id":task.artifact["task_id"]}),
            original.path(),
            "s",
            true,
        )
        .await
        .unwrap();
        assert_eq!(result.artifact["retrieval_status"], "success");
        assert!(result.artifact["task"]["stdout"]
            .as_str()
            .unwrap()
            .contains(worktree.path().file_name().unwrap().to_str().unwrap()));
        assert!(
            Path::new(result.artifact["task"]["output_file"].as_str().unwrap())
                .starts_with(fs::canonicalize(original.path()).unwrap())
        );
    }

    #[tokio::test]
    async fn output_is_bounded_without_blocking_a_verbose_process() {
        let root = tempfile::tempdir().unwrap();
        let command = if cfg!(windows) {
            "[Console]::Write(('x' * 5000000))"
        } else {
            "head -c 5000000 /dev/zero | tr '\\0' x"
        };
        let output = execute(shell(), &json!({"command":command}), root.path(), "s", true)
            .await
            .unwrap();
        assert_eq!(output.artifact["status"], "completed");
        assert!(output.artifact["stdout"].as_str().unwrap().len() <= 100_000);
        assert_eq!(output.artifact["truncated"], true);
        assert!(output.text.starts_with("Task: "));
        assert!(output
            .text
            .chars()
            .take(1000)
            .collect::<String>()
            .contains("Output file:"));
        assert!(output.text.len() < 20_000);
        let file = fs::metadata(output.artifact["output_file"].as_str().unwrap()).unwrap();
        assert_eq!(file.len(), 4_000_000);
    }

    #[tokio::test]
    async fn stopping_a_shell_also_stops_descendants() {
        let root = tempfile::tempdir().unwrap();
        let marker = root.path().join("descendant-escaped.txt");
        let marker = marker.to_string_lossy().replace('\'', "''");
        let command = if cfg!(windows) {
            format!("$code = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes(\"Start-Sleep -Seconds 2; [IO.File]::WriteAllText('{marker}', 'escaped')\")); $child = Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList '-NoProfile','-EncodedCommand',$code -PassThru -WindowStyle Hidden; Write-Output 'descendant-started'; Start-Sleep -Seconds 20")
        } else {
            format!(
                "(sleep 2; printf escaped > '{marker}') & printf 'descendant-started\\n'; sleep 20"
            )
        };
        let task = execute(
            shell(),
            &json!({"command":command,"run_in_background":true}),
            root.path(),
            "s",
            true,
        )
        .await
        .unwrap();
        let id = task.artifact["task_id"].as_str().unwrap();
        let mut started = false;
        for _ in 0..300 {
            let output = execute(
                "TaskOutput",
                &json!({"task_id":id,"block":false}),
                root.path(),
                "s",
                true,
            )
            .await
            .unwrap();
            if output.artifact["task"]["stdout"]
                .as_str()
                .unwrap()
                .contains("descendant-started")
            {
                started = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(started, "test child did not start");
        execute("TaskStop", &json!({"task_id":id}), root.path(), "s", true)
            .await
            .unwrap();
        sleep(Duration::from_millis(2500)).await;
        assert!(
            !root.path().join("descendant-escaped.txt").exists(),
            "descendant outlived TaskStop"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn output_directory_cannot_escape_through_a_symlink() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join(".taro")).unwrap();
        assert!(execute(
            shell(),
            &json!({"command":"echo escape"}),
            root.path(),
            "s",
            true
        )
        .await
        .unwrap_err()
        .contains("escapes"));
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn output_directory_cannot_escape_through_a_junction() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let target = outside.path().to_string_lossy().replace('\'', "''");
        let link = root
            .path()
            .join(".taro")
            .to_string_lossy()
            .replace('\'', "''");
        let created = shell_command("powershell.exe","PowerShell", &format!("New-Item -ItemType Junction -Path '{link}' -Value '{target}' -ErrorAction Stop | Out-Null"), root.path()).output().await.unwrap();
        assert!(
            created.status.success(),
            "{}",
            String::from_utf8_lossy(&created.stderr)
        );
        let denied = execute(
            shell(),
            &json!({"command":"echo escape"}),
            root.path(),
            "s",
            true,
        )
        .await
        .unwrap_err();
        assert!(denied.contains("escapes"));
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
        fs::remove_dir(root.path().join(".taro")).unwrap();
    }
}
