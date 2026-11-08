import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route(/images\.pexels\.com/, (r) =>
  r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") })
);
const check = (n, t, d) => { assert.ok(t, d ? `${n} — ${d}` : n); console.log(`PASS ${n}`); };

const editor = () => page.getByRole("textbox", { name: "Message", exact: true });

async function makeComment(frac, text) {
  await page.locator("[data-sel-toolbar]").waitFor({ state: "detached" }).catch(() => {});
  const para = page.locator("[data-doc-body] [data-block-type=paragraph]").first().locator("[data-editable]");
  const bb = await para.boundingBox();
  await page.mouse.move(bb.x + 8, bb.y + 9);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width * frac, bb.y + 9, { steps: 7 });
  await page.mouse.up();
  await page.locator("[data-sel-toolbar]").getByRole("button", { name: "Add comment" }).click();
  await page.getByLabel("Comment text").fill(text);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
}

try {
  await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
  await page.locator("[data-tokens-card]").scrollIntoViewIfNeeded();
  await page.locator("[data-tokens-card]").getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForTimeout(300);
  const panel = page.locator("[data-docs-panel]");

  /* ---------- comments list is a floating popover ---------- */
  await panel.getByRole("button", { name: "See all comments" }).click();
  await page.waitForTimeout(150);
  const pop = page.locator("[data-comments-popover]");
  check("comments list floats as a popover, not a dialog", (await pop.count()) === 1 && (await page.getByRole("dialog").count()) === 0);
  check("popover has Close", (await pop.getByText("Close", { exact: true }).count()) === 1);
  check("popover has Select all / Clear / Send all", (await pop.getByRole("button", { name: "Select all" }).count()) === 1 && (await pop.getByRole("button", { name: "Clear" }).count()) === 1 && (await pop.getByText(/Send all \(/).count()) === 1);
  await page.keyboard.press("Escape");

  /* ---------- no chat bubble; comments go into the composer ---------- */
  await makeComment(0.4, "Tighten this intro");
  check("no comment bubble is added to the conversation", (await page.locator("[data-comment-card]").count()) === 0);
  check("comment count badge appears", (await panel.locator("[data-comment-count]").innerText()) === "1");
  await panel.getByRole("button", { name: "See all comments" }).click();
  await page.waitForTimeout(100);
  check("comment logged in the popup", (await pop.locator("[data-comment-row]").count()) === 1);
  check("popup has no comment icons", (await pop.locator("svg").count()) === 0, "found svg icons");
  check("popup row shows the line range", /L\d+/.test(await pop.locator("[data-comment-row]").first().innerText()));

  /* single send → chip in composer */
  await pop.locator("[data-comment-row]").first().getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForTimeout(400);
  const chip = editor().locator("[data-chip-kind=comment]");
  check("sending one comment inserts a chip in the composer", (await chip.count()) === 1);
  check("single chip reads 'Comment · L…'", /Comment\s*·\s*L\d+/.test(await chip.innerText()), await chip.innerText());
  check("chip sits inside the composer editor", (await editor().locator("[data-chip]").count()) >= 1);
  check("no chat message was added for the comment", (await page.locator("[data-comment-card]").count()) === 0);

  /* ---------- second comment + send all as grouped chip ---------- */
  const chipText = await chip.innerText();
  await chip.getByRole("button", { name: /Remove/ }).click();
  await page.waitForTimeout(150);
  check("chip can be removed before sending", (await editor().locator("[data-chip-kind=comment]").count()) === 0);
  await page.locator("[data-tokens-card]").getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForTimeout(200);
  await makeComment(0.7, "Call out the token count");
  await panel.getByRole("button", { name: "See all comments" }).click();
  await page.waitForTimeout(100);
  await page.locator("[data-comments-popover]").getByRole("button", { name: /Send all/ }).click();
  await page.waitForTimeout(400);
  const groupChip = editor().locator("[data-chip-kind=comment]");
  check("send all inserts a grouped comment chip", (await groupChip.count()) === 1);
  const gt = await groupChip.innerText();
  check("grouped chip reads 'Comments · Design Plan'", /Comments\s*·\s*Design Plan/.test(gt), gt);
  check("grouped chip carries the count", gt.includes("2"), gt);
  check("composer keeps prior comment chip typing intact", (await editor().locator("[data-chip]").count()) === 1);
  void chipText;

  /* select a subset */
  await page.locator("[data-tokens-card]").getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForTimeout(200);
  await panel.getByRole("button", { name: "See all comments" }).click();
  await page.waitForTimeout(100);
  await pop.locator('input[type="checkbox"]').first().check();
  await pop.getByRole("button", { name: "Send selected" }).click();
  await page.waitForTimeout(400);
  check("custom selection inserts a single-comment chip", /Comment\s*·\s*L/.test(await editor().locator("[data-chip-kind=comment]").last().innerText()));

  /* send the composer normally → message keeps the inline chips */
  const before = await page.locator("[data-chip-kind=comment]").count();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  check("sending clears the composer", (await editor().locator("[data-chip]").count()) === 0);
  check("sent message keeps inline comment chips", (await page.locator("[data-chip-kind=comment]").count()) >= 1, `before=${before}`);

  /* ---------- big floating skeletal editor ---------- */
  await page.locator("[data-skeletal-card=ready]").scrollIntoViewIfNeeded();
  await page.locator("[data-skeletal-card=ready]").getByRole("button", { name: "Modify skeleton" }).click();
  await page.waitForTimeout(300);
  const modal = page.locator("[data-skeletal-editor]");
  check("skeletal editor opens as a big floating modal", (await modal.count()) === 1);
  const toolNames = ["Rectangle", "Circle", "Triangle", "Line", "Text"];
  const toolCounts = [];
  for (const name of toolNames) toolCounts.push(await modal.getByRole("button", { name, exact: true }).count());
  check("modal has rectangle, circle, triangle, line, text tools", toolCounts.every((n) => n === 1), toolCounts.join(","));
  check("modal supports renaming", (await modal.getByLabel("Skeletal design name").count()) === 1);
  check("modal shows boundary selection + resize handles", (await modal.locator("[data-shape]").count()) >= 5);
  check("modal has a change description box", (await modal.getByLabel("Describe the change you want").count()) === 1);

  // rename + resize via inputs
  await modal.getByLabel("Skeletal design name").fill("Discovery · Variant B");
  await modal.locator("[data-shape=rect]").first().click();
  await modal.getByLabel("W").fill("500");
  await modal.getByLabel("Selection label").fill("MEGA NAV");
  check("selection resize updates the shape", (await modal.locator("[data-shape]").first().getAttribute("style")).includes("500px"));
  check("selection rename updates the label", (await modal.locator("[data-shape]").first().innerText()).includes("MEGA NAV"));

  // add a circle
  const circlesBefore = await modal.locator("[data-shape=circle]").count();
  await modal.getByRole("button", { name: "Circle", exact: true }).click();
  const canvas = modal.locator("[data-shape]").first().locator("..");
  const cb = await canvas.boundingBox();
  await page.mouse.click(cb.x + 300, cb.y + 260);
  await page.waitForTimeout(150);
  check("clicking the canvas with the circle tool adds a circle", (await modal.locator("[data-shape=circle]").count()) === circlesBefore + 1);

  // add a triangle and a text block
  await modal.getByRole("button", { name: "Triangle", exact: true }).click();
  await page.mouse.click(cb.x + 480, cb.y + 260);
  await page.waitForTimeout(120);
  check("triangle tool adds a triangle", (await modal.locator("[data-shape=triangle]").count()) >= 1);
  await modal.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(cb.x + 600, cb.y + 300);
  await page.waitForTimeout(120);
  check("text tool adds an editable text block", (await modal.locator("[data-shape=text] input").count()) >= 1);

  await modal.getByLabel("Describe the change you want").fill("Make the hero shorter and move the CTA beside the copy.");
  await modal.getByRole("button", { name: "Send changes" }).click();
  await page.waitForTimeout(250);
  check("sending changes closes the modal", (await page.locator("[data-skeletal-editor]").count()) === 0);
  check("a new proposing artifact appears (loading state)", (await page.locator("[data-skeletal-card=loading]").count()) >= 1);
  await page.waitForTimeout(1100);
  check("the proposal resolves to a finished artifact", (await page.locator("[data-skeletal-card=ready]").count()) >= 2);
  check("agent confirms the skeletal change", (await page.locator("text=Updated the skeleton").count()) >= 1);

  check("no JavaScript errors", errors.length === 0, errors.join(" | "));
  console.log("All composer-comment & skeletal-editor checks passed.");
} finally {
  await browser.close();
}
