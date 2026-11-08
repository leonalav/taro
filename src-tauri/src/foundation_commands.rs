//! Tauri transport for the durable core. Store work runs off the UI thread;
//! no mutex is held during provider calls, user decisions, or tool execution.
use crate::run_store::*;
use serde_json::Value;
use std::sync::{Arc, Mutex};
pub struct FoundationService(pub Result<Arc<Mutex<RunStore>>, String>);
impl FoundationService {
    pub fn from_result(store: StoreResult<RunStore>) -> Self {
        Self(store.map(|store| Arc::new(Mutex::new(store))))
    }
}
async fn access<T: Send + 'static>(
    state: &FoundationService,
    operation: impl FnOnce(&mut RunStore) -> StoreResult<T> + Send + 'static,
) -> StoreResult<T> {
    let store = state.0.as_ref().map_err(Clone::clone)?.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut store = store
            .lock()
            .map_err(|_| "Foundation storage lock poisoned")?;
        operation(&mut store)
    })
    .await
    .map_err(|e| format!("Foundation worker failed: {e}"))?
}
#[tauri::command]
pub async fn foundation_begin_run(
    scope: Scope,
    limits: RunLimits,
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<RunRecord> {
    access(&state, move |s| s.begin(scope, limits)).await
}
#[tauri::command]
pub async fn foundation_load_run(
    scope: Scope,
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<LoadedRun> {
    access(&state, move |s| s.load(&scope)).await
}
#[tauri::command]
pub async fn foundation_reserve_request(
    scope: Scope,
    attempt_id: String,
    kind: String,
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<Reservation> {
    access(&state, move |s| {
        s.reserve_request(&scope, &attempt_id, &kind)
    })
    .await
}
#[tauri::command]
pub async fn foundation_record_exchange(
    scope: Scope,
    exchange_id: String,
    exchange: Value,
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<u64> {
    access(&state, move |s| {
        s.append_exchange(&scope, &exchange_id, exchange)
    })
    .await
}
#[tauri::command]
pub async fn foundation_record_tool_intent(
    scope: Scope,
    intent: ToolIntent,
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<ToolAttempt> {
    access(&state, move |s| s.record_intent(&scope, intent)).await
}
#[tauri::command]
pub async fn foundation_mark_tool_started(
    scope: Scope,
    attempt_id: String,
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<ToolAttempt> {
    access(&state, move |s| s.mark_started(&scope, &attempt_id)).await
}
#[tauri::command]
pub async fn foundation_record_tool_outcome(
    scope: Scope,
    attempt_id: String,
    outcome: ToolOutcome,
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<ToolAttempt> {
    access(&state, move |s| {
        s.record_outcome(&scope, &attempt_id, outcome)
    })
    .await
}
#[tauri::command]
pub async fn foundation_save_context(
    scope: Scope,
    expected_epoch: u64,
    context: ContextInput,
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<ContextEpoch> {
    access(&state, move |s| {
        s.save_context(&scope, expected_epoch, context)
    })
    .await
}
#[tauri::command]
pub async fn foundation_save_metadata(
    scope: Scope,
    metadata: Value,
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<RunRecord> {
    access(&state, move |s| s.save_metadata(&scope, metadata)).await
}
#[tauri::command]
pub async fn foundation_finish_run(
    scope: Scope,
    outcome: RunState,
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<RunRecord> {
    access(&state, move |s| s.finish(&scope, outcome)).await
}
#[tauri::command]
pub async fn foundation_list_recoverable(
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<Vec<RunRecord>> {
    access(&state, |s| s.list_claimed()).await
}

#[tauri::command]
pub async fn foundation_persist_output(
    scope: Scope,
    attempt_id: String,
    output: Value,
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<String> {
    access(&state, move |s| {
        s.persist_output(&scope, &attempt_id, output)
    })
    .await
}
#[tauri::command]
pub async fn foundation_read_output(
    scope: Scope,
    reference: String,
    state: tauri::State<'_, FoundationService>,
) -> StoreResult<Value> {
    access(&state, move |s| s.read_output(&scope, &reference)).await
}
