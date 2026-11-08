use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::HashMap,
    path::{Component, Path},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::ipc::Channel;

#[derive(Default)]
pub struct WorkspaceWatches(Mutex<HashMap<String, Watch>>);
struct Watch {
    _watcher: RecommendedWatcher,
    stopped: Arc<AtomicBool>,
}
impl Drop for Watch {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
    }
}
static NEXT: AtomicU64 = AtomicU64::new(1);

fn subscribe(
    root: &str,
    paths: Vec<String>,
    dirty: Arc<AtomicBool>,
) -> Result<RecommendedWatcher, String> {
    let root = Path::new(root).canonicalize().map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("Workspace must be a directory".into());
    }
    if paths.len() > 512 {
        return Err("Too many expanded directories to watch".into());
    }
    let mut directories = vec![root.clone()];
    for relative in paths {
        if Path::new(&relative)
            .components()
            .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
        {
            return Err("Watch path must stay in the workspace".into());
        }
        let path = root.join(relative);
        match path.canonicalize() {
            Ok(path) if !path.starts_with(&root) => {
                return Err("Watch path is outside the workspace".into())
            }
            Ok(path) if path.is_dir() => directories.push(path),
            _ => {} // An expanded directory can disappear between listing and subscription.
        }
    }
    directories.sort();
    directories.dedup();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if !matches!(event,Ok(ref event) if matches!(event.kind,notify::EventKind::Access(_))) {
            dirty.store(true, Ordering::Release);
        }
    })
    .map_err(|e| e.to_string())?;
    for path in directories {
        watcher
            .watch(&path, RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;
    }
    Ok(watcher)
}

#[tauri::command]
pub fn watch_workspace(
    workspace_root: String,
    paths: Vec<String>,
    on_change: Channel<()>,
    watches: tauri::State<'_, WorkspaceWatches>,
) -> Result<String, String> {
    let mut watches = watches.0.lock().map_err(|e| e.to_string())?;
    if watches.len() >= 8 {
        return Err("Too many workspace watchers".into());
    }
    let dirty = Arc::new(AtomicBool::new(false));
    let watcher = subscribe(&workspace_root, paths, dirty.clone())?;
    let stopped = Arc::new(AtomicBool::new(false));
    let stop = stopped.clone();
    std::thread::Builder::new()
        .name("taro-explorer-watch".into())
        .spawn(move || {
            while !stop.load(Ordering::Acquire) {
                std::thread::sleep(Duration::from_millis(180));
                if dirty.swap(false, Ordering::AcqRel) && on_change.send(()).is_err() {
                    break;
                }
            }
        })
        .map_err(|e| e.to_string())?;
    let id = format!("workspace-watch-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    watches.insert(
        id.clone(),
        Watch {
            _watcher: watcher,
            stopped,
        },
    );
    Ok(id)
}
#[tauri::command]
pub fn unwatch_workspace(
    id: String,
    watches: tauri::State<'_, WorkspaceWatches>,
) -> Result<(), String> {
    watches.0.lock().map_err(|e| e.to_string())?.remove(&id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn changed(dirty: &AtomicBool) {
        let start = std::time::Instant::now();
        while !dirty.swap(false, Ordering::AcqRel) {
            assert!(
                start.elapsed() < Duration::from_secs(5),
                "Filesystem change was not observed"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    }
    #[test]
    fn observes_external_file_and_directory_changes_and_rejects_escape() {
        let root = tempfile::tempdir().unwrap();
        let dirty = Arc::new(AtomicBool::new(false));
        let watcher = subscribe(root.path().to_str().unwrap(), vec![], dirty.clone()).unwrap();
        std::fs::write(root.path().join("a.txt"), "one").unwrap();
        changed(&dirty);
        std::fs::rename(root.path().join("a.txt"), root.path().join("b.txt")).unwrap();
        changed(&dirty);
        std::fs::remove_file(root.path().join("b.txt")).unwrap();
        changed(&dirty);
        std::fs::create_dir(root.path().join("nested")).unwrap();
        changed(&dirty);
        drop(watcher);
        let nested = subscribe(
            root.path().to_str().unwrap(),
            vec!["nested".into()],
            dirty.clone(),
        )
        .unwrap();
        dirty.store(false, Ordering::Release);
        std::fs::write(root.path().join("nested/file.txt"), "nested change").unwrap();
        changed(&dirty);
        drop(nested);
        assert!(subscribe(
            root.path().to_str().unwrap(),
            vec!["../outside".into()],
            dirty
        )
        .is_err());
    }
}
