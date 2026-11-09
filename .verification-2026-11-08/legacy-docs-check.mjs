import assert from "node:assert/strict";
import { chromium } from "./browser-tools/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ channel: "msedge", headless: true, chromiumSandbox: true, args: ["--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
await page.route(/images\.pexels\.com/, (route) =>
  route.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  })
);

const check = (name, test, detail) => {
  assert.ok(test, detail ? `${name} — ${detail}` : name);
  console.log(`PASS ${name}`);
};

const hexes = ["#FAFAF8", "#0A0A0A", "#FF4D00", "#1A2E1F", "#E8E1D5"];

try {
  await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
  const card = page.locator("[data-tokens-card]");
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  /* the artifact renders the 5 seed colors */
  check("artifact shows five swatches", (await card.locator(".h-11").count()) === 5);
  for (const hex of hexes) {
    check(`artifact renders color ${hex}`, (await card.locator(`p:text-is("${hex}")`).count()) >= 1);
  }

  /* Open the design doc */
  await card.getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForTimeout(300);
  const panel = page.locator("[data-docs-panel]");
  check("doc panel opens on the right", (await panel.count()) === 1);
  check("doc shows a Tab label", (await panel.getByText("Tab 1").count()) === 1);
  check("doc title is Design tokens", (await panel.getByText("Design tokens").count()) >= 1);
  check("toolbar has Table", (await panel.getByRole("button", { name: "Insert a table" }).count()) === 1);
  check("toolbar has Image", (await panel.getByRole("button", { name: "Insert an image" }).count()) === 1);
  check("toolbar has Checklist", (await panel.getByRole("button", { name: "Insert a checklist" }).count()) === 1);
  check("toolbar has Insert (+)", (await panel.getByRole("button", { name: "Insert", exact: true }).count()) === 1);

  const body = panel.locator("[data-doc-body]");
  check("doc renders the 5 inline color swatches", (await body.locator("[data-color-hex]").count()) === 5);

  /* Click a color swatch -> color picker with wheel + hex */
  await body.locator('[data-color-hex="#FF4D00"]').first().click();
  await page.waitForTimeout(200);
  check("picker opens with a color wheel", (await page.locator('div[style*="conic-gradient"]').count()) >= 1);
  check("picker shows a hex input", (await page.getByLabel("Hex value").count()) === 1);
  check("picker shows R/G/B inputs", (await page.getByLabel("R", { exact: true }).count()) === 1 && (await page.getByLabel("G", { exact: true }).count()) === 1 && (await page.getByLabel("B", { exact: true }).count()) === 1);
  check("picker initial hex is #FF4D00", (await page.getByLabel("Hex value").inputValue()) === "#FF4D00");

  /* Edit the color via the hex field -> doc + artifact update */
  await page.getByLabel("Hex value").fill("#FF8800");
  await page.waitForTimeout(250);
  const docText = await body.innerText();
  check("doc text now contains the new hex", docText.includes("#FF8800"));
  check("doc no longer has the old ember hex", !docText.includes("#FF4D00"));

  const emberInfo = await card.evaluate((cardEl) => {
    const ps = Array.from(cardEl.querySelectorAll("p"));
    const nameP = ps.find((p) => p.textContent?.trim() === "ember");
    const col = nameP?.parentElement;
    const block = col?.querySelector("div");
    const hexP = Array.from(col?.querySelectorAll("p") ?? []).find((p) => /^#/.test((p.textContent ?? "").trim()));
    return {
      bg: block ? getComputedStyle(block).backgroundColor : null,
      hex: (hexP?.textContent ?? "").trim() || null,
    };
  });
  check("artifact ember swatch updated to the new color", emberInfo.bg === "rgb(255, 136, 0)", emberInfo.bg);
  check("artifact ember label updated", emberInfo.hex === "#FF8800", emberInfo.hex);

  /* Close the picker */
  await page.getByRole("button", { name: "Close color picker" }).click();
  await page.waitForTimeout(150);
  check("picker closes", (await page.locator("div[style*=\"conic-gradient\"]").count()) === 0);

  /* Insert a table via the toolbar */
  const tablesBefore = await body.locator("table").count();
  await panel.getByRole("button", { name: "Insert a table" }).click();
  await page.waitForTimeout(150);
  check("insert table adds a table", (await body.locator("table").count()) === tablesBefore + 1);

  /* Insert a checklist via the + menu */
  const lisBefore = await body.locator("li").count();
  await panel.getByRole("button", { name: "Insert", exact: true }).click();
  await page.waitForTimeout(150);
  check("insert menu lists items", (await panel.getByRole("button", { name: "Bulleted list" }).count()) === 1);
  check("insert menu includes Image", (await panel.getByRole("button", { name: "Image", exact: true }).count()) === 1);
  await panel.getByRole("button", { name: "Checklist", exact: true }).click();
  await page.waitForTimeout(150);
  check("checklist insert adds list items", (await body.locator("li").count()) > lisBefore);

  /* Add an image by URL */
  const imgsBefore = await body.locator('[data-block-type="image"]').count();
  await panel.getByRole("button", { name: "Insert an image" }).click();
  await page.waitForTimeout(150);
  await panel.getByLabel("Image URL").fill("https://images.pexels.com/videos/1/hero.png");
  await panel.getByRole("button", { name: "Add image" }).click();
  await page.waitForTimeout(200);
  // Images are not rendered inline by design: web images show as [name.ext], local files show their path.
  check("image insert adds an image block", (await body.locator('[data-block-type="image"]').count()) === imgsBefore + 1);
  check("web image displays as [hero.png], not an <img>", (await body.locator('[data-block-type="image"]', { hasText: "[hero.png]" }).count()) === 1 && (await body.locator("img").count()) === 0);

  /* Close the doc */
  await panel.getByRole("button", { name: "Close document" }).click();
  await page.waitForTimeout(200);
  check("doc panel closes", (await panel.count()) === 0);

  check("no JavaScript page errors", pageErrors.length === 0);
  console.log("All docs checks passed.");
} finally {
  await browser.close();
}
