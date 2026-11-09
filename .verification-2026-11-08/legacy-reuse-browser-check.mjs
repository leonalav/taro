import assert from "node:assert/strict";
import { chromium } from "./browser-tools/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ channel: "msedge", headless: true, chromiumSandbox: true, args: ["--no-proxy-server"] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
// Test reuse without streaming external video files into the test browser.
await page.route(/\.mp4(?:\?|$)/, (route) => route.abort());

const check = (name, test) => {
  assert.ok(test, name);
  console.log(`PASS ${name}`);
};
const message = () => page.getByRole("textbox", { name: "Message", exact: true });
const openArtifacts = async () => {
  await page.getByRole("button", { name: "My artifacts", exact: true }).click();
  await page.getByRole("heading", { name: "My artifacts", exact: true }).waitFor();
  await page.waitForTimeout(240);
};
const reuseCheckout = async () => {
  await page.getByRole("button", { name: "Open Checkout flow", exact: true }).click();
  await page.getByRole("button", { name: "Reuse this design", exact: true }).click();
  await message().waitFor();
  await page.waitForTimeout(80);
};

try {
  await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
  await message().fill("Use this layout with");
  const title = await page.locator("header.app-drag").textContent();
  await openArtifacts();

  check("all twelve artifacts are shown", await page.getByRole("button", { name: /^Open / }).count() === 12);
  check("there are no sparkle icons", await page.locator(".lucide-sparkles, .lucide-sparkle, .lucide-wand-sparkles").count() === 0);
  const filter = page.getByRole("group", { name: "Filter artifacts by folder" });
  await filter.getByRole("button", { name: "taro", exact: true }).click();
  check("folder filter shows its three artifacts", await page.getByRole("button", { name: /^Open / }).count() === 3);
  await filter.getByRole("button", { name: "All folders", exact: true }).click();
  await page.getByRole("radio", { name: "Prototype", exact: true }).click();
  check("prototype filter shows two prototypes", await page.getByRole("button", { name: /^Open / }).count() === 2);
  await page.getByRole("radio", { name: "Skeletal design", exact: true }).click();
  check("skeletal filter shows three skeletons", await page.getByRole("button", { name: /^Open / }).count() === 3);
  await page.getByRole("radio", { name: "All", exact: true }).click();
  await page.getByRole("textbox", { name: "Search artifacts", exact: true }).fill("drawer");
  check("search filters artifact names and tags", await page.getByRole("button", { name: /^Open / }).count() === 1);
  await page.getByRole("textbox", { name: "Search artifacts", exact: true }).fill("no-such-design");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  check("clear filters restores the collection", await page.getByRole("button", { name: /^Open / }).count() === 12);
  await page.screenshot({ path: "A:/taro/.verification-2026-11-08/taro-artifacts-final.png", fullPage: true });

  await page.getByRole("button", { name: "Open Checkout flow", exact: true }).click();
  await page.waitForTimeout(260);
  await page.screenshot({ path: "A:/taro/.verification-2026-11-08/taro-artifact-detail-final.png", fullPage: true });
  await page.getByRole("button", { name: "Copy name", exact: true }).click();
  check("copy name copies the selected artifact", await page.evaluate(() => navigator.clipboard.readText()) === "Checkout flow");
  await page.getByRole("button", { name: "Close artifact preview", exact: true }).click();
  await reuseCheckout();

  check("reuse preserves the typed draft", (await message().textContent()).includes("Use this layout with"));
  check("reuse stays in the same conversation", await page.locator("header.app-drag").textContent() === title);
  check("reuse inserts one inline design chip", await message().locator("[data-chip-kind=artifact]").count() === 1);
  check("reuse focuses the composer", await message().evaluate((element) => element === document.activeElement));
  await openArtifacts();
  await reuseCheckout();
  check("reusing the same item does not duplicate it", await message().locator("[data-chip]").count() === 1);

  await page.getByRole("button", { name: "Browse media", exact: true }).click();
  await page.getByRole("heading", { name: "Gallery", exact: true }).waitFor();
  await page.getByRole("button", { name: "Preview Deep Current", exact: true }).click();
  await page.getByRole("button", { name: "Reuse this media", exact: true }).click();
  await message().waitFor();
  await page.waitForTimeout(80);
  check("media reuse appends a second inline artifact chip", await message().locator("[data-chip-kind=artifact]").count() === 2);
  const chips = await message().locator("[data-chip]").evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.dataset.chipValue)));
  check("design and media keep different source types", chips[0].artifact.source === "design" && chips[1].artifact.source === "media");
  check("media chip contains the original video URL", chips[1].artifact.url.includes("8336026"));
  await page.screenshot({ path: "A:/taro/.verification-2026-11-08/taro-mixed-chips.png", fullPage: true });

  await message().getByRole("button", { name: "Remove Checkout flow", exact: true }).click();
  check("the inline remove button works", await message().locator("[data-chip]").count() === 1);
  await openArtifacts();
  await reuseCheckout();
  await message().press("Enter");
  await page.waitForTimeout(150);
  check("sending clears the composer", await message().locator("[data-chip]").count() === 0);
  check("sent messages retain the video artifact chip", await page.locator("[data-chip='artifact:media:m30']").count() === 1);
  check("sent messages retain the design artifact chip", await page.locator("[data-chip='artifact:art-2']").count() === 1);

  await openArtifacts();
  await page.getByRole("button", { name: "Open Checkout flow", exact: true }).click();
  await page.keyboard.press("Escape");
  check("Escape closes the artifact preview", await page.getByRole("dialog").count() === 0);
  await page.setViewportSize({ width: 1050, height: 860 });
  check("artifacts view has no horizontal page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check("no JavaScript page errors", pageErrors.length === 0);
  console.log("All browser reuse checks passed.");
} finally {
  await browser.close();
}