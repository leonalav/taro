import { open } from "@tauri-apps/plugin-dialog";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectModelPreview } from "@/components/project-model-preview";
import {
  addAssetVariant, createProjectAssetPoster, cropProjectAsset, downloadProjectAsset, downloadProjectAssetVariant, importProjectAsset,
  listProjectAssets, projectAssetBlob, projectAssetFormats, projectAssetSource, projectAssetsAvailable, resizeProjectAsset, setProjectAssetApproval, updateProjectAsset,
  compactProjectModel, subsetProjectFont, editProjectImage, generateProjectImage, hasImageProviderKey, saveImageProviderKey, removeImageProviderKey,
  type AssetSource, type AssetVariant, type ProjectAsset, type VariantPurpose,
} from "@/lib/project-assets";

const labels = {
  image: "Image", video: "Video", font: "Font", texture: "Texture", environment: "Lighting map", model: "3D model",
};
const purposes: Record<VariantPurpose, string> = {
  delivery: "Delivery version", replacement: "Replacement", crop: "Crop", cutout: "Cutout",
  background_edit: "Background edit", image_edit: "Image edit", poster: "Video poster", preview: "Preview image", compressed: "Compressed version",
};
const fields = "grid gap-3 sm:grid-cols-2";
const inputLabel = "grid gap-1 text-xs text-muted-foreground";
const selectClass = "h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground";
const filters = [{ name: "Project assets", extensions: projectAssetFormats }];
type Action = (work: () => Promise<string | undefined>) => void;

function field(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim() || undefined;
}

function rights(data: FormData) {
  return { creator: field(data, "creator"), license: field(data, "license"), restrictions: field(data, "restrictions") };
}

function generation(data: FormData): AssetSource | undefined {
  if (!data.has("generated")) return;
  const provider = field(data, "provider");
  const model = field(data, "model");
  const request = field(data, "generationRequest");
  if (!provider || !model || !request) throw Error("Enter the provider, model, and generation request.");
  return { origin: "generated", provider, model, request };
}

function focal(data: FormData) {
  const x = field(data, "focalX");
  const y = field(data, "focalY");
  if (x === undefined && y === undefined) return;
  if (x === undefined || y === undefined) throw Error("Enter both focal point coordinates.");
  return { x: Number(x), y: Number(y) };
}

const placements = (data: FormData) => (field(data, "usage") ?? "").split("\n").map(item => item.trim()).filter(Boolean);
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export function ProjectAssetsPanel({ workspaceRoot }: { workspaceRoot?: string }) {
  if (!workspaceRoot) return <p className="p-6 text-sm text-muted-foreground">Select a workspace to use project assets.</p>;
  if (!projectAssetsAvailable()) return <p className="p-6 text-sm text-muted-foreground">Project files are available in the Taro desktop app.</p>;
  return <WorkspaceAssets key={workspaceRoot} root={workspaceRoot} />;
}

function WorkspaceAssets({ root }: { root: string }) {
  const [assets, setAssets] = React.useState<ProjectAsset[] | null>(null);
  const [selected, setSelected] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [observation, setObservation] = React.useState(0);
  const running = React.useRef(false);
  const listVersion = React.useRef(0);

  React.useEffect(() => {
    let active = true;
    const version = ++listVersion.current;
    listProjectAssets(root).then(
      items => { if (active && listVersion.current === version) setAssets(items); },
      error => { if (active && listVersion.current === version) setError(String(error)); },
    );
    return () => { active = false; };
  }, [root]);

  const run: Action = async work => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const notice = await work();
      listVersion.current++;
      setAssets(await listProjectAssets(root));
      setObservation(previous => previous + 1);
      setNotice(notice ?? "");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const asset = assets?.find(item => item.id === selected);
  const search = query.trim().toLocaleLowerCase();
  const visible = (assets ?? []).filter(item => [item.original.filename, labels[item.kind], item.source.creator, ...item.usage]
    .some(value => value?.toLocaleLowerCase().includes(search)));

  return <section className="space-y-5 p-6" aria-label="Project assets" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">Project assets</h2>
      <div className="flex items-center gap-2">
        <Input className="w-44" aria-label="Search project assets" placeholder="Search project assets" value={query} onChange={event => setQuery(event.target.value)} />
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(async () => undefined)}>Refresh</Button>
      </div>
    </div>
    <AssetImport root={root} run={run} busy={busy} onSelect={setSelected} />
    <AssetGeneration root={root} run={run} busy={busy} onSelect={setSelected} />
    {error && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    <p role="status" className={notice || busy || !assets && !error ? "text-sm text-muted-foreground" : "sr-only"}>
      {busy ? "Working with project files…" : notice || (!assets && !error ? "Loading project files…" : "")}
    </p>
    {assets?.length === 0 && <p className="text-sm text-muted-foreground">Import images, fonts, videos, textures, lighting maps, or self-contained GLB models.</p>}
    {assets && assets.length > 0 && visible.length === 0 && <p className="text-sm text-muted-foreground">No assets match this search.</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(14rem,1fr)_minmax(20rem,2fr)]">
      {visible.length > 0 && <ul className="overflow-hidden rounded-lg border border-border">
        {visible.map(item => <li key={item.id} className="border-b border-border last:border-b-0">
          <button type="button" aria-pressed={item.id === selected} className="w-full px-3 py-2.5 text-left hover:bg-accent aria-pressed:bg-accent" onClick={() => setSelected(item.id)}>
            <span className="block truncate text-sm font-medium">{item.original.filename}</span>
            <span className="block text-xs text-muted-foreground">
              {labels[item.kind]} · {size(item.original.size)}
              {item.candidate && " · Generated candidate"}
              {item.approval && " · Approved version"}
              {!item.original.available && " · Missing or changed"}
              {!item.source.license?.trim() && " · Rights unverified"}
            </span>
          </button>
        </li>)}
      </ul>}
      {asset && <AssetDetails key={asset.id} asset={asset} root={root} run={run} busy={busy} observation={observation} />}
    </div>
  </section>;
}

function AssetImport({ root, run, busy, onSelect }: { root: string; run: Action; busy: boolean; onSelect: (id: string) => void }) {
  const [generated, setGenerated] = React.useState(false);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const mode = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    run(async () => {
      const source = { ...(generation(data) ?? { origin: "imported" as const }), ...rights(data), pageUrl: field(data, "pageUrl") };
      const options = { texture: data.has("texture") };
      const url = field(data, "url");
      if (mode === "link") {
        const filename = field(data, "filename");
        if (!url || !filename) throw Error("For a download enter the direct file URL and a filename with an extension.");
        const asset = await downloadProjectAsset(root, url, filename, source, options);
        onSelect(asset.id);
        return `Saved ${asset.original.filename}.`;
      }
      const path = await open({ title: "Import a project asset", filters });
      if (!path) return;
      const asset = await importProjectAsset(root, path, source, options);
      onSelect(asset.id);
      return `Saved ${asset.original.filename}.`;
    });
  }
  return <details className="rounded-lg border border-border p-3">
    <summary className="cursor-pointer text-sm font-medium">Import an asset</summary>
    <form className="mt-3 space-y-3" onSubmit={submit}>
      <div className={fields}>
        <TextField name="url" label="Direct download URL" />
        <TextField name="filename" label="Filename for download" placeholder="product.glb" />
        <TextField name="pageUrl" label="Source page URL" />
        <TextField name="creator" label="Creator or rights holder" />
        <TextField name="license" label="License or usage permission" />
        <TextField name="restrictions" label="Credit and restrictions" />
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="texture" />Use as texture</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="generated" checked={generated} onChange={event => setGenerated(event.target.checked)} />Generated image</label>
      </div>
      {generated && <>
        <p className="text-xs text-muted-foreground">Use a configured image plugin to generate or edit the image, then import its output.</p>
        <GenerationFields />
      </>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} type="submit" value="file">Choose original file</Button>
        <Button size="sm" disabled={busy} type="submit" variant="secondary" value="link">Import from link</Button>
      </div>
    </form>
  </details>;
}

function TextField({ name, label, placeholder, defaultValue }: { name: string; label: string; placeholder?: string; defaultValue?: string | null }) {
  return <label className={inputLabel}>{label}<Input name={name} placeholder={placeholder} defaultValue={defaultValue ?? ""} /></label>;
}

function GenerationFields() {
  return <div className={fields}>
    <TextField name="provider" label="Generation provider" />
    <TextField name="model" label="Model" />
    <label className={`${inputLabel} sm:col-span-2`}>Generation or edit request<textarea className={`${selectClass} h-auto min-h-14 p-2`} name="generationRequest" /></label>
  </div>;
}

function AssetGeneration({ root, run, busy, onSelect }: { root: string; run: Action; busy: boolean; onSelect: (id: string) => void }) {
  const [connected, setConnected] = React.useState<boolean | null>(null);
  const [setupError, setSetupError] = React.useState("");
  const secret = React.useRef<HTMLInputElement>(null);
  function checkConnection() {
    if (connected !== null) return;
    hasImageProviderKey().then(
      value => { setConnected(value); setSetupError(""); },
      () => setSetupError("Could not check the Google Gemini connection."),
    );
  }
  return <details className="rounded-lg border border-border p-3" onToggle={event => { if (event.currentTarget.open) checkConnection(); }}>
    <summary className="cursor-pointer text-sm font-medium">Generate an image</summary>
    <div className="mt-3 space-y-3">
      {setupError && <p className="text-xs text-destructive" role="alert">{setupError}</p>}
      {connected ? <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">Google Gemini API key saved</p>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(async () => {
          await removeImageProviderKey();
          setConnected(false);
          return "Google Gemini API key removed.";
        })}>Remove key</Button>
      </div> : <form className={fields} onSubmit={event => {
        event.preventDefault();
        const key = secret.current?.value.trim();
        if (secret.current) secret.current.value = "";
        if (!key) return;
        run(async () => {
          await saveImageProviderKey(key);
          setConnected(true);
          setSetupError("");
          return "Google Gemini API key saved.";
        });
      }}>
        <label className={inputLabel}>Google Gemini API key<Input ref={secret} type="password" autoComplete="new-password" required /></label>
        <Button className="self-end justify-self-start" size="sm" variant="secondary" disabled={busy} type="submit">Save API key</Button>
      </form>}
      {connected && <form className="space-y-2" onSubmit={event => {
        event.preventDefault();
        const prompt = field(new FormData(event.currentTarget), "prompt");
        if (!prompt) return;
        run(async () => {
          const asset = await generateProjectImage(root, prompt);
          onSelect(asset.id);
          return "Saved a generated image candidate.";
        });
      }}>
        <label className={inputLabel}>Image description<textarea name="prompt" className={`${selectClass} h-auto min-h-14 p-2`} maxLength={4000} required /></label>
        <p className="text-xs text-muted-foreground">Sends the description to Google Gemini.</p>
        <Button type="submit" size="sm" disabled={busy}>Generate candidate</Button>
      </form>}
    </div>
  </details>;
}

function AssetDetails({ asset, root, run, busy, observation }: { asset: ProjectAsset; root: string; run: Action; busy: boolean; observation: number }) {
  const [selectedVariant, setVariant] = React.useState("");
  const variant = asset.variants.find(item => item.id === selectedVariant);
  const file = variant?.file ?? asset.original;
  const source = projectAssetSource(asset, variant);
  const candidate = variant?.candidate ?? asset.candidate;
  const approved = asset.approval?.variantId === (variant?.id ?? null);
  const previewOnly = variant?.options.purpose === "preview" || variant?.options.purpose === "poster";
  const previewKey = `${variant?.id ?? "original"}:${observation}`;
  const fallback = file.mime === "model/gltf-binary" && asset.variants.find(item =>
    item.options.purpose === "preview" && (item.options.parentVariant ?? null) === (variant?.id ?? null) && item.file.available,
  );
  return <article className="min-w-0 space-y-3 rounded-lg border border-border p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="min-w-0 break-all text-sm font-semibold">{asset.original.filename}</h3>
      <span className="text-xs text-muted-foreground">Details revision {asset.revision}</span>
    </div>
    {asset.variants.length > 0 && <label className={inputLabel}>Preview version
      <select value={selectedVariant} className={selectClass} onChange={event => setVariant(event.target.value)}>
        <option value="">Original{asset.approval?.variantId === null ? " · Approved" : ""}</option>
        {asset.variants.map(item => <option key={item.id} value={item.id}>
          {purposes[item.options.purpose]} · {item.file.filename}{item.candidate ? " · Generated" : ""}{asset.approval?.variantId === item.id ? " · Approved" : ""}{!item.file.available ? " · Missing" : ""}
        </option>)}
      </select>
    </label>}
    {file.mime === "model/gltf-binary"
      ? <ProjectModelPreview key={previewKey} root={root} asset={asset} variant={variant}
          fallback={fallback ? <>
            <p className="px-3 pb-2 text-center text-xs text-muted-foreground">Preview image{fallback.candidate ? " · Generated candidate" : ""}</p>
            <AssetPreview root={root} asset={asset} variant={fallback} />
          </> : undefined} />
      : <AssetPreview key={previewKey} root={root} asset={asset} variant={variant} />}
    <dl className="grid gap-1 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-2"><dt>File</dt><dd>{size(file.size)}{file.width && file.height ? ` · ${file.width} × ${file.height}` : ""}</dd></div>
      <div className="flex gap-2"><dt>Path</dt><dd className="min-w-0 break-all font-mono text-foreground">{file.path}</dd></div>
      <div className="flex flex-wrap gap-2"><dt>Origin</dt><dd>{candidate ? "Generated candidate" : source.origin === "downloaded" ? "Downloaded" : "Imported"}</dd></div>
      {approved && <div className="flex gap-2"><dt>Approval</dt><dd>{file.available ? "Approved" : "Approved file unavailable"}</dd></div>}
      {source.creator && <div className="flex gap-2"><dt>Creator</dt><dd>{source.creator}</dd></div>}
      <div className="flex gap-2"><dt>Rights</dt><dd>{source.license?.trim() || "Unverified"}</dd></div>
      {source.restrictions && <div className="flex gap-2"><dt>Restrictions</dt><dd>{source.restrictions}</dd></div>}
      {asset.usage.length > 0 && <div className="flex gap-2"><dt>Used in</dt><dd>{asset.usage.join(" · ")}</dd></div>}
      {asset.focal && <div className="flex gap-2"><dt>Focal point</dt><dd>{asset.focal.x}, {asset.focal.y}</dd></div>}
      {variant && <div className="flex min-w-0 gap-2"><dt>Variant request</dt><dd className="break-words">{variant.options.request}</dd></div>}
      {source.origin === "generated" && <>
        <div className="flex gap-2"><dt>Model</dt><dd>{source.provider} / {source.model}</dd></div>
        <div className="flex min-w-0 gap-2"><dt>Generation request</dt><dd className="break-words">{source.request}</dd></div>
      </>}
      {(source.pageUrl || source.downloadUrl) && <div><a className="underline hover:text-foreground" href={source.pageUrl || source.downloadUrl || ""} target="_blank" rel="noreferrer">View source ↗</a></div>}
    </dl>
    {!previewOnly && <Button variant="secondary" size="sm" disabled={busy || (!approved && !file.available)} onClick={() => run(async () => {
      await setProjectAssetApproval(root, asset, approved ? null : { variantId: variant?.id ?? null });
      return approved ? "Removed approval." : `Approved ${file.filename}.`;
    })}>{approved ? "Remove approval" : "Approve this version"}</Button>}
    <AssetMetadataForm key={asset.revision} root={root} asset={asset} run={run} busy={busy} />
    {asset.original.available && <AssetVariantForm root={root} asset={asset} sourceVersion={variant?.file.available && !previewOnly ? variant : undefined}
      run={run} busy={busy} onSelect={setVariant} />}
  </article>;
}

function AssetPreview({ root, asset, variant }: { root: string; asset: ProjectAsset; variant?: AssetVariant }) {
  const file = variant?.file ?? asset.original;
  const previewable = /^(image\/(png|jpeg|webp|gif|avif)|video\/|font\/)/.test(file.mime);
  const [url, setUrl] = React.useState("");
  const [fontFamily, setFontFamily] = React.useState("");
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (!previewable || !file.available) return;
    let alive = true;
    let url = "";
    let font: FontFace | undefined;
    projectAssetBlob(root, asset, variant).then(async blob => {
      if (!alive) return;
      url = URL.createObjectURL(blob);
      if (file.mime.startsWith("font/")) {
        font = new FontFace(`ProjectAsset${file.sha256}`, `url("${url}")`);
        await font.load();
        if (!alive) return;
        document.fonts.add(font);
        setFontFamily(font.family);
      }
      setUrl(url);
    }).catch(error => { if (alive) setError(error instanceof Error ? error.message : String(error)); });
    return () => {
      alive = false;
      if (font) document.fonts.delete(font);
      if (url) URL.revokeObjectURL(url);
    };
  }, [root, asset.id, variant?.id, file.mime, file.sha256, file.available, previewable]);
  const status = !file.available ? "Project file is missing or has changed." :
    error ? error : !previewable ? "Attach a preview image to see this asset here." : !url ? "Loading preview…" : "";
  return <div className="flex min-h-24 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
    {status ? <p className="px-3 py-6 text-center text-xs text-muted-foreground" role="status">{status}</p> :
      fontFamily ? <p className="min-w-0 whitespace-pre-wrap break-words p-4 text-center text-2xl" style={{ fontFamily }}>{variant?.options.fontText ?? "Aa Bb Cc 0123"}</p> :
      file.mime.startsWith("video/") ? <video controls playsInline preload="metadata" src={url} className="max-h-80 w-full" onError={() => setError("This video could not be played.")} /> :
      <img alt={file.filename} src={url} className="max-h-80 w-full object-contain" onError={() => setError("This image could not be decoded.")} />}
  </div>;
}

function AssetMetadataForm({ asset, root, run, busy }: { asset: ProjectAsset; root: string; run: Action; busy: boolean }) {
  return <details className="border-t border-border pt-3">
    <summary className="cursor-pointer text-sm">Edit asset details</summary>
    <form className="mt-3 space-y-3" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      run(async () => {
        await updateProjectAsset(root, asset, { ...rights(data), focal: focal(data), usage: placements(data) });
        return "Saved asset details.";
      });
    }}>
      <div className={fields}>
        <TextField name="creator" label="Creator or rights holder" defaultValue={asset.source.creator} />
        <TextField name="license" label="License or usage permission" defaultValue={asset.source.license} />
        <TextField name="restrictions" label="Credit and restrictions" defaultValue={asset.source.restrictions} />
        <label className={inputLabel}>Used in, one placement per line<textarea className={`${selectClass} h-auto min-h-14 p-2`} name="usage" defaultValue={asset.usage.join("\n")} /></label>
        {(asset.kind === "image" || asset.kind === "texture") && <>
          <label className={inputLabel}>Focal point X (0–1)<Input name="focalX" type="number" min={0} max={1} step="any" defaultValue={asset.focal?.x} /></label>
          <label className={inputLabel}>Focal point Y (0–1)<Input name="focalY" type="number" min={0} max={1} step="any" defaultValue={asset.focal?.y} /></label>
        </>}
      </div>
      <Button size="sm" variant="secondary" disabled={busy} type="submit">Save details</Button>
    </form>
  </details>;
}

function AssetVariantForm({ root, asset, sourceVersion, run, busy, onSelect }: {
  root: string; asset: ProjectAsset; sourceVersion?: AssetVariant; run: Action; busy: boolean; onSelect: (id: string) => void;
}) {
  const [mode, setMode] = React.useState("file");
  const [generated, setGenerated] = React.useState(false);
  const manual = mode === "file" || mode === "link";
  const raster = ["image", "texture"].includes(asset.kind) && /^image\/(png|jpeg|webp|gif|avif)$/.test(asset.original.mime);
  const canResize = raster && asset.original.mime !== "image/gif";
  const editMime = (sourceVersion?.file ?? asset.original).mime;
  const canEdit = raster && ["image/png", "image/jpeg", "image/webp"].includes(editMime);
  const allowed: VariantPurpose[] = ["delivery", "replacement", "preview", "compressed"];
  if (raster) allowed.push("crop", "cutout", "background_edit", "image_edit");
  if (asset.kind === "video") allowed.push("poster");
  return <details className="border-t border-border pt-3">
    <summary className="cursor-pointer text-sm">Add a version</summary>
    <form className="mt-3 space-y-3" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      run(async () => {
        let variant: AssetVariant;
        if (mode === "crop") {
          variant = await cropProjectAsset(root, asset, Number(data.get("width")), Number(data.get("height")), "Local focal crop.");
        } else if (mode === "resize") {
          variant = await resizeProjectAsset(root, asset, Number(data.get("width")), Number(data.get("height")));
        } else if (mode === "poster") {
          variant = await createProjectAssetPoster(root, asset, Number(data.get("seconds")));
        } else if (mode === "compact_glb") {
          variant = await compactProjectModel(root, asset.id, sourceVersion?.id);
        } else if (mode === "subset_font") {
          variant = await subsetProjectFont(root, asset.id, String(data.get("fontText") ?? ""), sourceVersion?.id);
        } else if (mode === "edit_image") {
          const prompt = field(data, "prompt");
          if (!prompt) throw Error("Describe how to edit the image.");
          variant = await editProjectImage(root, asset.id, prompt, sourceVersion?.id);
        } else {
          const request = field(data, "request");
          if (!request) throw Error("Describe how or why this version was made.");
          const purpose = data.get("purpose") as VariantPurpose;
          const generatedSource = generation(data);
          const assetRights = rights(data);
          const separateSource = mode === "link" || purpose === "replacement" || purpose === "preview" || Object.values(assetRights).some(Boolean);
          const source = generatedSource || separateSource ? { ...(generatedSource ?? { origin: "imported" as const }), ...assetRights } : undefined;
          const parentVariant = field(data, "parentVariant");
          const options = { purpose, request, source, parentVariant };
          if (mode === "link") {
            const url = field(data, "url");
            const filename = field(data, "filename");
            if (!url || !filename) throw Error("Enter the direct file URL and a filename with an extension.");
            variant = await downloadProjectAssetVariant(root, asset.id, url, filename, options);
          } else {
            const path = await open({ title: "Choose a project asset variant", filters });
            if (!path) return;
            variant = await addAssetVariant(root, asset.id, path, options);
          }
        }
        onSelect(variant.id);
        return `Saved ${variant.file.filename}.`;
      });
    }}>
      <div className={fields}>
        <label className={inputLabel}>Method<select className={selectClass} value={mode} onChange={event => setMode(event.target.value)}>
          <option value="file">Import a prepared file</option>
          <option value="link">Import a prepared file from a link</option>
          {raster && <option value="crop">Crop to size</option>}
          {canResize && <option value="resize">Resize original to a still image</option>}
          {asset.kind === "video" && <option value="poster">Extract a video frame</option>}
          {asset.kind === "model" && <option value="compact_glb">Compact GLB losslessly</option>}
          {asset.kind === "font" && <option value="subset_font">Subset font to WOFF2</option>}
          {canEdit && <option value="edit_image">Edit image with Gemini</option>}
        </select></label>
        {manual && <label className={inputLabel}>Purpose<select className={selectClass} name="purpose">
          {allowed.map(purpose => <option value={purpose} key={purpose}>{purposes[purpose]}</option>)}
        </select></label>}
        {manual && asset.variants.some(item => item.file.available && item.options.purpose !== "preview" && item.options.purpose !== "poster") &&
          <label className={inputLabel}>Source version
            <select key={sourceVersion?.id} className={selectClass} name="parentVariant" defaultValue={sourceVersion?.id ?? ""}>
              <option value="">Original</option>
              {asset.variants.filter(item => item.file.available && item.options.purpose !== "preview" && item.options.purpose !== "poster").map(item =>
                <option key={item.id} value={item.id}>{item.file.filename}</option>,
              )}
            </select>
          </label>}
        {mode === "link" && <>
          <TextField name="url" label="Direct download URL" />
          <TextField name="filename" label="Filename for download" />
        </>}
        {(mode === "crop" || mode === "resize") && <>
          <label className={inputLabel}>{mode === "resize" ? "Maximum width" : "Width in pixels"}<Input name="width" type="number" min={1} max={4096} defaultValue={960} required /></label>
          <label className={inputLabel}>{mode === "resize" ? "Maximum height" : "Height in pixels"}<Input name="height" type="number" min={1} max={4096} defaultValue={640} required /></label>
        </>}
        {mode === "poster" && <label className={inputLabel}>Time in seconds<Input name="seconds" type="number" min={0} step="any" defaultValue={0} required /></label>}
      </div>
      {mode === "subset_font" && <>
        <label className={inputLabel}>Page copy<textarea name="fontText" className={`${selectClass} h-auto min-h-14 p-2`} maxLength={3500} required /></label>
        <p className="text-xs text-muted-foreground">Requires FontTools with Brotli and a font license permitting subsetting.</p>
      </>}
      {mode === "edit_image" && <>
        <label className={inputLabel}>Image edit description<textarea name="prompt" className={`${selectClass} h-auto min-h-14 p-2`} maxLength={4000} required /></label>
        <p className="text-xs text-muted-foreground">Uploads {sourceVersion?.file.filename ?? asset.original.filename} and the edit description to Google Gemini.</p>
      </>}
      {manual && <>
        <TextField name="request" label="Change or processing notes" />
        <div className={fields}>
          <TextField name="creator" label="Variant creator or rights holder" />
          <TextField name="license" label="Variant license or usage permission" />
        </div>
        <label className="flex items-center gap-2 text-xs"><input name="generated" type="checkbox" checked={generated} onChange={event => setGenerated(event.target.checked)} />Generated image</label>
        {generated && <GenerationFields />}
      </>}
      <Button variant="secondary" size="sm" disabled={busy} type="submit">{mode === "file" ? "Choose variant file" : mode === "link" ? "Import version" : "Create version"}</Button>
    </form>
  </details>;
}
