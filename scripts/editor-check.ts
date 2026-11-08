/**
 * Headless check for the contenteditable editor helpers in the composer.
 * Run with: node scripts/editor-check.cjs (after bundling with esbuild)
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).Node = dom.window.Node;
(global as any).getSelection = () => dom.window.getSelection();

import { __editor, plainText } from "../src/components/composer";

let failures = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${e}\n      actual   ${a}`}`);
};

/* ---------- token detection ---------- */
const token = (html: string, caret: number) => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return __editor.findActiveToken(__editor.serialize(el).text, caret);
};

check("@ opens mention", token("review @sty", 11), { kind: "mention", query: "sty", start: 7, end: 11 });
check("/ opens skill", token("run /vis", 8), { kind: "skill", query: "vis", start: 4, end: 8 });
check("@ at start", token("@", 1), { kind: "mention", query: "", start: 0, end: 1 });
check("@ needs word boundary", token("mail@a", 6), null);
check("@ after space", token("hi @a", 5), { kind: "mention", query: "a", start: 3, end: 5 });
check("no token", token("hello world", 11), null);
check("query with space closes", token("@ab cd", 6), null);
check("slash after chip", token(`<span data-chip="f">x</span>\u00a0/vi`, 5), {
  kind: "skill",
  query: "vi",
  start: 2,
  end: 5,
});

/* ---------- serialize + caret ---------- */
const chipEl = (label: string) => {
  const s = document.createElement("span");
  s.dataset.chip = `file:${label}`;
  s.dataset.chipValue = JSON.stringify({ id: `file:${label}`, kind: "file", label });
  s.contentEditable = "false";
  s.textContent = label;
  return s;
};

const el = document.createElement("div");
el.append(document.createTextNode("review "), chipEl("styles.css"), document.createTextNode(" and @fo"));
const ser = __editor.serialize(el);
check("serialize maps chips to sentinel", ser.text, `review ${"\u0001"} and @fo`);
check("caret at end", ser.caret, 16);

/* ---------- chip insertion round-trip ---------- */
const ed = document.createElement("div");
ed.innerHTML = "please review @sty";
document.body.append(ed);
const s2 = __editor.serialize(ed);
const tok = __editor.findActiveToken(s2.text, s2.caret)!;
__editor.insertChip(ed, { id: "file:styles.css", kind: "file", label: "styles.css" }, {
  start: tok.start,
  end: tok.end,
});
const segs = __editor.toSegments(ed);
check("segments after insert", segs, [
  { type: "text", text: "please review " },
  { type: "chip", chip: { id: "file:styles.css", kind: "file", label: "styles.css" } },
  { type: "text", text: "\u00a0" },
]);
check("token cleared after insert", __editor.findActiveToken(__editor.serialize(ed).text, 99), null);

/* ---------- plain text ---------- */
check("plainText flattens", plainText(segs), "please review styles.css");

/* ---------- empty ---------- */
const empty = document.createElement("div");
check("empty editor yields no segments", __editor.toSegments(empty), []);


/* ---------- chip in the middle of text ---------- */
const mid = document.createElement("div");
mid.innerHTML = "use @sty and @fo here";
const midTok = __editor.findActiveToken(__editor.serialize(mid).text, 8)!;
__editor.insertChip(mid, { id: "file:styles.css", kind: "file", label: "styles.css" }, {
  start: midTok.start,
  end: midTok.end,
});
check("mid-text insert keeps trailing text", __editor.toSegments(mid), [
  { type: "text", text: "use " },
  { type: "chip", chip: { id: "file:styles.css", kind: "file", label: "styles.css" } },
  { type: "text", text: "\u00a0 and @fo here" },
]);

/* ---------- two chips + typing after a chip ---------- */
const two = document.createElement("div");
two.innerHTML = "compare ";
__editor.insertChip(two, { id: "file:a.css", kind: "file", label: "a.css" }, { start: 8, end: 8 });
__editor.insertChip(two, { id: "mcp:figma", kind: "mcp", label: "Figma" }, { start: 10, end: 10 });
const twoTok = __editor.findActiveToken(__editor.serialize(two).text, __editor.serialize(two).caret);
check("no token right after a chip", twoTok, null);
__editor.insertTextAtCaret(two, "/qa");
const t2 = __editor.findActiveToken(__editor.serialize(two).text, __editor.serialize(two).caret);
check("slash typed after a chip opens skill menu", t2 && [t2.kind, t2.query], ["skill", "qa"]);
check("two chips round-trip", __editor.toSegments(two).filter((s: any) => s.type === "chip").length, 2);

/* ---------- slash command chip ---------- */
const sk = document.createElement("div");
sk.innerHTML = "please /vi";
const skTok = __editor.findActiveToken(__editor.serialize(sk).text, 10)!;
__editor.insertChip(sk, { id: "skill:visual-qa", kind: "skill", label: "visual-qa" }, {
  start: skTok.start,
  end: skTok.end,
});
check("skill chip round-trip", __editor.toSegments(sk), [
  { type: "text", text: "please " },
  { type: "chip", chip: { id: "skill:visual-qa", kind: "skill", label: "visual-qa" } },
  { type: "text", text: "\u00a0" },
]);
check("plainText renders slash label", plainText(__editor.toSegments(sk)), "please visual-qa");

console.log(failures === 0 ? "\nAll editor checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
