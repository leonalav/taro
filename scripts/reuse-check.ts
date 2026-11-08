import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { artifacts, artifactFolders } from "../src/data/artifacts";
import { mediaItems } from "../src/data/media";
import { artifactToChip, mediaToChip } from "../src/lib/reuse";
import { __editor } from "../src/components/composer";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node });

function check(name: string, run: () => void) {
  run();
  console.log(`PASS ${name}`);
}

const editor = document.createElement("div");
document.body.append(editor);
const design = artifactToChip(artifacts[0]);
const media = mediaToChip(mediaItems[0]);

check("gallery has twelve artifacts in six folders", () => {
  assert.equal(artifacts.length, 12);
  assert.equal(artifactFolders.length, 6);
  assert.equal(new Set(artifacts.map((artifact) => artifact.folderId)).size, 6);
});

check("gallery includes designs, skeletal designs and prototypes", () => {
  assert.deepEqual([...new Set(artifacts.map((artifact) => artifact.kind))].sort(), ["design", "prototype", "skeleton"]);
});

check("reference screenshot starts with checkout-flow then taro", () => {
  assert.deepEqual([...new Set(artifacts.map((artifact) => artifact.folderId))].slice(0, 2), ["checkout-flow", "taro"]);
  assert.equal(artifacts.filter((artifact) => artifact.folderId === "checkout-flow").length, 3);
  assert.equal(artifacts.filter((artifact) => artifact.folderId === "taro").length, 3);
});

check("design reference retains identity, folder, frames and preview", () => {
  assert.equal(design.kind, "artifact");
  assert.equal(design.label, "Checkout flow");
  assert.equal(design.artifact?.id, artifacts[0].id);
  assert.equal(design.artifact?.folderId, "checkout-flow");
  assert.equal(design.artifact?.frames, 6);
  assert.equal(design.artifact?.background, artifacts[0].preview);
});

check("media reference retains video URL and thumbnail", () => {
  assert.equal(media.kind, "artifact");
  assert.equal(media.artifact?.type, "video");
  assert.equal(media.artifact?.url, mediaItems[0].video);
  assert.equal(media.artifact?.poster, mediaItems[0].poster);
});

check("reuse appends a real inline chip without destroying typed text", () => {
  editor.textContent = "Use this as a starting point";
  assert.equal(__editor.appendArtifactChip(editor, design), true);
  const segments = __editor.toSegments(editor);
  assert.equal(segments[0].text, "Use this as a starting point ");
  assert.deepEqual(segments[1], { type: "chip", chip: design });
  assert.equal(editor.querySelector("[data-chip-kind=artifact]")?.getAttribute("contenteditable"), "false");
  assert.equal(editor.querySelector("[data-remove-chip]")?.getAttribute("aria-label"), "Remove Checkout flow");
});

check("reusing the same artifact twice does not duplicate the chip", () => {
  assert.equal(__editor.appendArtifactChip(editor, design), false);
  assert.equal(editor.querySelectorAll("[data-chip]").length, 1);
});

check("design and video references can be mixed in one message", () => {
  __editor.appendArtifactChip(editor, media);
  const chips = __editor.toSegments(editor).filter((segment) => segment.type === "chip");
  assert.deepEqual(chips.map((segment) => segment.chip), [design, media]);
});

check("chip metadata and labels survive a draft restore", () => {
  const restored = document.createElement("div");
  restored.innerHTML = editor.innerHTML;
  assert.deepEqual(__editor.toSegments(restored), __editor.toSegments(editor));
});

check("inline references survive multiline editor blocks", () => {
  const multiline = document.createElement("div");
  multiline.innerHTML = `First line<div>${editor.innerHTML}<br>Last line</div>`;
  const segments = __editor.toSegments(multiline);
  assert.equal(segments.filter((segment) => segment.type === "chip").length, 2);
  assert.ok(segments[0].text?.startsWith("First line\n"));
  assert.ok(segments.at(-1)?.text?.includes("\nLast line"));
});

check("special characters in a reused title are safely escaped", () => {
  const special = { ...design, id: "artifact:special", label: '<img src=x onerror="throw 1"> & design' };
  __editor.appendArtifactChip(editor, special);
  assert.equal(editor.querySelectorAll("img").length, 0);
  assert.equal(editor.querySelector("[data-chip='artifact:special'] [class*=truncate]")?.textContent, special.label);
});

check("all existing thirty-two media videos remain intact", () => {
  assert.equal(mediaItems.length, 32);
  assert.ok(mediaItems.every((item) => item.video.startsWith("https://")));
});

console.log("All reuse checks passed.");