use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, path::{Component, Path, PathBuf}};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdiIdentity {
    pub run_id: String,
    pub workspace: String,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdiMutation {
    pub identity: AdiIdentity,
    pub contract_digest: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeContract {
    pub digest: String,
    pub generation: u64,
    pub target_files: Vec<String>,
}

fn canonical_root(root: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(|error| format!("ADI workspace unavailable: {error}"))?;
    if root.is_dir() { Ok(root) } else { Err("ADI workspace is not a directory.".into()) }
}

fn valid_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    let supplied = Path::new(path);
    if supplied.components().any(|item| matches!(item, Component::ParentDir)) {
        return Err("ADI mutation paths cannot contain parent traversal.".into());
    }
    let target = if supplied.is_absolute() { supplied.to_path_buf() } else { root.join(supplied) };
    let mut existing = target.as_path();
    while !existing.exists() { existing = existing.parent().ok_or("Invalid ADI mutation path.")?; }
    let canonical = fs::canonicalize(existing).map_err(|error| error.to_string())?;
    let suffix = target.strip_prefix(existing).map_err(|error| error.to_string())?;
    let canonical = canonical.join(suffix);
    if !canonical.starts_with(root) { return Err("ADI mutation path escapes the active workspace.".into()); }
    Ok(canonical)
}

fn frontend_path(path: &Path, root: &Path) -> bool {
    let relative = path.strip_prefix(root).unwrap_or(path);
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    matches!(extension.as_str(), "css" | "scss" | "sass" | "less" | "styl" | "html" | "htm" | "tsx" | "jsx" |
        "vue" | "svelte" | "astro" | "swiftui" | "xaml" | "svg" | "woff" | "woff2" | "ttf" | "webp" | "png" |
        "jpg" | "jpeg" | "avif" | "gif" | "ico") ||
        relative.components().filter_map(|item| item.as_os_str().to_str()).any(|item| matches!(item.to_ascii_lowercase().as_str(),
            "component" | "components" | "views" | "pages" | "screens" | "layouts" | "styles" | "themes" | "public" |
            "assets" | "templates" | "locales" | "frontend" | "client")) ||
        ["vite.config.", "next.config.", "tailwind.config.", "webpack.config."].iter().any(|prefix| name.starts_with(prefix)) ||
        matches!(name.as_str(), "package.json" | "pnpm-lock.yaml" | "tauri.conf.json")
}

pub fn guarded_mutation(tool: &str) -> bool {
    matches!(tool, "Write" | "Edit" | "NotebookEdit" | "Bash" | "PowerShell" | "MCP")
}

impl crate::run_store::RunStore {
    pub fn adi_prepare(&mut self, identity: &AdiIdentity, frontend: bool) -> Result<(), String> {
        if identity.run_id.is_empty() || identity.session_id.is_empty() {
            return Err("Invalid ADI run identity.".into());
        }
        let root = canonical_root(&identity.workspace)?.to_string_lossy().into_owned();
        self.connection.execute(
            "INSERT INTO adi_policy_runs(id,workspace,session_id,frontend) VALUES(?1,?2,?3,?4)
             ON CONFLICT(id) DO UPDATE SET frontend=MAX(frontend,excluded.frontend)
             WHERE workspace=excluded.workspace AND session_id=excluded.session_id",
            params![identity.run_id, root, identity.session_id, frontend],
        ).map_err(|error| error.to_string()).and_then(|count| if count == 1 { Ok(()) } else { Err("ADI run scope mismatch.".into()) })
    }

    pub fn adi_commit(&mut self, identity: &AdiIdentity, contract: &NativeContract) -> Result<(), String> {
        if contract.generation == 0 || contract.digest.len() != 64 || !contract.digest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("Invalid ADI contract digest or generation.".into());
        }
        let root = canonical_root(&identity.workspace)?;
        for path in &contract.target_files { valid_path(&root, path)?; }
        let files = serde_json::to_string(&contract.target_files).map_err(|error| error.to_string())?;
        let count = self.connection.execute(
            "UPDATE adi_policy_runs SET frontend=1, digest=?1, generation=?2, target_files=?3, mutation_generation=mutation_generation+1
             WHERE id=?4 AND workspace=?5 AND session_id=?6 AND generation < ?2",
            params![contract.digest, contract.generation, files, identity.run_id, root.to_string_lossy(), identity.session_id],
        ).map_err(|error| error.to_string())?;
        if count == 1 { Ok(()) } else { Err("ADI contract is stale or belongs to another run.".into()) }
    }

    pub fn adi_authorize(
        &mut self, mutation: &AdiMutation, effective_root: &Path, operation_id: &str, tool: &str, input: &Value,
    ) -> Result<(), String> {
        let identity = &mutation.identity;
        let root = canonical_root(&identity.workspace)?;
        let transaction = self.connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|error| error.to_string())?;
        let run = transaction.query_row(
            "SELECT frontend,digest,target_files FROM adi_policy_runs WHERE id=?1 AND workspace=?2 AND session_id=?3",
            params![identity.run_id, root.to_string_lossy(), identity.session_id],
            |row| Ok((row.get::<_, bool>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, String>(2)?)),
        ).optional().map_err(|error| error.to_string())?.ok_or("Register the current ADI run before mutating the workspace.")?;
        let key = if tool == "NotebookEdit" { "notebook_path" } else { "file_path" };
        let file = if matches!(tool, "Write" | "Edit" | "NotebookEdit") {
            Some(valid_path(effective_root, input[key].as_str().ok_or("Missing mutation file path.")?)?)
        } else { None };
        if run.0 || file.as_ref().map_or(true, |path| frontend_path(path, effective_root)) {
            if run.1.is_none() || run.1 != mutation.contract_digest {
                return Err("A current ADI design contract is required before this mutation.".into());
            }
            if let Some(file) = file {
                let allowed: Vec<String> = serde_json::from_str(&run.2).map_err(|error| error.to_string())?;
                if !allowed.iter().filter_map(|path| valid_path(effective_root, path).ok()).any(|path| path == file) {
                    return Err("This file is outside the ADI design decisions.".into());
                }
            }
        }
        if operation_id.is_empty() { return Err("Missing ADI operation ID.".into()); }
        transaction.execute("INSERT INTO adi_policy_operations(run_id,operation_id) VALUES(?1,?2)",
            params![identity.run_id, operation_id]).map_err(|error| format!("ADI operation was already used or could not be recorded: {error}"))?;
        transaction.execute("UPDATE adi_policy_runs SET mutation_generation=mutation_generation+1 WHERE id=?1",
            params![identity.run_id]).map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())
    }
}

pub fn snapshot_workspace(root: &str) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let root = canonical_root(root)?;
    let mut paths = Vec::new();
    let mut directories = vec![root.clone()];
    while let Some(directory) = directories.pop() {
        for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let kind = entry.file_type().map_err(|error| error.to_string())?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if kind.is_symlink() || matches!(name.as_ref(), ".git" | ".taro" | "node_modules" | "target" | "dist" | "build" | ".next" | ".cache") {
                continue;
            }
            let path = entry.path();
            if kind.is_dir() {
                directories.push(path);
            } else if kind.is_file() && (frontend_path(&path, &root) ||
                matches!(path.extension().and_then(|value| value.to_str()), Some("ts" | "js" | "mjs" | "cjs" | "json" | "lock" | "wasm"))) {
                paths.push(path);
                if paths.len() > 20_000 { return Err("Too many files to verify this workspace consistently.".into()); }
            }
        }
    }
    paths.sort();
    let mut digest = Sha256::new();
    let mut total = 0;
    for path in paths {
        let relative = path.strip_prefix(&root).map_err(|error| error.to_string())?;
        let file = fs::File::open(&path).map_err(|error| error.to_string())?;
        let size = file.metadata().map_err(|error| error.to_string())?.len();
        total += size;
        if total > 512 * 1024 * 1024 { return Err("Workspace exceeds the ADI verification snapshot limit.".into()); }
        digest.update(relative.to_string_lossy().as_bytes());
        digest.update([0]);
        let mut file_digest = Sha256::new();
        let bytes = std::io::copy(&mut std::io::BufReader::new(file), &mut file_digest).map_err(|error| error.to_string())?;
        if bytes != size { return Err("Workspace changed while collecting the ADI snapshot.".into()); }
        digest.update(file_digest.finalize());
    }
    Ok(format!("{:x}", digest.finalize()))
}
