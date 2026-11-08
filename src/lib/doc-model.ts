/* ------------------------------------------------------------------
 * Block document model for design docs.
 *
 * The editor works on blocks; Markdown is the storage/export format.
 * parseMarkdown and serializeMarkdown are inverses for everything the
 * insert menu can create, so round-tripping is lossless.
 * ------------------------------------------------------------------ */

export type Block =
  | { id: string; type: "heading"; level: 1 | 2 | 3; text: string }
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "bulleted"; items: string[] }
  | { id: string; type: "numbered"; items: string[] }
  | { id: string; type: "checklist"; items: { checked: boolean; text: string }[] }
  | { id: string; type: "code"; lang: string; code: string }
  | { id: string; type: "quote"; text: string }
  | { id: string; type: "divider" }
  | { id: string; type: "date"; value: string }
  | { id: string; type: "dropdown"; label: string; options: string[]; selected: number }
  | { id: string; type: "table"; header: string[]; rows: string[][] }
  | { id: string; type: "image"; src: string; alt: string };

let seq = 0;
export const newBlockId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

/* ---- helpers ------------------------------------------------------- */

const cells = (row: string) =>
  row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

const isTableSep = (line: string) => /^\s*\|?[\s:\-|]+\|?\s*$/.test(line) && line.includes("-");

/* ---- parse --------------------------------------------------------- */

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    // code fence
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const buf: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith("```")) buf.push(lines[j++]);
      blocks.push({ id: newBlockId(), type: "code", lang, code: buf.join("\n") });
      i = j + 1;
      continue;
    }

    // heading
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      blocks.push({ id: newBlockId(), type: "heading", level: h[1].length as 1 | 2 | 3, text: h[2] });
      i++;
      continue;
    }

    // divider
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ id: newBlockId(), type: "divider" });
      i++;
      continue;
    }

    // dropdown  <!-- dropdown:Label|opt1|opt2|sel=0 -->
    const dd = line.match(/^<!--\s*dropdown:(.*?)\s*-->$/);
    if (dd) {
      const parts = dd[1].split("|");
      const selMatch = parts[parts.length - 1]?.match(/^sel=(\d+)$/);
      const selected = selMatch ? Number(selMatch[1]) : 0;
      const opts = selMatch ? parts.slice(1, -1) : parts.slice(1);
      blocks.push({ id: newBlockId(), type: "dropdown", label: parts[0] ?? "Select", options: opts, selected });
      i++;
      continue;
    }

    // date  <!-- date:YYYY-MM-DD -->
    const dt = line.match(/^<!--\s*date:(\d{4}-\d{2}-\d{2})\s*-->$/);
    if (dt) {
      blocks.push({ id: newBlockId(), type: "date", value: dt[1] });
      i++;
      continue;
    }

    // table
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = cells(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes("|") && lines[j].trim()) {
        rows.push(cells(lines[j]));
        j++;
      }
      blocks.push({ id: newBlockId(), type: "table", header, rows });
      i = j;
      continue;
    }

    // image (standalone)
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (img) {
      blocks.push({ id: newBlockId(), type: "image", alt: img[1], src: img[2] });
      i++;
      continue;
    }

    // checklist / bulleted / numbered
    const li = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (li) {
      const check = li[2].match(/^\[([ xX])\]\s+(.*)$/);
      if (check) {
        const items: { checked: boolean; text: string }[] = [];
        let j = i;
        while (j < lines.length) {
          const m = lines[j].match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
          if (!m) break;
          items.push({ checked: m[1] !== " ", text: m[2] });
          j++;
        }
        blocks.push({ id: newBlockId(), type: "checklist", items });
        i = j;
        continue;
      }
      const ordered = /^\d+\.$/.test(li[1]);
      const items: string[] = [];
      let j = i;
      while (j < lines.length) {
        const m = lines[j].match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
        if (!m || /^\[[ xX]\]\s/.test(m[2])) break;
        if (/^\d+\.$/.test(m[1]) !== ordered) break;
        items.push(m[2]);
        j++;
      }
      blocks.push(ordered ? { id: newBlockId(), type: "numbered", items } : { id: newBlockId(), type: "bulleted", items });
      i = j;
      continue;
    }

    // quote
    if (line.startsWith(">")) {
      const buf: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].startsWith(">")) buf.push(lines[j++].replace(/^>\s?/, ""));
      blocks.push({ id: newBlockId(), type: "quote", text: buf.join("\n") });
      i = j;
      continue;
    }

    // paragraph: consecutive non-empty plain lines
    const buf: string[] = [line];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() && !startsBlock(lines[j], lines[j + 1])) buf.push(lines[j++]);
    blocks.push({ id: newBlockId(), type: "paragraph", text: buf.join("\n") });
    i = j;
  }

  return blocks;
}

function startsBlock(line: string, next?: string) {
  return (
    /^(#{1,3})\s+/.test(line) ||
    line.trim().startsWith("```") ||
    /^\s*([-*_])(\s*\1){2,}\s*$/.test(line) ||
    /^<!--\s*(dropdown|date):/.test(line) ||
    /^!\[[^\]]*\]\([^)]+\)\s*$/.test(line) ||
    /^\s*([-*+]|\d+\.)\s+/.test(line) ||
    line.startsWith(">") ||
    (line.includes("|") && !!next && isTableSep(next))
  );
}

/* ---- serialize ------------------------------------------------------ */

export function serializeBlock(b: Block): string {
  switch (b.type) {
    case "heading":
      return `${"#".repeat(b.level)} ${b.text}`;
    case "paragraph":
      return b.text;
    case "bulleted":
      return b.items.map((t) => `- ${t}`).join("\n");
    case "numbered":
      return b.items.map((t, i) => `${i + 1}. ${t}`).join("\n");
    case "checklist":
      return b.items.map((it) => `- [${it.checked ? "x" : " "}] ${it.text}`).join("\n");
    case "code":
      return "```" + b.lang + "\n" + b.code + "\n```";
    case "quote":
      return b.text.split("\n").map((l) => `> ${l}`).join("\n");
    case "divider":
      return "---";
    case "date":
      return `<!-- date:${b.value} -->`;
    case "dropdown":
      return `<!-- dropdown:${[b.label, ...b.options, `sel=${b.selected}`].join("|")} -->`;
    case "table": {
      const width = Math.max(b.header.length, ...b.rows.map((r) => r.length));
      const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
      const line = (r: string[]) => `| ${pad(r).join(" | ")} |`;
      return [line(b.header), `| ${Array(width).fill("---").join(" | ")} |`, ...b.rows.map(line)].join("\n");
    }
    case "image":
      return `![${b.alt}](${b.src})`;
  }
}

/** Blocks → Markdown, with blank lines between blocks (Markdown convention). */
export function serializeMarkdown(blocks: Block[]): string {
  return blocks.map(serializeBlock).join("\n\n") + "\n";
}

/**
 * Line offsets for each block in the serialized Markdown (1-based). Used to
 * map a DOM selection back to "L25-34" in the source.
 */
export function blockLineRanges(blocks: Block[]): { id: string; start: number; end: number }[] {
  const out: { id: string; start: number; end: number }[] = [];
  let line = 1;
  blocks.forEach((b, idx) => {
    const n = serializeBlock(b).split("\n").length;
    out.push({ id: b.id, start: line, end: line + n - 1 });
    line += n + (idx < blocks.length - 1 ? 1 : 0); // +1 for the blank separator
  });
  return out;
}

/** Display label for an image path: local file path as-is, remote URL as [name.ext]. */
export function imageLabel(src: string): string {
  if (/^https?:\/\//i.test(src)) {
    const name = src.split("?")[0].split("#")[0].split("/").pop() || "image";
    const file = /\.[a-z0-9]{2,5}$/i.test(name) ? name : `${name}.jpg`;
    return `[${file}]`;
  }
  if (src.startsWith("blob:") || src.startsWith("data:")) return "[image]";
  return src; // local filesystem path
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
