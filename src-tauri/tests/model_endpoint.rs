use serde_json::json;
use taro::model_endpoint::{build_body, resolve_endpoint, Protocol, StreamDecoder};

#[test]
fn endpoint_routes_full_urls_and_base_urls_without_duplicates() {
    for (input, expected, protocol) in [
        (
            "https://api.test/v1/",
            "https://api.test/v1/chat/completions",
            Protocol::ChatCompletions,
        ),
        (
            "http://localhost:11434",
            "http://localhost:11434/v1/chat/completions",
            Protocol::ChatCompletions,
        ),
        (
            "https://api.test/v1/responses/",
            "https://api.test/v1/responses",
            Protocol::Responses,
        ),
        (
            "https://api.test/chat/completions?api-version=1",
            "https://api.test/chat/completions?api-version=1",
            Protocol::ChatCompletions,
        ),
    ] {
        let resolved = resolve_endpoint(input).unwrap();
        assert_eq!(resolved.url, expected);
        assert_eq!(resolved.protocol, protocol);
    }
}

#[test]
fn rejects_invalid_urls_and_embedded_credentials_without_echoing_input() {
    for endpoint in [
        "",
        "file:///secret",
        "https://user:secret@api.test/v1",
        "https://api.test/v1?api_key=secret",
        "not a URL",
        "https://api.test/v1#secret",
    ] {
        let error = resolve_endpoint(endpoint).unwrap_err();
        assert!(!error.contains("secret"));
    }
}

#[test]
fn responses_body_converts_tool_history_tools_and_multimodal_content() {
    let messages = vec![
        json!({"role":"system","content":"Help"}),
        json!({"role":"user","content":[{"type":"text","text":"Look"},{"type":"image_url","image_url":{"url":"data:image/png;base64,AAAA"}},{"type":"file","file":{"filename":"a.pdf","file_data":"data:application/pdf;base64,AAAA"}}]}),
        json!({"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"Read","arguments":"{}"}}]}),
        json!({"role":"tool","tool_call_id":"call_1","content":"ok"}),
    ];
    let tools = vec![
        json!({"type":"function","function":{"name":"Read","description":"Read file","parameters":{"type":"object"}}}),
    ];
    let body = build_body(Protocol::Responses, "model", &messages, Some(&tools)).unwrap();
    assert!(body.get("messages").is_none());
    assert_eq!(body["input"][0]["content"][0]["type"], "input_text");
    assert_eq!(body["input"][1]["content"][1]["type"], "input_image");
    assert_eq!(body["input"][1]["content"][2]["type"], "input_file");
    assert_eq!(
        body["input"][2],
        json!({"type":"function_call","call_id":"call_1","name":"Read","arguments":"{}"})
    );
    assert_eq!(
        body["input"][3],
        json!({"type":"function_call_output","call_id":"call_1","output":"ok"})
    );
    assert_eq!(body["tools"][0]["name"], "Read");
    assert!(body["tools"][0].get("function").is_none());
}

#[test]
fn responses_stream_preserves_call_id_not_item_id_and_does_not_duplicate_arguments() {
    let mut decoder = StreamDecoder::new(Protocol::Responses);
    decoder.consume(&json!({"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_item","call_id":"call_1","name":"Read","arguments":""}})).unwrap();
    decoder.consume(&json!({"type":"response.function_call_arguments.delta","item_id":"fc_item","output_index":0,"delta":"{\"path\":"})).unwrap();
    decoder.consume(&json!({"type":"response.function_call_arguments.delta","item_id":"fc_item","output_index":0,"delta":"\"a\"}"})).unwrap();
    decoder.consume(&json!({"type":"response.function_call_arguments.done","output_index":0,"arguments":"{\"path\":\"a\"}"})).unwrap();
    let result = decoder.consume(&json!({"type":"response.completed","response":{"status":"completed","output":[{"type":"function_call","call_id":"call_1","name":"Read","arguments":"{\"path\":\"a\"}"}]}})).unwrap();
    assert!(result.done);
    let calls = decoder.calls().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].id, "call_1");
    assert_eq!(calls[0].arguments, "{\"path\":\"a\"}");
}

#[test]
fn chat_stream_handles_parallel_fragmented_calls_and_rejects_truncated_or_failed_output() {
    let mut decoder = StreamDecoder::new(Protocol::ChatCompletions);
    decoder.consume(&json!({"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_b","function":{"name":"Re","arguments":"{"}},{"index":0,"id":"call_a","function":{"name":"List","arguments":"{}"}}]}}]})).unwrap();
    decoder.consume(&json!({"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"name":"ad","arguments":"}"}}]}}]})).unwrap();
    assert_eq!(decoder.calls().unwrap()[1].name, "Read");
    assert!(decoder
        .consume(&json!({"choices":[{"delta":{},"finish_reason":"length"}]}))
        .is_err());
    let mut decoder = StreamDecoder::new(Protocol::Responses);
    assert!(decoder
        .consume(&json!({"type":"response.failed","response":{"error":{"message":"sk-sensitive"}}}))
        .unwrap_err()
        .contains("failed"));
    assert!(decoder
        .consume(&json!({"type":"error","error":{"message":"sk-sensitive"}}))
        .unwrap_err()
        .find("sk-sensitive")
        .is_none());
}

#[test]
fn sse_events_survive_unicode_chunks_and_multiline_data() {
    use taro::model_endpoint::SseBuffer;
    let mut parser = SseBuffer::default();
    let frame = "event: response.output_text.delta\r\ndata: {\"type\":\"response.output_text.delta\",\r\ndata: \"delta\":\"Привет\"}\r\n\r\n";
    let bytes = frame.as_bytes();
    let split = bytes.iter().position(|byte| *byte >= 128).unwrap() + 1;
    assert!(parser.push(&bytes[..split]).unwrap().is_empty());
    let data = parser.push(&bytes[split..]).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&data[0]).unwrap()["delta"],
        "Привет"
    );
}
