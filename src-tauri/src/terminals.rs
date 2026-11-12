use base64::{engine::general_purpose::STANDARD, Engine};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::{HashMap, VecDeque},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};

const OUTPUT_CAPACITY: usize = 1024 * 1024;
const READ_PAGE_SIZE: usize = 64 * 1024;
const MAX_SESSIONS: usize = 8;
const MAX_INPUT_SIZE: usize = 64 * 1024;
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

// This registry contains only terminals explicitly opened by the user. Agent
// background tasks have a separate registry and cannot supply a writable ID here.
#[derive(Default, Clone)]
pub struct TerminalManager(Arc<Registry>);
#[derive(Default)]
struct Registry(Mutex<HashMap<String, Arc<Session>>>);
struct Session {
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    killer: Mutex<Option<Box<dyn ChildKiller + Send + Sync>>>,
    output: Arc<Mutex<OutputBuffer>>,
    closed: AtomicBool,
    #[cfg(windows)]
    job: Mutex<Option<ProcessJob>>,
}
#[derive(Default)]
struct OutputBuffer {
    bytes: VecDeque<u8>,
    end: u64,
    exit_code: Option<u32>,
    error: Option<String>,
    eof: bool,
}
// portable-pty asks ConPTY to inherit a cursor. We answer its initial query
// before spawning the shell, so forwarding that query would make xterm send a
// second response into the user's command line. Keep later application queries.
#[cfg(windows)]
#[derive(Default)]
struct InitialCursorQuery {
    pending: Vec<u8>,
    consumed: bool,
}
#[cfg(windows)]
impl InitialCursorQuery {
    fn filter(&mut self, bytes: &[u8]) -> Vec<u8> {
        const QUERY: &[u8] = b"\x1b[6n";
        let mut visible = Vec::with_capacity(bytes.len());
        for &byte in bytes {
            if self.consumed {
                visible.push(byte);
                continue;
            }
            self.pending.push(byte);
            while !QUERY.starts_with(&self.pending) {
                visible.push(self.pending.remove(0));
            }
            if self.pending == QUERY {
                self.pending.clear();
                self.consumed = true;
            }
        }
        visible
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInfo {
    id: String,
    owner: String,
    shell: String,
    workspace_root: String,
    pid: Option<u32>,
    cols: u16,
    rows: u16,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalPage {
    data: String,
    cursor: u64,
    truncated: bool,
    exited: bool,
    exit_code: Option<u32>,
    error: Option<String>,
}
impl OutputBuffer {
    fn append(&mut self, bytes: &[u8]) {
        self.end += bytes.len() as u64;
        if bytes.len() >= OUTPUT_CAPACITY {
            self.bytes.clear();
            self.bytes.extend(&bytes[bytes.len() - OUTPUT_CAPACITY..]);
        } else {
            let excess = (self.bytes.len() + bytes.len()).saturating_sub(OUTPUT_CAPACITY);
            self.bytes.drain(..excess);
            self.bytes.extend(bytes);
        }
    }
    fn page(&self, cursor: u64) -> Result<TerminalPage, String> {
        if cursor > self.end {
            return Err("Terminal cursor is ahead of output".into());
        }
        let start = self.end - self.bytes.len() as u64;
        let offset = cursor.max(start);
        let bytes: Vec<_> = self
            .bytes
            .iter()
            .skip((offset - start) as usize)
            .take(READ_PAGE_SIZE)
            .copied()
            .collect();
        Ok(TerminalPage {
            cursor: offset + bytes.len() as u64,
            data: STANDARD.encode(&bytes),
            truncated: cursor < start,
            // Both the PTY reader and this caller must drain the final bytes
            // before the UI stops polling (a page is capped at 64 KiB).
            exited: self.exit_code.is_some() && self.eof && offset + bytes.len() as u64 == self.end,
            exit_code: self.exit_code,
            error: self.error.clone(),
        })
    }
}
impl TerminalManager {
    fn create(
        &self,
        workspace_root: &str,
        shell: &str,
        cols: u16,
        rows: u16,
    ) -> Result<TerminalInfo, String> {
        let size = terminal_size(cols, rows)?;
        if workspace_root.trim().is_empty() {
            return Err("Choose a workspace before opening a terminal".into());
        }
        let root = Path::new(workspace_root)
            .canonicalize()
            .map_err(|e| format!("Cannot open workspace: {e}"))?;
        if !root.is_dir() {
            return Err("Terminal workspace must be a directory".into());
        }
        let mut command = shell_command(shell)?;
        command.cwd(shell_directory(&root));
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("CHERE_INVOKING", "1");
        // Hold the registry across creation so concurrent requests cannot exceed the cap.
        let mut sessions = self.0 .0.lock().map_err(|e| e.to_string())?;
        if sessions.len() >= MAX_SESSIONS {
            return Err("Close a terminal before opening another (maximum 8)".into());
        }
        let pair = native_pty_system()
            .openpty(size)
            .map_err(|e| format!("Cannot open native terminal: {e}"))?;
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        // ConPTY requests the cursor position when initializing an inherited cursor.
        // A new tab starts at 1,1; satisfy that request before synchronous shell
        // startup, since the frontend cannot poll until this command returns.
        #[cfg(windows)]
        writer.write_all(b"\x1b[1;1R").map_err(|e| e.to_string())?;
        let mut child = pair.slave.spawn_command(command).map_err(|e| {
            format!("Cannot start {shell}: {e}. Check that the shell is installed.")
        })?;
        drop(pair.slave);
        let pid = child.process_id();
        #[cfg(windows)]
        let job = match ProcessJob::attach(child.as_raw_handle()) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };
        let output = Arc::new(Mutex::new(OutputBuffer::default()));
        let session = Arc::new(Session {
            master: Mutex::new(Some(pair.master)),
            writer: Mutex::new(Some(writer)),
            killer: Mutex::new(Some(child.clone_killer())),
            output: output.clone(),
            closed: AtomicBool::new(false),
            #[cfg(windows)]
            job: Mutex::new(Some(job)),
        });
        let reader_output = output.clone();
        if let Err(error) = std::thread::Builder::new()
            .name("taro-terminal-output".into())
            .spawn(move || {
                let mut buffer = [0u8; 8192];
                #[cfg(windows)]
                let mut initial_cursor_query = InitialCursorQuery::default();
                loop {
                    match reader.read(&mut buffer) {
                        Ok(0) => break,
                        Ok(count) => {
                            if let Ok(mut output) = reader_output.lock() {
                                #[cfg(windows)]
                                let bytes = initial_cursor_query.filter(&buffer[..count]);
                                #[cfg(not(windows))]
                                let bytes = &buffer[..count];
                                output.append(&bytes);
                            }
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                        Err(error) => {
                            // Windows reports broken pipe when the pseudoconsole closes.
                            if !matches!(
                                error.kind(),
                                std::io::ErrorKind::BrokenPipe | std::io::ErrorKind::UnexpectedEof
                            ) {
                                if let Ok(mut output) = reader_output.lock() {
                                    output.error = Some(error.to_string());
                                }
                            }
                            break;
                        }
                    }
                }
                if let Ok(mut output) = reader_output.lock() {
                    #[cfg(windows)]
                    output.append(&initial_cursor_query.pending);
                    output.eof = true;
                }
            })
        {
            session.shutdown();
            let _ = child.wait();
            return Err(format!("Cannot start terminal reader: {error}"));
        }
        let weak_session = Arc::downgrade(&session);
        if let Err(error) = std::thread::Builder::new()
            .name("taro-terminal-process".into())
            .spawn(move || {
                let result = child.wait();
                if let Ok(mut output) = output.lock() {
                    match result {
                        Ok(status) => output.exit_code = Some(status.exit_code()),
                        Err(error) => {
                            output.exit_code = Some(1);
                            output.error = Some(error.to_string());
                        }
                    }
                }
                if let Some(session) = weak_session.upgrade() {
                    session.shutdown();
                }
            })
        {
            session.shutdown();
            return Err(format!("Cannot start terminal monitor: {error}"));
        }
        let id = format!(
            "user-terminal-{}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        );
        sessions.insert(id.clone(), session);
        Ok(TerminalInfo {
            id,
            owner: "user".into(),
            shell: shell.into(),
            workspace_root: root.to_string_lossy().into_owned(),
            pid,
            cols,
            rows,
        })
    }
    fn get(&self, id: &str) -> Result<Arc<Session>, String> {
        self.0
             .0
            .lock()
            .map_err(|e| e.to_string())?
            .get(id)
            .cloned()
            .ok_or_else(|| "User terminal not found or already closed".into())
    }
    fn read(&self, id: &str, cursor: u64) -> Result<TerminalPage, String> {
        self.get(id)?
            .output
            .lock()
            .map_err(|e| e.to_string())?
            .page(cursor)
    }
    fn write(&self, id: &str, data: &str) -> Result<(), String> {
        if data.len() > MAX_INPUT_SIZE {
            return Err("Terminal input exceeds 64 KiB".into());
        }
        let session = self.get(id)?;
        let mut writer = session.writer.lock().map_err(|e| e.to_string())?;
        let writer = writer.as_mut().ok_or("Terminal process has exited")?;
        writer
            .write_all(data.as_bytes())
            .and_then(|_| writer.flush())
            .map_err(|e| format!("Cannot write terminal input: {e}"))
    }
    fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let size = terminal_size(cols, rows)?;
        self.get(id)?
            .master
            .lock()
            .map_err(|e| e.to_string())?
            .as_ref()
            .ok_or("Terminal process has exited")?
            .resize(size)
            .map_err(|e| e.to_string())
    }
    fn close(&self, id: &str) -> Result<(), String> {
        let session = self.0 .0.lock().map_err(|e| e.to_string())?.remove(id);
        if let Some(session) = session {
            session.shutdown();
        }
        Ok(())
    }
    pub fn close_all(&self) {
        let sessions = self
            .0
             .0
            .lock()
            .map(|mut sessions| {
                sessions
                    .drain()
                    .map(|(_, session)| session)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        for session in sessions {
            session.shutdown();
        }
    }
}

impl Session {
    fn shutdown(&self) {
        if self.closed.swap(true, Ordering::AcqRel) {
            return;
        }
        // Kill first: a shell not reading stdin must not block shutdown on a writer.
        #[cfg(windows)]
        if let Ok(mut job) = self.job.lock() {
            job.take();
        }
        if let Ok(mut killer) = self.killer.lock() {
            if let Some(mut killer) = killer.take() {
                let _ = killer.kill();
            }
        }
        if let Ok(mut writer) = self.writer.lock() {
            writer.take();
        }
        // The output reader remains active while ClosePseudoConsole drains output.
        if let Ok(mut master) = self.master.lock() {
            master.take();
        }
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        self.shutdown();
    }
}
impl Drop for Registry {
    fn drop(&mut self) {
        if let Ok(sessions) = self.0.get_mut() {
            for (_, session) in sessions.drain() {
                session.shutdown();
            }
        }
    }
}
fn terminal_size(cols: u16, rows: u16) -> Result<PtySize, String> {
    if cols == 0 || rows == 0 || cols > 1000 || rows > 500 {
        return Err("Terminal size must be 1–1000 columns and 1–500 rows".into());
    }
    Ok(PtySize {
        cols,
        rows,
        pixel_width: 0,
        pixel_height: 0,
    })
}
fn shell_directory(root: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        // cmd treats canonical \\?\ DOS paths as UNC and silently falls back to Windows.
        let text = root.to_string_lossy();
        if let Some(unc) = text.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{unc}"));
        }
        if let Some(path) = text.strip_prefix(r"\\?\") {
            return PathBuf::from(path);
        }
    }
    root.to_path_buf()
}
fn shell_command(shell: &str) -> Result<CommandBuilder, String> {
    #[cfg(windows)]
    {
        let windows = std::env::var_os("SystemRoot")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
        match shell {
            "cmd" => {
                let mut command = CommandBuilder::new(windows.join("System32").join("cmd.exe"));
                command.arg("/D");
                Ok(command)
            }
            "powershell" => {
                let mut command = CommandBuilder::new(
                    windows.join(r"System32\WindowsPowerShell\v1.0\powershell.exe"),
                );
                command.args(["-NoLogo", "-NoProfile"]);
                Ok(command)
            }
            "bash" => {
                let mut candidates = Vec::new();
                for variable in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
                    if let Some(base) = std::env::var_os(variable) {
                        candidates.push(PathBuf::from(&base).join(r"Git\bin\bash.exe"));
                        candidates.push(PathBuf::from(base).join(r"Programs\Git\bin\bash.exe"));
                    }
                }
                if let Some(path) = std::env::var_os("PATH") {
                    candidates.extend(
                        std::env::split_paths(&path)
                            .filter(|path| path.is_absolute())
                            .map(|path| path.join("bash.exe")),
                    );
                }
                let executable = candidates
                    .into_iter()
                    .find(|path| path.is_file())
                    .ok_or("Bash is not installed. Install Git for Windows and reopen Taro.")?;
                let mut command = CommandBuilder::new(executable);
                command.args(["--noprofile", "--norc", "-i"]);
                Ok(command)
            }
            _ => Err("Unsupported terminal shell. Choose cmd, powershell, or bash".into()),
        }
    }
    #[cfg(not(windows))]
    {
        if shell != "bash" {
            return Err("This terminal shell is only available on Windows".into());
        }
        let mut command = CommandBuilder::new("/bin/bash");
        command.args(["--noprofile", "--norc", "-i"]);
        Ok(command)
    }
}

// A kill-on-close job contains the shell and processes launched from it. This
// avoids leaving build tools or interactive programs behind when a tab/app closes.
#[cfg(windows)]
pub(crate) struct ProcessJob(std::os::windows::io::OwnedHandle);
#[cfg(windows)]
impl ProcessJob {
    pub(crate) fn attach(process: Option<std::os::windows::io::RawHandle>) -> Result<Self, String> {
        use std::{
            mem::{size_of, zeroed},
            os::windows::io::{AsRawHandle, FromRawHandle},
        };
        use windows_sys::Win32::{
            Foundation::CloseHandle,
            System::JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
        };
        let process = process.ok_or("Terminal process has no native handle")?;
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(format!(
                    "Cannot create terminal process group: {}",
                    std::io::Error::last_os_error()
                ));
            }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
            {
                let error = std::io::Error::last_os_error();
                CloseHandle(handle);
                return Err(format!("Cannot configure terminal process group: {error}"));
            }
            let job = Self(std::os::windows::io::OwnedHandle::from_raw_handle(handle));
            if AssignProcessToJobObject(job.0.as_raw_handle(), process) == 0 {
                return Err(format!(
                    "Cannot isolate terminal process group: {}",
                    std::io::Error::last_os_error()
                ));
            }
            Ok(job)
        }
    }
}
#[tauri::command]
pub async fn terminal_create(
    workspace_root: String,
    shell: String,
    cols: u16,
    rows: u16,
    terminals: tauri::State<'_, TerminalManager>,
) -> Result<TerminalInfo, String> {
    let manager = terminals.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        manager.create(&workspace_root, &shell, cols, rows)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn terminal_read(
    id: String,
    cursor: u64,
    terminals: tauri::State<'_, TerminalManager>,
) -> Result<TerminalPage, String> {
    let manager = terminals.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.read(&id, cursor))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn terminal_write(
    id: String,
    data: String,
    terminals: tauri::State<'_, TerminalManager>,
) -> Result<(), String> {
    let manager = terminals.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.write(&id, &data))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn terminal_resize(
    id: String,
    cols: u16,
    rows: u16,
    terminals: tauri::State<'_, TerminalManager>,
) -> Result<(), String> {
    let manager = terminals.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.resize(&id, cols, rows))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn terminal_close(
    id: String,
    terminals: tauri::State<'_, TerminalManager>,
) -> Result<(), String> {
    let manager = terminals.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.close(&id))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use std::{
        thread,
        time::{Duration, Instant},
    };

    fn collect_until(manager: &TerminalManager, id: &str, needle: &str) -> String {
        let deadline = Instant::now() + Duration::from_secs(20);
        let mut cursor = 0;
        let mut bytes = Vec::new();
        loop {
            let page = manager.read(id, cursor).unwrap();
            bytes.extend(STANDARD.decode(&page.data).unwrap());
            cursor = page.cursor;
            let text = String::from_utf8_lossy(&bytes);
            if text.contains(needle) {
                return text.into_owned();
            }
            assert!(
                Instant::now() < deadline,
                "Missing {needle:?} in terminal output: {text:?}"
            );
            thread::sleep(Duration::from_millis(30));
        }
    }

    #[cfg(windows)]
    #[test]
    fn initial_cursor_query_is_filtered_across_chunks_but_later_queries_are_preserved() {
        let mut filter = InitialCursorQuery::default();
        assert_eq!(filter.filter(b"before\x1b["), b"before");
        assert_eq!(filter.filter(b"6"), b"");
        assert_eq!(filter.filter(b"nafter\x1b[6n"), b"after\x1b[6n");
        let mut filter = InitialCursorQuery::default();
        assert_eq!(filter.filter(b"\x1b[31mhello\x1b[6n"), b"\x1b[31mhello");
    }

    #[test]
    fn rejects_invalid_workspaces_shells_and_sizes_without_starting_a_process() {
        let manager = TerminalManager::default();
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        assert!(manager.create("does-not-exist", "cmd", 80, 24).is_err());
        let file = dir.path().join("a.txt");
        std::fs::write(&file, "file").unwrap();
        assert!(manager
            .create(file.to_str().unwrap(), "cmd", 80, 24)
            .is_err());
        assert!(manager.create(root, "cmd /c calc", 80, 24).is_err());
        assert!(manager.create(root, "cmd", 0, 24).is_err());
        assert!(manager.create(root, "cmd", 80, 65535).is_err());
        assert!(manager.read("agent-task-id", 0).is_err());
        assert!(manager.write("agent-task-id", "whoami\r").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn narrow_progress_preserves_carriage_returns_for_in_place_redraw() {
        let manager = TerminalManager::default();
        let dir = tempfile::tempdir().unwrap();
        let terminal = manager
            .create(dir.path().to_str().unwrap(), "powershell", 40, 24)
            .unwrap();
        manager.write(&terminal.id,"[Console]::Error.Write(\"`rReceiving objects: 1% (656/65599), 116.01 KiB | 156.00 KiB/s\"); Start-Sleep -Milliseconds 100; [Console]::Error.Write(\"`rReceiving objects: 2% (1312/65599), 228.01 KiB | 117.00 KiB/s\"); [Console]::Error.WriteLine('PROGRESS_END')\r").unwrap();
        let output = collect_until(&manager, &terminal.id, "PROGRESS_END\r\n");
        assert!(
            output.contains("\rReceiving objects: 2%"),
            "Progress updates must retain their carriage returns: {output:?}"
        );
        manager.close(&terminal.id).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn cmd_runs_interactively_in_workspace_and_supports_resize_and_cleanup() {
        let manager = TerminalManager::default();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("taro-terminal-cwd.txt"), "TARO_CWD_OK_7621").unwrap();
        let terminal = manager
            .create(dir.path().to_str().unwrap(), "cmd", 80, 24)
            .unwrap();
        assert_eq!(terminal.owner, "user");
        assert!(terminal.pid.is_some());
        manager
            .write(&terminal.id, "type taro-terminal-cwd.txt\r")
            .unwrap();
        let output = collect_until(&manager, &terminal.id, "TARO_CWD_OK_7621");
        assert!(!output.contains("\x1b[6n"), "Initial cursor query was already answered by the backend and must not reach xterm: {output:?}");
        manager.resize(&terminal.id, 121, 37).unwrap();
        assert_eq!(
            manager
                .get(&terminal.id)
                .unwrap()
                .master
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .get_size()
                .unwrap()
                .cols,
            121
        );
        manager.write(&terminal.id, "exit /b 7\r").unwrap();
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let page = manager.read(&terminal.id, 0).unwrap();
            if page.exited {
                assert_eq!(page.exit_code, Some(7));
                break;
            }
            assert!(Instant::now() < deadline, "cmd did not exit");
            thread::sleep(Duration::from_millis(30));
        }
        manager.close(&terminal.id).unwrap();
        assert!(manager.read(&terminal.id, 0).is_err());
        manager.close(&terminal.id).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn powershell_accepts_input_and_close_terminates_the_live_process() {
        let manager = TerminalManager::default();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("taro-ps-cwd.txt"), "TARO_PS_OK_8912").unwrap();
        let terminal = manager
            .create(dir.path().to_str().unwrap(), "powershell", 100, 30)
            .unwrap();
        manager
            .write(
                &terminal.id,
                "Get-Content -LiteralPath './taro-ps-cwd.txt'\r",
            )
            .unwrap();
        collect_until(&manager, &terminal.id, "TARO_PS_OK_8912");
        let pid_file = dir.path().join("child.pid");
        manager.write(&terminal.id, &format!(
            "$child = Start-Process -FilePath powershell.exe -ArgumentList '-NoLogo','-NoProfile','-Command','Start-Sleep 1000' -PassThru; $child.Id | Set-Content -LiteralPath '{}'\r",
            pid_file.display()
        )).unwrap();
        let deadline = Instant::now() + Duration::from_secs(20);
        let child_pid = loop {
            if let Ok(pid) = std::fs::read_to_string(&pid_file) {
                if let Ok(pid) = pid.trim().parse::<u32>() {
                    break pid;
                }
            }
            assert!(
                Instant::now() < deadline,
                "PowerShell did not start its child"
            );
            thread::sleep(Duration::from_millis(30));
        };
        use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
        use windows_sys::Win32::System::Threading::{
            OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE,
        };
        let child_handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, child_pid) };
        assert!(
            !child_handle.is_null(),
            "Cannot observe child process {child_pid}"
        );
        let child_handle = unsafe { OwnedHandle::from_raw_handle(child_handle) };
        assert_eq!(
            unsafe { WaitForSingleObject(child_handle.as_raw_handle(), 0) },
            258,
            "Child exited before terminal close"
        );
        let session = manager.get(&terminal.id).unwrap();
        manager.close(&terminal.id).unwrap();
        assert_eq!(
            unsafe { WaitForSingleObject(child_handle.as_raw_handle(), 10_000) },
            0,
            "Terminal child survived close"
        );
        let deadline = Instant::now() + Duration::from_secs(10);
        while session.output.lock().unwrap().exit_code.is_none() {
            assert!(Instant::now() < deadline, "PowerShell survived close");
            thread::sleep(Duration::from_millis(30));
        }
        assert!(manager
            .write(&terminal.id, "echo should-not-run\r")
            .is_err());
    }

    #[cfg(windows)]
    #[test]
    fn bash_starts_in_workspace_and_close_all_terminates_the_shell() {
        let manager = TerminalManager::default();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("taro-bash-cwd.txt"), "TARO_BASH_OK_4138").unwrap();
        let terminal = manager
            .create(dir.path().to_str().unwrap(), "bash", 80, 24)
            .unwrap();
        manager
            .write(&terminal.id, "cat ./taro-bash-cwd.txt\r")
            .unwrap();
        collect_until(&manager, &terminal.id, "TARO_BASH_OK_4138");
        manager.write(&terminal.id, "sleep 1000\r").unwrap();
        let session = manager.get(&terminal.id).unwrap();
        manager.close_all();
        assert!(manager.read(&terminal.id, 0).is_err());
        let deadline = Instant::now() + Duration::from_secs(10);
        while session.output.lock().unwrap().exit_code.is_none() {
            assert!(Instant::now() < deadline, "Bash survived close_all");
            thread::sleep(Duration::from_millis(30));
        }
    }

    #[test]
    fn output_is_bounded_paginated_and_reports_stale_cursors_without_corrupting_bytes() {
        let mut output = OutputBuffer::default();
        output.append(&vec![b'a'; OUTPUT_CAPACITY + 11]);
        output.append("🦀".as_bytes());
        let page = output.page(0).unwrap();
        assert!(page.truncated);
        assert_eq!(STANDARD.decode(&page.data).unwrap().len(), READ_PAGE_SIZE);
        let mut cursor = page.cursor;
        let mut remaining = Vec::new();
        while cursor < output.end {
            let page = output.page(cursor).unwrap();
            remaining.extend(STANDARD.decode(&page.data).unwrap());
            cursor = page.cursor;
        }
        assert!(remaining.ends_with("🦀".as_bytes()));
        assert!(output.page(output.end + 1).is_err());
    }

    #[test]
    fn exited_is_reported_only_after_the_last_output_page() {
        let mut output = OutputBuffer::default();
        output.append(&vec![b'x'; READ_PAGE_SIZE + 1]);
        output.exit_code = Some(0);
        output.eof = true;
        let first = output.page(0).unwrap();
        assert!(
            !first.exited,
            "Final output must be drained before polling stops"
        );
        let last = output.page(first.cursor).unwrap();
        assert_eq!(STANDARD.decode(last.data).unwrap(), b"x");
        assert!(last.exited);
    }
}
