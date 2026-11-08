use base64::Engine;
use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    pub kind: String,
    pub content: Option<String>,
    pub data_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMatch {
    pub path: String,
    pub line: Option<usize>,
    pub snippet: Option<String>,
}

fn canonical_root(root: &str) -> Result<PathBuf, String> {
    let path = fs::canonicalize(root).map_err(|e| format!("Workspace is unavailable: {e}"))?;
    if !path.is_dir() {
        return Err("Workspace must be a folder".into());
    }
    Ok(path)
}

fn resolve(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let input = Path::new(relative);
    if input
        .components()
        .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
    {
        return Err("Path must stay inside the selected workspace".into());
    }
    let path = fs::canonicalize(root.join(input)).map_err(|e| format!("Cannot open path: {e}"))?;
    if !path.starts_with(root) {
        return Err("Path is outside the selected workspace".into());
    }
    Ok(path)
}

#[tauri::command]
pub fn list_workspace_directory(
    workspace_root: String,
    path: String,
) -> Result<Vec<WorkspaceEntry>, String> {
    let root = canonical_root(&workspace_root)?;
    let dir = resolve(&root, &path)?;
    if !dir.is_dir() {
        return Err("Path is not a folder".into());
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let Ok(canonical) = entry.path().canonicalize() else {
            continue;
        };
        if !canonical.starts_with(&root) {
            continue;
        }
        let kind = if canonical.is_dir() {
            "dir"
        } else if canonical.is_file() {
            "file"
        } else {
            continue;
        };
        entries.push(WorkspaceEntry {
            path: if path.is_empty() {
                name.clone()
            } else {
                format!("{path}/{name}")
            },
            name,
            kind: kind.into(),
        });
    }
    entries.sort_by(|a, b| {
        (a.kind != "dir")
            .cmp(&(b.kind != "dir"))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub fn list_workspace_files(workspace_root: String) -> Result<Vec<String>, String> {
    let root = canonical_root(&workspace_root)?;
    let mut paths = Vec::new();
    for item in walkdir::WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            !entry.file_type().is_dir()
                || entry.path() == root
                || !matches!(
                    entry.file_name().to_str(),
                    Some(".git" | "node_modules" | "target" | "dist")
                )
        })
    {
        let Ok(entry) = item else { continue };
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?;
        paths.push(relative.to_string_lossy().replace('\\', "/"));
        if paths.len() >= 5000 {
            break;
        }
    }
    paths.sort_unstable_by_key(|path| path.to_lowercase());
    Ok(paths)
}

#[tauri::command]
pub fn read_workspace_file(workspace_root: String, path: String) -> Result<WorkspaceFile, String> {
    let root = canonical_root(&workspace_root)?;
    let file = resolve(&root, &path)?;
    if !file.is_file() {
        return Err("Path is not a file".into());
    }
    let bytes = fs::read(&file).map_err(|e| e.to_string())?;
    if bytes.len() > 8_000_000 {
        return Err("File exceeds the 8 MB preview limit".into());
    }
    let ext = file
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" | "jfif" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        _ => None,
    };
    if let Some(mime) = mime {
        return Ok(WorkspaceFile {
            kind: "image".into(),
            content: None,
            data_url: Some(format!(
                "data:{mime};base64,{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            )),
        });
    }
    match String::from_utf8(bytes) {
        Ok(content) if !content.contains('\0') => Ok(WorkspaceFile {
            kind: "text".into(),
            content: Some(content),
            data_url: None,
        }),
        _ => Ok(WorkspaceFile {
            kind: "binary".into(),
            content: None,
            data_url: None,
        }),
    }
}

fn search_sync(workspace_root: String, query: String) -> Result<Vec<WorkspaceMatch>, String> {
    let root = canonical_root(&workspace_root)?;
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    if needle.len() > 120 {
        return Err("Search query is too long".into());
    }
    let mut matches = Vec::new();
    let mut scanned = 0;
    for entry in walkdir::WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            !entry.file_type().is_dir()
                || entry.path() == root
                || !matches!(
                    entry.file_name().to_str(),
                    Some(".git" | "node_modules" | "target" | "dist")
                )
        })
    {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_file() {
            continue;
        }
        scanned += 1;
        if scanned > 20_000 || matches.len() >= 200 {
            break;
        }
        let path = entry
            .path()
            .strip_prefix(&root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        if path.to_lowercase().contains(&needle) {
            matches.push(WorkspaceMatch {
                path,
                line: None,
                snippet: None,
            });
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if meta.len() > 2_000_000 {
            continue;
        }
        let Ok(text) = fs::read_to_string(entry.path()) else {
            continue;
        };
        if let Some((line_number, line)) = text
            .lines()
            .enumerate()
            .find(|(_, line)| line.to_lowercase().contains(&needle))
        {
            matches.push(WorkspaceMatch {
                path,
                line: Some(line_number + 1),
                snippet: Some(line.trim().chars().take(180).collect()),
            });
        }
    }
    Ok(matches)
}

#[tauri::command]
pub async fn search_workspace(
    workspace_root: String,
    query: String,
) -> Result<Vec<WorkspaceMatch>, String> {
    tokio::task::spawn_blocking(move || search_sync(workspace_root, query))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn reveal_workspace_entry(workspace_root: String, path: String) -> Result<(), String> {
    let root = canonical_root(&workspace_root)?;
    let target = resolve(&root, &path)?;
    #[cfg(target_os = "windows")]
    {
        let mut command = std::process::Command::new("explorer.exe");
        if target.is_file() {
            command.arg(format!("/select,{}", target.display()));
        } else {
            command.arg(&target);
        }
        command.spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        let mut command = std::process::Command::new("open");
        if target.is_file() {
            command.arg("-R");
        }
        command.arg(&target).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let folder = if target.is_file() {
            target.parent().unwrap_or(&target)
        } else {
            &target
        };
        std::process::Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        list_workspace_directory, list_workspace_files, read_workspace_file,
        reveal_workspace_entry, search_workspace,
    };
    use std::fs;

    #[test]
    fn lists_real_files_and_directories_in_folder_first_order() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("src")).unwrap();
        fs::write(root.path().join("README.md"), "hello").unwrap();
        fs::write(
            root.path().join("src").join("main.ts"),
            "export const n = 1",
        )
        .unwrap();
        let entries =
            list_workspace_directory(root.path().to_str().unwrap().into(), "".into()).unwrap();
        assert_eq!(
            entries.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(),
            vec!["src", "README.md"]
        );
        assert_eq!(entries[0].kind, "dir");
        assert_eq!(
            list_workspace_directory(root.path().to_str().unwrap().into(), "src".into()).unwrap()
                [0]
            .path,
            "src/main.ts"
        );
    }
    #[test]
    fn lists_real_project_files_for_mentions() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("src")).unwrap();
        fs::write(root.path().join("src/main.tsx"), "export {}").unwrap();
        fs::write(root.path().join("README.md"), "hello").unwrap();
        let files = list_workspace_files(root.path().to_str().unwrap().into()).unwrap();
        assert!(files.contains(&"src/main.tsx".to_string()));
        assert!(files.contains(&"README.md".to_string()));
    }

    #[tokio::test]
    async fn reads_text_and_searches_filenames_and_contents() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("notes.txt"), "alpha\nneedle here\n").unwrap();
        let base = root.path().to_str().unwrap().to_owned();
        let file = read_workspace_file(base.clone(), "notes.txt".into()).unwrap();
        assert_eq!(file.kind, "text");
        assert_eq!(file.content.as_deref(), Some("alpha\nneedle here\n"));
        let matches = search_workspace(base, "needle".into()).await.unwrap();
        assert_eq!(matches[0].path, "notes.txt");
        assert_eq!(matches[0].line, Some(2));
    }

    #[test]
    fn cannot_browse_outside_the_selected_folder() {
        let root = tempfile::tempdir().unwrap();
        let base = root.path().to_str().unwrap().to_owned();
        assert!(list_workspace_directory(base.clone(), "../".into()).is_err());
        assert!(read_workspace_file(base, "../secret.txt".into()).is_err());
    }

    #[test]
    fn reveal_rejects_paths_outside_the_selected_folder() {
        let root = tempfile::tempdir().unwrap();
        assert!(
            reveal_workspace_entry(root.path().to_str().unwrap().into(), "../".into()).is_err()
        );
    }
}
