use crate::{
    adi_policy::{AdiIdentity, NativeContract},
    foundation_commands::FoundationService,
};
#[tauri::command]
pub async fn adi_prepare_run(
    identity: AdiIdentity, frontend: bool, state: tauri::State<'_, FoundationService>,
) -> Result<(), String> {
    crate::foundation_commands::access(&state, move |store| store.adi_prepare(&identity, frontend)).await
}
#[tauri::command]
pub async fn adi_commit_contract(
    identity: AdiIdentity, contract: NativeContract, state: tauri::State<'_, FoundationService>,
) -> Result<(), String> {
    crate::foundation_commands::access(&state, move |store| store.adi_commit(&identity, &contract)).await
}

#[tauri::command]
pub async fn adi_snapshot_workspace(workspace: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::adi_policy::snapshot_workspace(&workspace))
        .await.map_err(|error| error.to_string())?
}
