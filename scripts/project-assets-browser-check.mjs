import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";

// cargo build --manifest-path src-tauri/Cargo.toml --no-default-features --example project_assets_smoke
const native = process.env.TARO_ASSET_SMOKE_BINARY || fileURLToPath(new URL(
  `../src-tauri/target/debug/examples/project_assets_smoke${process.platform === "win32" ? ".exe" : ""}`, import.meta.url,
));
const home = await mkdtemp(path.join(os.tmpdir(), "taro-asset-smoke-"));
const workspace = path.join(home, "workspace");
const model = path.join(home, "product.glb");
const unsupported = path.join(home, "triangle-strip.glb");
const fallback = path.join(home, "product-still.png");
const image = path.join(home, "campaign.png");
const font = fileURLToPath(new URL("../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2", import.meta.url));
const checkSubset = process.env.TARO_ASSET_SMOKE_FONT_SUBSET === "1";
const callStore = (...args) => execFileSync(native, [workspace, ...args], { windowsHide: true });
const entryId = "/__asset_entry.jsx";
const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import { ProjectAssetsPanel } from "/src/components/project-assets-panel";
import "/src/index.css";
createRoot(document.querySelector("#root")).render(<ProjectAssetsPanel workspaceRoot={${JSON.stringify(workspace)}} />);
`;

function makeGlb(mode = 4) {
  const positions = [-1, -0.65, 0, 0.9, -0.3, 0, 0.32, 0.9, 0.2, 0.2, 0, 0.9];
  const indices = mode === 4 ? [0, 1, 2, 1, 3, 2, 0, 2, 3, 0, 3, 1] : [0, 1, 2, 3];
  const bin = Buffer.alloc(48 + indices.length + 8192);
  positions.forEach((value, index) => bin.writeFloatLE(value, index * 4));
  indices.forEach((value, index) => bin.writeUInt8(value, 48 + index));
  const json = Buffer.from(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: indices.length }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [-1, -0.65, 0], max: [0.9, 0.9, 0.9] },
      { bufferView: 1, componentType: 5121, count: indices.length, type: "SCALAR" },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, mode }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.97, 0.38, 0.19, 1] } }],
  }));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const glb = Buffer.alloc(28 + jsonLength + bin.length);
  [0x46546c67, 2, glb.length, jsonLength, 0x4e4f534a].forEach((value, index) => glb.writeUInt32LE(value, index * 4));
  glb.fill(0x20, 20, 20 + jsonLength);
  json.copy(glb, 20);
  glb.writeUInt32LE(bin.length, 20 + jsonLength);
  glb.writeUInt32LE(0x004e4942, 24 + jsonLength);
  bin.copy(glb, 28 + jsonLength);
  return glb;
}

let server;
let browser;
const generations = [];
try {
  await mkdir(workspace);
  await writeFile(model, makeGlb());
  await writeFile(unsupported, makeGlb(5));
  await writeFile(fallback, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+Xv68AgAAAABJRU5ErkJggg==", "base64"));
  const bundle = await build({
    configFile: false,
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    build: {
      write: false, emptyOutDir: false, minify: false,
      rollupOptions: { input: entryId, output: { entryFileNames: "asset-check.js" } },
    },
    plugins: [tailwindcss(), {
      name: "project-assets-check",
      resolveId(id) { if (id === entryId) return id; },
      load(id) { if (id === entryId) return entry; },
    }],
  });
  const files = new Map(bundle.output.map(file => ["/" + file.fileName, file.type === "asset" ? file.source : file.code]));
  const css = [...files.keys()].find(name => name.endsWith(".css"));
  const html = `<!doctype html><meta name="viewport" content="width=device-width"><title>Asset preview check</title>
<link rel="stylesheet" href="${css}"><div id="root"></div><script type="module" src="/asset-check.js"></script>`;
  server = http.createServer(async (request, response) => {
          if (request.url === "/__asset_check") {
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            return response.end(html);
          }
          const file = files.get(request.url);
          if (file) {
            response.setHeader("Content-Type", request.url.endsWith(".css") ? "text/css" : request.url.endsWith(".js") ? "text/javascript" : "application/octet-stream");
            return response.end(file);
          }
          if (request.url !== "/__asset_ipc" || request.method !== "POST") {
            response.statusCode = 404;
            return response.end("Not found");
          }
          try {
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            const { command, args } = JSON.parse(Buffer.concat(chunks));
            if (command === "project_asset_bytes") {
              return response.end(callStore("bytes", args.id, ...(args.variantId ? [args.variantId] : [])));
            }
            response.setHeader("Content-Type", "application/json");
            if (command === "plugin:dialog|open") return response.end(JSON.stringify(model));
            if (command === "has_model_key") return response.end("true");
            if (command === "project_assets" && args.request.action === "list") return response.end(callStore("list"));
            if (command === "project_assets" && args.request.action === "compact_glb") {
              const { id, parentVariant } = args.request;
              return response.end(callStore("compact", id, ...(parentVariant ? [parentVariant] : [])));
            }
            if (command === "project_assets" && args.request.action === "subset_font") {
              const { id, text, parentVariant } = args.request;
              return response.end(callStore("subset", id, text, ...(parentVariant ? [parentVariant] : [])));
            }
            if (command === "project_assets" && args.request.action === "generate_image") {
              generations.push(args.request);
              throw Error("Google Gemini did not return a completed image.");
            }
            if (command === "project_assets" && args.request.action === "import_file") {
              assert.equal(args.request.path, model);
              return response.end(callStore("import", model));
            }
            if (command === "project_assets" && args.request.action === "set_approval") {
              const { id, expectedRevision, approval } = args.request;
              return response.end(callStore("approve", id, String(expectedRevision), JSON.stringify(approval)));
            }
            if (command === "project_assets" && args.request.action === "add_variant_data") {
              const { id, filename, data, options } = args.request;
              assert.match(filename, /^delivery-\d+x\d+\.webp$/);
              const file = path.join(home, filename);
              await writeFile(file, Buffer.from(data, "base64"));
              return response.end(callStore("delivery", id, file, JSON.stringify(options)));
            }
            throw Error(`Unexpected IPC command ${command}`);
          } catch (error) {
            response.statusCode = 500;
            response.end(String(error));
          }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    channel: process.env.TARO_BROWSER_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      async invoke(command, args) {
        const response = await fetch("/__asset_ipc", { method: "POST", body: JSON.stringify({ command, args }) });
        if (!response.ok) throw Error(await response.text());
        return command === "project_asset_bytes" ? response.arrayBuffer() : response.json();
      },
    };
  });
  await page.goto(`${origin}/__asset_check`, { waitUntil: "domcontentloaded" });
  await page.getByText("Import an asset", { exact: true }).click();
  await page.getByRole("button", { name: "Choose original file" }).click();
  await page.getByText("4 triangles", { exact: true }).waitFor();
  const canvas = page.getByRole("img", { name: "3D geometry preview of product.glb" });
  const initial = await canvas.screenshot();
  const rotate = page.getByRole("button", { name: "Rotate right" });
  await rotate.press("Enter");
  const rotated = await canvas.screenshot();
  assert.notDeepEqual(initial, rotated, "rotation changes the geometry rendered to the canvas");
  await page.getByRole("button", { name: "Reset view" }).click();
  assert.deepEqual(await canvas.screenshot(), initial, "reset restores the original geometry view");
  await page.getByRole("button", { name: "Approve this version" }).click();
  await page.getByRole("button", { name: "Remove approval" }).waitFor();
  const originalModel = JSON.parse(callStore("list"))[0];
  await page.getByText("Add a version", { exact: true }).click();
  await page.getByLabel("Method").selectOption("compact_glb");
  await page.getByRole("button", { name: "Create version" }).click();
  await page.getByText("Saved compact.glb.", { exact: true }).waitFor();
  await page.getByText("4 triangles", { exact: true }).waitFor();
  assert.deepEqual(await page.getByRole("img", { name: "3D geometry preview of compact.glb" }).screenshot(), initial,
    "compaction preserves the rendered geometry");
  const compact = JSON.parse(callStore("list"))[0].variants[0];
  assert.ok(compact.file.size < originalModel.original.size - 8000, "unused GLB storage is removed");
  assert.deepEqual(callStore("bytes", originalModel.id), makeGlb());
  const bad = JSON.parse(callStore("import", unsupported));
  callStore("attach", bad.id, fallback);
  const originalFont = JSON.parse(callStore("import", font));
  const pixels = await page.evaluate(async () => {
    const surface = document.createElement("canvas");
    surface.width = 160;
    surface.height = 80;
    const context = surface.getContext("2d");
    context.fillStyle = "#ff8b58";
    context.fillRect(0, 0, 160, 80);
    const blob = await new Promise(resolve => surface.toBlob(resolve, "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await writeFile(image, Buffer.from(pixels));
  const originalImage = JSON.parse(callStore("import", image));
  await page.reload();
  await page.getByRole("button", { name: /product\.glb/ }).click();
  await page.getByText("4 triangles", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Remove approval" }).waitFor();
  await page.getByRole("button", { name: /triangle-strip\.glb/ }).click();
  await page.getByText(/triangle-list meshes/i).waitFor();
  const still = page.getByRole("img", { name: "product-still.png" });
  await still.waitFor();
  await page.waitForFunction(() => [...document.images].some(img => img.alt === "product-still.png" && img.naturalWidth > 0));
  assert.equal(await page.getByRole("button", { name: "Rotate right" }).count(), 0);
  await page.getByRole("button", { name: /geist-latin-wght-normal\.woff2/ }).click();
  const sample = page.getByText("Aa Bb Cc 0123", { exact: true });
  await sample.waitFor();
  assert.ok(await sample.evaluate(element => document.fonts.check(`16px ${element.style.fontFamily}`)));
  if (checkSubset) {
    const copy = "Été Aa 0123";
    await page.getByText("Add a version", { exact: true }).click();
    await page.getByLabel("Method").selectOption("subset_font");
    await page.getByLabel("Page copy").fill(copy);
    await page.getByRole("button", { name: "Create version" }).click();
    const subsetSample = page.getByText(copy, { exact: true });
    await subsetSample.waitFor();
    assert.ok(await subsetSample.evaluate(element => document.fonts.check(`16px ${element.style.fontFamily}`, element.textContent)));
    const subset = JSON.parse(callStore("list")).find(asset => asset.id === originalFont.id).variants[0];
    assert.ok(subset.file.size < originalFont.original.size);
    assert.equal(subset.file.mime, "font/woff2");
    assert.deepEqual(callStore("bytes", originalFont.id), await readFile(font));
  }
  await page.getByRole("button", { name: /campaign\.png/ }).click();
  await page.getByText("Add a version", { exact: true }).click();
  await page.getByLabel("Method").selectOption("resize");
  await page.getByLabel("Maximum width").fill("80");
  await page.getByLabel("Maximum height").fill("60");
  await page.getByRole("button", { name: "Create version" }).click();
  const delivery = page.getByRole("img", { name: "delivery-80x40.webp" });
  await delivery.waitFor();
  await page.waitForFunction(() => [...document.images].some(img => img.alt === "delivery-80x40.webp" && img.naturalWidth === 80 && img.naturalHeight === 40));
  assert.deepEqual(callStore("bytes", originalImage.id), Buffer.from(pixels), "delivery sizing preserves the original");
  const manifest = callStore("list");
  await page.getByLabel("Method").selectOption("edit_image");
  await page.getByLabel("Image edit description").fill("Change the background to green.");
  await page.getByRole("button", { name: "Create version" }).click();
  await page.getByRole("alert").filter({ hasText: /did not return a completed image/ }).waitFor();
  assert.deepEqual(callStore("list"), manifest, "failed edit publishes no version");
  await page.getByText("Generate an image", { exact: true }).click();
  await page.getByLabel("Image description", { exact: true }).fill("Create a botanical drawing.");
  await page.getByRole("button", { name: "Generate candidate" }).click();
  await page.getByRole("alert").filter({ hasText: /did not return a completed image/ }).waitFor();
  assert.deepEqual(callStore("list"), manifest, "failed generation publishes no asset");
  const resize = JSON.parse(manifest).find(asset => asset.id === originalImage.id).variants[0];
  assert.deepEqual(generations, [
    { action: "generate_image", prompt: "Change the background to green.", edit: { id: originalImage.id, parentVariant: resize.id } },
    { action: "generate_image", prompt: "Create a botanical drawing." },
  ]);
  assert.deepEqual(errors, []);
  console.log(`PASS native import and reload, rendered GLB compaction, keyboard rotation/reset, still fallback, approval, font preview, image resizing, and generation/edit failure handling${checkSubset ? ", including FontTools WOFF2 subsetting" : ""}`);
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(home, { recursive: true, force: true });
}
