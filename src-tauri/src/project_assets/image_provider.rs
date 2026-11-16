use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::{env, time::Duration};

const ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta/interactions";
const RESPONSE_LIMIT: usize = 24 * 1024 * 1024;

pub(super) fn model() -> String {
    env::var("TARO_GEMINI_IMAGE_MODEL")
        .ok()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "gemini-nano-banana-2.1".into())
}

fn payload(model: &str, prompt: &str, source: Option<(String, Vec<u8>)>) -> Value {
    let mut input = vec![json!({"type": "text", "text": prompt})];
    if let Some((mime, bytes)) = source {
        input.push(json!({"type": "image", "mime_type": mime, "data": STANDARD.encode(bytes)}));
    }
    json!({ "model": model, "input": input, "store": false })
}

pub(super) async fn generate(
    key: String,
    model: &str,
    prompt: &str,
    source: Option<(String, Vec<u8>)>,
) -> Result<(&'static str, Vec<u8>), String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|_| "Could not open the Google Gemini connection.")?;
    let response = client
        .post(ENDPOINT)
        .header("x-goog-api-key", key)
        .header("Api-Revision", "2026-05-20")
        .json(&payload(model, prompt, source))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "The Google Gemini image request timed out."
            } else {
                "Could not reach Google Gemini for this image request."
            }
        })?;
    match response.status().as_u16() {
        200 => {}
        401 | 403 => {
            return Err("Google Gemini rejected the saved API key or its permissions.".into())
        }
        429 => return Err("Google Gemini image quota or request limit was reached.".into()),
        status => {
            return Err(format!(
                "Google Gemini image request failed (HTTP {status})."
            ))
        }
    }
    if response
        .content_length()
        .is_some_and(|bytes| bytes > RESPONSE_LIMIT as u64)
    {
        return Err("The Google Gemini image response is too large.".into());
    }
    let mut body = Vec::new();
    let mut chunks = response.bytes_stream();
    while let Some(chunk) = chunks.next().await {
        let chunk = chunk.map_err(|_| "Interrupted while receiving the generated image.")?;
        if body.len() + chunk.len() > RESPONSE_LIMIT {
            return Err("The Google Gemini image response is too large.".into());
        }
        body.extend_from_slice(&chunk);
    }
    let response: Value = serde_json::from_slice(&body)
        .map_err(|_| "Google Gemini returned an invalid image response.")?;
    decode(&response)
}

fn decode(response: &Value) -> Result<(&'static str, Vec<u8>), String> {
    let missing = "Google Gemini did not return a completed image.";
    if response["status"] != "completed" {
        return Err(missing.into());
    }
    let part = response["steps"]
        .as_array()
        .into_iter()
        .flatten()
        .rev()
        .filter(|step| step["type"] == "model_output")
        .flat_map(|step| step["content"].as_array().into_iter().flatten().rev())
        .find(|part| part["type"] == "image")
        .ok_or(missing)?;
    let data = part["data"]
        .as_str()
        .filter(|data| !data.is_empty())
        .ok_or(missing)?;
    let bytes = STANDARD
        .decode(data)
        .map_err(|_| "Google Gemini returned invalid image data.")?;
    let extension = match part["mime_type"].as_str() {
        Some("image/png") if bytes.ends_with(b"\0\0\0\0IEND\xaeB\x60\x82") => "png",
        Some("image/jpeg") if bytes.ends_with(b"\xff\xd9") => "jpg",
        Some("image/webp")
            if bytes.get(4..8).is_some_and(|length| {
                u64::from(u32::from_le_bytes(length.try_into().unwrap())) + 8 == bytes.len() as u64
            }) =>
        {
            "webp"
        }
        _ => return Err("Google Gemini returned an incomplete or unsupported image.".into()),
    };
    Ok((extension, bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edit_payload_sends_exact_input_and_turns_off_interaction_storage() {
        let body = payload(
            "image-model",
            "Remove background",
            Some(("image/png".into(), vec![1, 2, 3])),
        );
        assert_eq!(
            body,
            json!({
                "model": "image-model", "store": false,
                "input": [
                    {"type": "text", "text": "Remove background"},
                    {"type": "image", "mime_type": "image/png", "data": "AQID"},
                ]
            })
        );
    }

    #[test]
    fn returns_only_completed_inline_image_output() {
        let data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+Xv68AgAAAABJRU5ErkJggg==";
        let initial = json!({
            "status": "completed",
            "steps": [{"type": "model_output", "content": [{"type": "image", "mime_type": "image/png", "data": data}]}]
        });
        assert_eq!(
            decode(&initial).unwrap(),
            ("png", STANDARD.decode(data).unwrap())
        );
        let mut failed = initial.clone();
        failed["status"] = json!("failed");
        assert!(decode(&failed).is_err());
        failed = initial;
        failed["steps"][0]["content"][0]["data"] = json!("AQID");
        assert!(decode(&failed).is_err());
        assert!(decode(&json!({ "status": "completed", "steps": [{"type":"model_output", "content":[{"type":"text", "text":"I generated a file"}]}] })).is_err());
    }
}
