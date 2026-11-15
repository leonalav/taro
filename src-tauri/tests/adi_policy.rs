use serde_json::json;
use taro::{adi_policy::{AdiIdentity, AdiMutation, NativeContract}, run_store::RunStore};

#[test]
fn enforces_scope_generation_paths_and_single_use_after_restart() {
    let workspace = tempfile::tempdir().unwrap();
    let database = workspace.path().join("adi.sqlite");
    let root = std::fs::canonicalize(workspace.path()).unwrap();
    let identity = AdiIdentity { run_id: "r".into(), workspace: root.to_string_lossy().into_owned(), session_id: "s".into() };
    let mut store = RunStore::open(&database).unwrap();
    store.adi_prepare(&identity, false).unwrap();
    let mut request = AdiMutation { identity: identity.clone(), contract_digest: None };
    let edit = json!({"file_path":"src/app.css"});
    assert!(store.adi_authorize(&request, &root, "1", "Edit", &edit).is_err());
    assert!(store.adi_authorize(&request, &root, "1", "PowerShell", &json!({})).is_err());
    assert!(store.adi_authorize(&request, &root, "backend", "Edit", &json!({"file_path":"server/lib.rs"})).is_ok());
    let contract = NativeContract { digest: "a".repeat(64), generation: 1, target_files: vec!["src/app.css".into()] };
    store.adi_commit(&identity, &contract).unwrap();
    assert!(store.adi_commit(&identity, &contract).is_err());
    request.contract_digest = Some(contract.digest);
    assert!(store.adi_authorize(&request, &root, "1", "Edit", &edit).is_ok());
    assert!(store.adi_authorize(&request, &root, "2", "Edit", &json!({"file_path":"../app.css"})).is_err());
    drop(store);
    let mut restarted = RunStore::open(&database).unwrap();
    assert!(restarted.adi_authorize(&request, &root, "1", "Edit", &edit).is_err());
    assert!(restarted.adi_authorize(&request, &root, "3", "Edit", &json!({"file_path":"src/other.css"})).is_err());
    request.identity.session_id = "different".into();
    assert!(restarted.adi_authorize(&request, &root, "4", "Edit", &edit).is_err());
}

#[test]
fn snapshot_changes_when_a_stylesheet_or_untracked_asset_changes() {
    let workspace = tempfile::tempdir().unwrap();
    let root = workspace.path();
    let css = root.join("style.css");
    std::fs::write(&css, "button { color: black }").unwrap();
    let fingerprint = || taro::adi_policy::snapshot_workspace(&root.to_string_lossy()).unwrap();
    let baseline = fingerprint();
    std::fs::write(&css, "button { color: white }").unwrap();
    let revised = fingerprint();
    assert_ne!(baseline, revised);
    std::fs::write(root.join("asset.svg"), "<svg/>").unwrap();
    assert_ne!(revised, fingerprint());
}
