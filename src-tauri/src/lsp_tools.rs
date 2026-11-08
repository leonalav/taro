//! Installed stdio language servers only; nothing is installed automatically.
//! `.taro/lsp.json` example (takes precedence over the reference-style `.lsp.json`):
//! ```json
//! {"servers":{"typescript":{"command":"typescript-language-server","args":["--stdio"],
//!   "extensionToLanguage":{".ts":"typescript",".tsx":"typescriptreact"}}}}
//! ```
//! `.lsp.json` also accepts the direct server-name map. Optional per-server
//! `initializationOptions` and `settings` are passed to the server. A configured
//! extension overrides PATH defaults. Each approved invocation has its own server.
use crate::agent_tools::ToolOutput;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    time::timeout,
};

const MAX_MESSAGE: usize = 8 * 1024 * 1024;
const MAX_SOURCE: u64 = 4 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const TOTAL_TIMEOUT: Duration = Duration::from_secs(65);

#[derive(Debug)]
struct Server {
    name: String,
    command: String,
    args: Vec<String>,
    language: String,
    initialization_options: Value,
    settings: Value,
}

fn string<'a>(input: &'a Value, name: &str) -> Result<&'a str, String> {
    input
        .get(name)
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| format!("LSP requires a nonempty {name}"))
}

// Editor columns are one-based UTF-16 code units, as in LSP-aware editors.
// Reject a position inside a surrogate pair instead of sending an invalid offset.
fn position(source: &str, line: u64, character: u64) -> Result<Value, String> {
    if line == 0 || character == 0 || line > u32::MAX as u64 || character > u32::MAX as u64 {
        return Err("LSP line and character must be positive 1-based integers".into());
    }
    let text = source
        .split('\n')
        .nth((line - 1) as usize)
        .ok_or("LSP line is outside the source file")?
        .trim_end_matches('\r');
    let wanted = (character - 1) as usize;
    let mut offset = 0;
    for ch in text.chars() {
        if offset == wanted {
            break;
        }
        offset += ch.len_utf16();
    }
    if offset != wanted {
        return Err("LSP character is outside the line or splits a UTF-16 surrogate pair".into());
    }
    Ok(json!({"line":line-1,"character":character-1}))
}

fn file_uri(path: &Path) -> Result<String, String> {
    let raw = path
        .to_str()
        .ok_or("LSP requires a UTF-8 file path")?
        .replace('\\', "/");
    let raw = raw
        .strip_prefix("//?/UNC/")
        .map(|v| format!("//{v}"))
        .unwrap_or_else(|| raw.strip_prefix("//?/").unwrap_or(&raw).to_string());
    let mut encoded = String::new();
    for byte in raw.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~/:".contains(&byte) {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    if encoded.starts_with("//") {
        Ok(format!("file:{encoded}"))
    } else if encoded.starts_with('/') {
        Ok(format!("file://{encoded}"))
    } else {
        Ok(format!("file:///{encoded}"))
    }
}

fn configured_server(value: &Value, extension: &str) -> Result<Option<Server>, String> {
    let map = value
        .get("servers")
        .unwrap_or(value)
        .as_object()
        .ok_or("LSP configuration must be an object of named servers")?;
    let mut selected = None;
    for (name, entry) in map {
        let command = string(entry, "command")?;
        if command.contains(['\0', '\r', '\n']) || command.len() > 8192 {
            return Err(format!("Invalid command for LSP server {name}"));
        }
        let args = match entry.get("args") {
            None => vec![],
            Some(Value::Array(args)) if args.len() <= 128 => args
                .iter()
                .map(|arg| {
                    arg.as_str()
                        .filter(|s| s.len() <= 8192 && !s.contains('\0'))
                        .map(str::to_owned)
                        .ok_or_else(|| format!("LSP server {name} args must be strings"))
                })
                .collect::<Result<Vec<_>, _>>()?,
            _ => {
                return Err(format!(
                    "LSP server {name} args must be an array of at most 128 strings"
                ))
            }
        };
        let extensions = entry
            .get("extensionToLanguage")
            .and_then(Value::as_object)
            .ok_or_else(|| {
                format!(
                    "LSP server {name} needs extensionToLanguage, e.g. {{\".ts\":\"typescript\"}}"
                )
            })?;
        for (ext, language) in extensions {
            if !ext.starts_with('.') || language.as_str().filter(|s| !s.is_empty()).is_none() {
                return Err(format!("Invalid extensionToLanguage for LSP server {name}"));
            }
        }
        if let Some(language) = extensions.get(extension).and_then(Value::as_str) {
            if selected.is_some() {
                return Err(format!(
                    "Multiple LSP servers configured for {extension}; keep one mapping"
                ));
            }
            selected = Some(Server {
                name: name.clone(),
                command: command.into(),
                args,
                language: language.into(),
                initialization_options: entry
                    .get("initializationOptions")
                    .cloned()
                    .unwrap_or(Value::Null),
                settings: entry.get("settings").cloned().unwrap_or_else(|| json!({})),
            });
        }
    }
    Ok(selected)
}

fn select_server(root: &Path, file: &Path) -> Result<Server, String> {
    let extension = format!(
        ".{}",
        file.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase()
    );
    for config in [root.join(".taro/lsp.json"), root.join(".lsp.json")] {
        if config.exists() {
            let canonical =
                fs::canonicalize(&config).map_err(|e| format!("Cannot open LSP config: {e}"))?;
            if !canonical.starts_with(root) {
                return Err("LSP configuration must be inside the workspace".into());
            }
            let bytes = read_bounded(&canonical, 256 * 1024)?;
            let config: Value = serde_json::from_slice(&bytes)
                .map_err(|e| format!("Invalid LSP config {}: {e}", canonical.display()))?;
            if let Some(server) = configured_server(&config, &extension)? {
                return Ok(server);
            }
            break;
        }
    }
    let (command, args, language) = match extension.as_str() {
        ".ts" | ".mts" | ".cts" => ("typescript-language-server", vec!["--stdio"], "typescript"),
        ".tsx" => ("typescript-language-server", vec!["--stdio"], "typescriptreact"),
        ".js" | ".mjs" | ".cjs" => ("typescript-language-server", vec!["--stdio"], "javascript"),
        ".jsx" => ("typescript-language-server", vec!["--stdio"], "javascriptreact"),
        ".rs" => ("rust-analyzer", vec![], "rust"),
        ".py" | ".pyi" => ("pyright-langserver", vec!["--stdio"], "python"),
        ".go" => ("gopls", vec![], "go"),
        ".json" | ".jsonc" => ("vscode-json-language-server", vec!["--stdio"], "json"),
        _ => return Err(format!("No installed/default LSP server mapping for {extension}. Configure .taro/lsp.json with command, args, extensionToLanguage.")),
    };
    Ok(Server {
        name: command.into(),
        command: command.into(),
        args: args.into_iter().map(str::to_owned).collect(),
        language: language.into(),
        initialization_options: Value::Null,
        settings: json!({}),
    })
}

fn read_bounded(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    use std::io::Read;
    if !fs::metadata(path).map_err(|e| e.to_string())?.is_file() {
        return Err("LSP source/config must be a regular file".into());
    }
    let file = fs::File::open(path).map_err(|e| format!("Cannot open {}: {e}", path.display()))?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("LSP source/config must be a regular file".into());
    }
    let mut bytes = Vec::new();
    file.take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > max {
        return Err(format!("LSP file exceeds {max} byte limit"));
    }
    Ok(bytes)
}

async fn read_frame<R: AsyncRead + Unpin>(reader: &mut R) -> Result<Value, String> {
    let mut header = Vec::new();
    while !header.ends_with(b"\r\n\r\n") {
        if header.len() >= 8192 {
            return Err("LSP header exceeds 8 KiB".into());
        }
        header.push(
            reader.read_u8().await.map_err(|e| {
                format!("LSP server closed or sent incomplete protocol output: {e}")
            })?,
        );
    }
    let header = std::str::from_utf8(&header).map_err(|_| "Invalid LSP protocol header")?;
    let mut length = None;
    for line in header.split("\r\n").filter(|line| !line.is_empty()) {
        let (name, value) = line.split_once(':').ok_or("Invalid LSP protocol header")?;
        if name.eq_ignore_ascii_case("Content-Length") {
            if length.is_some() {
                return Err("Duplicate LSP Content-Length".into());
            }
            length = Some(
                value
                    .trim()
                    .parse::<usize>()
                    .map_err(|_| "Invalid LSP Content-Length")?,
            );
        }
    }
    let length = length.ok_or("Missing LSP Content-Length")?;
    if length > MAX_MESSAGE {
        return Err("LSP response exceeds 8 MiB".into());
    }
    let mut body = vec![0; length];
    reader
        .read_exact(&mut body)
        .await
        .map_err(|e| format!("Incomplete LSP response: {e}"))?;
    serde_json::from_slice(&body).map_err(|e| format!("Invalid LSP JSON-RPC response: {e}"))
}

struct Client {
    // Closing the Windows job also kills descendants of npm .cmd shims.
    #[cfg(windows)]
    _job: process_job::Job,
    #[cfg(unix)]
    group: process_group::Group,
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
    received: usize,
    frames: usize,
    workspace: Value,
    settings: Value,
}

#[cfg(unix)]
mod process_group {
    extern "C" {
        fn kill(pid: i32, signal: i32) -> i32;
    }

    pub struct Group(Option<i32>);
    impl Group {
        pub fn attach(child: &tokio::process::Child) -> Result<Self, String> {
            let pid = child
                .id()
                .and_then(|pid| i32::try_from(pid).ok())
                .filter(|pid| *pid > 0)
                .ok_or("LSP process group ID is unavailable")?;
            Ok(Self(Some(pid)))
        }

        pub fn terminate(&mut self) {
            if let Some(group) = self.0.take() {
                // The server was launched with process_group(0), so this negative
                // PID addresses only the group created for this invocation.
                unsafe {
                    kill(-group, 9);
                }
            }
        }
    }
    impl Drop for Group {
        fn drop(&mut self) {
            self.terminate();
        }
    }
}

#[cfg(windows)]
mod process_job {
    use std::ffi::c_void;
    #[repr(C)]
    #[derive(Default)]
    struct BasicLimits {
        process_time: i64,
        job_time: i64,
        flags: u32,
        min_working_set: usize,
        max_working_set: usize,
        active_processes: u32,
        affinity: usize,
        priority: u32,
        scheduling: u32,
    }
    #[repr(C)]
    #[derive(Default)]
    struct ExtendedLimits {
        basic: BasicLimits,
        io_counters: [u64; 6],
        process_memory: usize,
        job_memory: usize,
        peak_process_memory: usize,
        peak_job_memory: usize,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn CreateJobObjectW(attributes: *const c_void, name: *const u16) -> *mut c_void;
        fn SetInformationJobObject(
            job: *mut c_void,
            class: i32,
            info: *const c_void,
            size: u32,
        ) -> i32;
        fn AssignProcessToJobObject(job: *mut c_void, process: *mut c_void) -> i32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }
    pub struct Job(usize);
    impl Job {
        pub fn attach(child: &tokio::process::Child) -> Result<Self, String> {
            // These handles are only passed back to Win32, never dereferenced.
            let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if handle.is_null() {
                return Err(format!(
                    "Cannot create LSP process job: {}",
                    std::io::Error::last_os_error()
                ));
            }
            let job = Self(handle as usize);
            let mut limits = ExtendedLimits::default();
            limits.basic.flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            let process = child.raw_handle().ok_or("LSP process handle unavailable")?;
            if unsafe {
                SetInformationJobObject(
                    handle,
                    9,
                    &limits as *const _ as *const c_void,
                    std::mem::size_of::<ExtendedLimits>() as u32,
                )
            } == 0
                || unsafe { AssignProcessToJobObject(handle, process) } == 0
            {
                return Err(format!(
                    "Cannot contain LSP process tree: {}",
                    std::io::Error::last_os_error()
                ));
            }
            Ok(job)
        }
    }
    impl Drop for Job {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0 as *mut c_void);
            }
        }
    }
}

impl Client {
    async fn send(&mut self, message: Value) -> Result<(), String> {
        let body = serde_json::to_vec(&message).map_err(|e| e.to_string())?;
        if body.len() > MAX_MESSAGE {
            return Err("LSP request exceeds 8 MiB".into());
        }
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        self.stdin
            .write_all(header.as_bytes())
            .await
            .map_err(|e| format!("LSP stdin: {e}"))?;
        self.stdin
            .write_all(&body)
            .await
            .map_err(|e| format!("LSP stdin: {e}"))?;
        self.stdin.flush().await.map_err(|e| e.to_string())
    }

    async fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
        self.send(json!({"jsonrpc":"2.0","method":method,"params":params}))
            .await
    }

    async fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        timeout(REQUEST_TIMEOUT, self.request_inner(method, params))
            .await
            .map_err(|_| {
                format!(
                    "LSP {method} timed out after {} seconds",
                    REQUEST_TIMEOUT.as_secs()
                )
            })?
    }

    async fn request_inner(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        self.send(json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))
            .await?;
        loop {
            let message = read_frame(&mut self.stdout).await?;
            self.frames += 1;
            self.received += message.to_string().len();
            if self.frames > 2048 || self.received > 32 * 1024 * 1024 {
                return Err("LSP server exceeded response/notification budget".into());
            }
            if let Some(method) = message.get("method").and_then(Value::as_str) {
                if let Some(request_id) = message.get("id") {
                    let params = message.get("params").unwrap_or(&Value::Null);
                    let result = match method {
                        "workspace/configuration" => Some(Value::Array(
                            params
                                .get("items")
                                .and_then(Value::as_array)
                                .map(|items| {
                                    items
                                        .iter()
                                        .map(|item| {
                                            item.get("section")
                                                .and_then(Value::as_str)
                                                .filter(|s| !s.is_empty())
                                                .map(|section| {
                                                    section
                                                        .split('.')
                                                        .try_fold(&self.settings, |value, key| {
                                                            value.get(key)
                                                        })
                                                        .cloned()
                                                        .unwrap_or(Value::Null)
                                                })
                                                .unwrap_or_else(|| self.settings.clone())
                                        })
                                        .collect()
                                })
                                .unwrap_or_default(),
                        )),
                        "workspace/workspaceFolders" => Some(self.workspace.clone()),
                        "client/registerCapability"
                        | "client/unregisterCapability"
                        | "window/workDoneProgress/create" => Some(Value::Null),
                        "window/showMessageRequest" => Some(Value::Null),
                        "workspace/applyEdit" => {
                            Some(json!({"applied":false,"failureReason":"LSP tool is read-only"}))
                        }
                        _ => None,
                    };
                    let reply = match result {
                        Some(result) => json!({"jsonrpc":"2.0","id":request_id,"result":result}),
                        None => {
                            json!({"jsonrpc":"2.0","id":request_id,"error":{"code":-32601,"message":"Client method not supported"}})
                        }
                    };
                    self.send(reply).await?;
                }
                continue;
            }
            if message.get("id").and_then(Value::as_u64) == Some(id) {
                if let Some(error) = message.get("error") {
                    return Err(format!("LSP {method} error: {error}"));
                }
                return message
                    .get("result")
                    .cloned()
                    .ok_or_else(|| "LSP response has no result".into());
            }
        }
    }

    async fn shutdown(&mut self) {
        let _ = timeout(Duration::from_secs(2), async {
            let _ = self.request("shutdown", Value::Null).await;
            let _ = self.notify("exit", Value::Null).await;
            #[cfg(unix)]
            {
                // Give exit a chance to close stdio, without reaping the group
                // leader yet. Keeping its PID reserved prevents a later group
                // cleanup from targeting a reused PID. Descendants holding the
                // pipe open are bounded by this shutdown deadline.
                let mut buffer = [0; 4096];
                for _ in 0..32 {
                    match self.stdout.read(&mut buffer).await {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {}
                    }
                }
            }
            #[cfg(not(unix))]
            let _ = self.child.wait().await;
        })
        .await;
        #[cfg(unix)]
        self.group.terminate();
        let _ = self.child.kill().await;
    }
}

fn resolve_executable(command: &str, root: &Path) -> Result<PathBuf, String> {
    let path = Path::new(command);
    let dirs = if path.is_absolute() || path.components().count() > 1 {
        vec![PathBuf::new()]
    } else {
        std::env::var_os("PATH")
            .map(|s| std::env::split_paths(&s).collect())
            .unwrap_or_default()
    };
    for dir in dirs {
        let candidate = if path.is_absolute() {
            path.to_owned()
        } else if path.components().count() > 1 {
            root.join(path)
        } else {
            dir.join(path)
        };
        if candidate.is_file() {
            return Ok(candidate);
        }
        #[cfg(windows)]
        if candidate.extension().is_none() {
            for extension in ["exe", "cmd", "bat", "com"] {
                let candidate = candidate.with_extension(extension);
                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
        }
    }
    Err(format!("LSP executable '{command}' was not found on PATH. Install that language server or configure its full command path in .taro/lsp.json; Taro does not install servers."))
}

fn server_command(server: &Server, root: &Path) -> Result<Command, String> {
    let executable = resolve_executable(&server.command, root)?;
    #[cfg(windows)]
    {
        let extension = executable
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat") {
            // cmd.exe is required for npm shims. Permit only inert strings: no
            // expansion, command separators, quote escaping, or newlines.
            let mut pieces = vec![executable.to_string_lossy().into_owned()];
            pieces.extend(server.args.iter().cloned());
            if pieces.iter().any(|arg| {
                arg.contains([
                    '&', '|', '<', '>', '^', '%', '!', '"', '\r', '\n', '\0', '(', ')',
                ])
            }) {
                return Err("Unsafe shell characters in LSP .cmd/.bat command/args; configure a direct executable (e.g. node with the server's JavaScript entrypoint)".into());
            }
            let invocation = pieces
                .iter()
                .map(|arg| format!("\"{arg}\""))
                .collect::<Vec<_>>()
                .join(" ");
            let system = std::env::var_os("SystemRoot")
                .ok_or("SystemRoot is missing; configure a direct LSP executable")?;
            // cmd parses its own command line; a forward slash in argv[0]
            // ("System32/cmd.exe") can be mistaken for its /c switch.
            let mut command = Command::new(PathBuf::from(system).join("System32").join("cmd.exe"));
            command.args(["/d", "/s", "/v:off", "/c"]);
            command.raw_arg(format!("\"{invocation}\""));
            command.creation_flags(0x08000000);
            return Ok(command);
        }
    }
    let mut command = Command::new(executable);
    command.args(&server.args);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    Ok(command)
}

pub async fn execute(input: &Value, root: &Path, approved: bool) -> Result<ToolOutput, String> {
    if !approved {
        return Err("User approval is required to launch an LSP executable".into());
    }
    timeout(TOTAL_TIMEOUT, execute_inner(input, root))
        .await
        .map_err(|_| "LSP invocation exceeded the 65 second time limit".to_string())?
}

async fn execute_inner(input: &Value, root: &Path) -> Result<ToolOutput, String> {
    let operation = string(input, "operation")?;
    let method = match operation {
        "goToDefinition" => "textDocument/definition",
        "findReferences" => "textDocument/references",
        "hover" => "textDocument/hover",
        "documentSymbol" => "textDocument/documentSymbol",
        "workspaceSymbol" => "workspace/symbol",
        "goToImplementation" => "textDocument/implementation",
        "prepareCallHierarchy" | "incomingCalls" | "outgoingCalls" => {
            "textDocument/prepareCallHierarchy"
        }
        _ => return Err(format!("Unknown LSP operation: {operation}")),
    };
    let root = fs::canonicalize(root).map_err(|e| format!("LSP workspace unavailable: {e}"))?;
    if !root.is_dir() {
        return Err("LSP workspace must be a directory".into());
    }
    let file = Path::new(string(input, "filePath")?);
    let file = fs::canonicalize(if file.is_absolute() {
        file.to_owned()
    } else {
        root.join(file)
    })
    .map_err(|e| format!("LSP source unavailable: {e}"))?;
    if !file.starts_with(&root) {
        return Err("LSP file is outside the selected workspace".into());
    }
    let source = String::from_utf8(read_bounded(&file, MAX_SOURCE)?)
        .map_err(|_| "LSP source must be UTF-8".to_string())?;
    let line = input
        .get("line")
        .and_then(Value::as_u64)
        .ok_or("LSP line must be a positive integer")?;
    let character = input
        .get("character")
        .and_then(Value::as_u64)
        .ok_or("LSP character must be a positive integer")?;
    let position = position(&source, line, character)?;
    let server = select_server(&root, &file)?;
    let uri = file_uri(&file)?;
    let root_uri = file_uri(&root)?;
    let workspace = json!([{"uri":root_uri,"name":root.file_name().and_then(|s| s.to_str()).unwrap_or("workspace")}]);
    let mut command = server_command(&server, &root)?;
    command
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    #[cfg(unix)]
    command.process_group(0);
    let mut child = command.spawn().map_err(|e| {
        format!(
            "Cannot launch LSP server '{}': {e}. Check .taro/lsp.json and PATH.",
            server.command
        )
    })?;
    #[cfg(windows)]
    let job = process_job::Job::attach(&child)?;
    #[cfg(unix)]
    let group = process_group::Group::attach(&child)?;
    let stdin = child.stdin.take().ok_or("LSP stdin unavailable")?;
    let stdout = child.stdout.take().ok_or("LSP stdout unavailable")?;
    let mut client = Client {
        #[cfg(windows)]
        _job: job,
        #[cfg(unix)]
        group,
        child,
        stdin,
        stdout: BufReader::new(stdout),
        next_id: 0,
        frames: 0,
        received: 0,
        workspace: workspace.clone(),
        settings: server.settings.clone(),
    };
    let response = async {
        let initialized = client.request("initialize", json!({
            "processId":std::process::id(),"clientInfo":{"name":"Taro","version":env!("CARGO_PKG_VERSION")},
            "rootUri":root_uri,"rootPath":root,"workspaceFolders":workspace,
            "initializationOptions":server.initialization_options,
            "capabilities":{"general":{"positionEncodings":["utf-16"]},"workspace":{"configuration":true,"workspaceFolders":true},"textDocument":{"hover":{"contentFormat":["markdown","plaintext"]},"synchronization":{"didSave":false},"callHierarchy":{"dynamicRegistration":false}}}
        })).await?;
        if let Some(encoding) = initialized.pointer("/capabilities/positionEncoding").and_then(Value::as_str) {
            if encoding != "utf-16" { return Err(format!("LSP server selected unsupported position encoding {encoding}; UTF-16 is required")); }
        }
        client.notify("initialized", json!({})).await?;
        client.notify("workspace/didChangeConfiguration", json!({"settings":server.settings})).await?;
        client.notify("textDocument/didOpen", json!({"textDocument":{"uri":uri,"languageId":server.language,"version":1,"text":source}})).await?;
        let params = match operation {
            "documentSymbol" => json!({"textDocument":{"uri":uri}}),
            "workspaceSymbol" => json!({"query":""}),
            "findReferences" => json!({"textDocument":{"uri":uri},"position":position,"context":{"includeDeclaration":true}}),
            _ => json!({"textDocument":{"uri":uri},"position":position}),
        };
        let mut result = client.request(method, params).await?;
        let mut prepared_item = Value::Null;
        if matches!(operation, "incomingCalls" | "outgoingCalls") {
            if let Some(item) = result.as_array().and_then(|items| items.first()).cloned() {
                prepared_item = item.clone();
                result = client.request(if operation == "incomingCalls" { "callHierarchy/incomingCalls" } else { "callHierarchy/outgoingCalls" }, json!({"item":item})).await?;
            } else if !result.is_null() && !result.is_array() {
                return Err("LSP prepareCallHierarchy returned an invalid result".into());
            }
        }
        let count = if result.is_null() { 0 } else { result.as_array().map(Vec::len).unwrap_or(1) };
        let mut rendered = serde_json::to_string(&result).map_err(|e| e.to_string())?;
        if rendered.len() > 64 * 1024 {
            let mut end = 64 * 1024;
            while !rendered.is_char_boundary(end) { end -= 1; }
            rendered.truncate(end);
            rendered.push_str("\n[Text truncated at 64 KiB; full server result is in the artifact]");
        }
        let text = if count == 0 { format!("LSP {operation}: no results.\n{rendered}") }
            else { format!("LSP {operation} ({count} result(s)):\n{rendered}") };
        Ok(ToolOutput { text, artifact: json!({"kind":"lsp","operation":operation,"filePath":file,"server":server.name,"languageId":server.language,"line":line,"character":character,"position":position,"result":result,"resultCount":count,"preparedItem":prepared_item}) })
    }.await;
    client.shutdown().await;
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[tokio::test]
    async fn dropping_process_group_terminates_server_descendants() {
        use tokio::io::AsyncBufReadExt;
        let mut command = Command::new("sh");
        command
            .args(["-c", "sleep 60 & echo $!; wait"])
            .process_group(0)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        let mut child = command.spawn().unwrap();
        let group = process_group::Group::attach(&child).unwrap();
        let mut output = BufReader::new(child.stdout.take().unwrap());
        let mut line = String::new();
        timeout(Duration::from_secs(2), output.read_line(&mut line))
            .await
            .unwrap()
            .unwrap();
        let descendant = line.trim().parse::<u32>().unwrap();
        // This is the same guard drop used when the execute future is cancelled
        // or its overall deadline expires, before Child's kill-on-drop runs.
        drop(group);
        timeout(Duration::from_secs(2), child.wait())
            .await
            .unwrap()
            .unwrap();
        timeout(Duration::from_secs(2), async {
            loop {
                let status = Command::new("ps")
                    .args(["-o", "stat=", "-p", &descendant.to_string()])
                    .output()
                    .await
                    .unwrap();
                let state = String::from_utf8_lossy(&status.stdout);
                // A terminated orphan can briefly remain a zombie until init
                // reaps it; it cannot keep running or retain open pipes.
                if state.trim().is_empty() || state.trim_start().starts_with('Z') {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("LSP server descendant survived process-group cleanup");
    }

    #[test]
    fn editor_positions_validate_utf16_and_line_endings() {
        assert_eq!(
            position("a😀z\r\n", 1, 4).unwrap(),
            json!({"line":0,"character":3})
        );
        assert!(position("a😀z", 1, 3).is_err());
        assert!(position("abc", 1, 5).is_err());
        assert!(position("abc", 0, 1).is_err());
        assert!(position("abc", 2, 1).is_err());
        assert!(position("abc\n", 2, 1).is_ok());
    }

    #[tokio::test]
    async fn framing_handles_unicode_extra_headers_and_sequential_messages() {
        let value = json!({"result":"😀","id":1,"jsonrpc":"2.0"});
        let body = serde_json::to_vec(&value).unwrap();
        let frame = format!(
            "Content-Type: application/vscode-jsonrpc; charset=utf-8\r\nContent-Length: {}\r\n\r\n",
            body.len()
        );
        let mut bytes = frame.into_bytes();
        bytes.extend_from_slice(&body);
        let mut stream = &bytes[..];
        assert_eq!(read_frame(&mut stream).await.unwrap(), value);
    }

    #[tokio::test]
    async fn framing_rejects_missing_duplicate_and_oversized_lengths() {
        for bytes in [
            b"Other: 1\r\n\r\n".as_slice(),
            b"Content-Length: 1\r\nContent-Length: 1\r\n\r\n0",
            b"Content-Length: 999999999\r\n\r\n",
            b"Content-Length: 10\r\n\r\n{}",
        ] {
            assert!(read_frame(&mut &bytes[..]).await.is_err());
        }
    }

    #[test]
    fn configured_server_supports_reference_extension_map() {
        let config = json!({"custom":{"command":"my-server","args":["--stdio"],"extensionToLanguage":{".xyz":"custom"}}});
        let selected = configured_server(&config, ".xyz").unwrap().unwrap();
        assert_eq!(selected.command, "my-server");
        assert_eq!(selected.language, "custom");
        assert!(configured_server(&config, ".unknown").unwrap().is_none());
        assert!(configured_server(
            &json!({"bad":{"command":"x","args":[1],"extensionToLanguage":{".xyz":"custom"}}}),
            ".xyz"
        )
        .is_err());
    }

    #[test]
    fn uri_escapes_reserved_characters_and_unicode() {
        assert_eq!(
            file_uri(Path::new("/tmp/a #😀.ts")).unwrap(),
            "file:///tmp/a%20%23%F0%9F%98%80.ts"
        );
    }

    #[tokio::test]
    async fn real_stdio_server_covers_all_operations_and_shutdown() {
        let workspace = tempfile::tempdir().unwrap();
        let root = workspace.path();
        let node = match resolve_executable("node", root) {
            Ok(node) => node,
            Err(_) => {
                eprintln!("Skipping fake-server integration: node is not installed");
                return;
            }
        };
        fs::create_dir(root.join(".taro")).unwrap();
        fs::write(root.join("source.xyz"), "a😀z\n").unwrap();
        let script = root.join("server.cjs");
        let trace = root.join("trace.json");
        fs::write(&script, r#"
const fs = require('fs');
let bytes = Buffer.alloc(0), initialized = false, opened = null, pending = null;
let configReceived = false, registrationReceived = false;
const log = [];
const item = {name:'caller',kind:12,uri:'file:///fake',range:{start:{line:0,character:0},end:{line:0,character:1}},selectionRange:{start:{line:0,character:0},end:{line:0,character:1}},data:{token:42}};
function send(message) {
  const body = Buffer.from(JSON.stringify({jsonrpc:'2.0',...message}));
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(Buffer.concat([header,body]));
}
function respond(message) {
  log.push(message);
  if (message.id === 'config') {
    if (JSON.stringify(message.result) !== JSON.stringify([{enabled:true}])) process.exit(9);
    configReceived = true;
  }
  if (message.id === 'registration') registrationReceived = true;
  if (pending && configReceived && registrationReceived) {
    send({id:pending.id,result:{capabilities:{positionEncoding:'utf-16'}}}); pending = null;
  }
  if (message.method === 'initialize') {
    pending = message;
    if (!message.params.workspaceFolders[0].uri.startsWith('file:')) process.exit(8);
    send({method:'window/logMessage',params:{type:3,message:'loading'}});
    send({id:'config',method:'workspace/configuration',params:{items:[{section:'fake'}]}});
    send({id:'registration',method:'client/registerCapability',params:{registrations:[]}});
  } else if (message.method === 'initialized') initialized = true;
  else if (message.method === 'textDocument/didOpen') opened = message.params.textDocument;
  else if (message.method === 'shutdown') {
    fs.writeFileSync(process.argv[2],JSON.stringify(log));
    send({id:message.id,result:null});
  } else if (message.method === 'exit') process.exit(0);
  else if (message.method && message.id !== undefined) {
    if (!initialized || !opened || opened.text !== 'a😀z\n' || opened.languageId !== 'custom') process.exit(7);
    if (message.params.position && message.params.position.character !== 3) process.exit(6);
    if (opened.uri.endsWith('/empty.xyz')) send({id:message.id,result:null});
    else if (opened.uri.endsWith('/error.xyz')) send({id:message.id,error:{code:-32601,message:'Unsupported fake operation'}});
    else if (message.method === 'textDocument/prepareCallHierarchy') send({id:message.id,result:[item]});
    else if (message.method.startsWith('callHierarchy/') && message.params.item.data.token !== 42) process.exit(5);
    else send({id:message.id,result:{method:message.method,params:message.params}});
  }
}
process.stdin.on('data', chunk => {
  bytes = Buffer.concat([bytes,chunk]);
  while (true) {
    const end = bytes.indexOf('\r\n\r\n');
    if (end < 0) break;
    const match = /Content-Length: (\d+)/i.exec(bytes.subarray(0,end).toString());
    if (!match) process.exit(4);
    const length = Number(match[1]);
    if (bytes.length < end + 4 + length) break;
    const message = JSON.parse(bytes.subarray(end+4,end+4+length).toString());
    bytes = bytes.subarray(end+4+length);
    respond(message);
  }
});
"#).unwrap();
        fs::write(root.join(".taro/lsp.json"), json!({"servers":{"fake":{
            "command":node,"args":[script,trace],"extensionToLanguage":{".xyz":"custom"},"settings":{"fake":{"enabled":true}}
        }}}).to_string()).unwrap();
        for (operation, method) in [
            ("goToDefinition", "textDocument/definition"),
            ("findReferences", "textDocument/references"),
            ("hover", "textDocument/hover"),
            ("documentSymbol", "textDocument/documentSymbol"),
            ("workspaceSymbol", "workspace/symbol"),
            ("goToImplementation", "textDocument/implementation"),
            ("prepareCallHierarchy", "textDocument/prepareCallHierarchy"),
            ("incomingCalls", "callHierarchy/incomingCalls"),
            ("outgoingCalls", "callHierarchy/outgoingCalls"),
        ] {
            let result = execute(
                &json!({"operation":operation,"filePath":"source.xyz","line":1,"character":4}),
                root,
                true,
            )
            .await
            .unwrap();
            if operation == "prepareCallHierarchy" {
                assert_eq!(result.artifact["result"][0]["data"]["token"], 42);
            } else {
                assert_eq!(result.artifact["result"]["method"], method);
            }
            let log: Vec<Value> = serde_json::from_slice(&fs::read(&trace).unwrap()).unwrap();
            assert!(log.iter().any(|v| v["method"] == "shutdown"));
            if operation == "workspaceSymbol" {
                assert!(log
                    .iter()
                    .any(|v| v["method"] == method && v["params"]["query"] == ""));
            }
            if operation == "findReferences" {
                assert!(log.iter().any(|v| v["method"] == method
                    && v["params"]["context"]["includeDeclaration"] == true));
            }
        }
        fs::write(root.join("empty.xyz"), "a😀z\n").unwrap();
        for operation in ["hover", "incomingCalls", "outgoingCalls"] {
            let result = execute(
                &json!({"operation":operation,"filePath":"empty.xyz","line":1,"character":4}),
                root,
                true,
            )
            .await
            .unwrap();
            assert!(result.artifact["result"].is_null());
            assert_eq!(result.artifact["resultCount"], 0);
        }
        fs::write(root.join("error.xyz"), "a😀z\n").unwrap();
        assert!(execute(
            &json!({"operation":"hover","filePath":"error.xyz","line":1,"character":4}),
            root,
            true
        )
        .await
        .unwrap_err()
        .contains("Unsupported fake operation"));
        #[cfg(windows)]
        {
            let shim = root.join("server shim.cmd");
            fs::write(
                &shim,
                format!(
                    "@echo off\r\n\"{}\" \"{}\" %*\r\n",
                    node.display(),
                    script.display()
                ),
            )
            .unwrap();
            fs::write(root.join(".taro/lsp.json"), json!({"servers":{"fake":{
                "command":shim,"args":[trace],"extensionToLanguage":{".xyz":"custom"},"settings":{"fake":{"enabled":true}}
            }}}).to_string()).unwrap();
            let result = execute(
                &json!({"operation":"hover","filePath":"source.xyz","line":1,"character":4}),
                root,
                true,
            )
            .await
            .unwrap();
            assert_eq!(result.artifact["result"]["method"], "textDocument/hover");
            let invalid = Server {
                name: "unsafe".into(),
                command: shim.to_string_lossy().into_owned(),
                args: vec!["x & echo injected".into()],
                language: "custom".into(),
                initialization_options: Value::Null,
                settings: json!({}),
            };
            assert!(server_command(&invalid, root).is_err());
        }
    }

    #[tokio::test]
    async fn guards_run_before_launch_and_missing_servers_are_actionable() {
        let workspace = tempfile::tempdir().unwrap();
        let input = json!({"operation":"hover","filePath":"file.xyz","line":1,"character":1});
        assert!(execute(&input, workspace.path(), false)
            .await
            .unwrap_err()
            .contains("approval"));
        fs::write(workspace.path().join("file.xyz"), "hello").unwrap();
        fs::create_dir(workspace.path().join(".taro")).unwrap();
        fs::write(workspace.path().join(".taro/lsp.json"), json!({"servers":{"fake":{"command":"taro-nonexistent-lsp-for-test","extensionToLanguage":{".xyz":"custom"}}}}).to_string()).unwrap();
        assert!(execute(&input, workspace.path(), true)
            .await
            .unwrap_err()
            .contains("not found on PATH"));
        let outside = tempfile::NamedTempFile::new().unwrap();
        let outside_input =
            json!({"operation":"hover","filePath":outside.path(),"line":1,"character":1});
        assert!(execute(&outside_input, workspace.path(), true)
            .await
            .unwrap_err()
            .contains("outside"));
    }
}
