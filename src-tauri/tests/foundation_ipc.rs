#![cfg(feature = "desktop-tests")]
use serde_json::{json, Value};
use taro::{foundation_commands::*, run_store::RunStore};
use tauri::{
    ipc::{CallbackFn, InvokeBody},
    test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY},
    webview::InvokeRequest,
};

#[test]
fn registered_foundation_ipc_persists_and_rejects_foreign_scope() {
    let directory = tempfile::tempdir().unwrap();
    let store = RunStore::open(&directory.path().join("foundation.sqlite")).unwrap();
    let app = mock_builder()
        .manage(FoundationService::from_result(Ok(store)))
        .invoke_handler(tauri::generate_handler![
            foundation_begin_run,
            foundation_load_run,
            foundation_record_exchange,
            foundation_reserve_request,
            foundation_record_tool_intent,
            foundation_mark_tool_started,
            foundation_persist_output,
            foundation_read_output,
            foundation_record_tool_outcome,
            foundation_finish_run,
            foundation_save_context,
            foundation_save_metadata,
            foundation_list_recoverable
        ])
        .build(mock_context(noop_assets()))
        .unwrap();
    let view = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let invoke = |command: &str, body: Value| {
        get_ipc_response(
            &view,
            InvokeRequest {
                cmd: command.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Json(body),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.into(),
            },
        )
        .map(|response| response.deserialize::<Value>().unwrap())
    };
    let scope = json!({"workspaceRoot":directory.path(),"sessionId":"ipc-chat","runId":"ipc-run"});
    let started = invoke(
        "foundation_begin_run",
        json!({"scope":scope,"limits":{"requestLimit":128,"activeTimeLimitMs":1800000}}),
    )
    .unwrap();
    let canonical = started["scope"].clone();
    assert_eq!(started["state"], "active");
    invoke("foundation_record_exchange",json!({"scope":canonical,"exchangeId":"ipc-user","exchange":{"role":"user","content":"Preserve this exact message"}})).unwrap();
    let reservation = invoke(
        "foundation_reserve_request",
        json!({"scope":canonical,"attemptId":"ipc-request","kind":"model"}),
    )
    .unwrap();
    assert_eq!(reservation["ordinal"], 1);
    invoke("foundation_record_tool_intent",json!({"scope":canonical,"intent":{"attemptId":"ipc-tool","operationId":"ipc-operation","tool":"Read","input":{"file_path":"a.txt"},"sideEffect":false}})).unwrap();
    invoke(
        "foundation_mark_tool_started",
        json!({"scope":canonical,"attemptId":"ipc-tool"}),
    )
    .unwrap();
    let output = json!({"text":"full result","artifact":{"kind":"read"}});
    let reference = invoke(
        "foundation_persist_output",
        json!({"scope":canonical,"attemptId":"ipc-tool","output":output}),
    )
    .unwrap();
    invoke("foundation_record_tool_outcome",json!({"scope":canonical,"attemptId":"ipc-tool","outcome":{"state":"succeeded","preview":"Saved","outputRef":reference}})).unwrap();
    assert_eq!(
        invoke(
            "foundation_read_output",
            json!({"scope":canonical,"reference":reference})
        )
        .unwrap(),
        output
    );
    let mut foreign = canonical.clone();
    foreign["sessionId"] = json!("other-chat");
    assert!(invoke("foundation_load_run", json!({"scope":foreign}))
        .unwrap_err()
        .as_str()
        .unwrap()
        .contains("scope mismatch"));
    let loaded = invoke("foundation_load_run", json!({"scope":canonical})).unwrap();
    assert_eq!(
        loaded["exchanges"][0]["payload"]["content"],
        "Preserve this exact message"
    );
    invoke(
        "foundation_finish_run",
        json!({"scope":canonical,"outcome":"completed"}),
    )
    .unwrap();
}

#[test]
fn unavailable_storage_returns_an_ipc_error_instead_of_success() {
    let app = mock_builder()
        .manage(FoundationService::from_result(Err(
            "storage unavailable".into()
        )))
        .invoke_handler(tauri::generate_handler![foundation_list_recoverable])
        .build(mock_context(noop_assets()))
        .unwrap();
    let view = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let response = get_ipc_response(
        &view,
        InvokeRequest {
            cmd: "foundation_list_recoverable".into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "tauri://localhost".parse().unwrap(),
            body: InvokeBody::Json(json!({})),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.into(),
        },
    );
    assert_eq!(
        response.unwrap_err(),
        json!("storage unavailable"),
        "The storage error must propagate, rather than an unrelated routing error"
    );
}
