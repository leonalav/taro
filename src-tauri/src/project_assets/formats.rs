use super::{AssetFile, Kind, MAX_BYTES};
use std::path::Path;

pub(super) struct Format {
    pub kind: Kind,
    pub extension: String,
    mime: &'static str,
    pub dimensions: Option<(u32, u32)>,
}

impl Format {
    pub fn file(&self, filename: String, path: String, sha256: String, size: usize) -> AssetFile {
        AssetFile {
            filename,
            path,
            sha256,
            size,
            mime: self.mime.into(),
            width: self.dimensions.map(|d| d.0),
            height: self.dimensions.map(|d| d.1),
            available: true,
        }
    }
}

fn media_type(extension: &str) -> Option<(Kind, &'static str)> {
    Some(match extension {
        "png" => (Kind::Image, "image/png"),
        "jpg" | "jpeg" => (Kind::Image, "image/jpeg"),
        "webp" => (Kind::Image, "image/webp"),
        "gif" => (Kind::Image, "image/gif"),
        "avif" => (Kind::Image, "image/avif"),
        "mp4" | "m4v" => (Kind::Video, "video/mp4"),
        "mov" => (Kind::Video, "video/quicktime"),
        "webm" => (Kind::Video, "video/webm"),
        "ogv" => (Kind::Video, "video/ogg"),
        "woff" => (Kind::Font, "font/woff"),
        "woff2" => (Kind::Font, "font/woff2"),
        "ttf" => (Kind::Font, "font/ttf"),
        "otf" => (Kind::Font, "font/otf"),
        "ktx2" => (Kind::Texture, "image/ktx2"),
        "dds" => (Kind::Texture, "image/vnd-ms.dds"),
        "hdr" => (Kind::Environment, "image/vnd.radiance"),
        "exr" => (Kind::Environment, "image/x-exr"),
        "glb" => (Kind::Model, "model/gltf-binary"),
        _ => return None,
    })
}

pub(super) fn accepted_extension(extension: &str) -> bool {
    media_type(extension).is_some()
}

pub(super) fn inspect(name: &str, bytes: &[u8]) -> Result<Format, String> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err("Choose a non-empty asset file no larger than 80 MB.".into());
    }
    let extension = Path::new(name)
        .extension()
        .and_then(|p| p.to_str())
        .unwrap_or("");
    let normalized = extension.to_ascii_lowercase();
    let (kind, mime) = media_type(&normalized)
        .ok_or("Unsupported format. Use an image, video, font, texture, lighting map, or self-contained GLB.")?;
    let signature = match normalized.as_str() {
        "png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR"),
        "jpg" | "jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "webp" => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
        "gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "avif" => has_brand(bytes, &[b"avif", b"avis"]),
        "mp4" | "m4v" => has_brand(
            bytes,
            &[
                b"isom", b"iso2", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"M4V ",
                b"dash", b"MSNV", b"cmfc", b"cmfs",
            ],
        ),
        "mov" => has_brand(bytes, &[b"qt  "]),
        "webm" => {
            bytes.starts_with(b"\x1a\x45\xdf\xa3")
                && bytes[..bytes.len().min(64)]
                    .windows(7)
                    .any(|part| part == b"\x42\x82\x84webm")
        }
        "ogv" => {
            bytes.starts_with(b"OggS")
                && bytes
                    .get(..bytes.len().min(1024))
                    .is_some_and(|head| head.windows(7).any(|part| part == b"\x80theora"))
        }
        "woff" => bytes.starts_with(b"wOFF"),
        "woff2" => bytes.starts_with(b"wOF2"),
        "ttf" => bytes.starts_with(b"\x00\x01\x00\x00") || bytes.starts_with(b"true"),
        "otf" => bytes.starts_with(b"OTTO"),
        "ktx2" => bytes.starts_with(b"\xabKTX 20\xbb\r\n\x1a\n"),
        "dds" => bytes.starts_with(b"DDS "),
        "hdr" => bytes.starts_with(b"#?RADIANCE\n") || bytes.starts_with(b"#?RGBE\n"),
        "exr" => bytes.starts_with(b"\x76\x2f\x31\x01"),
        "glb" => valid_glb(bytes),
        _ => false,
    };
    if !signature {
        return Err(if kind == Kind::Model {
            "Choose a valid GLB 2.0 model with all of its buffers and textures embedded."
        } else {
            "Asset contents do not match the filename extension."
        }
        .into());
    }
    let dimensions = match normalized.as_str() {
        "png" => word32(bytes, 16, true).zip(word32(bytes, 20, true)),
        "gif" => word16(bytes, 6, false).zip(word16(bytes, 8, false)),
        "jpg" | "jpeg" => jpeg_dimensions(bytes),
        "webp" => webp_dimensions(bytes),
        "ktx2" => word32(bytes, 20, false).zip(word32(bytes, 24, false)),
        "dds" => word32(bytes, 16, false).zip(word32(bytes, 12, false)),
        _ => None,
    }
    .filter(|&(w, h)| w > 0 && h > 0);
    // All stored files use lowercase extensions regardless of the imported name.
    Ok(Format {
        kind,
        extension: normalized,
        mime,
        dimensions,
    })
}

fn word16(bytes: &[u8], start: usize, big_endian: bool) -> Option<u32> {
    let value = bytes.get(start..start + 2)?.try_into().ok()?;
    Some(u32::from(if big_endian {
        u16::from_be_bytes(value)
    } else {
        u16::from_le_bytes(value)
    }))
}

fn word32(bytes: &[u8], start: usize, big_endian: bool) -> Option<u32> {
    let value = bytes.get(start..start + 4)?.try_into().ok()?;
    Some(if big_endian {
        u32::from_be_bytes(value)
    } else {
        u32::from_le_bytes(value)
    })
}

fn has_brand(bytes: &[u8], brands: &[&[u8; 4]]) -> bool {
    let Some(size) = word32(bytes, 0, true).map(|value| value as usize) else {
        return false;
    };
    bytes.get(4..8) == Some(b"ftyp")
        && size >= 16
        && size <= bytes.len()
        && (brands
            .iter()
            .any(|brand| bytes.get(8..12) == Some(brand.as_slice()))
            || bytes[16..size]
                .chunks_exact(4)
                .any(|code| brands.iter().any(|brand| code == brand.as_slice())))
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    let mut i = 2;
    while bytes.get(i) == Some(&0xff) {
        i += 1;
        let marker = *bytes.get(i)?;
        i += 1;
        match marker {
            0xff => {
                i -= 1;
                continue;
            }
            0xd9 | 0xda => break,
            0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf => {
                return word16(bytes, i + 5, true).zip(word16(bytes, i + 3, true));
            }
            _ => {
                let segment = word16(bytes, i, true)? as usize;
                if segment < 2 {
                    break;
                }
                i += segment;
            }
        }
    }
    None
}

fn webp_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    let header = bytes.get(12..16)?;
    match header {
        b"VP8X" => Some((
            ((word32(bytes, 24, false)?) & 0xff_ffff) + 1,
            u32::from_le_bytes([*bytes.get(27)?, *bytes.get(28)?, *bytes.get(29)?, 0]) + 1,
        )),
        b"VP8L" if bytes.get(20) == Some(&0x2f) => {
            let packed = word32(bytes, 21, false)?;
            Some(((packed & 0x3fff) + 1, ((packed >> 14) & 0x3fff) + 1))
        }
        b"VP8 " if bytes.get(23..26) == Some(b"\x9d\x01\x2a") => Some((
            word16(bytes, 26, false)? & 0x3fff,
            word16(bytes, 28, false)? & 0x3fff,
        )),
        _ => None,
    }
}

fn valid_glb(bytes: &[u8]) -> bool {
    if !bytes.starts_with(b"glTF")
        || word32(bytes, 4, false) != Some(2)
        || word32(bytes, 8, false) != Some(bytes.len() as u32)
        || bytes.get(16..20) != Some(b"JSON")
    {
        return false;
    }
    let Some(size) = word32(bytes, 12, false).map(|value| value as usize) else {
        return false;
    };
    if size == 0 || size % 4 != 0 || size > 4 * 1024 * 1024 {
        return false;
    }
    let end = 20 + size;
    let Some(Ok(document)) = bytes
        .get(20..end)
        .map(serde_json::from_slice::<serde_json::Value>)
    else {
        return false;
    };
    if document
        .pointer("/asset/version")
        .and_then(|version| version.as_str())
        != Some("2.0")
    {
        return false;
    }
    for field in ["buffers", "images"] {
        if document.get(field).is_some_and(|value| !value.is_array()) {
            return false;
        }
    }
    if !local_resources(&document) {
        return false;
    }
    end == bytes.len()
        || (bytes.get(end + 4..end + 8) == Some(b"BIN\0")
            && word32(bytes, end, false).is_some_and(|size| {
                size as usize % 4 == 0 && end + 8 + size as usize == bytes.len()
            }))
}

fn local_resources(document: &serde_json::Value) -> bool {
    match document {
        serde_json::Value::Object(fields) => fields.iter().all(|(key, value)| {
            if key.eq_ignore_ascii_case("uri") {
                value.as_str().is_some_and(|uri| {
                    [
                        "data:application/octet-stream;base64,",
                        "data:application/gltf-buffer;base64,",
                        "data:image/png;base64,",
                        "data:image/jpeg;base64,",
                        "data:image/webp;base64,",
                        "data:image/ktx2;base64,",
                    ]
                    .iter()
                    .any(|prefix| uri.starts_with(prefix))
                })
            } else {
                local_resources(value)
            }
        }),
        serde_json::Value::Array(items) => items.iter().all(local_resources),
        _ => true,
    }
}
