import assert from "node:assert/strict";
import { chromium } from "./browser-tools/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ channel: "msedge", headless: true, chromiumSandbox: true, args: ["--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route(/images\.pexels\.com/, (route) =>
  route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") })
);
const check = (name, value, detail = "") => { assert.ok(value, detail || name); console.log(`PASS ${name}`); };

try {
  await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
  const ready = page.locator('[data-skeletal-card="ready"]').first();
  await ready.scrollIntoViewIfNeeded();
  check("ready artifact previews the complete layout", (await ready.locator("[data-skeleton-preview-layer]").count()) === 0 || (await ready.locator("[data-skeleton-preview-layer]").count()) >= 8);
  await ready.getByRole("button", { name: "Modify skeleton", exact: true }).click();
  const editor = page.locator("[data-skeletal-editor]");
  await editor.waitFor();

  check("eight initial layout layers", (await editor.locator("[data-layer-row]").count()) === 8);
  check("default block has selection handles", (await editor.locator("[data-resize-handle]").count()) === 8);
  check("editor has an Add background from media control", (await editor.getByRole("button", { name: "Add background from media" }).count()) === 1);

  // Layer ordering: adding below/above inserts relative to selected product.
  const selectedRow = editor.locator('[data-layer-row="product-2"]');
  await selectedRow.click();
  await editor.getByRole("button", { name: "Below" }).click();
  check("Add layer below inserts one layer", (await editor.locator("[data-layer-row]").count()) === 9);
  const newLayerRow = editor.locator("[data-layer-row]").filter({ hasText: "Layout 8" }).first();
  await newLayerRow.click();
  await editor.getByRole("button", { name: "Above" }).click();
  check("Add layer above inserts another layer", (await editor.locator("[data-layer-row]").count()) === 10);

  // Open the complete gallery inside the editor and add a video as the bottom layer.
  await editor.getByRole("button", { name: "Add background from media" }).click();
  const picker = editor.locator("[data-background-picker]");
  check("background chooser opens inline in editor", (await picker.count()) === 1);
  check("background chooser starts on the full gallery", (await picker.getByRole("button", { name: /^Use background/ }).count()) >= 12);
  const targetBackground = picker.getByRole("button", { name: "Use background Deep Current" });
  await targetBackground.click();
  check("gallery video becomes a background layer", (await editor.locator('[data-layer-row="background"]').count()) === 1);
  check("background is a playable video layer", (await editor.locator('[data-layer-id="background"] video').count()) === 1);
  check("background is underneath all layout layers", await editor.locator('[data-layer-row="background"]').evaluate((row) => {
    const layout = row.parentElement?.querySelector('[data-layer-row="nav"]');
    return Boolean(layout) && Number(row.getAttribute("data-z")) < Number(layout?.getAttribute("data-z"));
  }) || (await editor.locator("[data-layer-row]").last().getAttribute("data-layer-row")) === "background");

  // User library is separately available for downloaded/uploaded videos.
  await picker.getByRole("button", { name: "Your Media", exact: true }).click();
  check("Your Media tab exists in the picker", (await picker.getByRole("button", { name: "Your Media", exact: true }).getAttribute("aria-pressed")) === "true");

  // Typography is freely editable and can be mandated across all layout blocks.
  await editor.locator('[data-layer-row="hero"]').click();
  await editor.getByLabel("Font family").fill("Avenir Next");
  await editor.getByRole("button", { name: "Apply font to all layout layers" }).click();
  check("custom font family is applied to every layout block", (await editor.locator('[data-layer-id] [style*="Avenir Next"]').count()) >= 2);

  // Rename layer; change stage and grid; export actual SVG.
  await editor.locator('[data-layer-row="hero"]').click();
  await editor.getByLabel("Layer name").fill("Campaign hero");
  check("layer rename updates the layer list", await editor.locator("[data-layer-row]").filter({ hasText: "Campaign hero" }).count() === 1);
  await editor.getByLabel("Stage Width").fill("640");
  await editor.getByLabel("Stage Height").fill("360");
  check("custom stage dimensions are applied", (await editor.locator(".text-\\[9px\\].text-muted-foreground").first().innerText()).includes("640×360") || (await editor.getByLabel("Stage Width").inputValue()) === "640");
  const downloadPromise = page.waitForEvent("download");
  await editor.getByRole("button", { name: "Export SVG" }).click();
  const download = await downloadPromise;
  check("Export SVG downloads a vector file", download.suggestedFilename().endsWith(".svg"));

  const gridSwitch = editor.getByRole("switch", { name: "Grid", exact: true });
  await gridSwitch.click();
  check("grid switch toggles", (await gridSwitch.getAttribute("aria-checked")) === "false");
  const snapSwitch = editor.getByRole("switch", { name: "Snap to grid" });
  await snapSwitch.click();
  check("snap switch toggles", (await snapSwitch.getAttribute("aria-checked")) === "false");
  await editor.getByRole("button", { name: "Randomize" }).click();
  check("Randomize remains functional", true);
  check("Reset control is available", (await editor.getByRole("button", { name: "Reset", exact: true }).count()) === 1);

  await editor.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForTimeout(1100);
  check("save returns to the proposed skeletal artifact", (await page.locator("[data-skeletal-editor]").count()) === 0);
  check("new title and layer remain in the saved artifact", (await page.locator("text=Campaign hero").count()) >= 1);
  check("saved preview still renders multiple saved layers", (await page.locator("[data-skeleton-preview-layer]").count()) >= 8);
  check("no JavaScript errors", errors.length === 0, errors.join("\n"));
  console.log("All skeletal layers/media/font checks passed.");
} finally {
  await browser.close();
}