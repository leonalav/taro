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

try {
  await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });

  /* ---------- Questions artifact ---------- */
  const q = page.locator("[data-questions-card]");
  await q.scrollIntoViewIfNeeded();
  check("Questions artifact is present", (await q.count()) === 1);
  check("shows Question 1 of 3", (await page.locator("[data-question-progress]").innerText()).includes("Question 1 of 3"));
  check("renders 4 MCQ options A–D", (await q.locator("button[aria-pressed]").count()) === 4);
  const labels = await q.locator("button[aria-pressed] span.font-mono").allInnerTexts();
  check("options are lettered A/B/C/D", JSON.stringify(labels) === JSON.stringify(["A", "B", "C", "D"]), labels.join(","));
  check("has Skip", (await q.getByRole("button", { name: "Skip" }).count()) === 1);
  check("has Decline to answer", (await q.getByRole("button", { name: "Decline to answer" }).count()) === 1);

  await q.locator("button[aria-pressed]").nth(1).click();
  await page.waitForTimeout(600);
  check("answering advances to question 2", (await page.locator("[data-question-progress]").innerText()).includes("Question 2 of 3"));
  await page.getByRole("button", { name: "Skip" }).click();
  await page.waitForTimeout(200);
  check("Skip advances to question 3", (await page.locator("[data-question-progress]").innerText()).includes("Question 3 of 3"));
  await page.getByRole("button", { name: "Decline to answer" }).click();
  await page.waitForTimeout(300);
  check("Decline closes the questions", (await page.locator("[data-questions-card]").count()) === 0);
  check("decline is acknowledged in chat", (await page.locator("text=sensible defaults").count()) >= 1);

  /* ---------- Skeletal design artifacts ---------- */
  const loading = page.locator('[data-skeletal-card="loading"]');
  const ready = page.locator('[data-skeletal-card="ready"]');
  check("proposing (loading) artifact exists", (await loading.count()) === 1);
  check("loading shows 'Proposing skeletal design…'", (await loading.innerText()).toLowerCase().includes("proposing skeletal design"));
  check("loading has a spinner", (await loading.locator(".animate-spin").count()) >= 1);
  check("proposed (ready) artifact exists", (await ready.count()) === 1);
  check("ready shows 'Proposed skeletal design'", (await ready.innerText()).toLowerCase().includes("proposed skeletal design"));
  check("ready has a wireframe preview", (await ready.locator(".bg-\\[\\#0b0b0d\\]").count()) >= 1);
  await ready.getByRole("button", { name: "Use this skeleton" }).click();
  await page.waitForTimeout(250);
  check("accepting the skeleton is recorded", (await ready.innerText()).includes("Accepted"));
  check("agent acknowledges acceptance", (await page.locator("text=Skeleton accepted").count()) >= 1);

  /* ---------- Docs: open + single-click editing ---------- */
  const card = page.locator("[data-tokens-card]");
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForTimeout(300);
  const panel = page.locator("[data-docs-panel]");
  const body = panel.locator("[data-doc-body]");

  const heading = body.locator('[data-block-type="heading"] [data-editable]').first();
  await heading.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" (edited)");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  check("single click edits a heading", (await heading.innerText()).includes("(edited)"));

  const cell = body.locator('[data-block-type="table"] [role=textbox]').nth(4);
  await cell.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Canvas and cards v2");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  check("table cells are editable on click", (await body.locator('[data-block-type="table"]').innerText()).includes("Canvas and cards v2"));

  const task = body.locator('[data-block-type="checklist"] [data-editable]').first();
  await task.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Define the neutral scale v2");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  check("checklist text is editable on click", (await task.innerText()).includes("v2"));

  // inserted checklist item is editable too
  await panel.getByRole("button", { name: "Insert a checklist" }).click();
  await page.waitForTimeout(120);
  check("inserted checklist renders", (await body.locator('[data-block-type="checklist"]').count()) >= 2);

  /* ---------- Comment popover (not a modal) ---------- */
  const commentBtn = panel.getByRole("button", { name: "See all comments" });
  check("no count badge before any comment", (await panel.locator("[data-comment-count]").count()) === 0);
  await commentBtn.click();
  await page.waitForTimeout(150);
  check("comments open as a popover, not a dialog", (await page.locator("[data-comments-popover]").count()) === 1 && (await page.getByRole("dialog").count()) === 0);

  // add two comments via selection
  const addComment = async (frac, text) => {
    const para = body.locator('[data-block-type="paragraph"]').first().locator("[data-editable]");
    const bb = await para.boundingBox();
    await page.mouse.move(bb.x + 8, bb.y + 10);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width * frac, bb.y + 10, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    await page.locator("[data-sel-toolbar]").getByRole("button", { name: "Add comment" }).click();
    await page.getByLabel("Comment text").fill(text);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
  };
  await commentBtn.click(); // close
  await page.waitForTimeout(100);
  await addComment(0.4, "Tighten this intro");
  await addComment(0.6, "Call out the token count");

  check("comment button shows a count badge", (await panel.locator("[data-comment-count]").innerText()) === "2");
  await commentBtn.click();
  await page.waitForTimeout(120);
  const pop = page.locator("[data-comments-popover]");
  check("both comments are listed in the popover", (await pop.locator("[data-comment-row]").count()) === 2);
  check("popover has no comment icons", (await pop.locator("svg.lucide-message-square, svg.lucide-message-square-plus").count()) === 0);
  check("popover has selectable comments", (await pop.locator('input[type="checkbox"]').count()) === 2);

  // hover highlights
  await pop.locator("[data-comment-row]").first().hover();
  await page.waitForTimeout(150);
  check("hovering highlights the matching block", (await body.locator(".bg-taro\\/15").count()) >= 1);

  // send a single selected comment → composer chip
  await pop.locator('input[type="checkbox"]').first().check();
  await pop.getByRole("button", { name: /Send selected/ }).click();
  await page.waitForTimeout(400);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  check("sending selected inserts a comment chip into the composer", (await composer.locator("[data-chip-kind=comment]").count()) === 1);
  check("no comment bubble is added to chat", (await page.locator("[data-comment-card]").count()) === 0);

  // send all → grouped chip (sending closes the doc, so reopen it)
  await page.locator("[data-tokens-card]").getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForTimeout(250);
  await page.locator("[data-docs-panel]").getByRole("button", { name: "See all comments" }).click();
  await page.waitForTimeout(150);
  await page.locator("[data-comments-popover]").getByRole("button", { name: /Send all/ }).click();
  await page.waitForTimeout(400);
  const text = await composer.locator("[data-chip-kind=comment]").last().innerText();
  check("send all inserts a grouped Comments · Design Plan chip", /Comments\s*·\s*Design Plan/.test(text), text);

  check("no JavaScript errors", errors.length === 0, errors.join(" | "));
  console.log("All comments/editable checks passed.");
} finally {
  await browser.close();
}
