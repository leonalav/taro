use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use taro::{
    project_assets::{
        read_bounded, AssetApproval, AssetOptions, MetadataUpdate, Origin, ProjectAssets, Purpose,
        Source, VariantOptions, MAX_BYTES,
    },
    web_transport,
};

#[path = "project_assets/image_provider.rs"]
mod image_provider;

#[derive(Deserialize)]
#[serde(
    tag = "action",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum AssetRequest {
    List,
    StageWorktree {
        session_id: String,
        expected_worktree: PathBuf,
        asset_ids: Vec<String>,
    },
    ImportFile {
        path: PathBuf,
        source: Source,
        options: AssetOptions,
    },
    ImportUrl {
        url: String,
        filename: String,
        source: Source,
        options: AssetOptions,
        variant: Option<DownloadVariant>,
    },
    AddVariantFile {
        id: String,
        path: PathBuf,
        options: VariantOptions,
    },
    AddVariantData {
        id: String,
        filename: String,
        data: String,
        options: VariantOptions,
    },
    CompactGlb {
        id: String,
        parent_variant: Option<String>,
    },
    SubsetFont {
        id: String,
        parent_variant: Option<String>,
        text: String,
    },
    GenerateImage {
        prompt: String,
        edit: Option<ImageEdit>,
    },
    Update {
        id: String,
        expected_revision: u32,
        update: MetadataUpdate,
    },
    SetApproval {
        id: String,
        expected_revision: u32,
        approval: Option<AssetApproval>,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DownloadVariant {
    id: String,
    options: VariantOptions,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImageEdit {
    id: String,
    parent_variant: Option<String>,
}

#[tauri::command]
pub async fn project_assets(
    workspace_root: String,
    request: AssetRequest,
) -> Result<Value, String> {
    if let AssetRequest::GenerateImage { prompt, edit } = request {
        return generate_image(workspace_root, prompt, edit).await;
    }
    if let AssetRequest::ImportUrl {
        url,
        filename,
        mut source,
        options,
        variant,
    } = request
    {
        let url = web_transport::validate_url(&url)?;
        let response = web_transport::get(&url, MAX_BYTES).await.map_err(|error| {
            if error.starts_with("Web server returned HTTP")
                || error.starts_with("Web response")
                || error.starts_with("Web request timed out")
            {
                error
            } else {
                "The asset could not be downloaded from the supplied link.".into()
            }
        })?;
        // A signed URL can carry credentials in its query string. The durable copy is local.
        let mut public_source = response.final_url;
        public_source.set_query(None);
        source.download_url = Some(public_source.to_string());
        if source.origin != Origin::Generated {
            source.origin = Origin::Downloaded;
        }
        return tauri::async_runtime::spawn_blocking(move || {
            let store = ProjectAssets::open(Path::new(&workspace_root))?;
            if let Some(mut variant) = variant {
                variant.options.source = Some(source);
                return json(store.add_variant(
                    &variant.id,
                    &filename,
                    &response.body,
                    variant.options,
                )?);
            }
            json(store.import(&filename, &response.body, source, options)?)
        })
        .await
        .map_err(|error| error.to_string())?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let store = ProjectAssets::open(Path::new(&workspace_root))?;
        match request {
            AssetRequest::List => json(store.list()?),
            AssetRequest::StageWorktree {
                session_id,
                expected_worktree,
                asset_ids,
            } => crate::session_tools::with_owned_worktree(
                Path::new(&workspace_root),
                &session_id,
                &expected_worktree,
                |worktree| {
                    json(store.stage_selection(&ProjectAssets::open(worktree)?, &asset_ids)?)
                },
            ),
            AssetRequest::ImportFile {
                path,
                source,
                options,
            } => {
                let bytes = read_bounded(&path, MAX_BYTES)?;
                json(store.import(file_name(&path)?, &bytes, source, options)?)
            }
            AssetRequest::AddVariantFile { id, path, options } => {
                let bytes = read_bounded(&path, MAX_BYTES)?;
                json(store.add_variant(&id, file_name(&path)?, &bytes, options)?)
            }
            AssetRequest::AddVariantData {
                id,
                filename,
                data,
                options,
            } => {
                const TRANSFORM_LIMIT: usize = 32 * 1024 * 1024;
                if data.len() > TRANSFORM_LIMIT.div_ceil(3) * 4 {
                    return Err("Processed image is larger than 32 MB.".into());
                }
                let bytes = STANDARD
                    .decode(data)
                    .map_err(|_| "Invalid processed asset data.")?;
                if bytes.len() > TRANSFORM_LIMIT {
                    return Err("Processed image is larger than 32 MB.".into());
                }
                json(store.add_variant(&id, &filename, &bytes, options)?)
            }
            AssetRequest::CompactGlb { id, parent_variant } => {
                json(store.compact_glb(&id, parent_variant.as_deref())?)
            }
            AssetRequest::SubsetFont {
                id,
                parent_variant,
                text,
            } => json(store.subset_font(&id, parent_variant.as_deref(), &text)?),
            AssetRequest::Update {
                id,
                expected_revision,
                update,
            } => json(store.update(&id, expected_revision, update)?),
            AssetRequest::SetApproval {
                id,
                expected_revision,
                approval,
            } => json(store.set_approval(&id, expected_revision, approval)?),
            AssetRequest::ImportUrl { .. } | AssetRequest::GenerateImage { .. } => unreachable!(),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

async fn generate_image(
    workspace_root: String,
    prompt: String,
    edit: Option<ImageEdit>,
) -> Result<Value, String> {
    let prompt = prompt.trim().to_owned();
    if prompt.is_empty() || prompt.len() > 4000 || prompt.contains('\0') {
        return Err("Describe the image request in up to 4000 UTF-8 bytes.".into());
    }
    let key = crate::read_model_key("project-assets:gemini")?
        .filter(|value| !value.trim().is_empty())
        .ok_or("Google Gemini is disconnected. Save an API key in Generate an image.")?;
    let (store, edit, input) = tauri::async_runtime::spawn_blocking(move || {
        let store = ProjectAssets::open(Path::new(&workspace_root))?;
        let input = edit
            .as_ref()
            .map(|edit| store.image_edit_input(&edit.id, edit.parent_variant.as_deref()))
            .transpose()?;
        Ok::<_, String>((store, edit, input))
    })
    .await
    .map_err(|error| error.to_string())??;
    let model = image_provider::model();
    if model.len() > 240
        || !model
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err("TARO_GEMINI_IMAGE_MODEL must be a valid Gemini model identifier.".into());
    }
    let (extension, bytes) = image_provider::generate(key, &model, &prompt, input).await?;
    let source = Source {
        origin: Origin::Generated,
        provider: Some("Google Gemini".into()),
        model: Some(model),
        request: Some(prompt.clone()),
        ..Source::default()
    };
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(edit) = edit {
            return json(store.add_variant(
                &edit.id,
                &format!("generated-edit.{extension}"),
                &bytes,
                VariantOptions {
                    purpose: Purpose::ImageEdit,
                    request: prompt,
                    source: Some(source),
                    parent_variant: edit.parent_variant,
                    ..VariantOptions::default()
                },
            )?);
        }
        json(store.import(
            &format!("generated-image.{extension}"),
            &bytes,
            source,
            AssetOptions::default(),
        )?)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn project_asset_bytes(
    workspace_root: String,
    id: String,
    variant_id: Option<String>,
) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = ProjectAssets::open(Path::new(&workspace_root))?;
        Ok(tauri::ipc::Response::new(
            store.read(&id, variant_id.as_deref())?,
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn file_name(path: &Path) -> Result<&str, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Choose a supported asset filename.".into())
}

fn json(value: impl serde::Serialize) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|error| error.to_string())
}
