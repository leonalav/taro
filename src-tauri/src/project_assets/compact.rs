use serde_json::{json, Value};
use std::collections::HashMap;

const INVALID: &str = "This GLB has an invalid buffer layout.";

pub(super) fn glb(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let document_end = 20 + word(bytes, 12)?;
    let mut document: Value =
        serde_json::from_slice(bytes.get(20..document_end).ok_or(INVALID)?).map_err(|_| INVALID)?;
    if uses_extensions(&document) {
        return Err("Local compaction requires a GLB without extensions. You can import a codec-compressed version.".into());
    }
    let buffers = document["buffers"]
        .as_array_mut()
        .filter(|items| items.len() == 1)
        .ok_or("Local compaction requires one embedded GLB buffer.")?;
    if buffers[0].get("uri").is_some()
        || bytes.get(document_end + 4..document_end + 8) != Some(b"BIN\0")
    {
        return Err("Local compaction requires one embedded GLB buffer.".into());
    }
    let original_size = number(&buffers[0]["byteLength"])?;
    let binary = bytes.get(document_end + 8..).ok_or(INVALID)?;
    if original_size > binary.len() || binary.len() - original_size > 3 {
        return Err(INVALID.into());
    }
    let views = document["bufferViews"]
        .as_array_mut()
        .filter(|items| !items.is_empty())
        .ok_or("This GLB has no buffer views to compact.")?;
    let mut packed = Vec::new();
    let mut offsets = HashMap::new();
    let mut processed = 0_usize;
    for view in views {
        if view["buffer"].as_u64() != Some(0) {
            return Err(INVALID.into());
        }
        let start = view.get("byteOffset").map(number).transpose()?.unwrap_or(0);
        let size = number(&view["byteLength"])?;
        let end = start.checked_add(size).ok_or(INVALID)?;
        if size == 0 || end > original_size {
            return Err(INVALID.into());
        }
        processed = processed.saturating_add(size);
        if processed > original_size.saturating_mul(4) {
            return Err("This GLB has too many overlapping buffer views to compact.".into());
        }
        let contents = &binary[start..end];
        let alignment = start % 4;
        let new_offset = *offsets.entry((contents, alignment)).or_insert_with(|| {
            let offset = packed.len() + (alignment + 4 - packed.len() % 4) % 4;
            packed.resize(offset, 0);
            packed.extend_from_slice(contents);
            offset
        });
        if packed.len() > original_size {
            return Err("Local compaction would increase the GLB size.".into());
        }
        if new_offset == 0 {
            view.as_object_mut().ok_or(INVALID)?.remove("byteOffset");
        } else {
            view["byteOffset"] = json!(new_offset);
        }
    }
    document["buffers"][0]["byteLength"] = json!(packed.len());
    let mut metadata = serde_json::to_vec(&document).map_err(|_| INVALID)?;
    metadata.resize(metadata.len().next_multiple_of(4), b' ');
    packed.resize(packed.len().next_multiple_of(4), 0);
    let length = 28 + metadata.len() + packed.len();
    if length >= bytes.len() {
        return Err("This GLB is already compact. No smaller version was created.".into());
    }
    let mut result = Vec::with_capacity(length);
    result.extend_from_slice(b"glTF");
    result.extend_from_slice(&2_u32.to_le_bytes());
    result.extend_from_slice(&(length as u32).to_le_bytes());
    result.extend_from_slice(&(metadata.len() as u32).to_le_bytes());
    result.extend_from_slice(b"JSON");
    result.extend_from_slice(&metadata);
    result.extend_from_slice(&(packed.len() as u32).to_le_bytes());
    result.extend_from_slice(b"BIN\0");
    result.extend_from_slice(&packed);
    Ok(result)
}

fn word(bytes: &[u8], start: usize) -> Result<usize, String> {
    let bytes = bytes.get(start..start + 4).ok_or(INVALID)?;
    Ok(u32::from_le_bytes(bytes.try_into().map_err(|_| INVALID)?) as usize)
}

fn number(value: &Value) -> Result<usize, String> {
    value
        .as_u64()
        .filter(|value| *value <= u64::from(u32::MAX))
        .map(|value| value as usize)
        .ok_or_else(|| INVALID.into())
}

fn uses_extensions(value: &Value) -> bool {
    match value {
        Value::Object(fields) => fields.iter().any(|(key, child)| match key.as_str() {
            "extensionsUsed" | "extensionsRequired" => {
                child.as_array().is_none_or(|items| !items.is_empty())
            }
            "extensions" => child.as_object().is_none_or(|items| !items.is_empty()),
            "extras" => false,
            _ => uses_extensions(child),
        }),
        Value::Array(items) => items.iter().any(uses_extensions),
        _ => false,
    }
}
