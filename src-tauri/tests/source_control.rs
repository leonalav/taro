#[path = "../src/source_control.rs"]
mod source_control;
use source_control::*;
use std::{fs, path::Path, process::Command};

fn git(root: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap()
}
fn repo() -> tempfile::TempDir {
    let d = tempfile::tempdir().unwrap();
    git(d.path(), &["init", "-b", "main"]);
    git(d.path(), &["config", "user.name", "Test"]);
    git(d.path(), &["config", "user.email", "test@example.invalid"]);
    git(d.path(), &["config", "commit.gpgsign", "false"]);
    d
}
fn root(d: &tempfile::TempDir) -> &str {
    d.path().to_str().unwrap()
}
fn write(d: &tempfile::TempDir, name: &str, text: &str) {
    fs::write(d.path().join(name), text).unwrap();
}
fn initial(d: &tempfile::TempDir) {
    write(d, "file.txt", "first\n");
    stage(root(d), &["file.txt".into()]).unwrap();
    commit(root(d), "Initial").unwrap();
}

#[test]
fn unborn_unstage_and_unusual_literal_paths() {
    let d = repo();
    let name = "[special] space.txt";
    write(&d, name, "hello");
    assert!(status(root(&d)).unwrap().unborn);
    stage(root(&d), &[name.into()]).unwrap();
    assert_eq!(status(root(&d)).unwrap().changes[0].index, "A");
    write(&d, name, "edits after staging");
    unstage(root(&d), &[name.into()]).unwrap();
    assert_eq!(status(root(&d)).unwrap().changes[0].index, "?");
    assert!(d.path().join(name).exists());
    assert_eq!(
        fs::read_to_string(d.path().join(name)).unwrap(),
        "edits after staging"
    );
    assert!(stage(root(&d), &["../outside".into()]).is_err());
    assert!(stage(root(&d), &[".git/config".into()]).is_err());
}

#[test]
fn partial_staging_commit_preserves_worktree_and_history() {
    let d = repo();
    initial(&d);
    write(&d, "file.txt", "staged\n");
    stage(root(&d), &["file.txt".into()]).unwrap();
    write(&d, "file.txt", "later unstaged\n");
    let state = status(root(&d)).unwrap();
    assert_eq!(
        (&*state.changes[0].index, &*state.changes[0].worktree),
        ("M", "M")
    );
    assert!(diff(root(&d), "file.txt", true)
        .unwrap()
        .contains("+staged"));
    commit(root(&d), "Only staged").unwrap();
    assert_eq!(git(d.path(), &["show", "HEAD:file.txt"]).trim(), "staged");
    assert_eq!(
        fs::read_to_string(d.path().join("file.txt")).unwrap(),
        "later unstaged\n"
    );
    assert_eq!(history(root(&d), 0).unwrap()[0].message, "Only staged");
    assert!(commit(root(&d), "Nothing staged").is_err());
}

#[test]
fn dirty_checkout_and_safe_discard_and_revert() {
    let d = repo();
    initial(&d);
    checkout(root(&d), "feature", true).unwrap();
    write(&d, "file.txt", "modified\n");
    assert!(checkout(root(&d), "main", false).is_err());
    discard(root(&d), "file.txt").unwrap();
    write(&d, "new.txt", "do not delete");
    assert!(discard(root(&d), "new.txt").is_err());
    stage(root(&d), &["new.txt".into()]).unwrap();
    assert!(discard(root(&d), "new.txt").is_err());
    let sha = commit(root(&d), "Add new").unwrap();
    revert(root(&d), &sha).unwrap();
    assert!(!d.path().join("new.txt").exists());
    assert_eq!(status(root(&d)).unwrap().changes.len(), 0);
    checkout(root(&d), "main", false).unwrap();
    assert_eq!(status(root(&d)).unwrap().branch.as_deref(), Some("main"));
}

#[test]
fn conflicts_reject_commit_and_checkout_and_are_visible() {
    let d = repo();
    initial(&d);
    checkout(root(&d), "other", true).unwrap();
    write(&d, "file.txt", "other\n");
    stage(root(&d), &["file.txt".into()]).unwrap();
    commit(root(&d), "Other").unwrap();
    checkout(root(&d), "main", false).unwrap();
    write(&d, "file.txt", "main\n");
    stage(root(&d), &["file.txt".into()]).unwrap();
    commit(root(&d), "Main").unwrap();
    let out = Command::new("git")
        .current_dir(d.path())
        .args(["merge", "other"])
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert!(status(root(&d)).unwrap().changes[0].conflict);
    assert!(commit(root(&d), "Invalid").is_err());
    assert!(checkout(root(&d), "other", false).is_err());
}

#[test]
fn rename_status_and_detached_head_are_truthful() {
    let d = repo();
    initial(&d);
    git(d.path(), &["mv", "file.txt", "renamed file.txt"]);
    let changes = status(root(&d)).unwrap().changes;
    assert_eq!(changes[0].path, "renamed file.txt");
    assert_eq!(changes[0].original_path.as_deref(), Some("file.txt"));
    commit(root(&d), "Rename").unwrap();
    git(d.path(), &["checkout", "--detach"]);
    assert!(status(root(&d)).unwrap().branch.is_none());
    assert!(push(root(&d)).is_err());
}

#[test]
fn github_remote_and_repository_inputs_are_strict() {
    assert_eq!(
        github_repository("git@github.com:owner/repo.git").as_deref(),
        Some("owner/repo")
    );
    assert_eq!(
        github_repository("https://github.com/owner/repo.git").as_deref(),
        Some("owner/repo")
    );
    assert!(github_repository("https://evil.example/owner/repo").is_none());
    assert!(valid_repository("owner/repo"));
    assert!(!valid_repository("owner/repo/../../user"));
}

#[test]
fn push_and_fast_forward_pull_use_real_remote_and_reject_divergence() {
    let d = repo();
    initial(&d);
    let bare = tempfile::tempdir().unwrap();
    git(bare.path(), &["init", "--bare"]);
    git(
        d.path(),
        &["remote", "add", "origin", bare.path().to_str().unwrap()],
    );
    push(root(&d)).unwrap();
    let clone_parent = tempfile::tempdir().unwrap();
    let clone = clone_parent.path().join("clone");
    git(
        clone_parent.path(),
        &[
            "clone",
            "--branch",
            "main",
            bare.path().to_str().unwrap(),
            clone.to_str().unwrap(),
        ],
    );
    git(&clone, &["config", "user.name", "Test"]);
    git(&clone, &["config", "user.email", "test@example.invalid"]);
    write(&d, "remote.txt", "remote\n");
    stage(root(&d), &["remote.txt".into()]).unwrap();
    commit(root(&d), "Remote update").unwrap();
    push(root(&d)).unwrap();
    pull(clone.to_str().unwrap()).unwrap();
    assert!(clone.join("remote.txt").exists());
    fs::write(clone.join("file.txt"), "dirty\n").unwrap();
    assert!(pull(clone.to_str().unwrap()).is_err());
    discard(clone.to_str().unwrap(), "file.txt").unwrap();
    fs::write(clone.join("local.txt"), "local\n").unwrap();
    stage(clone.to_str().unwrap(), &["local.txt".into()]).unwrap();
    commit(clone.to_str().unwrap(), "Local divergence").unwrap();
    write(&d, "another.txt", "another\n");
    stage(root(&d), &["another.txt".into()]).unwrap();
    commit(root(&d), "Remote divergence").unwrap();
    push(root(&d)).unwrap();
    let before = status(clone.to_str().unwrap()).unwrap().head;
    assert!(pull(clone.to_str().unwrap()).is_err());
    assert_eq!(status(clone.to_str().unwrap()).unwrap().head, before);
}

#[cfg(windows)]
#[test]
fn path_operations_reject_directory_junctions_without_touching_the_target() {
    let d = repo();
    let directory = d.path().join("tracked");
    fs::create_dir(&directory).unwrap();
    fs::write(directory.join("file.txt"), "inside\n").unwrap();
    stage(root(&d), &["tracked/file.txt".into()]).unwrap();
    commit(root(&d), "Tracked directory").unwrap();
    fs::remove_file(directory.join("file.txt")).unwrap();
    fs::remove_dir(&directory).unwrap();
    let external = tempfile::tempdir().unwrap();
    fs::write(external.path().join("file.txt"), "external sentinel\n").unwrap();
    git(d.path(), &["config", "core.symlinks", "false"]);
    let output = Command::new("cmd.exe")
        .args([
            "/D",
            "/C",
            "mklink",
            "/J",
            directory.to_str().unwrap(),
            external.path().to_str().unwrap(),
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        discard(root(&d), "tracked/file.txt").is_err(),
        "discard must not follow a junction"
    );
    assert!(
        stage(root(&d), &["tracked/file.txt".into()]).is_err(),
        "stage must not read through a junction"
    );
    assert!(
        diff(root(&d), "tracked/file.txt", false).is_err(),
        "diff must not read through a junction"
    );
    assert_eq!(
        fs::read_to_string(external.path().join("file.txt")).unwrap(),
        "external sentinel\n"
    );
}
