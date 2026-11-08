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

const check = (name, test, detail) => {
  assert.ok(test, detail ? `${name} — ${detail}` : name);
  console.log(`PASS ${name}`);
};

try {
  await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });

  /* ---------- Upgrade plan is a white pill ---------- */
  const upgrade = page.getByRole("button", { name: /Upgrade plan/ }).first();
  await upgrade.waitFor();
  const styles = await upgrade.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, radius: s.borderRadius, color: s.color, shadow: s.boxShadow };
  });
  const white = (rgb) => {
    const m = rgb.match(/\d+/g)?.map(Number) ?? [];
    return m[0] > 235 && m[1] > 235 && m[2] > 235;
  };
  check("Upgrade plan has a white background", white(styles.bg));
  check("Upgrade plan is fully pill-shaped", parseFloat(styles.radius) >= 9999 || styles.radius.includes("9999") || parseFloat(styles.radius) >= 12);
  check("Upgrade plan uses dark text on white", !white(styles.color));
  const support = page.locator("text=Need support?").first();
  const upBox = await upgrade.boundingBox();
  const supBox = await support.boundingBox();
  check("Upgrade plan sits above Need support?", upBox.y < supBox.y);

  /* ---------- API key field on custom models ---------- */
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Models", exact: true }).click();
  await page.getByRole("button", { name: "Chat model" }).waitFor();

  await page.getByRole("button", { name: "Add provider" }).click();
  check("Add provider form exposes an API key field", (await page.getByLabel("API key").count()) === 1);

  await page.getByLabel("Model name").fill("Llama 4.1");
  await page.getByLabel("Base URL (OpenAI-compatible)").fill("https://api.mycorp.com/v1");
  await page.getByLabel("API key").fill("sk-live-abc123");
  await page.getByRole("button", { name: "Save model" }).click();
  await page.waitForTimeout(150);

  check("saved model shows its API key field", (await page.getByLabel("Llama 4.1 API key").count()) === 1);
  check("API key value is stored", (await page.getByLabel("Llama 4.1 API key").inputValue()) === "sk-live-abc123");
  check("saved key is marked", (await page.locator("text=Key saved").count()) >= 1);

  // Edit the key in place
  await page.getByLabel("Llama 4.1 API key").fill("sk-rotated-999");
  await page.waitForTimeout(120);
  check("API key is editable in place", (await page.getByLabel("Llama 4.1 API key").inputValue()) === "sk-rotated-999");

  // A model with no key is flagged
  await page.getByRole("button", { name: "Add provider" }).click();
  await page.getByLabel("Model name").fill("Local Mixtral");
  await page.getByLabel("Base URL (OpenAI-compatible)").fill("http://localhost:11434/v1");
  await page.getByRole("button", { name: "Save model" }).click();
  await page.waitForTimeout(150);
  check("keyless model is flagged as No key", (await page.locator("text=No key").count()) >= 1);

  await page.keyboard.press("Escape");

  /* ---------- MCP permission artifact ---------- */
  const perm = page.locator('[data-permission-card]');
  check("a pending permission artifact is in the thread", (await perm.count()) >= 1);
  const title = await perm.first().locator("[data-permission-title]").innerText();
  check("title names agent, MCP and tool", /^Allow .+ to use .+ : .+\?$/.test(title.replace(/\s+/g, " ").trim()), JSON.stringify(title));
  check("seeded request is for GitHub get_content", title.includes("GitHub") && title.includes("get_content"));

  check("Allow tool button is visible", (await perm.first().getByRole("button", { name: "Allow tool", exact: true }).count()) === 1);
  check("Deny tool button is visible", (await perm.first().getByRole("button", { name: "Deny tool", exact: true }).count()) === 1);
  check("collapsed state hides the long option list", (await perm.first().getByRole("button", { name: "Always allow tool", exact: true }).count()) === 0);

  // Chevron expands the Allow options
  await perm.first().getByRole("button", { name: "More allow tool options" }).click();
  await page.waitForTimeout(150);
  for (const label of [
    "Allow tool, this session",
    "Always allow tool, this session",
    "Always allow tool",
    "Always allow using this MCP, this session",
    "Always allow using this MCP",
  ]) {
    check(`Allow chevron reveals "${label}"`, (await perm.first().getByRole("button", { name: label, exact: true }).count()) === 1);
  }

  // Deny chevron mirrors it
  await perm.first().getByRole("button", { name: "More deny tool options" }).click();
  await page.waitForTimeout(150);
  for (const label of [
    "Deny tool, this session",
    "Always deny tool, this session",
    "Always deny tool",
    "Always deny using this MCP, this session",
    "Always deny using this MCP",
  ]) {
    check(`Deny chevron reveals "${label}"`, (await perm.first().getByRole("button", { name: label, exact: true }).count()) === 1);
  }

  // Only one panel is open at a time — reopen Allow to decide with it.
  await perm.first().getByRole("button", { name: "More allow tool options" }).click();
  await page.waitForTimeout(150);
  await perm.first().getByRole("button", { name: "Always allow using this MCP", exact: true }).click();
  await page.waitForTimeout(200);
  check("decision is recorded on the card", (await perm.first().locator("text=Always allow using this MCP").count()) >= 1);
  check("resolved card offers to change the decision", (await perm.first().getByRole("button", { name: "Change decision" }).count()) === 1);
  check("granting permission runs the MCP tool", (await page.locator("text=Used MCP tool 'get_content'").count()) >= 1);

  await page.screenshot({ path: "/tmp/permission-card.png", fullPage: false, clip: { x: 300, y: 300, width: 800, height: 640 } });

  // Change decision -> Deny flow
  await perm.first().getByRole("button", { name: "Change decision" }).click();
  await page.waitForTimeout(150);
  check("change decision reopens the buttons", (await perm.first().getByRole("button", { name: "Deny tool", exact: true }).count()) === 1);
  await perm.first().getByRole("button", { name: "Deny tool", exact: true }).click();
  await page.waitForTimeout(200);
  check("deny records a denial", (await perm.first().locator("text=Deny tool, this session").count()) >= 1);

  /* ---------- permission is requested when an MCP is mentioned ---------- */
  await page.keyboard.press("Escape");
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  await message.click();
  // Type "@git" to filter the mention menu down to the GitHub MCP, then accept it.
  await page.keyboard.type("@git");
  await page.waitForTimeout(300);
  const menuItems = page.locator("[data-menu-item]");
  check("mention menu offers the GitHub MCP", (await menuItems.count()) >= 1);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check("accepting the mention inserts an MCP chip", (await message.locator("[data-chip-kind='mcp']").count()) === 1);
  await page.keyboard.type(" check the readme");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1400);
  const allPerm = page.locator('[data-permission-card]');
  const titles = await allPerm.locator("[data-permission-title]").allInnerTexts();
  check("mentioning an MCP spawns a new permission request", titles.length >= 2);
  check("new request names the mentioned MCP", titles.some((t) => t.includes("GitHub")));

  check("no JavaScript page errors", pageErrors.length === 0);
  console.log("All permission/plan checks passed.");
} finally {
  await browser.close();
}
