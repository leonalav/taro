#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod agent_tools;
mod phase_two_tasks;
mod session_tools;
mod lsp_tools;
mod explorer_folders;
mod mcp_client;
mod workspace_explorer;
mod terminals;
mod workspace_watch;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Mutex};
use tauri::ipc::Channel;
use tauri::Manager;
use tokio_util::sync::CancellationToken;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    request_id: String,
    endpoint: String,
    model: String,
    messages: Vec<serde_json::Value>,
    credential_id: String,
    tools: Option<Vec<serde_json::Value>>,
}
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolCall {
    id: String,
    name: String,
    arguments: String,
}
fn merge_tool_delta(
    delta: &serde_json::Value,
    calls: &mut std::collections::BTreeMap<usize, ToolCall>,
) {
    if let Some(items) = delta["tool_calls"].as_array() {
        for item in items {
            let index = item["index"].as_u64().unwrap_or(0) as usize;
            let call = calls.entry(index).or_default();
            if let Some(id) = item["id"].as_str() {
                call.id.push_str(id)
            }
            if let Some(name) = item["function"]["name"].as_str() {
                call.name.push_str(name)
            }
            if let Some(args) = item["function"]["arguments"].as_str() {
                call.arguments.push_str(args)
            }
        }
    }
}
fn take_sse_lines(buffer: &mut Vec<u8>) -> Vec<String> {
    let mut lines = Vec::new();
    while let Some(i) = buffer.iter().position(|b| *b == b'\n') {
        lines.push(String::from_utf8_lossy(&buffer[..i]).trim().to_string());
        buffer.drain(..=i);
    }
    lines
}
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Event {
    Delta { text: String },
    Done,
    Stopped,
}
#[derive(Default)]
struct Streams(Mutex<HashMap<String, CancellationToken>>);

#[tauri::command]
fn stop_chat(request_id: String, streams: tauri::State<'_, Streams>) -> Result<(), String> {
    let token = streams
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .entry(request_id)
        .or_insert_with(CancellationToken::new)
        .clone();
    token.cancel();
    Ok(())
}

#[tauri::command]
async fn store_model_key(model_id: String, secret: String) -> Result<(), String> {
    keyring::Entry::new("taro", &model_id)
        .map_err(|e| e.to_string())?
        .set_password(&secret)
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn delete_model_key(model_id: String) -> Result<(), String> {
    let e = keyring::Entry::new("taro", &model_id).map_err(|e| e.to_string())?;
    let _ = e.delete_credential();
    Ok(())
}
#[tauri::command]
async fn stream_chat(
    request: Request,
    on_event: Channel<Event>,
    streams: tauri::State<'_, Streams>,
) -> Result<Vec<ToolCall>, String> {
    let token = streams
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .entry(request.request_id.clone())
        .or_insert_with(CancellationToken::new)
        .clone();
    let result = stream_chat_inner(&request, &on_event, &token).await;
    streams
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&request.request_id);
    result
}
async fn stream_chat_inner(
    request: &Request,
    on_event: &Channel<Event>,
    token: &CancellationToken,
) -> Result<Vec<ToolCall>, String> {
    let secret = keyring::Entry::new("taro", &request.credential_id)
        .map_err(|e| e.to_string())?
        .get_password()
        .ok();
    let base = request.endpoint.trim_end_matches('/');
    let endpoint = if base.ends_with("/chat/completions") {
        base.to_string()
    } else {
        format!("{base}/chat/completions")
    };
    let client = reqwest::Client::new();
    let mut body =
        serde_json::json!({"model":request.model,"stream":true,"messages":request.messages});
    if let Some(tools) = &request.tools {
        body["tools"] = serde_json::json!(tools);
        body["tool_choice"] = serde_json::json!("auto");
    }
    let mut req = client.post(endpoint).json(&body);
    if let Some(key) = secret {
        req = req.bearer_auth(key);
    }
    let response = tokio::select! { _=token.cancelled()=>{let _=on_event.send(Event::Stopped);return Ok(vec![]);}, result=req.send()=>result.map_err(|e|e.to_string())? };
    if !response.status().is_success() {
        return Err(format!("Endpoint returned HTTP {}", response.status()));
    }
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    let mut calls = std::collections::BTreeMap::<usize, ToolCall>::new();
    loop {
        let chunk = tokio::select! { _=token.cancelled()=>{let _=on_event.send(Event::Stopped);return Ok(vec![]);}, next=stream.next()=>next };
        let Some(chunk) = chunk else { break };
        buffer.extend_from_slice(&chunk.map_err(|e| e.to_string())?);
        for line in take_sse_lines(&mut buffer) {
            if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if data == "[DONE]" {
                    let _ = on_event.send(Event::Done);
                    return Ok(calls.into_values().collect());
                }
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
                    let delta = &v["choices"][0]["delta"];
                    if let Some(t) = delta["content"].as_str() {
                        let _ = on_event.send(Event::Delta { text: t.into() });
                    }
                    merge_tool_delta(delta, &mut calls);
                }
            }
        }
    }
    Err("The model stream ended before completion.".into())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let store=(|| -> Result<taro::run_store::RunStore,String> {
                let data=app.path().app_data_dir().map_err(|error|error.to_string())?;
                std::fs::create_dir_all(&data).map_err(|error|error.to_string())?;
                taro::run_store::RunStore::open(&data.join("foundation.sqlite"))
            })();
            // Storage failures remain visible command errors. They must not make
            // the app impossible to open for recovery or inspection.
            app.manage(taro::foundation_commands::FoundationService::from_result(store));
            Ok(())
        })
        .manage(Streams::default())
        .manage(workspace_watch::WorkspaceWatches::default())
        .manage(terminals::TerminalManager::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            explorer_folders::create_explorer_folder,
            workspace_explorer::list_workspace_directory,
            workspace_explorer::list_workspace_files,
            workspace_explorer::read_workspace_file,
            workspace_explorer::search_workspace,
            workspace_explorer::reveal_workspace_entry,
            workspace_watch::watch_workspace,
            workspace_watch::unwatch_workspace,
            terminals::terminal_create,
            terminals::terminal_read,
            terminals::terminal_write,
            terminals::terminal_resize,
            terminals::terminal_close,
            phase_two_tasks::agent_terminal_list,
            phase_two_tasks::agent_terminal_read,
            taro::foundation_commands::foundation_begin_run,
            taro::foundation_commands::foundation_load_run,
            taro::foundation_commands::foundation_persist_output,
            taro::foundation_commands::foundation_read_output,
            taro::foundation_commands::foundation_reserve_request,
            taro::foundation_commands::foundation_record_exchange,
            taro::foundation_commands::foundation_record_tool_intent,
            taro::foundation_commands::foundation_mark_tool_started,
            taro::foundation_commands::foundation_record_tool_outcome,
            taro::foundation_commands::foundation_save_context,
            taro::foundation_commands::foundation_save_metadata,
            taro::foundation_commands::foundation_finish_run,
            taro::foundation_commands::foundation_list_recoverable,
            stream_chat,
            stop_chat,
            store_model_key,
            delete_model_key,
            execute_agent_tool,
            list_mcp_tools
        ])
        .build(tauri::generate_context!())
        .expect("error while building Taro desktop app")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<terminals::TerminalManager>().close_all();
            }
        });
}

#[tauri::command]
async fn execute_agent_tool(
    request: agent_tools::ToolRequest,
    streams: tauri::State<'_, Streams>,
) -> Result<agent_tools::ToolOutput, String> {
    let id = request.request_id.clone().unwrap_or_default();
    let token = streams
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .entry(id.clone())
        .or_insert_with(CancellationToken::new)
        .clone();
    let result = tokio::select! {_=token.cancelled()=>Err("Tool execution stopped".into()),result=agent_tools::execute(request)=>result};
    streams.0.lock().map_err(|e| e.to_string())?.remove(&id);
    result
}

#[tauri::command]
async fn list_mcp_tools(
    config: serde_json::Value,
    workspace_root: String,
) -> Result<serde_json::Value, String> {
    mcp_client::request(
        &config,
        "tools/list",
        serde_json::json!({}),
        &workspace_root,
    )
    .await
}

#[cfg(test)]
mod stream_tests {
    use super::*;
    #[test]
    fn sse_lines_survive_arbitrary_chunks() {
        let mut buffer = b"data: {\"a\"".to_vec();
        assert!(take_sse_lines(&mut buffer).is_empty());
        buffer.extend_from_slice(b":1}\r\ndata: [DONE]\n");
        assert_eq!(
            take_sse_lines(&mut buffer),
            vec!["data: {\"a\":1}", "data: [DONE]"]
        );
    }
    #[test]
    fn tool_call_arguments_and_name_merge_across_deltas() {
        let mut calls = std::collections::BTreeMap::new();
        merge_tool_delta(
            &serde_json::json!({"tool_calls":[{"index":0,"id":"call_1","function":{"name":"Re","arguments":"{\"file_"}}]}),
            &mut calls,
        );
        merge_tool_delta(
            &serde_json::json!({"tool_calls":[{"index":0,"function":{"name":"ad","arguments":"path\":\"a.txt\"}"}}]}),
            &mut calls,
        );
        let call = &calls[&0];
        assert_eq!(call.id, "call_1");
        assert_eq!(call.name, "Read");
        assert_eq!(call.arguments, "{\"file_path\":\"a.txt\"}");
    }
    #[test]
    fn reasoning_only_delta_is_not_content() {
        let value = serde_json::json!({"reasoning_content":"secret"});
        assert!(value["content"].as_str().is_none());
    }
}
