use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

pub const MAX_BYTES: usize = 80 * 1024 * 1024;
const DIRECTORY: &str = "taro-assets";

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Origin {
    #[default]
    Imported,
    Downloaded,
    Generated,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Image,
    Video,
    Font,
    Texture,
    Environment,
    Model,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Purpose {
    #[default]
    Delivery,
    Replacement,
    Crop,
    Cutout,
    BackgroundEdit,
    ImageEdit,
    Poster,
    Preview,
    Compressed,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Source {
    pub origin: Origin,
    pub page_url: Option<String>,
    pub download_url: Option<String>,
    pub creator: Option<String>,
    pub license: Option<String>,
    pub restrictions: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub request: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct FocalPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct AssetOptions {
    pub texture: bool,
    pub focal: Option<FocalPoint>,
    pub usage: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct MetadataUpdate {
    pub creator: Option<String>,
    pub license: Option<String>,
    pub restrictions: Option<String>,
    pub focal: Option<FocalPoint>,
    pub usage: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct VariantOptions {
    pub purpose: Purpose,
    pub request: String,
    pub source: Option<Source>,
    pub parent_variant: Option<String>,
    pub target_width: Option<u32>,
    pub target_height: Option<u32>,
    pub focal: Option<FocalPoint>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_text: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetFile {
    pub filename: String,
    pub path: String,
    pub sha256: String,
    pub size: usize,
    pub mime: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    #[serde(default = "available")]
    pub available: bool,
}

fn available() -> bool {
    true
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Variant {
    pub id: String,
    pub file: AssetFile,
    pub options: VariantOptions,
    #[serde(default)]
    pub candidate: bool,
    pub created_at: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetApproval {
    pub variant_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub version: u32,
    pub id: String,
    pub revision: u32,
    pub kind: Kind,
    pub original: AssetFile,
    pub source: Source,
    pub focal: Option<FocalPoint>,
    pub usage: Vec<String>,
    pub candidate: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval: Option<AssetApproval>,
    pub created_at: u64,
    #[serde(default)]
    pub variants: Vec<Variant>,
}

pub struct ProjectAssets {
    workspace: PathBuf,
}

impl ProjectAssets {
    pub fn open(path: &Path) -> Result<Self, String> {
        let workspace = path
            .canonicalize()
            .map_err(|e| format!("Workspace is unavailable: {e}"))?;
        if !workspace.is_dir() {
            return Err("Select a workspace folder.".into());
        }
        Ok(Self { workspace })
    }

    pub fn list(&self) -> Result<Vec<Asset>, String> {
        let directory = self.workspace.join(DIRECTORY);
        let Some(directory) = checked(&directory, true)? else {
            return Ok(Vec::new());
        };
        let mut assets = Vec::new();
        for entry in directory.read_dir().map_err(io_error)? {
            let entry = entry.map_err(io_error)?;
            let name = entry.file_name();
            if let Some(id) = name.to_str().filter(|id| valid_id(id)) {
                assets.push(self.asset(id)?);
            }
        }
        assets.sort_unstable_by(|a, b| b.created_at.cmp(&a.created_at).then(a.id.cmp(&b.id)));
        Ok(assets)
    }

    pub fn import(
        &self,
        name: &str,
        bytes: &[u8],
        source: Source,
        options: AssetOptions,
    ) -> Result<Asset, String> {
        let name = filename(name)?;
        let info = formats::inspect(&name, bytes)?;
        validate_source(&source)?;
        validate_focal(options.focal.as_ref())?;
        validate_usage(&options.usage)?;
        if options.texture && !matches!(info.kind, Kind::Image | Kind::Texture) {
            return Err("A texture must be an image or a supported texture format.".into());
        }
        if source.origin == Origin::Generated && info.kind != Kind::Image {
            return Err("Generated results must be image files.".into());
        }
        let sha256 = hash(bytes);
        let id = identity(&(&name, &source, &options, &sha256))?;
        let parent = ensure_dir(&self.workspace.join(DIRECTORY))?;
        let file = info.file(
            name,
            format!("{DIRECTORY}/{id}/original.{}", info.extension),
            sha256,
            bytes.len(),
        );
        let asset = Asset {
            version: 1,
            id: id.clone(),
            revision: 1,
            kind: if options.texture {
                Kind::Texture
            } else {
                info.kind
            },
            original: file,
            candidate: source.origin == Origin::Generated,
            approval: None,
            source,
            focal: options.focal,
            usage: options.usage,
            created_at: now(),
            variants: Vec::new(),
        };
        let destination = parent.join(&id);
        if checked(&destination, true)?.is_none() {
            publish_dir(&parent, &destination, |staging| {
                save(staging.join(format!("original.{}", info.extension)), bytes)?;
                save_json(staging.join("asset.json"), &asset)
            })?;
        }
        let stored = self.asset(&id)?;
        self.read(&id, None)?;
        Ok(stored)
    }

    pub fn add_variant(
        &self,
        id: &str,
        name: &str,
        bytes: &[u8],
        options: VariantOptions,
    ) -> Result<Variant, String> {
        let asset = self.asset(id)?;
        let name = filename(name)?;
        let info = formats::inspect(&name, bytes)?;
        let same_kind =
            asset.kind == info.kind || (asset.kind == Kind::Texture && info.kind == Kind::Image);
        match options.purpose {
            Purpose::Poster if asset.kind == Kind::Video && info.kind == Kind::Image => {}
            Purpose::Preview if info.kind == Kind::Image => {}
            Purpose::Crop | Purpose::Cutout | Purpose::BackgroundEdit | Purpose::ImageEdit
                if matches!(asset.kind, Kind::Image | Kind::Texture)
                    && info.kind == Kind::Image => {}
            Purpose::Compressed | Purpose::Replacement | Purpose::Delivery if same_kind => {}
            _ => return Err("The selected file is incompatible with this variant purpose.".into()),
        }
        validate_text(Some(&options.request), 4000)?;
        if options.request.trim().is_empty() {
            return Err("Record how or why this variant was made.".into());
        }
        if let Some(text) = options.font_text.as_deref() {
            validate_text(Some(text), 3500)?;
            if info.kind != Kind::Font || options.purpose != Purpose::Compressed {
                return Err("Only compressed fonts can record subset copy.".into());
            }
        }
        if let Some(source) = &options.source {
            validate_source(source)?;
            if source.origin == Origin::Generated && info.kind != Kind::Image {
                return Err("Generated variants must be image files.".into());
            }
        }
        validate_focal(options.focal.as_ref())?;
        if options
            .target_width
            .is_some_and(|width| Some(width) != info.dimensions.map(|d| d.0))
            || options
                .target_height
                .is_some_and(|height| Some(height) != info.dimensions.map(|d| d.1))
        {
            return Err("The variant dimensions do not match the request.".into());
        }
        self.read_file(Self::find_file(&asset, options.parent_variant.as_deref())?)?;
        let generated_parent = options
            .parent_variant
            .as_deref()
            .and_then(|id| asset.variants.iter().find(|variant| variant.id == id))
            .map(|variant| variant.candidate)
            .unwrap_or(asset.candidate);
        let candidate = options
            .source
            .as_ref()
            .is_some_and(|source| source.origin == Origin::Generated)
            || (options.purpose != Purpose::Replacement && generated_parent);
        let sha256 = hash(bytes);
        let variant_id = identity(&(&name, &options, &sha256))?;
        let directory = self.asset_directory(id)?;
        let parent = ensure_dir(&directory.join("variants"))?;
        let destination = parent.join(&variant_id);
        let file = info.file(
            name,
            format!(
                "{DIRECTORY}/{id}/variants/{variant_id}/content.{}",
                info.extension
            ),
            sha256,
            bytes.len(),
        );
        let variant = Variant {
            id: variant_id.clone(),
            file,
            options,
            candidate,
            created_at: now(),
        };
        if checked(&destination, true)?.is_none() {
            publish_dir(&parent, &destination, |staging| {
                save(staging.join(format!("content.{}", info.extension)), bytes)?;
                save_json(staging.join("asset.json"), &variant)
            })?;
        }
        let stored = self.variant(id, &variant_id, &destination)?;
        self.read_file(&stored.file)?;
        Ok(stored)
    }

    pub fn compact_glb(&self, id: &str, parent_variant: Option<&str>) -> Result<Variant, String> {
        let asset = self.asset(id)?;
        let source = Self::find_file(&asset, parent_variant)?;
        if source.mime != "model/gltf-binary" {
            return Err("Choose a GLB model to compact.".into());
        }
        let bytes = self.read_file(source)?;
        formats::inspect(&source.filename, &bytes)?;
        let compact = compact::glb(&bytes)?;
        self.add_variant(
            id,
            "compact.glb",
            &compact,
            VariantOptions {
                purpose: Purpose::Compressed,
                request: format!(
                    "Lossless GLB buffer compaction ({} → {} bytes).",
                    bytes.len(),
                    compact.len()
                ),
                parent_variant: parent_variant.map(str::to_owned),
                ..VariantOptions::default()
            },
        )
    }

    pub fn subset_font(
        &self,
        id: &str,
        parent_variant: Option<&str>,
        text: &str,
    ) -> Result<Variant, String> {
        if text.trim().is_empty() || text.len() > 3500 || text.contains('\0') {
            return Err("Enter page copy for the subset, up to 3500 UTF-8 bytes.".into());
        }
        let asset = self.asset(id)?;
        let source = Self::find_file(&asset, parent_variant)?;
        if !source.mime.starts_with("font/") {
            return Err("Choose a font file to subset.".into());
        }
        let bytes = self.read_file(source)?;
        let subset = font::subset(&bytes, text)?;
        self.add_variant(
            id,
            "subset.woff2",
            &subset,
            VariantOptions {
                purpose: Purpose::Compressed,
                request: "FontTools WOFF2 subset for the recorded page copy.".into(),
                font_text: Some(text.into()),
                parent_variant: parent_variant.map(str::to_owned),
                ..VariantOptions::default()
            },
        )
    }

    pub fn update(&self, id: &str, expected: u32, update: MetadataUpdate) -> Result<Asset, String> {
        let mut asset = self.load_revision(id, expected)?;
        asset.source.creator = update.creator;
        asset.source.license = update.license;
        asset.source.restrictions = update.restrictions;
        asset.focal = update.focal;
        asset.usage = update.usage;
        validate_source(&asset.source)?;
        validate_focal(asset.focal.as_ref())?;
        validate_usage(&asset.usage)?;
        self.save_revision(asset)
    }

    pub fn set_approval(
        &self,
        id: &str,
        expected: u32,
        approval: Option<AssetApproval>,
    ) -> Result<Asset, String> {
        let mut asset = self.load_revision(id, expected)?;
        if let Some(selection) = &approval {
            let variant_id = selection.variant_id.as_deref();
            if let Some(variant) = asset
                .variants
                .iter()
                .find(|variant| Some(variant.id.as_str()) == variant_id)
            {
                if matches!(variant.options.purpose, Purpose::Preview | Purpose::Poster) {
                    return Err("Only originals and delivery versions can be approved.".into());
                }
            }
            self.read_file(Self::find_file(&asset, variant_id)?)?;
        }
        asset.approval = approval;
        self.save_revision(asset)
    }

    fn load_revision(&self, id: &str, expected: u32) -> Result<Asset, String> {
        let asset = self.asset(id)?;
        if asset.revision != expected {
            return Err("Project asset revision changed. Reopen the asset and try again.".into());
        }
        Ok(asset)
    }

    fn save_revision(&self, mut asset: Asset) -> Result<Asset, String> {
        asset.revision = asset
            .revision
            .checked_add(1)
            .ok_or("Project asset revision limit reached.")?;
        let root = self.asset_directory(&asset.id)?;
        let metadata = ensure_dir(&root.join("metadata"))?;
        let target = metadata.join(format!("{:010}", asset.revision));
        asset.variants.clear();
        asset.original.available = true;
        if !publish_dir(&metadata, &target, |staging| {
            save_json(staging.join("asset.json"), &asset)
        })? {
            return Err("Project asset revision changed. Reopen the asset and try again.".into());
        }
        self.asset(&asset.id)
    }

    pub fn read(&self, id: &str, variant_id: Option<&str>) -> Result<Vec<u8>, String> {
        let asset = self.asset(id)?;
        self.read_file(Self::find_file(&asset, variant_id)?)
    }

    #[cfg(feature = "desktop")]
    pub fn image_edit_input(
        &self,
        id: &str,
        variant_id: Option<&str>,
    ) -> Result<(String, Vec<u8>), String> {
        let asset = self.asset(id)?;
        let file = Self::find_file(&asset, variant_id)?;
        if !matches!(asset.kind, Kind::Image | Kind::Texture)
            || !matches!(
                file.mime.as_str(),
                "image/png" | "image/jpeg" | "image/webp"
            )
            || file.size > 12 * 1024 * 1024
            || asset.variants.iter().any(|variant| {
                Some(variant.id.as_str()) == variant_id
                    && variant.options.purpose == Purpose::Preview
            })
        {
            return Err("Choose a PNG, JPEG or WebP image version up to 12 MB to edit.".into());
        }
        Ok((file.mime.clone(), self.read_file(file)?))
    }

    fn asset_directory(&self, id: &str) -> Result<PathBuf, String> {
        if !valid_id(id) {
            return Err("Invalid project asset ID.".into());
        }
        let base = checked(&self.workspace.join(DIRECTORY), true)?
            .ok_or("Project assets are unavailable.")?;
        checked(&base.join(id), true)?
            .ok_or_else(|| "Project asset was not found in this workspace.".into())
    }

    fn asset(&self, id: &str) -> Result<Asset, String> {
        let dir = self.asset_directory(id)?;
        let mut asset: Asset = load_json(&dir.join("asset.json"))?;
        if let Some(metadata) = checked(&dir.join("metadata"), true)? {
            let mut latest = 1;
            for entry in metadata.read_dir().map_err(io_error)? {
                let entry = entry.map_err(io_error)?;
                if let Some(revision) = entry
                    .file_name()
                    .to_str()
                    .and_then(|name| {
                        (name.len() == 10 && name.bytes().all(|byte| byte.is_ascii_digit()))
                            .then(|| name.parse::<u32>().ok())
                            .flatten()
                    })
                    .filter(|revision| *revision > latest)
                {
                    let folder =
                        checked(&entry.path(), true)?.ok_or("Asset metadata is unavailable.")?;
                    let rec: Asset = load_json(&folder.join("asset.json"))?;
                    if rec.revision != revision || rec.original != asset.original {
                        return Err("Invalid project asset metadata revision.".into());
                    }
                    latest = revision;
                    asset = rec;
                }
            }
        }
        if asset.version != 1 || asset.id != id {
            return Err("Invalid project asset manifest.".into());
        }
        asset.original.available =
            file_available(&asset.original, &dir, &format!("{DIRECTORY}/{id}/original"))?;
        asset.variants.clear();
        if let Some(variants) = checked(&dir.join("variants"), true)? {
            for entry in variants.read_dir().map_err(io_error)? {
                let entry = entry.map_err(io_error)?;
                if let Some(variant_id) = entry.file_name().to_str().filter(|id| valid_id(id)) {
                    asset
                        .variants
                        .push(self.variant(id, variant_id, &entry.path())?);
                }
            }
            asset
                .variants
                .sort_unstable_by(|a, b| b.created_at.cmp(&a.created_at).then(a.id.cmp(&b.id)));
        }
        Ok(asset)
    }

    fn variant(&self, id: &str, variant_id: &str, directory: &Path) -> Result<Variant, String> {
        let dir = checked(directory, true)?.ok_or("Project asset variant is unavailable.")?;
        let mut variant: Variant = load_json(&dir.join("asset.json"))?;
        if variant.id != variant_id {
            return Err("Invalid project asset variant manifest.".into());
        }
        variant.file.available = file_available(
            &variant.file,
            &dir,
            &format!("{DIRECTORY}/{id}/variants/{variant_id}/content"),
        )?;
        Ok(variant)
    }

    fn find_file<'a>(asset: &'a Asset, id: Option<&str>) -> Result<&'a AssetFile, String> {
        match id {
            None => Ok(&asset.original),
            Some(id) => asset
                .variants
                .iter()
                .find(|item| item.id == id)
                .map(|item| &item.file)
                .ok_or_else(|| "Project asset variant was not found.".into()),
        }
    }

    fn read_file(&self, record: &AssetFile) -> Result<Vec<u8>, String> {
        if !record.available {
            return Err("Project asset file is missing or has changed size.".into());
        }
        let path = self.workspace.join(&record.path);
        let path = checked(&path, false)?.ok_or("Project asset file is missing.")?;
        let bytes = read_bounded(&path, MAX_BYTES)?;
        if hash(&bytes) != record.sha256 {
            return Err("Project asset file checksum does not match its manifest.".into());
        }
        Ok(bytes)
    }
}

fn validate_source(source: &Source) -> Result<(), String> {
    for field in [
        &source.creator,
        &source.license,
        &source.restrictions,
        &source.provider,
        &source.model,
        &source.request,
    ] {
        validate_text(field.as_deref(), 4000)?;
    }
    for value in [&source.page_url, &source.download_url]
        .into_iter()
        .flatten()
    {
        if value.len() > 8192 {
            return Err("Source URL is too long.".into());
        }
        let url = url::Url::parse(value).map_err(|_| "Invalid source URL.")?;
        if !matches!(url.scheme(), "https" | "http")
            || url.host().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("Source URLs must use HTTP(S) without credentials.".into());
        }
    }
    match source.origin {
        Origin::Downloaded if source.download_url.is_none() => {
            Err("Record the download URL.".into())
        }
        Origin::Generated
            if [&source.provider, &source.model, &source.request]
                .into_iter()
                .any(|part| part.as_deref().is_none_or(|value| value.trim().is_empty())) =>
        {
            Err("Generated assets require a provider, model, and request.".into())
        }
        _ => Ok(()),
    }
}

fn validate_usage(usage: &[String]) -> Result<(), String> {
    if usage.len() > 40 {
        return Err("List at most 40 asset placements.".into());
    }
    for placement in usage {
        validate_text(Some(placement), 240)?;
    }
    Ok(())
}

fn validate_text(value: Option<&str>, limit: usize) -> Result<(), String> {
    if value.is_some_and(|v| v.len() > limit || v.contains('\0')) {
        return Err("Asset metadata is too long or contains unsupported characters.".into());
    }
    Ok(())
}

fn validate_focal(point: Option<&FocalPoint>) -> Result<(), String> {
    if point.is_some_and(|point| !(0.0..=1.0).contains(&point.x) || !(0.0..=1.0).contains(&point.y))
    {
        return Err("Asset focal point must be within the image.".into());
    }
    Ok(())
}

fn filename(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty()
        || name.len() > 240
        || name.contains(['/', '\\', ':'])
        || name.chars().any(char::is_control)
    {
        return Err("Invalid asset filename.".into());
    }
    Ok(name.to_owned())
}

fn valid_id(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn identity(value: &impl Serialize) -> Result<String, String> {
    Ok(hash(
        &serde_json::to_vec(value).map_err(|error| error.to_string())?,
    ))
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn file_available(record: &AssetFile, directory: &Path, prefix: &str) -> Result<bool, String> {
    let suffix = record
        .path
        .strip_prefix(prefix)
        .and_then(|suffix| suffix.strip_prefix('.'))
        .filter(|suffix| formats::accepted_extension(suffix))
        .ok_or("Invalid asset path in the manifest.")?;
    let stem = prefix.rsplit('/').next().ok_or("Invalid asset path.")?;
    let expected = directory.join(format!("{stem}.{suffix}"));
    Ok(checked(&expected, false)?
        .and_then(|path| path.metadata().ok())
        .is_some_and(|m| m.len() == record.size as u64))
}

fn checked(path: &Path, is_dir: bool) -> Result<Option<PathBuf>, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) => {
            let linked =
                meta.file_type().is_symlink() || path.canonicalize().map_err(io_error)? != path;
            if linked
                || if is_dir {
                    !meta.is_dir()
                } else {
                    !meta.is_file()
                }
            {
                return Err(
                    "Project asset storage contains an unexpected file type or link.".into(),
                );
            }
            Ok(Some(path.to_path_buf()))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(io_error(error)),
    }
}

fn ensure_dir(path: &Path) -> Result<PathBuf, String> {
    match fs::create_dir(path) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(io_error(error)),
    }
    checked(path, true)?.ok_or_else(|| "Could not create project asset storage.".into())
}

fn publish_dir(
    parent: &Path,
    destination: &Path,
    write: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<bool, String> {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let staging = parent.join(format!(
        ".pending-{}-{}-{}",
        std::process::id(),
        now(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir(&staging).map_err(io_error)?;
    let result = write(&staging).and_then(|()| match fs::rename(&staging, destination) {
        Ok(()) => Ok(true),
        Err(error) => match checked(destination, true)? {
            Some(_) => Ok(false),
            None => Err(io_error(error)),
        },
    });
    if staging.exists() {
        let _ = fs::remove_dir_all(staging);
    }
    result
}

fn save(path: PathBuf, content: &[u8]) -> Result<(), String> {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(io_error)?;
    file.write_all(content)
        .and_then(|()| file.sync_all())
        .map_err(io_error)
}

fn save_json(path: PathBuf, value: &impl Serialize) -> Result<(), String> {
    save(
        path,
        &serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?,
    )
}

fn load_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let path = checked(path, false)?.ok_or("Project asset manifest is missing.")?;
    let content = read_bounded(&path, 64 * 1024)?;
    serde_json::from_slice(&content)
        .map_err(|error| format!("Invalid project asset manifest: {error}"))
}

pub fn read_bounded(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    let meta = path.metadata().map_err(io_error)?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > limit as u64 {
        return Err(format!(
            "Choose a non-empty asset file no larger than {} MB.",
            limit / (1024 * 1024)
        ));
    }
    let mut bytes = Vec::with_capacity(meta.len() as usize);
    fs::File::open(path)
        .map_err(io_error)?
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(io_error)?;
    if bytes.is_empty() || bytes.len() > limit {
        return Err("Asset file exceeds the allowed size or is empty.".into());
    }
    Ok(bytes)
}

fn io_error(error: io::Error) -> String {
    format!("Project asset storage failed: {error}")
}

mod compact;
mod font;
mod formats;
#[cfg(test)]
mod tests;
mod worktree;
