use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanningAncestor {
    pub workspace_root: String,
    pub session_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRequest {
    pub name: String,
    pub input: Value,
    pub workspace_root: String,
    pub approved: bool,
    pub mcp_config: Option<Value>,
    pub request_id: Option<String>,
    pub session_id: Option<String>,
    #[serde(default)]
    pub read_only: bool,
    #[serde(default)]
    pub planning_ancestors: Vec<PlanningAncestor>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolOutput {
    pub text: String,
    pub artifact: Value,
}

fn root(path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(path).map_err(|e| format!("Workspace is unavailable: {e}"))?;
    if !root.is_dir() {
        return Err("Workspace must be a directory".into());
    }
    Ok(root)
}
fn target(root: &Path, input: &str, write: bool) -> Result<PathBuf, String> {
    let relative = Path::new(input);
    let path = if relative.is_absolute() {
        relative.to_path_buf()
    } else {
        root.join(relative)
    };
    let mut ancestor = path.as_path();
    while !ancestor.exists() {
        ancestor = ancestor.parent().ok_or("Invalid path")?;
    }
    let canonical = fs::canonicalize(ancestor).map_err(|e| e.to_string())?;
    if !canonical.starts_with(root) {
        return Err("Path is outside the selected workspace".into());
    }
    if !write && !path.exists() {
        return Err("File does not exist".into());
    }
    Ok(path)
}
fn required<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("Missing {key}"))
}
fn text_result(text: String, artifact: Value) -> ToolOutput {
    ToolOutput { text, artifact }
}

#[cfg(test)]
mod web_dispatch_tests {
    use super::*;
    #[tokio::test]
    async fn web_dispatch_without_workspace_still_validates_url() {
        let result=execute(ToolRequest{name:"WebFetch".into(),input:json!({"url":"http://127.0.0.1"}),workspace_root:String::new(),approved:false,mcp_config:None,request_id:None,session_id:None,read_only:true,planning_ancestors:vec![]}).await;
        let error=result.unwrap_err();assert!(error.contains("Private")||error.contains("public"),"{error}");assert!(!error.contains("Workspace"));
    }
}

pub async fn execute(request: ToolRequest) -> Result<ToolOutput, String> {
    if matches!(request.name.as_str(), "WebSearch" | "WebFetch") {
        let result = taro::web_tools::execute(&request.name, &request.input).await?;
        return Ok(ToolOutput { text: result["text"].as_str().unwrap_or_default().to_string(), artifact: result["artifact"].clone() });
    }
    let original_root = root(&request.workspace_root)?;
    let input = &request.input;
    let name = request.name.as_str();
    let scope = request.session_id.as_deref().unwrap_or("legacy");
    let ancestor_planning = request.planning_ancestors.iter().any(|ancestor| {
        crate::session_tools::is_plan_mode(
            Path::new(&ancestor.workspace_root),
            &ancestor.session_id,
        )
    });
    let readonly_agent = name == "Agent"
        && matches!(
            input.get("subagent_type").and_then(Value::as_str),
            Some("Explore" | "Plan")
        )
        && input.get("isolation").is_none_or(Value::is_null);
    if (request.read_only || ancestor_planning)
        && !readonly_agent
        && !matches!(
            name,
            "Read"
                | "ListFiles"
                | "Glob"
                | "Grep"
                | "LSP"
                | "Skill"
                | "TaskOutput"
                | "ToolSearch"
                | "StopChildTasks"
        )
    {
        return Err("This child agent is read-only".into());
    }
    crate::session_tools::guard_tool(&original_root, scope, name, input)?;
    let root = crate::session_tools::effective_root(&original_root, scope)?;
    if matches!(
        name,
        "Write" | "Edit" | "NotebookEdit" | "Bash" | "MCP" | "PowerShell" | "LSP"
    ) && !request.approved
    {
        return Err("User approval is required".into());
    }
    if matches!(
        name,
        "EnterPlanMode" | "ExitPlanMode" | "EnterWorktree" | "ExitWorktree" | "Skill"
    ) {
        return crate::session_tools::execute(name, input, &original_root, scope, request.approved)
            .await;
    }
    if matches!(name, "PowerShell" | "Bash" | "TaskOutput" | "TaskStop") {
        return crate::phase_two_tasks::execute_in_workspace(
            name,
            input,
            &original_root,
            &root,
            scope,
            request.approved,
        )
        .await;
    }
    if name == "LSP" {
        return crate::lsp_tools::execute(input, &root, request.approved).await;
    }
    if name == "StopChildTasks" {
        return crate::phase_two_tasks::stop_scope(&original_root, scope).await;
    }
    if name == "Agent" {
        return Ok(text_result(
            "Child agent scope validated".into(),
            json!({"kind":"agent-authorization","readOnly":request.read_only||crate::session_tools::is_plan_mode(&original_root,scope),"workspaceRoot":root}),
        ));
    }
    match name {
        "Read" => {
            let p = target(&root, required(input, "file_path")?, false)?;
            let bytes = fs::read(&p).map_err(|e| e.to_string())?;
            if bytes.len() > 8_000_000 {
                return Err("File exceeds the 8 MB read limit".into());
            }
            let ext = p
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let body = if ext == "pdf" {
                pdf_extract::extract_text(&p).map_err(|e| e.to_string())?
            } else if ["png", "jpg", "jpeg", "jfif", "webp", "gif"].contains(&ext.as_str()) {
                let mime = if ext == "png" {
                    "image/png"
                } else if ext == "webp" {
                    "image/webp"
                } else if ext == "gif" {
                    "image/gif"
                } else {
                    "image/jpeg"
                };
                let data_url = format!(
                    "data:{mime};base64,{}",
                    base64::engine::general_purpose::STANDARD.encode(&bytes)
                );
                return Ok(text_result(
                    format!("Image: {}", p.display()),
                    json!({"kind":"image","path":p,"dataUrl":data_url}),
                ));
            } else {
                String::from_utf8(bytes)
                    .map_err(|_| "Unsupported binary file format".to_string())?
            };
            let offset = input
                .get("offset")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .max(1) as usize;
            let limit = input
                .get("limit")
                .and_then(Value::as_u64)
                .unwrap_or(200)
                .min(2000) as usize;
            if input.get("raw").and_then(Value::as_bool) == Some(true) {
                return Ok(text_result(body.clone(), json!({"kind":"read","path":p,"content":body})));
            }
            let selected = body
                .lines()
                .enumerate()
                .skip(offset - 1)
                .take(limit)
                .map(|(i, line)| format!("{}: {}", i + 1, line))
                .collect::<Vec<_>>()
                .join("\n");
            Ok(text_result(
                selected.clone(),
                json!({"kind":"read","path":p,"content":selected,"totalLines":body.lines().count()}),
            ))
        }
        "Write" => {
            let p = target(&root, required(input, "file_path")?, true)?;
            let content = required(input, "content")?;
            if let Some(parent) = p.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                if !fs::canonicalize(parent)
                    .map_err(|e| e.to_string())?
                    .starts_with(&root)
                {
                    return Err("Path is outside the selected workspace".into());
                }
            }
            let before = fs::read_to_string(&p).unwrap_or_default();
            fs::write(&p, content).map_err(|e| e.to_string())?;
            Ok(text_result(
                format!("Wrote {}", p.display()),
                json!({"kind":"edit","path":p,"before":before,"after":content}),
            ))
        }
        "Edit" => {
            let p = target(&root, required(input, "file_path")?, false)?;
            let before = fs::read_to_string(&p).map_err(|e| e.to_string())?;
            let old = required(input, "old_string")?;
            let new = required(input, "new_string")?;
            if old.is_empty() {
                return Err("old_string cannot be empty".into());
            }
            let count = before.matches(old).count();
            if count == 0 {
                return Err("old_string was not found".into());
            }
            let all = input
                .get("replace_all")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            if count > 1 && !all {
                return Err(
                    "old_string is not unique; set replace_all or provide more context".into(),
                );
            }
            let after = if all {
                before.replace(old, new)
            } else {
                before.replacen(old, new, 1)
            };
            fs::write(&p, &after).map_err(|e| e.to_string())?;
            Ok(text_result(
                format!("Edited {} ({count} replacement(s))", p.display()),
                json!({"kind":"edit","path":p,"before":before,"after":after}),
            ))
        }
        "ListFiles" => {
            let search_path = input.get("path").and_then(Value::as_str).unwrap_or(".");
            let base = target(&root, search_path, false)?;
            if !base.is_dir() {
                return Err("ListFiles path must be a folder".into());
            }
            let recursive = input
                .get("recursive")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let mut entries = Vec::new();
            if recursive {
                for item in walkdir::WalkDir::new(&base)
                    .min_depth(1)
                    .follow_links(false)
                    .into_iter()
                    .filter_entry(|entry| {
                        entry.path() == base
                            || !matches!(
                                entry.file_name().to_str(),
                                Some(".git" | "node_modules" | "target" | "dist")
                            )
                    })
                {
                    let entry = item.map_err(|e| e.to_string())?;
                    let path = entry
                        .path()
                        .strip_prefix(&root)
                        .unwrap_or(entry.path())
                        .to_string_lossy()
                        .replace('\\', "/");
                    entries.push(if entry.file_type().is_dir() {
                        format!("{path}/")
                    } else {
                        path
                    });
                    if entries.len() >= 500 {
                        break;
                    }
                }
            } else {
                for item in fs::read_dir(&base).map_err(|e| e.to_string())? {
                    let entry = item.map_err(|e| e.to_string())?;
                    let canonical = entry.path().canonicalize().map_err(|e| e.to_string())?;
                    if !canonical.starts_with(&root) {
                        continue;
                    }
                    let path = entry
                        .path()
                        .strip_prefix(&root)
                        .unwrap_or(&canonical)
                        .to_string_lossy()
                        .replace('\\', "/");
                    entries.push(if canonical.is_dir() {
                        format!("{path}/")
                    } else {
                        path
                    });
                }
            }
            entries.sort_unstable_by_key(|path| path.to_lowercase());
            let truncated = entries.len() >= 500;
            let text = if entries.is_empty() {
                "Folder is empty".into()
            } else {
                entries.join("\n")
            };
            Ok(text_result(
                text,
                json!({"kind":"file-list","path":search_path,"entries":entries,"truncated":truncated}),
            ))
        }
        "Glob" | "Grep" => {
            let search_path = input.get("path").and_then(Value::as_str).unwrap_or(".");
            let base = target(&root, search_path, false)?;
            let pattern = required(input, "pattern")?;
            let matcher = if name == "Glob" {
                Some(
                    globset::Glob::new(pattern)
                        .map_err(|e| e.to_string())?
                        .compile_matcher(),
                )
            } else {
                None
            };
            let regex = if name == "Grep" {
                Some(regex::Regex::new(pattern).map_err(|e| e.to_string())?)
            } else {
                None
            };
            let mut found = Vec::new();
            for item in walkdir::WalkDir::new(&base).into_iter().filter_entry(|e| {
                !matches!(
                    e.file_name().to_str().unwrap_or(""),
                    ".git" | "node_modules" | "target" | "dist"
                )
            }) {
                let entry = item.map_err(|e| e.to_string())?;
                if !entry.file_type().is_file() {
                    continue;
                }
                let path = entry.path();
                let rel = path
                    .strip_prefix(&root)
                    .unwrap_or(path)
                    .to_string_lossy()
                    .replace('\\', "/");
                if let Some(glob) = &matcher {
                    if glob.is_match(&rel) || glob.is_match(path.file_name().unwrap_or_default()) {
                        found.push(rel.clone())
                    }
                }
                if let Some(re) = &regex {
                    if let Ok(content) = fs::read_to_string(path) {
                        for (i, line) in content.lines().enumerate() {
                            if re.is_match(line) {
                                found.push(format!("{rel}:{}: {}", i + 1, line));
                                if found.len() >= 200 {
                                    break;
                                }
                            }
                        }
                    }
                }
                if found.len() >= 200 {
                    break;
                }
            }
            let result = found.join("\n");
            Ok(text_result(
                result.clone(),
                json!({"kind":name.to_lowercase(),"matches":found,"truncated":found.len()>=200}),
            ))
        }
        "NotebookEdit" => {
            let p = target(&root, required(input, "notebook_path")?, false)?;
            if p.extension().and_then(|s| s.to_str()) != Some("ipynb") {
                return Err("NotebookEdit requires an .ipynb file".into());
            }
            let before = fs::read_to_string(&p).map_err(|e| e.to_string())?;
            let mut notebook: Value = serde_json::from_str(&before).map_err(|e| e.to_string())?;
            let cells = notebook
                .get_mut("cells")
                .and_then(Value::as_array_mut)
                .ok_or("Notebook has no cells array")?;
            let index = input
                .get("cell_index")
                .and_then(Value::as_u64)
                .ok_or("Missing cell_index")? as usize;
            let mode = input
                .get("edit_mode")
                .and_then(Value::as_str)
                .unwrap_or("replace");
            if mode == "delete" {
                if index >= cells.len() {
                    return Err("Cell index out of range".into());
                }
                cells.remove(index);
            } else {
                let source = required(input, "new_source")?;
                let lines = json!(source
                    .lines()
                    .map(|line| format!("{line}\n"))
                    .collect::<Vec<_>>());
                if mode == "insert" {
                    if index > cells.len() {
                        return Err("Cell index out of range".into());
                    }
                    let kind = required(input, "cell_type")?;
                    if kind != "code" && kind != "markdown" {
                        return Err("cell_type must be code or markdown".into());
                    }
                    let cell = if kind == "code" {
                        json!({"cell_type":kind,"metadata":{},"source":lines,"outputs":[],"execution_count":null,"id":format!("cell-{index}")})
                    } else {
                        json!({"cell_type":kind,"metadata":{},"source":lines,"id":format!("cell-{index}")})
                    };
                    cells.insert(index, cell);
                } else if mode == "replace" {
                    let cell = cells.get_mut(index).ok_or("Cell index out of range")?;
                    cell["source"] = lines;
                    if cell["cell_type"] == "code" {
                        cell["outputs"] = json!([]);
                        cell["execution_count"] = Value::Null;
                    }
                } else {
                    return Err("Unsupported notebook edit_mode".into());
                }
            }
            let after = serde_json::to_string_pretty(&notebook).map_err(|e| e.to_string())?;
            fs::write(&p, &after).map_err(|e| e.to_string())?;
            Ok(text_result(
                format!("{mode} notebook cell {index} in {}", p.display()),
                json!({"kind":"notebook","path":p,"cellIndex":index,"mode":mode,"before":before,"after":after}),
            ))
        }
        "Bash" => {
            let command = required(input, "command")?;
            let shell = if cfg!(windows) {
                r"C:\Program Files\Git\bin\bash.exe"
            } else {
                "bash"
            };
            let output = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                tokio::process::Command::new(shell)
                    .arg("-lc")
                    .arg(command)
                    .current_dir(root)
                    .kill_on_drop(true)
                    .output(),
            )
            .await
            .map_err(|_| "Command timed out after 30 seconds".to_string())?
            .map_err(|e| e.to_string())?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let value = format!("{}{}", stdout, stderr);
            let text = format!(
                "Exit code: {:?}\n{}",
                output.status.code(),
                value.chars().take(50_000).collect::<String>()
            );
            Ok(text_result(
                text.clone(),
                json!({"kind":"bash","command":command,"exitCode":output.status.code(),"output":text}),
            ))
        }
        "MCP" => {
            let config = request
                .mcp_config
                .as_ref()
                .ok_or("MCP server is not configured")?;
            let tool = required(input, "tool")?;
            let args = input.get("arguments").cloned().unwrap_or(json!({}));
            let current_workspace = root.to_string_lossy().into_owned();
            let result = crate::mcp_client::request(
                config,
                "tools/call",
                json!({"name":tool,"arguments":args}),
                &current_workspace,
            )
            .await?;
            let text = result.to_string();
            Ok(text_result(
                text.clone(),
                json!({"kind":"mcp","server":config["id"],"tool":tool,"result":result}),
            ))
        }
        _ => Err(format!("Unknown tool: {name}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(name: &str, input: Value, root: &Path, approved: bool) -> ToolRequest {
        ToolRequest {
            name: name.into(),
            input,
            workspace_root: root.to_string_lossy().into_owned(),
            approved,
            mcp_config: None,
            request_id: None,
            session_id: None,
            read_only: false,
            planning_ancestors: Vec::new(),
        }
    }
    #[tokio::test]
    async fn dispatcher_enforces_child_and_ancestor_plan_restrictions() {
        let directory = tempfile::tempdir().unwrap();
        let mut enter = request(
            "EnterPlanMode",
            json!({"name":"Review"}),
            directory.path(),
            false,
        );
        enter.session_id = Some("parent".into());
        let plan = execute(enter).await.unwrap();
        let mut write = request(
            "Write",
            json!({"file_path":"unsafe.txt","content":"blocked"}),
            directory.path(),
            true,
        );
        write.session_id = Some("child".into());
        write.planning_ancestors = vec![PlanningAncestor {
            workspace_root: directory.path().to_string_lossy().into_owned(),
            session_id: "parent".into(),
        }];
        assert!(execute(write).await.unwrap_err().contains("read-only"));
        assert!(!directory.path().join("unsafe.txt").exists());
        let mut readonly = request(
            "PowerShell",
            json!({"command":"Write-Output unsafe"}),
            directory.path(),
            true,
        );
        readonly.read_only = true;
        assert!(execute(readonly).await.unwrap_err().contains("read-only"));
        let mut plan_write = request(
            "Write",
            json!({"file_path":plan.artifact["path"],"content":"# Review\n\nInspect first."}),
            directory.path(),
            true,
        );
        plan_write.session_id = Some("parent".into());
        execute(plan_write).await.unwrap();
        let mut preview = request("ExitPlanMode", json!({}), directory.path(), false);
        preview.session_id = Some("parent".into());
        assert_eq!(
            execute(preview).await.unwrap().artifact["markdown"],
            "# Review\n\nInspect first."
        );
    }
    #[tokio::test]
    async fn write_read_edit_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        execute(request(
            "Write",
            json!({"file_path":"src/a.txt","content":"alpha\nbeta\n"}),
            dir.path(),
            true,
        ))
        .await
        .unwrap();
        let read = execute(request(
            "Read",
            json!({"file_path":"src/a.txt","offset":2,"limit":1}),
            dir.path(),
            false,
        ))
        .await
        .unwrap();
        assert_eq!(read.text, "2: beta");
        execute(request(
            "Edit",
            json!({"file_path":"src/a.txt","old_string":"beta","new_string":"gamma"}),
            dir.path(),
            true,
        ))
        .await
        .unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("src/a.txt")).unwrap(),
            "alpha\ngamma\n"
        );
    }
    #[tokio::test]
    async fn edit_rejects_ambiguous_or_missing_text() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a"), "x x").unwrap();
        assert!(execute(request(
            "Edit",
            json!({"file_path":"a","old_string":"x","new_string":"y"}),
            dir.path(),
            true
        ))
        .await
        .unwrap_err()
        .contains("not unique"));
        assert!(execute(request(
            "Edit",
            json!({"file_path":"a","old_string":"z","new_string":"y"}),
            dir.path(),
            true
        ))
        .await
        .unwrap_err()
        .contains("not found"));
        execute(request(
            "Edit",
            json!({"file_path":"a","old_string":"x","new_string":"y","replace_all":true}),
            dir.path(),
            true,
        ))
        .await
        .unwrap();
        assert_eq!(fs::read_to_string(dir.path().join("a")).unwrap(), "y y");
    }
    #[tokio::test]
    async fn permissions_and_workspace_boundary() {
        let dir = tempfile::tempdir().unwrap();
        assert!(execute(request(
            "Write",
            json!({"file_path":"a","content":"x"}),
            dir.path(),
            false
        ))
        .await
        .unwrap_err()
        .contains("approval"));
        assert!(execute(request(
            "Write",
            json!({"file_path":"../escape.txt","content":"x"}),
            dir.path(),
            true
        ))
        .await
        .unwrap_err()
        .contains("outside"));
        assert!(execute(request(
            "Read",
            json!({"file_path":"../escape.txt"}),
            dir.path(),
            false
        ))
        .await
        .is_err());
    }
    #[tokio::test]
    async fn glob_and_grep_find_nested_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("sub/a.rs"), "hello\nworld\n").unwrap();
        let glob = execute(request(
            "Glob",
            json!({"pattern":"**/*.rs"}),
            dir.path(),
            false,
        ))
        .await
        .unwrap();
        assert!(glob.text.contains("sub/a.rs"));
        let grep = execute(request(
            "Grep",
            json!({"pattern":"wor.d"}),
            dir.path(),
            false,
        ))
        .await
        .unwrap();
        assert!(grep.text.contains("sub/a.rs:2: world"));
    }
    #[tokio::test]
    async fn list_files_is_read_only_and_returns_directories_and_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("src")).unwrap();
        fs::write(dir.path().join("README.md"), "hello").unwrap();
        fs::write(dir.path().join("src").join("main.ts"), "code").unwrap();
        let top = execute(request("ListFiles", json!({}), dir.path(), false))
            .await
            .unwrap();
        assert!(top.text.contains("src/"));
        assert!(top.text.contains("README.md"));
        assert!(!top.text.contains("main.ts"));
        let nested = execute(request(
            "ListFiles",
            json!({"path":"src","recursive":true}),
            dir.path(),
            false,
        ))
        .await
        .unwrap();
        assert!(nested.text.contains("src/main.ts"));
        assert_eq!(nested.artifact["kind"], "file-list");
    }
    #[tokio::test]
    async fn notebook_edit_clears_stale_outputs() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("n.ipynb");
        fs::write(&p,json!({"cells":[{"cell_type":"code","source":["old\n"],"outputs":[{"text":"stale"}],"execution_count":2}],"metadata":{},"nbformat":4,"nbformat_minor":5}).to_string()).unwrap();
        execute(request(
            "NotebookEdit",
            json!({"notebook_path":"n.ipynb","cell_index":0,"new_source":"print(1)"}),
            dir.path(),
            true,
        ))
        .await
        .unwrap();
        let v: Value = serde_json::from_str(&fs::read_to_string(p).unwrap()).unwrap();
        assert_eq!(v["cells"][0]["source"][0], "print(1)\n");
        assert!(v["cells"][0]["outputs"].as_array().unwrap().is_empty());
        assert!(v["cells"][0]["execution_count"].is_null());
    }
    #[tokio::test]
    async fn image_read_returns_multimodal_data() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.png"), [137, 80, 78, 71, 13, 10, 26, 10]).unwrap();
        let result = execute(request(
            "Read",
            json!({"file_path":"a.png"}),
            dir.path(),
            false,
        ))
        .await
        .unwrap();
        assert_eq!(result.artifact["kind"], "image");
        assert!(result.artifact["dataUrl"]
            .as_str()
            .unwrap()
            .starts_with("data:image/png;base64,"));
    }
    #[tokio::test]
    async fn pdf_read_extracts_text() {
        use lopdf::{
            content::{Content, Operation},
            dictionary, Document, Object, Stream,
        };
        let dir = tempfile::tempdir().unwrap();
        let mut pdf = Document::with_version("1.5");
        let pages = pdf.new_object_id();
        let font =
            pdf.add_object(dictionary! {"Type"=>"Font","Subtype"=>"Type1","BaseFont"=>"Helvetica"});
        let resources = pdf.add_object(dictionary! {"Font"=>dictionary!{"F1"=>font}});
        let content = Content {
            operations: vec![
                Operation::new("BT", vec![]),
                Operation::new("Tf", vec![Object::Name(b"F1".to_vec()), 18.into()]),
                Operation::new("Td", vec![50.into(), 750.into()]),
                Operation::new("Tj", vec![Object::string_literal("PDF hello")]),
                Operation::new("ET", vec![]),
            ],
        };
        let stream = pdf.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
        let page=pdf.add_object(dictionary!{"Type"=>"Page","Parent"=>pages,"MediaBox"=>vec![0.into(),0.into(),595.into(),842.into()],"Contents"=>stream,"Resources"=>resources});
        pdf.objects.insert(
            pages,
            dictionary! {"Type"=>"Pages","Kids"=>vec![page.into()],"Count"=>1}.into(),
        );
        let catalog = pdf.add_object(dictionary! {"Type"=>"Catalog","Pages"=>pages});
        pdf.trailer.set("Root", catalog);
        pdf.save(dir.path().join("a.pdf")).unwrap();
        let result = execute(request(
            "Read",
            json!({"file_path":"a.pdf"}),
            dir.path(),
            false,
        ))
        .await
        .unwrap();
        assert!(result.text.contains("PDF hello"));
    }
    #[tokio::test]
    async fn bash_runs_in_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let result = execute(request(
            "Bash",
            json!({"command":"echo taro-tool-ok"}),
            dir.path(),
            true,
        ))
        .await
        .unwrap();
        assert!(result.text.contains("taro-tool-ok"));
        assert_eq!(result.artifact["exitCode"], 0);
    }
    #[tokio::test]
    async fn write_overwrites_existing_content() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.txt"), "old").unwrap();
        let result = execute(request(
            "Write",
            json!({"file_path":"a.txt","content":"new"}),
            dir.path(),
            true,
        ))
        .await
        .unwrap();
        assert_eq!(result.artifact["before"], "old");
        assert_eq!(fs::read_to_string(dir.path().join("a.txt")).unwrap(), "new");
    }
    #[tokio::test]
    async fn invalid_patterns_fail_without_writing() {
        let dir = tempfile::tempdir().unwrap();
        assert!(
            execute(request("Grep", json!({"pattern":"["}), dir.path(), false))
                .await
                .is_err()
        );
        assert!(
            execute(request("Glob", json!({"pattern":"["}), dir.path(), false))
                .await
                .is_err()
        );
    }
    #[tokio::test]
    async fn unsupported_binary_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("binary.bin"), [0xff, 0xfe]).unwrap();
        assert!(execute(request(
            "Read",
            json!({"file_path":"binary.bin"}),
            dir.path(),
            false
        ))
        .await
        .unwrap_err()
        .contains("binary"));
    }
    #[tokio::test]
    async fn notebook_index_is_validated() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("n.ipynb"), "{\"cells\":[]}").unwrap();
        assert!(execute(request(
            "NotebookEdit",
            json!({"notebook_path":"n.ipynb","cell_index":2,"new_source":"x"}),
            dir.path(),
            true
        ))
        .await
        .unwrap_err()
        .contains("out of range"));
    }
    #[tokio::test]
    async fn notebook_insert_and_delete_cells() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("n.ipynb");
        fs::write(&p, "{\"cells\":[]}").unwrap();
        execute(request("NotebookEdit",json!({"notebook_path":"n.ipynb","cell_index":0,"new_source":"# heading","edit_mode":"insert","cell_type":"markdown"}),dir.path(),true)).await.unwrap();
        let v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v["cells"][0]["cell_type"], "markdown");
        execute(request(
            "NotebookEdit",
            json!({"notebook_path":"n.ipynb","cell_index":0,"edit_mode":"delete"}),
            dir.path(),
            true,
        ))
        .await
        .unwrap();
        let v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v["cells"].as_array().unwrap().len(), 0);
    }
    #[tokio::test]
    async fn unknown_tool_and_missing_workspace_fail() {
        let dir = tempfile::tempdir().unwrap();
        assert!(execute(request("Unknown", json!({}), dir.path(), false))
            .await
            .unwrap_err()
            .contains("Unknown tool"));
        let bad = ToolRequest {
            session_id: None,
            read_only: false,
            planning_ancestors: Vec::new(),
            name: "Read".into(),
            input: json!({"file_path":"a"}),
            workspace_root: dir.path().join("missing").to_string_lossy().into(),
            approved: false,
            mcp_config: None,
            request_id: None,
        };
        assert!(execute(bad).await.unwrap_err().contains("Workspace"));
    }
    #[tokio::test]
    async fn bash_requires_explicit_approval() {
        let dir = tempfile::tempdir().unwrap();
        assert!(execute(request(
            "Bash",
            json!({"command":"echo unsafe"}),
            dir.path(),
            false
        ))
        .await
        .unwrap_err()
        .contains("approval"));
    }
}
