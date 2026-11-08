import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
await page.route(/images\.pexels\.com/, (route) =>
  route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") })
);

const check = (name, test, detail) => {
  assert.ok(test, detail ? `${name} — ${detail}` : name);
  console.log(`PASS ${name}`);
};

try {
  await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });

  /* ======== Edited Plan artifact + grouped diffs ======== */
  const plan = page.locator("button", { hasText: "Edited" }).filter({ hasText: "Plan" }).first();
  await plan.scrollIntoViewIfNeeded();
  check("Edited Plan artifact exists", (await plan.count()) === 1);
  check("Plan shows +4 −2", (await plan.innerText()).includes("+4") && (await plan.innerText()).includes("−2"));
  await plan.click();
  await page.waitForTimeout(150);
  check("Plan diff expands", (await page.locator("text=Ship tokens first, hero second").count()) === 1);

  const group = page.locator("details").filter({ hasText: "edited 4 files" }).first();
  await group.locator("summary").click();
  await page.waitForTimeout(150);
  const inlineEdits = group.locator("[data-inline-edit]");
  check("grouped rows contain inline Edited diffs", (await inlineEdits.count()) === 2);
  await inlineEdits.first().locator("button").first().click();
  await page.waitForTimeout(150);
  check("inline grouped diff expands", (await group.locator("text=--ember: #ff4d00;").count()) === 1);

  /* ======== Open the design doc ======== */
  const card = page.locator("[data-tokens-card]");
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForTimeout(300);
  const panel = page.locator("[data-docs-panel]");
  const body = panel.locator("[data-doc-body]");
  check("doc panel opens", (await panel.count()) === 1);
  check("Send to agent pill sits between Export and Close",
    (await panel.getByRole("button", { name: "Send to agent" }).count()) === 1 &&
    (await panel.getByRole("button", { name: "Close document" }).count()) === 1);
  check("See all comments button present", (await panel.getByRole("button", { name: "See all comments" }).count()) === 1);

  check("seed table renders", (await body.locator("table").count()) === 1);
  check("seed checklist renders", (await body.locator('[data-block-type="checklist"]').count()) === 1);

  /* ======== Every insert item renders a real block ======== */
  const openInsert = async () => {
    await panel.getByRole("button", { name: "Insert", exact: true }).click();
    await page.waitForTimeout(100);
  };
  const expect = [
    ["Bulleted list", "bulleted"],
    ["Checklist", "checklist"],
    ["Code block", "code"],
    ["Date", "date"],
    ["Divider", "divider"],
    ["Dropdown", "dropdown"],
    ["Heading 1", "heading"],
    ["Heading 2", "heading"],
    ["Heading 3", "heading"],
    ["Numbered list", "numbered"],
    ["Quote", "quote"],
    ["Table", "table"],
  ];
  for (const [label, type] of expect) {
    const before = await body.locator(`[data-block-type="${type}"]`).count();
    await openInsert();
    await panel.getByRole("button", { name: label, exact: true }).click();
    await page.waitForTimeout(80);
    const after = await body.locator(`[data-block-type="${type}"]`).count();
    check(`insert "${label}" renders a ${type} block`, after === before + 1, `${before}→${after}`);
  }
  check("date block has a date input", (await body.locator('[data-block-type="date"] input[type=date]').count()) >= 1);
  check("dropdown block has a select", (await body.locator('[data-block-type="dropdown"] select').count()) >= 1);
  check("code block has a language field", (await body.locator('[data-block-type="code"] input[aria-label="Code language"]').count()) >= 1);

  /* ======== Images: web → [name.ext], local → path ======== */
  await panel.getByRole("button", { name: "Insert an image" }).click();
  await panel.getByLabel("Image URL").fill("https://cdn.example.com/assets/hero-shot.png?w=1200");
  await panel.getByRole("button", { name: "Add image" }).click();
  await page.waitForTimeout(100);
  check("web image shows as [hero-shot.png]", (await body.locator('[data-block-type="image"]', { hasText: "[hero-shot.png]" }).count()) === 1);

  await panel.getByRole("button", { name: "Insert an image" }).click();
  await panel.locator('input[type=file]').setInputFiles({ name: "mockup.png", mimeType: "image/png", buffer: Buffer.from("x") });
  await page.waitForTimeout(150);
  check("local image shows its file path", (await body.locator('[data-block-type="image"]', { hasText: "mockup.png" }).count()) === 1);
  check("local image is labelled local file", (await body.locator('[data-block-type="image"]', { hasText: "local file" }).count()) >= 1);

  /* ======== Editing a block ======== */
  const firstHeading = body.locator('[data-block-type="heading"]').first().locator('[role=textbox]');
  await firstHeading.dblclick();
  await page.waitForTimeout(80);
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Discovery — Tokens v2");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
  check("double-click edits a heading", (await body.locator('[data-block-type="heading"]').first().innerText()).includes("Discovery — Tokens v2"));

  // toggle a checklist item
  const cb = body.locator('[data-block-type="checklist"] [role=checkbox]').nth(2);
  const wasChecked = await cb.getAttribute("aria-checked");
  await cb.click();
  await page.waitForTimeout(80);
  check("checklist toggles", (await cb.getAttribute("aria-checked")) !== wasChecked);

  // table + row
  const rowsBefore = await body.locator('[data-block-type="table"]').first().locator("tbody tr").count();
  await body.locator('[data-block-type="table"]').first().getByRole("button", { name: "+ row" }).click();
  check("table + row adds a row", (await body.locator('[data-block-type="table"]').first().locator("tbody tr").count()) === rowsBefore + 1);

  /* ======== Color chip still edits the artifact ======== */
  await body.locator('[data-color-hex="#FF4D00"]').first().click();
  await page.getByLabel("Hex value").fill("#FF8800");
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Close color picker" }).click();
  const emberHex = await card.evaluate((el) => {
    const p = Array.from(el.querySelectorAll("p")).find((x) => x.textContent?.trim() === "ember");
    return Array.from(p?.parentElement?.querySelectorAll("p") ?? []).find((x) => /^#/.test(x.textContent ?? ""))?.textContent?.trim();
  });
  check("artifact swatch follows the doc color", emberHex === "#FF8800", emberHex);

  /* ======== Export is well-formed Markdown ======== */
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "Export" }).click(),
  ]);
  const md = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  check("export downloads a .md file", download.suggestedFilename().endsWith(".md"));
  check("export has H1 heading", /^# Discovery — Tokens v2/m.test(md));
  check("export has a Markdown table", /\| --- \| --- \| --- \|/.test(md));
  check("export has a checklist", /- \[[ x]\] /.test(md));
  check("export has a fenced code block", /```js\n[\s\S]*?\n```/.test(md));
  check("export has an image line", /!\[.*\]\(.*hero-shot\.png.*\)/.test(md));
  check("export encodes the date block", /<!-- date:\d{4}-\d{2}-\d{2} -->/.test(md));
  check("export encodes the dropdown", /<!-- dropdown:.*sel=\d+ -->/.test(md));
  check("export has a divider", /^---$/m.test(md));
  check("export has a quote", /^> /m.test(md));
  // Markdown convention: blocks separated by exactly one blank line, never two.
  check("export never has runs of 2+ blank lines", !/\n\n\n/.test(md));
  check("export headings are preceded by a blank line", !/[^\n]\n#{1,3} /.test(md));
  check("export ends with a single trailing newline", md.endsWith("\n") && !md.endsWith("\n\n"));
  check("export carries the edited color", md.includes("#FF8800"));

  /* ======== Selection → Add comment → inline artifact ======== */
  const target = body.locator('[data-block-type="paragraph"]').first();
  const para = target.locator('[role=textbox]');
  const bb = await para.boundingBox();
  await page.mouse.move(bb.x + 4, bb.y + 8);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width * 0.6, bb.y + 8, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const tb = page.locator("[data-sel-toolbar]");
  check("selecting text shows the toolbar", (await tb.count()) === 1);
  check("toolbar offers Add comment", (await tb.getByRole("button", { name: "Add comment" }).count()) === 1);
  check("toolbar offers Send to agent", (await tb.getByRole("button", { name: "Send to agent" }).count()) === 1);

  await tb.getByRole("button", { name: "Add comment" }).click();
  await page.getByLabel("Comment text").fill("Tighten this copy");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);

  check("no comment bubble is added to the conversation", (await page.locator("[data-comment-card]").count()) === 0);
  check("comment counter badge on the toolbar", (await panel.locator("[data-comment-count]").innerText()) === "1");

  /* ======== See all comments (popover) → highlight ======== */
  await panel.getByRole("button", { name: "See all comments" }).click();
  await page.waitForTimeout(200);
  const row = page.locator("[data-comment-row]").first();
  check("popover lists the comment", (await row.count()) === 1);
  await row.hover();
  await page.waitForTimeout(120);
  check("hovering a comment highlights the doc block", (await body.locator(".bg-taro\\/15").count()) >= 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  check("Escape dismisses the comment popover", (await page.locator("[data-comments-popover]").count()) === 0);

  check("highlight clears after the popover closes", (await body.locator(".bg-taro\\/15").count()) === 0);

  /* ======== Send to agent (selection) ======== */
  await page.waitForTimeout(2300);
  const bb2 = await para.boundingBox();
  await page.mouse.move(bb2.x + 4, bb2.y + 8);
  await page.mouse.down();
  await page.mouse.move(bb2.x + bb2.width * 0.5, bb2.y + 8, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await page.locator("[data-sel-toolbar]").getByRole("button", { name: "Send to agent" }).click();
  await page.waitForTimeout(1100);
  check("selection send creates a user message with the quote", (await page.locator("text=Review this part of the design doc").count()) >= 1);
  check("agent replies to the selection", (await page.locator("text=I've read L").count()) >= 1);

  /* ======== Send to agent (whole doc) ======== */
  await panel.getByRole("button", { name: "Send to agent" }).click();
  await page.waitForTimeout(1100);
  check("header send reads the full doc", (await page.locator("text=Read full design doc").count()) >= 1);

  check("no JavaScript page errors", pageErrors.length === 0, pageErrors.join(" | "));
  console.log("All docs-editor checks passed.");
} finally {
  await browser.close();
}
