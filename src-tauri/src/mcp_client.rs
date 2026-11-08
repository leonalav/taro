use serde_json::{json, Value};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

fn data(body: &str) -> Result<Value, String> {
    if let Ok(value) = serde_json::from_str(body) {
        return Ok(value);
    }
    for line in body.lines().rev() {
        if let Some(s) = line.strip_prefix("data:") {
            if let Ok(value) = serde_json::from_str(s.trim()) {
                return Ok(value);
            }
        }
    }
    Err("MCP server returned an unreadable response".into())
}
async fn http(config: &Value, method: &str, params: Value) -> Result<Value, String> {
    let url = config["url"].as_str().ok_or("MCP URL is missing")?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let key = config["id"]
        .as_str()
        .and_then(|id| keyring::Entry::new("taro", &format!("mcp:{id}")).ok())
        .and_then(|entry| entry.get_password().ok());
    let send = |id: i32, method: &str, params: Value, session: Option<&str>| {
        let mut request = client
            .post(url)
            .header("Accept", "application/json, text/event-stream")
            .json(&json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}));
        if let Some(session) = session {
            request = request.header("Mcp-Session-Id", session)
        }
        if let Some(key) = &key {
            request = request.bearer_auth(key)
        }
        request
    };
    let init=tokio::time::timeout(Duration::from_secs(20),send(1,"initialize",json!({"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"Taro","version":"0.1.0"}}),None).send()).await.map_err(|_|"MCP initialization timed out")?.map_err(|e|e.to_string())?;
    let session = init
        .headers()
        .get("mcp-session-id")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    if !init.status().is_success() {
        return Err(format!(
            "MCP initialization returned HTTP {}",
            init.status()
        ));
    }
    let _ = data(&init.text().await.map_err(|e| e.to_string())?)?;
    let mut notification = client
        .post(url)
        .header("Accept", "application/json, text/event-stream")
        .json(&json!({"jsonrpc":"2.0","method":"notifications/initialized"}));
    if let Some(s) = &session {
        notification = notification.header("Mcp-Session-Id", s)
    }
    if let Some(key) = &key {
        notification = notification.bearer_auth(key)
    }
    notification.send().await.map_err(|e| e.to_string())?;
    let response = tokio::time::timeout(
        Duration::from_secs(30),
        send(2, method, params, session.as_deref()).send(),
    )
    .await
    .map_err(|_| "MCP request timed out")?
    .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("MCP returned HTTP {}", response.status()));
    }
    let value = data(&response.text().await.map_err(|e| e.to_string())?)?;
    if let Some(error) = value.get("error") {
        return Err(error.to_string());
    }
    Ok(value.get("result").cloned().unwrap_or(Value::Null))
}
async fn stdio(config: &Value, method: &str, params: Value, root: &str) -> Result<Value, String> {
    let command = config["command"].as_str().ok_or("MCP command is missing")?;
    let windows_cmd = if cfg!(windows) && matches!(command, "npx" | "npm" | "pnpm" | "yarn") {
        format!("{command}.cmd")
    } else {
        command.to_string()
    };
    let mut process = tokio::process::Command::new(windows_cmd);
    if let Some(args) = config["args"].as_array() {
        for arg in args {
            if let Some(s) = arg.as_str() {
                process.arg(s);
            }
        }
    }
    let mut child = process
        .current_dir(root)
        .kill_on_drop(true)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut stdin = child.stdin.take().ok_or("MCP stdin unavailable")?;
    let stdout = child.stdout.take().ok_or("MCP stdout unavailable")?;
    let mut stdout = BufReader::new(stdout);
    async fn exchange(
        stdin: &mut tokio::process::ChildStdin,
        stdout: &mut BufReader<tokio::process::ChildStdout>,
        id: i32,
        method: &str,
        params: Value,
    ) -> Result<Value, String> {
        stdin
            .write_all(
                format!(
                    "{}\n",
                    json!({"jsonrpc":"2.0","id":id,"method":method,"params":params})
                )
                .as_bytes(),
            )
            .await
            .map_err(|e| e.to_string())?;
        tokio::time::timeout(Duration::from_secs(30), async {
            loop {
                let mut line = String::new();
                if stdout
                    .read_line(&mut line)
                    .await
                    .map_err(|e| e.to_string())?
                    == 0
                {
                    return Err("MCP server closed the connection".into());
                }
                if let Ok(v) = serde_json::from_str::<Value>(&line) {
                    if v["id"] == id {
                        if let Some(error) = v.get("error") {
                            return Err(error.to_string());
                        }
                        return Ok(v.get("result").cloned().unwrap_or(Value::Null));
                    }
                }
            }
        })
        .await
        .map_err(|_| "MCP server timed out".to_string())?
    }
    exchange(&mut stdin,&mut stdout,1,"initialize",json!({"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"Taro","version":"0.1.0"}})).await?;
    stdin
        .write_all(b"{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}\n")
        .await
        .map_err(|e| e.to_string())?;
    let result = exchange(&mut stdin, &mut stdout, 2, method, params).await;
    let _ = child.kill().await;
    result
}
pub async fn request(
    config: &Value,
    method: &str,
    params: Value,
    root: &str,
) -> Result<Value, String> {
    if config["transport"] == "stdio" {
        stdio(config, method, params, root).await
    } else {
        http(config, method, params).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_json_and_sse_responses() {
        assert_eq!(data("{\"result\":1}").unwrap()["result"], 1);
        assert_eq!(
            data("event: message\ndata: {\"result\":{\"tools\":[]}}\n\n").unwrap()["result"]
                ["tools"],
            json!([])
        );
    }
    #[test]
    fn rejects_unreadable_server_output() {
        assert!(data("not json").is_err());
    }
    #[tokio::test]
    async fn http_handshake_and_tool_listing() {
        use tokio::{
            io::{AsyncReadExt, AsyncWriteExt},
            net::TcpListener,
        };
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            for index in 0..3 {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut bytes = Vec::new();
                let mut temp = [0u8; 4096];
                loop {
                    let n = socket.read(&mut temp).await.unwrap();
                    if n == 0 {
                        break;
                    }
                    bytes.extend_from_slice(&temp[..n]);
                    if let Some(split) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                        let header = String::from_utf8_lossy(&bytes[..split]);
                        let len = header
                            .lines()
                            .find_map(|line| {
                                line.to_ascii_lowercase()
                                    .strip_prefix("content-length:")
                                    .and_then(|s| s.trim().parse::<usize>().ok())
                            })
                            .unwrap_or(0);
                        if bytes.len() >= split + 4 + len {
                            break;
                        }
                    }
                }
                let body = if index == 0 {
                    json!({"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26","capabilities":{},"serverInfo":{"name":"mock","version":"1"}}}).to_string()
                } else if index == 1 {
                    String::new()
                } else {
                    json!({"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"ping","description":"Ping","inputSchema":{"type":"object"}}]}}).to_string()
                };
                let status = if index == 1 { "202 Accepted" } else { "200 OK" };
                let session = if index == 0 {
                    "Mcp-Session-Id: test-session\r\n"
                } else {
                    ""
                };
                let response=format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\n{session}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
                socket.write_all(response.as_bytes()).await.unwrap();
            }
        });
        let result = request(
            &json!({"transport":"http","url":format!("http://{address}/mcp")}),
            "tools/list",
            json!({}),
            ".",
        )
        .await
        .unwrap();
        assert_eq!(result["tools"][0]["name"], "ping");
        server.await.unwrap();
    }
    #[tokio::test]
    async fn stdio_handshake_and_tool_call() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("mcp.js");
        std::fs::write(&script,r#"let b='';process.stdin.on('data',c=>{b+=c;let i;while((i=b.indexOf('\n'))>=0){const line=b.slice(0,i);b=b.slice(i+1);const q=JSON.parse(line);if(q.id)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result:q.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{}}:{content:[{type:'text',text:'pong'}]}})+'\n')}});"#).unwrap();
        let result = request(
            &json!({"transport":"stdio","command":"node","args":[script.to_string_lossy()]}),
            "tools/call",
            json!({"name":"ping","arguments":{}}),
            dir.path().to_str().unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(result["content"][0]["text"], "pong");
    }
}
