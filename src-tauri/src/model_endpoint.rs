//! OpenAI-compatible protocol translation. Original implementation informed by
//! the local OpenCode (MIT), Aider (Apache-2.0), and mini-swe-agent (MIT) references.
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Protocol {
    ChatCompletions,
    Responses,
}
#[derive(Debug)]
pub struct Endpoint {
    pub url: String,
    pub protocol: Protocol,
}

pub fn resolve_endpoint(endpoint: &str) -> Result<Endpoint, String> {
    let mut url = url::Url::parse(endpoint.trim())
        .map_err(|_| "Enter a valid HTTP or HTTPS endpoint URL.")?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("Enter a valid HTTP or HTTPS endpoint URL.".into());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.query_pairs().any(|(key, _)| {
            matches!(
                key.to_ascii_lowercase().as_str(),
                "key" | "api_key" | "api-key" | "apikey" | "token" | "access_token"
            )
        })
    {
        return Err(
            "Endpoint URLs cannot contain credentials or fragments. Use the API key field.".into(),
        );
    }
    let path = url.path().trim_end_matches('/');
    let protocol = if path.ends_with("/responses") {
        Protocol::Responses
    } else {
        Protocol::ChatCompletions
    };
    let path = if path.ends_with("/responses") || path.ends_with("/chat/completions") {
        path.to_string()
    } else if path.is_empty() {
        "/v1/chat/completions".into()
    } else {
        format!("{path}/chat/completions")
    };
    url.set_path(&path);
    Ok(Endpoint {
        url: url.into(),
        protocol,
    })
}

fn response_content(content: &Value, assistant: bool) -> Result<Vec<Value>, String> {
    let text_type = if assistant {
        "output_text"
    } else {
        "input_text"
    };
    if let Some(text) = content.as_str() {
        return Ok(vec![json!({"type":text_type,"text":text})]);
    }
    if content.is_null() {
        return Ok(vec![]);
    }
    content.as_array().ok_or("Unsupported model message content.")?.iter().map(|part| {
        match part["type"].as_str() {
            Some("text") => Ok(json!({"type":text_type,"text":part["text"]})),
            Some("image_url") if !assistant => {
                let mut image = json!({"type":"input_image","image_url":part["image_url"]["url"]});
                if let Some(detail) = part["image_url"].get("detail") { image["detail"] = detail.clone(); }
                Ok(image)
            },
            Some("file") if !assistant => Ok(json!({"type":"input_file","filename":part["file"]["filename"],"file_data":part["file"]["file_data"]})),
            Some("input_text" | "input_image" | "input_file" | "output_text") => Ok(part.clone()),
            _ => Err("Unsupported content type for the Responses endpoint.".into()),
        }
    }).collect()
}

pub fn build_body(
    protocol: Protocol,
    model: &str,
    messages: &[Value],
    tools: Option<&Vec<Value>>,
) -> Result<Value, String> {
    if model.trim().is_empty() {
        return Err("Set the provider's model ID in Models settings.".into());
    }
    let mut body = json!({"model":model,"stream":true});
    if protocol == Protocol::ChatCompletions {
        body["messages"] = json!(messages);
    } else {
        let mut input = vec![];
        for message in messages {
            if message["type"]
                .as_str()
                .is_some_and(|t| matches!(t, "function_call" | "function_call_output"))
            {
                input.push(message.clone());
                continue;
            }
            let role = message["role"]
                .as_str()
                .ok_or("Model message is missing its role.")?;
            if role == "tool" {
                input.push(json!({"type":"function_call_output","call_id":message["tool_call_id"],"output":message["content"]}));
                continue;
            }
            let content = response_content(&message["content"], role == "assistant")?;
            if !content.is_empty() {
                input.push(json!({"role":role,"content":content}));
            }
            if let Some(calls) = message["tool_calls"].as_array() {
                for call in calls {
                    input.push(json!({"type":"function_call","call_id":call["id"],"name":call["function"]["name"],"arguments":call["function"]["arguments"]}));
                }
            }
        }
        body["input"] = json!(input);
        // Taro stores the full conversation, including tool outputs, locally.
        body["store"] = json!(false);
    }
    if let Some(tools) = tools.filter(|tools| !tools.is_empty()) {
        body["tools"] = if protocol == Protocol::ChatCompletions {
            json!(tools)
        } else {
            json!(tools
                .iter()
                .map(|tool| {
                    if tool["type"] == "function" && tool.get("function").is_some() {
                        let mut flat = tool["function"].clone();
                        flat["type"] = json!("function");
                        flat
                    } else {
                        tool.clone()
                    }
                })
                .collect::<Vec<_>>())
        };
        body["tool_choice"] = json!("auto");
    }
    Ok(body)
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}
#[derive(Debug, Default)]
pub struct Decoded {
    pub text: Option<String>,
    pub done: bool,
}
pub struct StreamDecoder {
    protocol: Protocol,
    calls: BTreeMap<usize, ToolCall>,
    item_indices: HashMap<String, usize>,
}
impl StreamDecoder {
    pub fn new(protocol: Protocol) -> Self {
        Self {
            protocol,
            calls: BTreeMap::new(),
            item_indices: HashMap::new(),
        }
    }
    fn response_call(&mut self, index: usize, item: &Value) {
        if item["type"] != "function_call" {
            return;
        }
        if let Some(id) = item["id"].as_str() {
            self.item_indices.insert(id.to_string(), index);
        }
        let call = self.calls.entry(index).or_default();
        if let Some(id) = item["call_id"].as_str() {
            call.id = id.into();
        }
        if let Some(name) = item["name"].as_str() {
            call.name = name.into();
        }
        if let Some(args) = item["arguments"].as_str() {
            if !args.is_empty() {
                call.arguments = args.into();
            }
        }
    }
    pub fn consume(&mut self, value: &Value) -> Result<Decoded, String> {
        if value.get("error").is_some() || value["type"] == "error" {
            return Err("The model endpoint reported an error. Check the model ID, credentials and provider limits.".into());
        }
        let mut decoded = Decoded::default();
        if self.protocol == Protocol::ChatCompletions {
            let choice = &value["choices"][0];
            let delta = &choice["delta"];
            decoded.text = delta["content"].as_str().map(str::to_string);
            if delta["refusal"]
                .as_str()
                .is_some_and(|text| !text.is_empty())
            {
                return Err("The model refused this request.".into());
            }
            if let Some(items) = delta["tool_calls"].as_array() {
                for item in items {
                    let index = item["index"].as_u64().unwrap_or(0) as usize;
                    let call = self.calls.entry(index).or_default();
                    if let Some(id) = item["id"].as_str() {
                        call.id.push_str(id);
                    }
                    if let Some(name) = item["function"]["name"].as_str() {
                        call.name.push_str(name);
                    }
                    if let Some(args) = item["function"]["arguments"].as_str() {
                        call.arguments.push_str(args);
                    }
                }
            }
            match choice["finish_reason"].as_str() {
                Some("length") => return Err("The model reached its output limit before completing. Retry with a smaller request.".into()),
                Some("content_filter") => return Err("The provider filtered this response.".into()),
                _ => (),
            }
        } else {
            let index = value["output_index"]
                .as_u64()
                .map(|n| n as usize)
                .or_else(|| {
                    value["item_id"]
                        .as_str()
                        .and_then(|id| self.item_indices.get(id).copied())
                })
                .unwrap_or(0);
            match value["type"].as_str() {
                Some("response.output_text.delta") => decoded.text = value["delta"].as_str().map(str::to_string),
                Some("response.refusal.delta") => return Err("The model refused this request.".into()),
                Some("response.output_item.added" | "response.output_item.done") => self.response_call(index, &value["item"]),
                Some("response.function_call_arguments.delta") => {
                    if let Some(args) = value["delta"].as_str() { self.calls.entry(index).or_default().arguments.push_str(args); }
                },
                Some("response.function_call_arguments.done") => {
                    if let Some(args) = value["arguments"].as_str() { self.calls.entry(index).or_default().arguments = args.into(); }
                },
                Some("response.completed") => {
                    if value["response"]["status"].as_str().is_some_and(|status| status != "completed") { return Err("The model response did not complete.".into()); }
                    if let Some(output) = value["response"]["output"].as_array() {
                        for (index, item) in output.iter().enumerate() { self.response_call(index, item); }
                    }
                    decoded.done = true;
                },
                Some("response.failed") => return Err("The model response failed. Check the model ID, credentials and provider limits.".into()),
                Some("response.incomplete") => return Err("The model response was incomplete, possibly because it reached its output limit.".into()),
                _ => (),
            }
        }
        Ok(decoded)
    }
    pub fn calls(&self) -> Result<Vec<ToolCall>, String> {
        self.calls
            .values()
            .map(|call| {
                if call.id.is_empty()
                    || call.name.is_empty()
                    || serde_json::from_str::<Value>(&call.arguments)
                        .ok()
                        .is_none_or(|args| !args.is_object())
                {
                    Err(
                        "The model returned an incomplete or invalid tool call. Retry the request."
                            .into(),
                    )
                } else {
                    Ok(call.clone())
                }
            })
            .collect()
    }
}

#[derive(Default)]
pub struct SseBuffer {
    bytes: Vec<u8>,
    data: Vec<String>,
}
impl SseBuffer {
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<String>, String> {
        const LIMIT: usize = 4 * 1024 * 1024;
        if self.bytes.len() + chunk.len() + self.data.iter().map(String::len).sum::<usize>() > LIMIT
        {
            return Err("Model stream event exceeded the 4 MiB limit.".into());
        }
        self.bytes.extend_from_slice(chunk);
        let mut frames = vec![];
        while let Some(end) = self.bytes.iter().position(|byte| *byte == b'\n') {
            let line = std::str::from_utf8(&self.bytes[..end])
                .map_err(|_| "Model stream contained invalid UTF-8.")?
                .trim_end_matches('\r')
                .to_string();
            self.bytes.drain(..=end);
            if line.is_empty() {
                if !self.data.is_empty() {
                    frames.push(self.data.join("\n"));
                    self.data.clear();
                }
            } else if let Some(data) = line.strip_prefix("data:") {
                self.data
                    .push(data.strip_prefix(' ').unwrap_or(data).to_string());
            }
        }
        Ok(frames)
    }
}
