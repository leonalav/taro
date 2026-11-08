use std::path::{Component, Path};

#[tauri::command]
pub fn create_explorer_folder(parent_path: String, name: String) -> Result<String, String> {
    let name = name.trim();
    let mut parts = Path::new(name).components();
    if name.is_empty()
        || !matches!(parts.next(), Some(Component::Normal(_)))
        || parts.next().is_some()
        || name.contains(['/', '\\', ':'])
    {
        return Err("Enter a single folder name without path separators".into());
    }
    let parent = Path::new(&parent_path)
        .canonicalize()
        .map_err(|e| format!("Cannot open parent folder: {e}"))?;
    if !parent.is_dir() {
        return Err("The selected parent is not a folder".into());
    }
    let child = parent.join(name);
    std::fs::create_dir(&child).map_err(|e| format!("Cannot create folder: {e}"))?;
    child
        .canonicalize()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::create_explorer_folder;

    #[test]
    fn creates_a_directory_inside_the_selected_parent() {
        let parent = tempfile::tempdir().unwrap();
        let path = create_explorer_folder(parent.path().to_str().unwrap().into(), "project".into())
            .unwrap();
        assert!(parent.path().join("project").is_dir());
        assert_eq!(
            std::path::PathBuf::from(path),
            parent.path().join("project").canonicalize().unwrap()
        );
    }

    #[test]
    fn rejects_invalid_names_and_existing_directories() {
        let parent = tempfile::tempdir().unwrap();
        let base = parent.path().to_str().unwrap().to_owned();
        for name in ["", ".", "..", "a/b", "a\\b"] {
            assert!(create_explorer_folder(base.clone(), name.into()).is_err());
        }
        create_explorer_folder(base.clone(), "project".into()).unwrap();
        assert!(create_explorer_folder(base, "project".into()).is_err());
    }
}
