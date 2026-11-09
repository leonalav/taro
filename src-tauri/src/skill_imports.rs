//! User-selected skill discovery and bounded, non-executing workspace import.
use serde::Serialize;
use std::io::Read;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkill {
    pub name: String,
    pub description: String,
    pub path: String,
    pub source: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn discovers_real_skill_content_without_executing_it() {
        let dir = tempfile::tempdir().unwrap();
        let skill = dir.path().join("review");
        fs::create_dir(&skill).unwrap();
        fs::write(skill.join("SKILL.md"),"---\nname: review\ndescription: Review real changes\n---\nRun nothing during discovery").unwrap();
        let found = discover_directory(dir.path(), "Selected").unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].description, "Review real changes");
    }
    #[test]
    fn imports_support_files_and_never_overwrites_existing_skills() {
        let source = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        let skill = source.path().join("review");
        fs::create_dir_all(skill.join("references")).unwrap();
        fs::write(skill.join("SKILL.md"), "# Review").unwrap();
        fs::write(skill.join("references/check.md"), "Evidence").unwrap();
        let imported = import_skill(workspace.path(), &skill.join("SKILL.md")).unwrap();
        assert!(Path::new(&imported.path).is_file());
        assert_eq!(
            fs::read_to_string(
                workspace
                    .path()
                    .join(".taro/skills/review/references/check.md")
            )
            .unwrap(),
            "Evidence"
        );
        assert!(import_skill(workspace.path(), &skill.join("SKILL.md")).is_err());
    }
    #[test]
    fn rejects_frontmatter_without_instructions() {
        let source = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        fs::write(
            source.path().join("SKILL.md"),
            "---\nname: empty\ndescription: No instructions\n---\n",
        )
        .unwrap();
        assert!(import_skill(workspace.path(), &source.path().join("SKILL.md")).is_err());
    }
    #[test]
    fn discovery_hides_incomplete_import_staging_directories() {
        let root = tempfile::tempdir().unwrap();
        let staging = root.path().join(".import-review-123");
        fs::create_dir(&staging).unwrap();
        fs::write(staging.join("SKILL.md"), "# Incomplete import").unwrap();
        assert!(discover_directory(root.path(), "Selected")
            .unwrap()
            .is_empty());
    }
    #[cfg(windows)]
    #[test]
    fn rejects_source_asset_and_destination_junctions() {
        let source = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let skill = source.path().join("review");
        fs::create_dir(&skill).unwrap();
        fs::write(skill.join("SKILL.md"), "# Review").unwrap();
        fs::write(outside.path().join("preserved.txt"), "Private contents").unwrap();
        let link = skill.join("references");
        let make = |path: &Path| {
            let output = std::process::Command::new("cmd.exe")
                .args(["/C", "mklink", "/J"])
                .arg(path)
                .arg(outside.path())
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        };
        make(&link);
        assert!(import_skill(workspace.path(), &skill.join("SKILL.md")).is_err());
        fs::remove_dir(&link).unwrap();
        let destination = workspace.path().join(".taro");
        make(&destination);
        assert!(import_skill(workspace.path(), &skill.join("SKILL.md")).is_err());
        fs::remove_dir(&destination).unwrap();
        assert_eq!(
            fs::read_to_string(outside.path().join("preserved.txt")).unwrap(),
            "Private contents"
        );
        assert!(!outside.path().join("skills").exists());
    }
    #[test]
    fn rejects_non_skill_documents_and_empty_instructions() {
        let source = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        let file = source.path().join("README.md");
        fs::write(&file, "instructions").unwrap();
        assert!(import_skill(workspace.path(), &file).is_err());
        let file = source.path().join("SKILL.md");
        fs::write(&file, " ").unwrap();
        assert!(import_skill(workspace.path(), &file).is_err());
    }
}

fn bounded_read(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut data = Vec::new();
    file.take((limit + 1) as u64)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() > limit {
        return Err("Skill file exceeds import limits".into());
    }
    Ok(data)
}
fn simple_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 120
        && name != "."
        && name != ".."
        && !name.starts_with(".import-")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}
fn linked(meta: &fs::Metadata) -> bool {
    if meta.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    false
}
fn safe_path(path: &Path) -> Result<(), String> {
    for ancestor in path.ancestors() {
        match fs::symlink_metadata(ancestor) {
            Ok(meta) if linked(&meta) => {
                return Err(format!(
                    "Linked paths are not imported: {}",
                    ancestor.display()
                ))
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}
fn metadata(path: &Path, source: &str) -> Result<InstalledSkill, String> {
    safe_path(path)?;
    if path.file_name().and_then(|v| v.to_str()) != Some("SKILL.md") {
        return Err("Select an actual SKILL.md file".into());
    }
    let name = path
        .parent()
        .and_then(Path::file_name)
        .and_then(|s| s.to_str())
        .ok_or("Invalid skill directory")?;
    if !simple_name(name) {
        return Err("Skill directory must have a simple name".into());
    }
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > 262144 {
        return Err("Skill document exceeds 256 KiB".into());
    }
    let bytes = bounded_read(path, 262144)?;
    let content = String::from_utf8(bytes).map_err(|e| e.to_string())?;
    if content.trim().is_empty() {
        return Err("Skill instructions are empty".into());
    }
    let normalized = content.replace("\r\n", "\n");
    let body = if let Some(rest) = normalized.strip_prefix("---\n") {
        rest.split_once("\n---")
            .ok_or("Skill frontmatter is incomplete")?
            .1
    } else {
        &normalized
    };
    if body.trim().is_empty() {
        return Err("Skill instructions are empty".into());
    }
    let description = normalized
        .strip_prefix("---\n")
        .and_then(|rest| rest.split_once("\n---"))
        .and_then(|(front, _)| {
            front.lines().find_map(|line| {
                line.strip_prefix("description:").map(|value| {
                    value
                        .trim()
                        .trim_matches(['\'', '"'])
                        .chars()
                        .take(500)
                        .collect()
                })
            })
        })
        .unwrap_or_default();
    Ok(InstalledSkill {
        name: name.into(),
        description,
        path: fs::canonicalize(path)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .into(),
        source: source.into(),
    })
}
fn scan(
    dir: &Path,
    source: &str,
    depth: usize,
    visited: &mut usize,
    found: &mut BTreeMap<String, InstalledSkill>,
) -> Result<(), String> {
    if depth > 5 || *visited >= 4096 || found.len() >= 512 {
        return Ok(());
    }
    safe_path(dir)?;
    if !dir.is_dir() {
        return Ok(());
    }
    let file = dir.join("SKILL.md");
    if file.is_file() {
        let skill = metadata(&file, source)?;
        found.entry(skill.path.clone()).or_insert(skill);
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        *visited += 1;
        if *visited > 4096 {
            break;
        }
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        if name.to_string_lossy().starts_with(".import-") {
            continue;
        }
        if ["node_modules", ".git", "target", "dist"]
            .iter()
            .any(|v| name == *v)
        {
            continue;
        }
        let meta = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        if !linked(&meta) && meta.is_dir() {
            scan(&entry.path(), source, depth + 1, visited, found)?;
        }
    }
    Ok(())
}
fn discover_directory(dir: &Path, source: &str) -> Result<Vec<InstalledSkill>, String> {
    let mut found = BTreeMap::new();
    scan(dir, source, 0, &mut 0, &mut found)?;
    Ok(found.into_values().collect())
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub fn discover_installed_skills(
    workspace_root: Option<String>,
    directory: Option<String>,
) -> Result<Vec<InstalledSkill>, String> {
    if let Some(directory) = directory {
        return discover_directory(Path::new(&directory), "Selected directory");
    }
    let mut roots = Vec::new();
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        let home = PathBuf::from(home);
        for (base, label) in [
            (".claude/skills", "Claude Code"),
            (".codex/skills", "Codex"),
            (".agents/skills", "Codex"),
            (".config/opencode/skills", "OpenCode"),
            (".opencode/skills", "OpenCode"),
        ] {
            roots.push((home.join(base), label));
        }
    }
    if let Some(root) = workspace_root {
        for (base, label) in [
            (".taro/skills", "Taro workspace"),
            (".claude/skills", "Claude Code workspace"),
            (".agents/skills", "Codex workspace"),
            (".codex/skills", "Codex workspace"),
            (".opencode/skills", "OpenCode workspace"),
        ] {
            roots.push((Path::new(&root).join(base), label));
        }
    }
    let mut all = BTreeMap::new();
    for (root, label) in roots {
        if root.exists() {
            for skill in discover_directory(&root, label)? {
                all.entry(skill.path.clone()).or_insert(skill);
            }
        }
    }
    Ok(all.into_values().collect())
}
fn collect_assets(
    root: &Path,
    dir: &Path,
    files: &mut Vec<(PathBuf, Vec<u8>)>,
    total: &mut usize,
    depth: usize,
) -> Result<(), String> {
    if depth > 12 {
        return Err("Skill asset nesting exceeds 12 directories".into());
    }
    safe_path(dir)?;
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        safe_path(&path)?;
        let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            collect_assets(root, &path, files, total, depth + 1)?;
        } else if meta.is_file() {
            if files.len() >= 512 || meta.len() > 8 * 1024 * 1024 {
                return Err("Skill assets exceed import limits".into());
            }
            let bytes = bounded_read(&path, 8 * 1024 * 1024)?;
            *total += bytes.len();
            if *total > 8 * 1024 * 1024 {
                return Err("Skill assets exceed 8 MiB".into());
            }
            files.push((
                path.strip_prefix(root)
                    .map_err(|e| e.to_string())?
                    .to_path_buf(),
                bytes,
            ));
        } else {
            return Err("Unsupported skill asset type".into());
        }
    }
    Ok(())
}
fn import_skill(workspace: &Path, source: &Path) -> Result<InstalledSkill, String> {
    let info = metadata(source, "Taro workspace")?;
    let root = fs::canonicalize(workspace).map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("Select a workspace directory".into());
    }
    let source = PathBuf::from(&info.path);
    let source_dir = source.parent().ok_or("Missing skill directory")?;
    let mut files = Vec::new();
    collect_assets(source_dir, source_dir, &mut files, &mut 0, 0)?;
    let parent = root.join(".taro/skills");
    safe_path(&parent)?;
    let target = parent.join(&info.name);
    safe_path(&target)?;
    if target.exists() {
        return Err(format!(
            "Skill '{}' already exists; existing files are preserved",
            info.name
        ));
    }
    fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let staging = parent.join(format!(".import-{}-{unique}", info.name));
    fs::create_dir(&staging).map_err(|e| e.to_string())?;
    let lock_path = parent.join(format!(".import-{}.lock", info.name));
    let lock = match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
    {
        Ok(file) => file,
        Err(e) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(format!("Skill import is locked or unavailable: {e}"));
        }
    };
    let write = (|| {
        for (relative, bytes) in files {
            let path = staging.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(path, bytes).map_err(|e| e.to_string())?;
        }
        if target.exists() {
            return Err("Skill already exists; existing files are preserved".into());
        }
        fs::rename(&staging, &target).map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })();
    drop(lock);
    let _ = fs::remove_file(lock_path);
    let _ = fs::remove_dir_all(&staging);
    write?;
    metadata(&target.join("SKILL.md"), "Taro workspace")
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub fn import_installed_skill(
    workspace_root: String,
    source_path: String,
) -> Result<InstalledSkill, String> {
    import_skill(Path::new(&workspace_root), Path::new(&source_path))
}
