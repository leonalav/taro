import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.route(/images\.pexels\.com/, (route) =>
  route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") })
);

const check = (name, test) => {
  assert.ok(test, name);
  console.log(`PASS ${name}`);
};

try {
  await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
  const artboard = page.locator("[data-artboard]");

  /* ---------- web bar ---------- */
  await page.getByRole("button", { name: "Review mode — live design preview" }).click();
  await page.getByRole("button", { name: "Reload preview" }).waitFor();
  check("web bar shows the preview URL", (await page.locator("text=discovery.taro.app/fig/variant-b").count()) > 0);
  check("web bar has back/forward/reload controls", (await page.getByRole("button", { name: "Back" }).count()) === 1 && (await page.getByRole("button", { name: "Forward" }).count()) === 1);

  /* ---------- reload remounts the page ---------- */
  await page.getByRole("button", { name: "Reload preview" }).click();
  const spinner = page.locator("div.rounded-xl .animate-spin");
  await spinner.first().waitFor({ state: "visible", timeout: 2000 });
  check("reload shows a loading state", true);
  await page.waitForTimeout(900);
  check("page is back after reload", (await page.locator("text=Move in").count()) === 1);

  /* ---------- comment button hides the circles ---------- */
  const pins = page.locator('[aria-label^="Annotation by"]');
  check("three annotation circles are visible", (await pins.count()) === 3);
  await page.getByRole("button", { name: "Hide comments (C)" }).click();
  check("comment button hides the circles", (await pins.count()) === 0);
  check("comment button now offers to show them", (await page.getByRole("button", { name: "Show comments (C)" }).count()) === 1);
  await page.getByRole("button", { name: "Show comments (C)" }).click();
  check("comment button shows the circles again", (await pins.count()) === 3);

  /* ---------- dimensions ---------- */
  const widthInput = page.getByLabel("Viewport width");
  const heightInput = page.getByLabel("Viewport height");

  await page.getByRole("button", { name: "Responsive" }).click();
  await page.getByRole("menuitemradio", { name: "iPhone 16 393" }).click();
  check("preset menu label updates", (await page.getByRole("button", { name: "iPhone 16", exact: true }).count()) >= 1);
  check("preset width applied to inputs", (await widthInput.inputValue()) === "393" && (await heightInput.inputValue()) === "852");
  const phoneWidth = (await artboard.boundingBox()).width;
  check("artboard renders at the device width", Math.abs(phoneWidth - 393) <= 2);

  await page.getByRole("button", { name: "iPhone 16", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "iPad Pro 13 1032" }).click();
  const fitWidth = (await artboard.boundingBox()).width;
  check("fit to window scales a wide preset down", fitWidth < 1032 && fitWidth > 500);

  await page.getByRole("button", { name: /Fit to window|\d+%/ }).click();
  await page.getByRole("menuitemradio", { name: "200%", exact: true }).click();
  const zoomedWidth = (await artboard.boundingBox()).width;
  check("200% zoom scales the device up", Math.abs(zoomedWidth - 2064) <= 4);

  // Custom range (back to 100% so the width maps 1:1)
  await page.getByRole("button", { name: /Fit to window|\d+%/ }).click();
  await page.getByRole("menuitemradio", { name: "100%", exact: true }).click();
  await widthInput.fill("500");
  await page.waitForTimeout(150);
  check("typing a custom range sets Dimension = Custom", (await page.getByRole("button", { name: "Custom", exact: true }).count()) === 1);
  check("custom width is applied", Math.abs((await artboard.boundingBox()).width - 500) <= 2);

  /* ---------- models settings ---------- */
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Models", exact: true }).click();
  await page.getByRole("button", { name: "Chat model" }).waitFor();

  await page.getByRole("button", { name: "Chat model" }).click();
  for (const name of ["GPT-6 Luna", "GPT-6 Terra", "DeepSeek v4.1 Flash", "Grok 4.7"]) {
    check(`chat model offers ${name}`, (await page.getByRole("menuitem", { name, exact: true }).count()) === 1);
  }
  await page.keyboard.press("Escape");

  // Add two custom models
  await page.getByRole("button", { name: "Add provider" }).click();
  await page.getByLabel("Model name").fill("Llama 4.1");
  await page.getByLabel("Base URL (OpenAI-compatible)").fill("https://api.mycorp.com/v1");
  await page.getByRole("button", { name: "Save model" }).click();
  check("first custom model saved and listed", (await page.locator("text=api.mycorp.com/v1").count()) >= 1);
  await page.getByRole("button", { name: "Chat model" }).click();
  check("custom model appears in the chat picker", (await page.getByRole("menuitem", { name: "Llama 4.1", exact: true }).count()) === 1);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Add provider" }).click();
  await page.getByLabel("Model name").fill("Mistral Large");
  await page.getByLabel("Base URL (OpenAI-compatible)").fill("https://api.mistral.example/v1");
  await page.getByRole("button", { name: "Save model" }).click();
  const addBtn = page.getByRole("button", { name: "Add provider" });
  check("the third custom model is blocked at 2", (await addBtn.isDisabled()) === true);

  // Providers section greyed out
  const addKey = page.getByRole("button", { name: "Add key" }).first();
  const pe = await addKey.evaluate((el) => getComputedStyle(el.closest("[aria-disabled='true']") ?? el).pointerEvents);
  check("providers section is locked (pointer-events none)", pe === "none");
  check("providers labelled Lite+ and above", (await page.locator("text=Lite+ and above").count()) >= 1);

  // Effort Max greyed out with crown
  const maxBtn = page.getByRole("radio", { name: "Max" });
  check("Max effort is disabled", (await maxBtn.getAttribute("aria-disabled")) === "true");
  check("Max effort carries a crown icon", (await maxBtn.locator("svg").count()) >= 1);

  await page.keyboard.press("Escape");

  /* ---------- composer effort gate ---------- */
  await page.getByRole("button", { name: "Medium", exact: true }).click();
  const composerMax = page.getByRole("button", { name: /Max/ });
  check("composer Max label is disabled", (await composerMax.isDisabled()) === true);
  const levelListMax = page.locator('[title="Max requires Lite+"]');
  check("composer shows Lite+ hint for Max", (await levelListMax.count()) >= 1);
  await page.keyboard.press("Escape");

  /* ---------- sidebar upgrade button ---------- */
  const upgrade = page.getByRole("button", { name: /Upgrade plan/ });
  check("Upgrade plan button exists in the sidebar", (await upgrade.count()) >= 1);
  const support = page.locator("text=Need support?");
  const upBox = await upgrade.first().boundingBox();
  const supportBox = await support.first().boundingBox();
  check("Upgrade plan sits above Need support?", upBox && supportBox && upBox.y < supportBox.y);

  check("no JavaScript page errors", pageErrors.length === 0);
  console.log("All canvas & settings checks passed.");
} finally {
  await browser.close();
}
