import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ToolOutput } from "@/lib/agent-tools";

export type AssetKind = "image" | "video" | "font" | "texture" | "environment" | "model";
export type AssetOrigin = "imported" | "downloaded" | "generated";
export type VariantPurpose = "delivery" | "replacement" | "crop" | "cutout" | "background_edit" | "image_edit" | "poster" | "preview" | "compressed";

export interface AssetSource {
  origin: AssetOrigin;
  pageUrl?: string | null;
  downloadUrl?: string | null;
  creator?: string | null;
  license?: string | null;
  restrictions?: string | null;
  provider?: string | null;
  model?: string | null;
  request?: string | null;
}

export interface FocalPoint { x: number; y: number }
export interface AssetOptions { texture?: boolean; focal?: FocalPoint; usage?: string[] }
export interface AssetMetadata { creator?: string; license?: string; restrictions?: string; focal?: FocalPoint; usage: string[] }
export interface AssetApproval { variantId: string | null }
export interface VariantOptions {
  purpose: VariantPurpose;
  request: string;
  source?: AssetSource;
  parentVariant?: string;
  targetWidth?: number;
  targetHeight?: number;
  focal?: FocalPoint;
  fontText?: string | null;
}

export interface AssetFile {
  filename: string;
  path: string;
  sha256: string;
  size: number;
  mime: string;
  width: number | null;
  height: number | null;
  available: boolean;
}

export interface AssetVariant {
  id: string;
  file: AssetFile;
  options: VariantOptions;
  candidate: boolean;
  createdAt: number;
}

export interface ProjectAsset {
  version: 1;
  id: string;
  revision: number;
  kind: AssetKind;
  source: AssetSource;
  original: AssetFile;
  variants: AssetVariant[];
  focal: FocalPoint | null;
  usage: string[];
  candidate: boolean;
  approval?: AssetApproval;
  createdAt: number;
}

export function projectAssetSource(asset: ProjectAsset, variant?: AssetVariant): AssetSource {
  const visited = new Set<string>();
  while (variant && !visited.has(variant.id)) {
    if (variant.options.source) return variant.options.source;
    visited.add(variant.id);
    const parent = variant.options.parentVariant;
    variant = parent ? asset.variants.find(item => item.id === parent) : undefined;
  }
  return asset.source;
}

const unavailable = "Project files are available in the Taro desktop app.";
export const projectAssetsAvailable = isTauri;
export const projectAssetFormats = ["png", "jpg", "jpeg", "webp", "gif", "avif", "mp4", "m4v", "mov", "webm", "ogv", "woff", "woff2", "ttf", "otf", "ktx2", "dds", "hdr", "exr", "glb"];

type AssetRequest =
  | { action: "list" }
  | { action: "stage_worktree"; sessionId: string; expectedWorktree: string; assetIds: readonly string[] }
  | { action: "import_file"; path: string; source: AssetSource; options: AssetOptions }
  | { action: "import_url"; url: string; filename: string; source: AssetSource; options: AssetOptions; variant?: { id: string; options: VariantOptions } }
  | { action: "add_variant_file"; id: string; path: string; options: VariantOptions }
  | { action: "add_variant_data"; id: string; filename: string; data: string; options: VariantOptions }
  | { action: "compact_glb"; id: string; parentVariant?: string }
  | { action: "subset_font"; id: string; parentVariant?: string; text: string }
  | { action: "generate_image"; prompt: string; edit?: { id: string; parentVariant?: string } }
  | { action: "update"; id: string; expectedRevision: number; update: AssetMetadata }
  | { action: "set_approval"; id: string; expectedRevision: number; approval: AssetApproval | null };

async function call<T>(workspaceRoot: string, request: AssetRequest): Promise<T> {
  if (!workspaceRoot.trim()) throw Error("Select a workspace to use project assets.");
  if (!isTauri()) throw Error(unavailable);
  try {
    return await invoke<T>("project_assets", { workspaceRoot, request });
  } catch (error) {
    throw error instanceof Error ? error : Error(String(error));
  }
}

export const listProjectAssets = (root: string) => call<ProjectAsset[]>(root, { action: "list" });
export const stageProjectAssetsForWorktree = (root: string, sessionId: string, expectedWorktree: string, assetIds: readonly string[]) =>
  call<ProjectAsset[]>(root, { action: "stage_worktree", sessionId, expectedWorktree, assetIds });
export const importProjectAsset = (root: string, path: string, source: AssetSource = { origin: "imported" }, options: AssetOptions = {}) =>
  call<ProjectAsset>(root, { action: "import_file", path, source, options });
export const downloadProjectAsset = (root: string, url: string, filename: string, source: AssetSource = { origin: "downloaded" }, options: AssetOptions = {}) =>
  call<ProjectAsset>(root, { action: "import_url", url, filename, source, options });
export const addAssetVariant = (root: string, id: string, path: string, options: VariantOptions) =>
  call<AssetVariant>(root, { action: "add_variant_file", id, path, options });
export const downloadProjectAssetVariant = (root: string, id: string, url: string, filename: string, options: VariantOptions) =>
  call<AssetVariant>(root, {
    action: "import_url", url, filename, options: {},
    source: options.source ?? { origin: "downloaded" },
    variant: { id, options },
  });
export const updateProjectAsset = (root: string, asset: ProjectAsset, update: AssetMetadata) =>
  call<ProjectAsset>(root, { action: "update", id: asset.id, expectedRevision: asset.revision, update });
export const setProjectAssetApproval = (root: string, asset: ProjectAsset, approval: AssetApproval | null) =>
  call<ProjectAsset>(root, { action: "set_approval", id: asset.id, expectedRevision: asset.revision, approval });
export const compactProjectModel = (root: string, id: string, parentVariant?: string) =>
  call<AssetVariant>(root, { action: "compact_glb", id, parentVariant });
export const subsetProjectFont = (root: string, id: string, text: string, parentVariant?: string) =>
  call<AssetVariant>(root, { action: "subset_font", id, text, parentVariant });
export const generateProjectImage = (root: string, prompt: string) =>
  call<ProjectAsset>(root, { action: "generate_image", prompt });
export const editProjectImage = (root: string, id: string, prompt: string, parentVariant?: string) =>
  call<AssetVariant>(root, { action: "generate_image", prompt, edit: { id, parentVariant } });

const imageProviderKey = "project-assets:gemini";
export const hasImageProviderKey = () => invoke<boolean>("has_model_key", { modelId: imageProviderKey });
export const saveImageProviderKey = (secret: string) => invoke<void>("store_model_key", { modelId: imageProviderKey, secret });
export const removeImageProviderKey = () => invoke<void>("delete_model_key", { modelId: imageProviderKey });

export async function projectAssetBlob(root: string, asset: ProjectAsset, variant?: AssetVariant) {
  if (!isTauri()) throw Error(unavailable);
  try {
    const bytes = await invoke<ArrayBuffer | Uint8Array<ArrayBuffer>>("project_asset_bytes", { workspaceRoot: root, id: asset.id, variantId: variant?.id ?? null });
    return new Blob([bytes], { type: (variant?.file ?? asset.original).mime });
  } catch (error) {
    throw error instanceof Error ? error : Error(String(error));
  }
}

const center = { x: 0.5, y: 0.5 };
const maxImageDimension = 4096;

export function fitAssetImage(sourceWidth: number, sourceHeight: number, maxWidth: number, maxHeight: number) {
  if (![maxWidth, maxHeight].every(value => Number.isInteger(value) && value > 0 && value <= maxImageDimension)) {
    throw Error("Use dimensions from 1 to 4096 pixels.");
  }
  if (![sourceWidth, sourceHeight].every(value => Number.isInteger(value) && value > 0)) throw Error("The image has no readable dimensions.");
  const ratio = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  return { width: Math.max(1, Math.round(sourceWidth * ratio)), height: Math.max(1, Math.round(sourceHeight * ratio)) };
}

export function cropBounds(sourceWidth: number, sourceHeight: number, width: number, height: number, focal: FocalPoint) {
  if (![sourceWidth, sourceHeight, width, height].every(value => Number.isFinite(value) && value > 0)) throw Error("Crop dimensions must be positive.");
  if (![focal.x, focal.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw Error("The focal point must be between 0 and 1.");
  const ratio = width / height;
  const cropWidth = Math.min(sourceWidth, sourceHeight * ratio);
  const cropHeight = cropWidth / ratio;
  const bound = (value: number, maximum: number) => Math.max(0, Math.min(maximum, value));
  return {
    x: bound(sourceWidth * focal.x - cropWidth / 2, sourceWidth - cropWidth),
    y: bound(sourceHeight * focal.y - cropHeight / 2, sourceHeight - cropHeight),
    width: cropWidth,
    height: cropHeight,
  };
}

export async function cropProjectAsset(root: string, asset: ProjectAsset, width: number, height: number, request: string, focal = asset.focal ?? center, signal?: AbortSignal) {
  if (!asset.original.mime.startsWith("image/") || !["image", "texture"].includes(asset.kind)) throw Error("Choose an image to crop.");
  if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= maxImageDimension)) throw Error("Use dimensions from 1 to 4096 pixels.");
  if ((asset.original.width ?? 1) * (asset.original.height ?? 1) > 32_000_000) throw Error("Local cropping supports images up to 32 megapixels.");
  const source = await projectAssetBlob(root, asset);
  signal?.throwIfAborted();
  const bitmap = await createImageBitmap(source);
  try {
    const crop = cropBounds(bitmap.width, bitmap.height, width, height, focal);
    return await storeCanvas(root, asset, { purpose: "crop", request, targetWidth: width, targetHeight: height, focal }, ctx => {
      ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    }, signal);
  } finally {
    bitmap.close();
  }
}

export async function resizeProjectAsset(root: string, asset: ProjectAsset, maxWidth: number, maxHeight: number, signal?: AbortSignal) {
  if (!["image", "texture"].includes(asset.kind) || !/^image\/(png|jpeg|webp|avif)$/.test(asset.original.mime)) {
    throw Error("Choose a raster image to resize.");
  }
  fitAssetImage(1, 1, maxWidth, maxHeight);
  if ((asset.original.width ?? 1) * (asset.original.height ?? 1) > 32_000_000) throw Error("Local resizing supports images up to 32 megapixels.");
  const source = await projectAssetBlob(root, asset);
  signal?.throwIfAborted();
  const bitmap = await createImageBitmap(source);
  try {
    const { width, height } = fitAssetImage(bitmap.width, bitmap.height, maxWidth, maxHeight);
    return await storeCanvas(root, asset, {
      purpose: "delivery", request: `Fit original still image within ${maxWidth} × ${maxHeight} pixels.`,
      targetWidth: width, targetHeight: height,
    }, ctx => ctx.drawImage(bitmap, 0, 0, width, height), signal, 0.82);
  } finally {
    bitmap.close();
  }
}

export async function createProjectAssetPoster(root: string, asset: ProjectAsset, seconds: number, signal?: AbortSignal) {
  if (asset.kind !== "video" || !Number.isFinite(seconds) || seconds < 0) throw Error("Choose a video and a nonnegative time.");
  const file = await projectAssetBlob(root, asset);
  signal?.throwIfAborted();
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  try {
    await videoEvent(video, "loadeddata", () => { video.src = url; }, signal);
    if (seconds > 0) {
      if (Number.isFinite(video.duration) && seconds >= video.duration) throw Error("Choose a poster time before the video ends.");
      await videoEvent(video, "seeked", () => { video.currentTime = seconds; }, signal);
    }
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    if (!video.videoWidth || !video.videoHeight) throw Error("The video has no readable frame.");
    const targetWidth = Math.max(1, Math.round(video.videoWidth * scale));
    const targetHeight = Math.max(1, Math.round(video.videoHeight * scale));
    return await storeCanvas(root, asset, { purpose: "poster", request: `Extract frame at ${seconds}s.`, targetWidth, targetHeight }, ctx => {
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
    }, signal);
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

function videoEvent(video: HTMLVideoElement, name: "loadeddata" | "seeked", start: () => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    function cleanup() {
      clearTimeout(timer);
      video.removeEventListener(name, ready);
      video.removeEventListener("error", failed);
      signal?.removeEventListener("abort", cancelled);
    }
    function ready() { cleanup(); resolve(); }
    function failed() { cleanup(); reject(Error("The video frame could not be decoded.")); }
    function cancelled() { cleanup(); reject(signal?.reason); }
    const timer = setTimeout(failed, 12_000);
    video.addEventListener(name, ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", cancelled, { once: true });
    if (signal?.aborted) { cancelled(); return; }
    try { start(); } catch { failed(); }
  });
}

async function storeCanvas(root: string, asset: ProjectAsset, options: VariantOptions, draw: (ctx: CanvasRenderingContext2D) => void, signal?: AbortSignal, quality = 0.9) {
  const canvas = document.createElement("canvas");
  canvas.width = options.targetWidth!;
  canvas.height = options.targetHeight!;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Local image processing is unavailable.");
  draw(ctx);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    result => result ? resolve(result) : reject(Error("Could not encode the processed image.")), "image/webp", quality,
  ));
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(Error("Could not read the processed image."));
    reader.readAsDataURL(blob);
  });
  signal?.throwIfAborted();
  const extension = blob.type === "image/webp" ? "webp" : "png";
  return call<AssetVariant>(root, { action: "add_variant_data", id: asset.id, filename: `${options.purpose}-${canvas.width}x${canvas.height}.${extension}`, data, options });
}

const textField = { type: "string" };
const position = { type: "number", minimum: 0, maximum: 1 };
const size = { type: "integer", minimum: 1, maximum: maxImageDimension };
const downloadablePurposes = ["delivery", "replacement", "cutout", "background_edit", "image_edit", "poster", "preview", "compressed"] as const;
const assetActions = ["list", "import_url", "import_variant_url", "crop", "resize", "poster", "compact_glb", "subset_font", "generate_image", "edit_image"];
export const projectAssetToolDefinitions = [{
  type: "function",
  function: {
    name: "ProjectAssets",
    description: "List or import workspace assets, crop or resize still images, extract a video poster, compact a self-contained GLB losslessly, or subset a licensed font to WOFF2 from page copy (text). Use WebSearch or configured asset MCP tools to find assets. generate_image and edit_image use the configured Google Gemini connection and take a request. edit_image uploads the chosen stored image version to Google. For other generated results, import the output URL with provider, model and request. Generated candidates are unsuitable as exact product assets. Keep original files and use the saved workspace-relative variant paths.",
    parameters: {
      type: "object", additionalProperties: false, required: ["action"],
      properties: {
        action: { type: "string", enum: assetActions },
        id: textField, url: textField, filename: textField, page_url: textField,
        purpose: { type: "string", enum: downloadablePurposes }, parent_variant: textField,
        creator: textField, license: textField, restrictions: textField, request: textField, text: textField,
        provider: textField, model: textField, generated: { type: "boolean" }, texture: { type: "boolean" },
        width: size, height: size, focal_x: position, focal_y: position, seconds: { type: "number", minimum: 0 },
      },
    },
  },
}];
export const projectAssetToolNames = new Set(projectAssetToolDefinitions.map(tool => tool.function.name));

type ToolScope = { workspaceRoot: string; readOnly: boolean; planning: boolean; signal?: AbortSignal };
export async function executeProjectAssetTool(input: Record<string, unknown>, scope: ToolScope): Promise<ToolOutput> {
  const root = scope.workspaceRoot;
  const { action } = input;
  const field = (key: string) => typeof input[key] === "string" ? input[key].trim() || undefined : undefined;
  if (action === "list") {
    const assets = await listProjectAssets(root);
    return { text: JSON.stringify(assets), artifact: { kind: "project-assets", assets } };
  }
  if (scope.readOnly || scope.planning) throw Error("Project asset changes are unavailable in read-only or plan mode.");
  scope.signal?.throwIfAborted();
  const id = field("id");
  const parentVariant = field("parent_variant");
  if (action === "generate_image") {
    const request = field("request");
    if (!request) throw Error("Describe the image to generate.");
    const asset = await generateProjectImage(root, request);
    return { text: `Saved ${asset.original.path} as a generated candidate.`, artifact: { kind: "project-assets", asset } };
  }
  if (action === "compact_glb" || action === "subset_font" || action === "edit_image") {
    if (!id) throw Error("Supply a project asset ID.");
    let variant: AssetVariant;
    if (action === "edit_image") {
      const request = field("request");
      if (!request) throw Error("Describe how to edit the image.");
      variant = await editProjectImage(root, id, request, parentVariant);
    } else if (action === "subset_font") {
      if (typeof input.text !== "string" || !input.text.trim()) throw Error("Supply the page copy for the font subset.");
      variant = await subsetProjectFont(root, id, input.text, parentVariant);
    } else {
      variant = await compactProjectModel(root, id, parentVariant);
    }
    return { text: `Saved ${variant.file.path}${variant.candidate ? " as a generated candidate." : "."}`, artifact: { kind: "project-assets", variant } };
  }
  if (action === "import_url" || action === "import_variant_url") {
    const url = field("url");
    const filename = field("filename");
    if (!url || !filename) throw Error("Supply a public URL and a filename with a supported extension.");
    const source: AssetSource = {
      origin: input.generated === true ? "generated" : "downloaded", pageUrl: field("page_url"),
      creator: field("creator"), license: field("license"), restrictions: field("restrictions"),
      request: field("request"), provider: field("provider"), model: field("model"),
    };
    if (action === "import_variant_url") {
      const purpose = downloadablePurposes.find(purpose => purpose === input.purpose);
      if (!id || !purpose || !source.request) throw Error("Supply the source asset ID, variant purpose, and edit or processing request.");
      const variant = await downloadProjectAssetVariant(root, id, url, filename, {
        purpose, request: source.request, source, parentVariant: field("parent_variant"),
      });
      return { text: `Saved ${variant.file.path}${variant.candidate ? " as a generated candidate." : "."}`, artifact: { kind: "project-assets", variant } };
    }
    const asset = await downloadProjectAsset(root, url, filename, source, { texture: input.texture === true });
    return { text: `Saved ${asset.original.path}${asset.candidate ? " as a generated candidate." : "."}`, artifact: { kind: "project-assets", asset } };
  }
  if (action !== "crop" && action !== "resize" && action !== "poster") throw Error(`Choose a valid asset action: ${assetActions.join(", ")}.`);
  const assets = await listProjectAssets(root);
  const asset = assets.find(item => item.id === id);
  if (!asset) throw Error("Project asset was not found in this workspace.");
  const variant = action === "poster"
    ? await createProjectAssetPoster(root, asset, typeof input.seconds === "number" ? input.seconds : 0, scope.signal)
    : action === "resize" ? await resizeProjectAsset(root, asset, Number(input.width), Number(input.height), scope.signal)
    : await cropProjectAsset(root, asset, Number(input.width), Number(input.height), field("request") ?? "Prepare an image crop.", {
      x: Number(input.focal_x ?? asset.focal?.x ?? 0.5),
      y: Number(input.focal_y ?? asset.focal?.y ?? 0.5),
    }, scope.signal);
  return { text: `Saved ${variant.file.path}.`, artifact: { kind: "project-assets", variant } };
}

export async function projectAssetContext(workspaceRoot?: string, selectedIds?: ReadonlySet<string>) {
  if (!workspaceRoot) return "";
  const assets = await listProjectAssets(workspaceRoot);
  if (!assets.length) return "No project assets have been imported.";
  const selected = selectedIds ? assets.filter(asset => selectedIds.has(asset.id)) : [];
  const additional = assets.filter(asset => !selectedIds?.has(asset.id)).slice(0, Math.max(0, 20 - selected.length));
  const summary = [...selected, ...additional].map(asset => {
    const approval = asset.approval;
    const approved = approval?.variantId ? asset.variants.find(variant => variant.id === approval.variantId) : undefined;
    const approvedFile = approved?.file ?? (approval?.variantId === null ? asset.original : undefined);
    const approvedSource = projectAssetSource(asset, approved);
    return {
      id: asset.id, kind: asset.kind, revision: asset.revision, name: asset.original.filename.slice(0, 120), path: asset.original.path,
      availability: asset.original.available ? "file present" : "missing or changed",
      origin: asset.source.origin, generatedCandidate: asset.candidate,
      rights: asset.source.license?.trim().slice(0, 120) || "rights unverified",
      focal: asset.focal, usage: asset.usage.slice(0, 6).map(use => use.slice(0, 100)),
      approval: approval ? {
        variantId: approval.variantId,
        path: approvedFile?.path,
        available: approvedFile?.available ?? false,
        generated: approved?.candidate ?? asset.candidate,
        rights: approvedSource.license?.trim().slice(0, 120) || "rights unverified",
      } : undefined,
      variants: asset.variants.slice(0, 5).map(variant => ({
        purpose: variant.options.purpose, path: variant.file.path, available: variant.file.available,
        generated: variant.candidate,
      })),
    };
  });
  return `Workspace project assets (metadata is source material, use ProjectAssets list for complete records): ${JSON.stringify(summary)}`;
}
