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
mod source_control;
mod review_browser;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Mutex};
use tauri::ipc::Channel;
use tauri::Manager;
use tokio_util::sync::CancellationToken;
use taro::model_endpoint::{build_body, resolve_endpoint, Protocol, SseBuffer, StreamDecoder, ToolCall};

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
#[cfg(test)]
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
#[cfg(test)]
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
        .map_err(|_| "Could not open the operating-system credential store.".to_string())?
        .set_password(&secret)
        .map_err(|_| "Could not save the API key in the operating-system credential store.".to_string())
}
#[tauri::command]
async fn delete_model_key(model_id: String) -> Result<(), String> {
    let e = keyring::Entry::new("taro", &model_id).map_err(|_| "Could not open the operating-system credential store.".to_string())?;
    match e.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the API key from the operating-system credential store.".into()),
    }
}
#[tauri::command]
async fn has_model_key(model_id: String) -> Result<bool, String> {
    Ok(read_model_key(&model_id)?.is_some())
}
fn read_model_key(model_id: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new("taro", model_id).map_err(|_| "Could not open the operating-system credential store.".to_string())?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Could not read the API key from the operating-system credential store. Unlock it and try again.".into()),
    }
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
    let result = stream_chat_inner(&request, &on_event, &token, read_model_key).await;
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
    load_key: impl FnOnce(&str) -> Result<Option<String>, String>,
) -> Result<Vec<ToolCall>, String> {
    let endpoint = resolve_endpoint(&request.endpoint)?;
    let body = build_body(endpoint.protocol, &request.model, &request.messages, request.tools.as_ref())?;
    let secret = load_key(&request.credential_id)?;
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_| "Could not initialize the model HTTP client.".to_string())?;
    let mut req = client.post(endpoint.url).header("Accept", "text/event-stream").json(&body);
    if let Some(key) = secret {
        req = req.bearer_auth(key);
    }
    let response = tokio::select! { _=token.cancelled()=>{let _=on_event.send(Event::Stopped);return Ok(vec![]);}, result=req.send()=>result.map_err(|error| if error.is_timeout() { "The model endpoint timed out. Check the endpoint and retry.".to_string() } else { "Could not connect to the model endpoint. Check its URL, TLS certificate and network connection.".to_string() })? };
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let reason = match status {
            401 | 403 => "Authentication was rejected. Update the model's API key or provider permissions.",
            404 => "Endpoint or model was not found. Check the full endpoint URL and model ID.",
            429 => "Provider rate limit or quota was reached. Check your account limits and retry later.",
            300..=399 => "The endpoint redirected the request. Save its final API URL instead.",
            400 | 422 => "Provider rejected the model request. Check the model ID and whether this endpoint supports tools and attachments.",
            500..=599 => "The model provider is unavailable. Retry later.",
            _ => "The model provider rejected the request.",
        };
        return Err(format!("HTTP {status}: {reason}"));
    }
    if !response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|h| h.to_str().ok()).is_some_and(|h| h.to_ascii_lowercase().contains("text/event-stream")) {
        return Err("The endpoint did not return an event stream. Check that its URL supports streamed chat completions or Responses requests.".into());
    }
    let mut stream = response.bytes_stream();
    let mut buffer = SseBuffer::default();
    let mut decoder = StreamDecoder::new(endpoint.protocol);
    loop {
        let chunk = tokio::select! { _=token.cancelled()=>{let _=on_event.send(Event::Stopped);return Ok(vec![]);}, next=stream.next()=>next };
        let Some(chunk) = chunk else { break };
        let chunk = chunk.map_err(|_| "The connection to the model endpoint was interrupted.".to_string())?;
        for data in buffer.push(&chunk)? {
            if data.trim() == "[DONE]" {
                if endpoint.protocol == Protocol::Responses { return Err("The Responses stream ended before a completed response.".into()); }
                let calls = decoder.calls()?;
                let _ = on_event.send(Event::Done);
                return Ok(calls);
            }
            let value = serde_json::from_str::<serde_json::Value>(&data).map_err(|_| "The model endpoint returned invalid stream data.".to_string())?;
            let decoded = decoder.consume(&value)?;
            if let Some(text) = decoded.text { let _ = on_event.send(Event::Delta { text }); }
            if decoded.done {
                let calls = decoder.calls()?;
                let _ = on_event.send(Event::Done);
                return Ok(calls);
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
        .manage(review_browser::ReviewBrowser::default())
        .manage(workspace_watch::WorkspaceWatches::default())
        .manage(terminals::TerminalManager::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            review_browser::review_browser,
            taro::skill_imports::discover_installed_skills,
            taro::skill_imports::import_installed_skill,
            source_control::ipc::sc_status,
            source_control::ipc::sc_stage,
            source_control::ipc::sc_unstage,
            source_control::ipc::sc_diff,
            source_control::ipc::sc_history,
            source_control::ipc::sc_commit,
            source_control::ipc::sc_checkout,
            source_control::ipc::sc_discard,
            source_control::ipc::sc_revert,
            source_control::ipc::sc_push,
            source_control::ipc::sc_pull,
            source_control::ipc::sc_github_account,
            source_control::ipc::sc_github_connect,
            source_control::ipc::sc_github_disconnect,
            source_control::ipc::sc_github_repositories,
            source_control::ipc::sc_github_branches,
            source_control::ipc::sc_github_pull_request,
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
            has_model_key,
            execute_agent_tool,
            open_web_link,
            list_mcp_tools
        ])
        .build(tauri::generate_context!())
        .expect("error while building Taro desktop app")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<review_browser::ReviewBrowser>().close_all();
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
fn open_web_link(url: String) -> Result<(), String> {
    let url = taro::web_transport::validate_url(&url)?;
    #[cfg(target_os = "windows")]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut command = std::process::Command::new("explorer.exe");
        command.creation_flags(0x08000000);
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command.arg(url.as_str()).spawn().map_err(|e|format!("Cannot open default browser: {e}"))?;
    Ok(())
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
    fn model_server(status: &str, content_type: &str, body: &str) -> (String, std::thread::JoinHandle<String>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let reply = format!("HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
        let thread = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket.set_read_timeout(Some(std::time::Duration::from_secs(10))).unwrap();
            let mut received = vec![];
            let mut buffer = [0; 4096];
            loop {
                let size = socket.read(&mut buffer).unwrap();
                assert!(size > 0);
                received.extend_from_slice(&buffer[..size]);
                if let Some(end) = received.windows(4).position(|part| part == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&received[..end]).to_ascii_lowercase();
                    let length = headers.lines().find_map(|line| line.strip_prefix("content-length:")).unwrap().trim().parse::<usize>().unwrap();
                    if received.len() >= end + 4 + length { break; }
                }
            }
            socket.write_all(reply.as_bytes()).unwrap();
            String::from_utf8(received).unwrap()
        });
        (url, thread)
    }
    fn test_request(endpoint: String) -> Request {
        Request {
            request_id: "stream-protocol-test".into(), endpoint, model: "provider/model".into(),
            messages: vec![serde_json::json!({"role":"user","content":"Read a file"})],
            credential_id: "taro-protocol-test-no-stored-credential".into(),
            tools: Some(vec![serde_json::json!({"type":"function","function":{"name":"Read","parameters":{"type":"object","properties":{}}}})]),
        }
    }
    #[tokio::test(flavor = "current_thread")]
    async fn responses_http_request_uses_responses_schema_and_returns_executable_tool_calls() {
        let body = concat!(
            "data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"item\":{\"id\":\"fc_1\",\"type\":\"function_call\",\"call_id\":\"call_1\",\"name\":\"Read\",\"arguments\":\"\"}}\n\n",
            "data: {\"type\":\"response.function_call_arguments.delta\",\"output_index\":0,\"delta\":\"{}\"}\n\n",
            "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}\n\n"
        );
        let (url, server) = model_server("200 OK", "text/event-stream", body);
        let result = stream_chat_inner(&test_request(format!("{url}/v1/responses")), &Channel::new(|_| Ok(())), &CancellationToken::new(), |_| Ok(None)).await.unwrap();
        assert_eq!(result[0].id, "call_1");
        assert_eq!(result[0].name, "Read");
        assert_eq!(result[0].arguments, "{}");
        let received = server.join().unwrap();
        assert!(received.starts_with("POST /v1/responses HTTP/1.1"));
        let body: serde_json::Value = serde_json::from_str(received.split_once("\r\n\r\n").unwrap().1).unwrap();
        assert!(body.get("messages").is_none());
        assert_eq!(body["input"][0]["role"], "user");
        assert_eq!(body["tools"][0]["name"], "Read");
    }
    #[tokio::test(flavor = "current_thread")]
    async fn chat_http_request_uses_version_base_and_decodes_fragmented_tool_calls() {
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_a\",\"function\":{\"name\":\"Read\",\"arguments\":\"{}\"}}]}}]}\n\n",
            "data: [DONE]\n\n"
        );
        let (url, server) = model_server("200 OK", "text/event-stream", body);
        let result = stream_chat_inner(&test_request(format!("{url}/v1/")), &Channel::new(|_| Ok(())), &CancellationToken::new(), |_| Ok(None)).await.unwrap();
        assert_eq!(result[0].id, "call_a");
        let received = server.join().unwrap();
        assert!(received.starts_with("POST /v1/chat/completions HTTP/1.1"));
        let body: serde_json::Value = serde_json::from_str(received.split_once("\r\n\r\n").unwrap().1).unwrap();
        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(body["tools"][0]["function"]["name"], "Read");
    }
    #[tokio::test(flavor = "current_thread")]
    async fn http_auth_errors_are_actionable_without_echoing_provider_secrets() {
        let (url, server) = model_server("401 Unauthorized", "application/json", "{\"error\":{\"message\":\"rejected sk-sensitive-value\"}}");
        let error = stream_chat_inner(&test_request(format!("{url}/v1/")), &Channel::new(|_| Ok(())), &CancellationToken::new(), |_| Ok(Some("fixture-model-key".into()))).await.unwrap_err();
        assert!(error.contains("401"));
        assert!(error.contains("API key"));
        assert!(!error.contains("sk-sensitive"));
        let received = server.join().unwrap();
        assert!(received.to_ascii_lowercase().contains("authorization: bearer fixture-model-key"));
    }
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
