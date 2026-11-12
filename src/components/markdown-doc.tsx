import * as React from "react";
import {
  ArrowRight,
  Calendar,
  Check,
  ChevronDown,
  Code,
  Download,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  ListChecks,
  ListOrdered,
  MessageSquare,
  MessageSquarePlus,
  Minus,
  Plus,
  Quote,
  Table,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/color-picker";
import { colorToHex, type ColorOccurrence } from "@/lib/color";
import {
  blockLineRanges,
  imageLabel,
  newBlockId,
  parseMarkdown,
  serializeMarkdown,
  todayISO,
  type Block,
} from "@/lib/doc-model";
import type { DocComment } from "@/data/mock";
import { cn } from "@/utils/cn";

/* ------------------------------------------------------------------
 * Props
 * ------------------------------------------------------------------ */

export interface DocSelection {
  startLine: number;
  endLine: number;
  quote: string;
}

interface DocsPanelProps {
  title: string;
  saveError?: string;
  docText: string;
  onDocChange: (text: string) => void;
  onClose: () => void;
  comments: DocComment[];
  onAddComment: (sel: DocSelection, body: string) => void;
  onSendToAgent: (payload: { quote?: string; range?: { startLine: number; endLine: number } }) => void;
  /** Send one or many comments to the agent as a Comments · Design Plan artifact. */
  onSendComments: (comments: DocComment[]) => void;
  /** A comment to spotlight (set when a comment artifact is clicked in chat). */
  focusComment?: DocComment | null;
  onFocusHandled?: () => void;
}

/* ------------------------------------------------------------------
 * Insert menu (matches the reference: Bulleted list … Table, Image)
 * ------------------------------------------------------------------ */

type InsertKind =
  | "bulleted" | "checklist" | "code" | "date" | "divider" | "dropdown"
  | "h1" | "h2" | "h3" | "numbered" | "quote" | "table" | "image";

const INSERT_ITEMS: { id: InsertKind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "bulleted", label: "Bulleted list", icon: List },
  { id: "checklist", label: "Checklist", icon: ListChecks },
  { id: "code", label: "Code block", icon: Code },
  { id: "date", label: "Date", icon: Calendar },
  { id: "divider", label: "Divider", icon: Minus },
  { id: "dropdown", label: "Dropdown", icon: ChevronDown },
  { id: "h1", label: "Heading 1", icon: Heading1 },
  { id: "h2", label: "Heading 2", icon: Heading2 },
  { id: "h3", label: "Heading 3", icon: Heading3 },
  { id: "numbered", label: "Numbered list", icon: ListOrdered },
  { id: "quote", label: "Quote", icon: Quote },
  { id: "table", label: "Table", icon: Table },
  { id: "image", label: "Image", icon: Image },
];

function makeBlock(kind: InsertKind): Block | null {
  const id = newBlockId();
  switch (kind) {
    case "bulleted": return { id, type: "bulleted", items: ["First item", "Second item"] };
    case "checklist": return { id, type: "checklist", items: [{ checked: false, text: "First task" }, { checked: false, text: "Second task" }] };
    case "code": return { id, type: "code", lang: "js", code: "// code" };
    case "date": return { id, type: "date", value: todayISO() };
    case "divider": return { id, type: "divider" };
    case "dropdown": return { id, type: "dropdown", label: "Status", options: ["Draft", "In review", "Approved"], selected: 0 };
    case "h1": return { id, type: "heading", level: 1, text: "Heading 1" };
    case "h2": return { id, type: "heading", level: 2, text: "Heading 2" };
    case "h3": return { id, type: "heading", level: 3, text: "Heading 3" };
    case "numbered": return { id, type: "numbered", items: ["First", "Second"] };
    case "quote": return { id, type: "quote", text: "A quote" };
    case "table": return { id, type: "table", header: ["Column A", "Column B"], rows: [["Value", "Value"]] };
    case "image": return null; // handled by the image popover
  }
}

/* ------------------------------------------------------------------
 * Panel
 * ------------------------------------------------------------------ */

interface PickerState {
  blockId: string;
  field: string; // which text field in the block (e.g. "text", "row:1:0")
  occ: ColorOccurrence;
  hex: string;
  x: number;
  y: number;
}

interface SelState extends DocSelection {
  x: number;
  y: number;
}

export function DocsPanel({
  title,
  saveError,
  docText,
  onDocChange,
  onClose,
  comments,
  onAddComment,
  onSendToAgent,
  onSendComments,
  focusComment,
  onFocusHandled,
}: DocsPanelProps) {
  // Blocks are the editing model; Markdown is derived.
  const [blocks, setBlocks] = React.useState<Block[]>(() => parseMarkdown(docText));
  const lastSerialized = React.useRef(serializeMarkdown(blocks));

  // Re-parse only when the Markdown changed outside this editor.
  React.useEffect(() => {
    if (docText !== lastSerialized.current) {
      setBlocks(parseMarkdown(docText));
      lastSerialized.current = docText;
    }
  }, [docText]);

  const commit = (next: Block[]) => {
    setBlocks(next);
    const md = serializeMarkdown(next);
    lastSerialized.current = md;
    onDocChange(md);
  };

  const update = (id: string, patch: (b: Block) => Block) => commit(blocks.map((b) => (b.id === id ? patch(b) : b)));
  const remove = (id: string) => commit(blocks.filter((b) => b.id !== id));
  const insertAfter = (afterId: string | null, block: Block) => {
    if (!afterId) return commit([...blocks, block]);
    const i = blocks.findIndex((b) => b.id === afterId);
    const next = [...blocks];
    next.splice(i + 1, 0, block);
    commit(next);
  };

  /* ---- popovers ---- */
  const [insertOpen, setInsertOpen] = React.useState(false);
  const [imageOpen, setImageOpen] = React.useState(false);
  const [imageUrl, setImageUrl] = React.useState("");
  const [commentsOpen, setCommentsOpen] = React.useState(false);
  const [hoverComment, setHoverComment] = React.useState<string | null>(null);
  const [selectedComments, setSelectedComments] = React.useState<string[]>([]);
  const commentsRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const insertRef = React.useRef<HTMLDivElement>(null);
  const imageRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!insertOpen && !imageOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (insertOpen && !insertRef.current?.contains(e.target as Node)) setInsertOpen(false);
      if (imageOpen && !imageRef.current?.contains(e.target as Node)) setImageOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [insertOpen, imageOpen]);

  const addImage = (src: string, alt: string) => {
    insertAfter(null, { id: newBlockId(), type: "image", src, alt });
    setImageUrl("");
    setImageOpen(false);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Desktop builds expose a real path; the browser only gives us the name.
    const path = (file as File & { path?: string }).path || file.name;
    addImage(path, file.name.replace(/\.[^.]+$/, ""));
    e.target.value = "";
  };

  const chooseInsert = (kind: InsertKind) => {
    setInsertOpen(false);
    if (kind === "image") return setImageOpen(true);
    const b = makeBlock(kind);
    if (b) insertAfter(null, b);
  };

  /* ---- export ---- */
  const exportMarkdown = () => {
    const md = serializeMarkdown(blocks);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, "-")}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  /* ---- color picker ---- */
  const [picker, setPicker] = React.useState<PickerState | null>(null);
  const openColor = (blockId: string, field: string, occ: ColorOccurrence, x: number, y: number) =>
    setPicker({ blockId, field, occ, hex: occ.hex, x, y });

  const onColorChange = (hex: string) => {
    if (!picker) return;
    const { blockId, field, occ } = picker;
    update(blockId, (b) => replaceInField(b, field, occ, hex));
    setPicker((p) => (p ? { ...p, hex, occ: { ...p.occ, value: hex, hex, end: p.occ.start + hex.length } } : p));
  };

  /* ---- selection toolbar ---- */
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [sel, setSel] = React.useState<SelState | null>(null);
  const [commentDraft, setCommentDraft] = React.useState<string | null>(null);
  const ranges = React.useMemo(() => blockLineRanges(blocks), [blocks]);

  React.useEffect(() => {
    const onUp = (ev: MouseEvent) => {
      // Interacting with the selection toolbar must not clear the selection.
      if ((ev.target as HTMLElement | null)?.closest("[data-sel-toolbar], [data-comments-popover]")) return;
      const s = window.getSelection();
      if (!s || s.isCollapsed || !bodyRef.current) return setSel(null);
      const quote = s.toString().trim();
      if (!quote) return setSel(null);
      const range = s.getRangeAt(0);
      if (!bodyRef.current.contains(range.commonAncestorContainer)) return setSel(null);
      const startEl = (range.startContainer as HTMLElement).parentElement?.closest("[data-block-id]");
      const endEl = (range.endContainer as HTMLElement).parentElement?.closest("[data-block-id]");
      const sId = startEl?.getAttribute("data-block-id");
      const eId = endEl?.getAttribute("data-block-id");
      const sr = ranges.find((r) => r.id === sId);
      const er = ranges.find((r) => r.id === eId) ?? sr;
      if (!sr || !er) return setSel(null);
      const rect = range.getBoundingClientRect();
      setSel({ startLine: sr.start, endLine: er.end, quote, x: rect.left + rect.width / 2, y: rect.top });
    };
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-sel-toolbar]")) return;
      setSel(null);
      setCommentDraft(null);
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("mousedown", onDown);
    };
  }, [ranges]);

  /* ---- focus a comment from chat ---- */
  React.useEffect(() => {
    if (!focusComment) return;
    setHoverComment(focusComment.id);
    const el = bodyRef.current?.querySelector(`[data-line-start="${focusComment.startLine}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = window.setTimeout(() => {
      setHoverComment(null);
      onFocusHandled?.();
    }, 2200);
    return () => window.clearTimeout(t);
  }, [focusComment, onFocusHandled]);

  const toggleComment = (id: string) =>
    setSelectedComments((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const focusRange = (startLine: number) => {
    const el = bodyRef.current?.querySelector(`[data-line-start="${startLine}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const sendComments = (list: DocComment[]) => {
    if (list.length === 0) return;
    onSendComments(list);
    setSelectedComments([]);
    setCommentsOpen(false);
  };

  // Popover dismissal (click outside / Escape).
  React.useEffect(() => {
    if (!commentsOpen) return;
    const close = () => {
      setCommentsOpen(false);
      setHoverComment(null);
    };
    const onPointer = (e: MouseEvent) => {
      if (!commentsRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [commentsOpen]);

  const activeComment = hoverComment ? comments.find((c) => c.id === hoverComment) ?? null : null;
  const isHighlighted = (start: number, end: number) =>
    activeComment ? !(end < activeComment.startLine || start > activeComment.endLine) : false;

  return (
    <aside aria-label="Document editor" data-docs-panel="true" className="relative flex min-w-0 flex-1 flex-col bg-[#0c0c0e]">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card/70 px-3">
        <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <span className="text-[13px] font-medium text-foreground">Tab 1</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </div>
        <span className="mx-1 h-4 w-px shrink-0 bg-border" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground" title={title}>{title}</span>

        <div className="ml-1 flex shrink-0 items-center gap-0.5">
          <ToolbarButton label="Insert a table" onClick={() => chooseInsert("table")}>
            <Table className="size-4" />
          </ToolbarButton>

          <div className="relative" ref={imageRef}>
            <ToolbarButton label="Insert an image" onClick={() => setImageOpen((o) => !o)} active={imageOpen}>
              <Image className="size-4" />
            </ToolbarButton>
            {imageOpen && (
              <div className="animate-pop absolute left-0 top-full z-40 mt-1.5 w-72 rounded-xl border border-border bg-[#141414] p-3 shadow-2xl shadow-black/70">
                <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Insert image</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>Upload</Button>
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && imageUrl.trim() && addImage(imageUrl.trim(), "")}
                    placeholder="…or paste an image URL"
                    aria-label="Image URL"
                    className="h-7 flex-1 font-mono text-xs"
                  />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/70">
                  Local files show their path; web images show as [name.ext].
                </p>
                <div className="mt-2 flex justify-end">
                  <Button size="sm" disabled={!imageUrl.trim()} onClick={() => addImage(imageUrl.trim(), "")}>
                    <Image className="size-3.5" />Add image
                  </Button>
                </div>
              </div>
            )}
          </div>

          <ToolbarButton label="Insert a checklist" onClick={() => chooseInsert("checklist")}>
            <ListChecks className="size-4" />
          </ToolbarButton>

          <div className="relative" ref={insertRef}>
            <ToolbarButton label="Insert" onClick={() => setInsertOpen((o) => !o)} active={insertOpen}>
              <Plus className="size-4" />
              <ChevronDown className="size-3" />
            </ToolbarButton>
            {insertOpen && (
              <div className="animate-pop absolute left-0 top-full z-40 mt-1.5 w-56 rounded-xl border border-border bg-[#141414] p-1 shadow-2xl shadow-black/70">
                {INSERT_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => chooseInsert(item.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </button>
                ))}
                <p className="px-2.5 pt-1 pb-1 text-[10px] text-muted-foreground/70">Type / in the document for more</p>
              </div>
            )}
          </div>

          <div className="relative" ref={commentsRef}>
            <button
              type="button"
              aria-label="See all comments"
              aria-expanded={commentsOpen}
              onClick={() => setCommentsOpen((o) => !o)}
              className={cn(
                "relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                commentsOpen && "bg-accent text-foreground"
              )}
            >
              <MessageSquare className="size-4" />
              {comments.length > 0 && (
                <span
                  data-comment-count={comments.length}
                  className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-taro px-1 text-[9px] leading-4 font-semibold text-white ring-2 ring-card"
                >
                  {comments.length}
                </span>
              )}
            </button>

            {commentsOpen && (
              <div
                data-comments-popover="true"
                className="animate-pop absolute left-0 top-full z-50 mt-1.5 w-[310px] overflow-hidden rounded-xl border border-border bg-[#111111] shadow-2xl shadow-black/80"
              >
                <div className="flex items-center gap-1.5 px-3 py-2.5">
                  <span className="text-[13px] font-medium text-foreground">Comments</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{comments.length}</span>
                  <button
                    type="button"
                    onClick={() => { setCommentsOpen(false); setHoverComment(null); }}
                    className="ml-auto rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Close
                  </button>
                </div>

                <div className="scrollbar-thin max-h-[260px] overflow-y-auto border-y border-border">
                  {comments.length === 0 && (
                    <p className="px-3 py-7 text-center text-[11px] leading-relaxed text-muted-foreground">
                      No comments yet. Select text in the document and choose “Add comment”.
                    </p>
                  )}
                  {comments.map((c) => {
                    const range = c.startLine === c.endLine ? `L${c.startLine}` : `L${c.startLine}-${c.endLine}`;
                    const checked = selectedComments.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        data-comment-row={c.id}
                        onMouseEnter={() => setHoverComment(c.id)}
                        onMouseLeave={() => setHoverComment(null)}
                        className={cn(
                          "flex items-start gap-2 border-b border-border px-3 py-2 last:border-0 transition-colors",
                          checked && "bg-white/[0.04]",
                          hoverComment === c.id && "bg-white/[0.05]"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleComment(c.id)}
                          aria-label={`Select comment ${range}`}
                          className="mt-1 size-3 shrink-0 cursor-pointer accent-[var(--taro)]"
                        />
                        <button type="button" onClick={() => focusRange(c.startLine)} className="min-w-0 flex-1 text-left">
                          <span className="font-mono text-[11px] text-foreground/80">{range}</span>
                          <span className="mt-0.5 block line-clamp-2 text-[12px] leading-[1.15rem] text-foreground/90">
                            {c.body}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground/60">
                            “{c.quote}”
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => sendComments([c])}
                          className="shrink-0 rounded px-1 pt-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Send
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="px-3 py-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedComments(comments.map((c) => c.id))}
                        disabled={comments.length === 0 || selectedComments.length === comments.length}
                        className="transition-colors hover:text-foreground disabled:opacity-40"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedComments([])}
                        disabled={selectedComments.length === 0}
                        className="transition-colors hover:text-foreground disabled:opacity-40"
                      >
                        Clear
                      </button>
                    </div>
                    <span className="tabular-nums">{selectedComments.length} selected</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={selectedComments.length === 0}
                      onClick={() => sendComments(comments.filter((c) => selectedComments.includes(c.id)))}
                      className="h-7 rounded-md bg-secondary px-2 text-[11px] font-medium text-secondary-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
                    >
                      Send selected
                    </button>
                    <button
                      type="button"
                      disabled={comments.length === 0}
                      onClick={() => sendComments(comments)}
                      className="h-7 rounded-md bg-white px-2 text-[11px] font-medium text-black transition-colors hover:bg-white/85 disabled:pointer-events-none disabled:opacity-40"
                    >
                      Send all ({comments.length})
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={exportMarkdown} title="Export as Markdown">
            <Download className="size-3.5" />Export
          </Button>
          <button
            type="button"
            onClick={() => onSendToAgent({})}
            className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 text-xs font-medium text-black transition-colors hover:bg-white/85"
          >
            Send to agent
            <ArrowRight className="size-3.5" />
          </button>
          <ToolbarButton label="Close document" onClick={onClose}>
            <X className="size-4" />
          </ToolbarButton>
        </div>
      </header>
      {saveError&&<p role="alert" className="border-b border-border px-4 py-2 text-xs leading-5 text-destructive">{saveError}</p>}

      {/* Body */}
      <div ref={bodyRef} data-doc-body="true" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-8 py-9 text-[15px] leading-7 text-foreground/90">
          {blocks.map((b, i) => {
            const r = ranges[i];
            return (
              <BlockView
                key={b.id}
                block={b}
                lineStart={r?.start ?? 0}
                highlighted={r ? isHighlighted(r.start, r.end) : false}
                onChange={(nb) => update(b.id, () => nb)}
                onRemove={() => remove(b.id)}
                onOpenColor={(field, occ, x, y) => openColor(b.id, field, occ, x, y)}
              />
            );
          })}
          {blocks.length === 0 && (
            <p className="text-sm text-muted-foreground">Empty document — use + to add a block.</p>
          )}
        </div>
      </div>

      {/* Selection toolbar */}
      {sel && (
        <div
          data-sel-toolbar="true"
          style={{ position: "fixed", left: Math.max(12, sel.x - 110), top: Math.max(8, sel.y - 48), zIndex: 150 }}
          className="animate-pop flex items-center gap-1 rounded-xl border border-border bg-[#141414] p-1 shadow-2xl shadow-black/70"
        >
          {commentDraft === null ? (
            <>
              <button
                type="button"
                onClick={() => setCommentDraft("")}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs text-foreground transition-colors hover:bg-accent"
              >
                <MessageSquarePlus className="size-3.5 text-taro" />Add comment
              </button>
              <span className="h-4 w-px bg-border" />
              <button
                type="button"
                onClick={() => {
                  onSendToAgent({ quote: sel.quote, range: { startLine: sel.startLine, endLine: sel.endLine } });
                  setSel(null);
                  window.getSelection()?.removeAllRanges();
                }}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs text-foreground transition-colors hover:bg-accent"
              >
                Send to agent<ArrowRight className="size-3.5" />
              </button>
            </>
          ) : (
            <div className="flex w-72 items-center gap-1.5 p-1">
              <Input
                autoFocus
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && commentDraft.trim()) {
                    onAddComment({ startLine: sel.startLine, endLine: sel.endLine, quote: sel.quote }, commentDraft.trim());
                    setCommentDraft(null);
                    setSel(null);
                    window.getSelection()?.removeAllRanges();
                  }
                  if (e.key === "Escape") setCommentDraft(null);
                }}
                placeholder={`Comment on L${sel.startLine}${sel.endLine !== sel.startLine ? `-${sel.endLine}` : ""}…`}
                aria-label="Comment text"
                className="h-7 flex-1 text-xs"
              />
              <Button
                size="sm"
                disabled={!commentDraft.trim()}
                onClick={() => {
                  onAddComment({ startLine: sel.startLine, endLine: sel.endLine, quote: sel.quote }, commentDraft.trim());
                  setCommentDraft(null);
                  setSel(null);
                  window.getSelection()?.removeAllRanges();
                }}
              >
                <Check className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {picker && (
        <ColorPicker hex={picker.hex} x={picker.x} y={picker.y} onChange={onColorChange} onClose={() => setPicker(null)} />
      )}

    </aside>
  );
}

/* ------------------------------------------------------------------
 * Toolbar button
 * ------------------------------------------------------------------ */

function ToolbarButton({ label, onClick, active, children }: { label: string; onClick?: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------
 * Color helpers on blocks
 * ------------------------------------------------------------------ */

function getField(b: Block, field: string): string {
  if (field === "text" && "text" in b) return b.text;
  if (field === "code" && b.type === "code") return b.code;
  const item = field.match(/^item:(\d+)$/);
  if (item && (b.type === "bulleted" || b.type === "numbered")) return b.items[+item[1]] ?? "";
  if (item && b.type === "checklist") return b.items[+item[1]]?.text ?? "";
  const hdr = field.match(/^hdr:(\d+)$/);
  if (hdr && b.type === "table") return b.header[+hdr[1]] ?? "";
  const cell = field.match(/^cell:(\d+):(\d+)$/);
  if (cell && b.type === "table") return b.rows[+cell[1]]?.[+cell[2]] ?? "";
  return "";
}

function setField(b: Block, field: string, value: string): Block {
  if (field === "text" && "text" in b) return { ...b, text: value } as Block;
  if (field === "code" && b.type === "code") return { ...b, code: value };
  const item = field.match(/^item:(\d+)$/);
  if (item && (b.type === "bulleted" || b.type === "numbered")) {
    const items = [...b.items];
    items[+item[1]] = value;
    return { ...b, items };
  }
  if (item && b.type === "checklist") {
    const items = b.items.map((it, i) => (i === +item[1] ? { ...it, text: value } : it));
    return { ...b, items };
  }
  const hdr = field.match(/^hdr:(\d+)$/);
  if (hdr && b.type === "table") {
    const header = [...b.header];
    header[+hdr[1]] = value;
    return { ...b, header };
  }
  const cell = field.match(/^cell:(\d+):(\d+)$/);
  if (cell && b.type === "table") {
    const rows = b.rows.map((r) => [...r]);
    rows[+cell[1]][+cell[2]] = value;
    return { ...b, rows };
  }
  return b;
}

function replaceInField(b: Block, field: string, occ: ColorOccurrence, hex: string): Block {
  const cur = getField(b, field);
  return setField(b, field, cur.slice(0, occ.start) + hex + cur.slice(occ.end));
}

/* Matches bold, inline code, and hex / rgb() colour literals. */
const INLINE_RE =
  /(\*\*[^*]+\*\*|`[^`]+`|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b)/g;

type ColorOpen = (occ: ColorOccurrence, x: number, y: number) => void;

/** Inline HTML for the editable surface: bold, code, and interactive color chips. */
function inlineHtml(value: string): string {
  if (!value) return "";
  const re = new RegExp(INLINE_RE.source, "g");
  let html = "";
  let last = 0;
  let m: RegExpExecArray | null;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  while ((m = re.exec(value))) {
    if (m.index > last) html += esc(value.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) html += `<strong>${esc(tok.slice(2, -2))}</strong>`;
    else if (tok.startsWith("`")) html += `<code class="rounded bg-white/[0.07] px-1 font-mono text-[0.85em]">${esc(tok.slice(1, -1))}</code>`;
    else {
      const hex = colorToHex(tok);
      if (hex) {
        html +=
          `<span data-color-hex="${esc(hex)}" contenteditable="false" title="Edit ${esc(hex)}" ` +
          `class="mx-px inline-flex cursor-pointer items-center gap-1 rounded-[5px] px-1 align-baseline hover:bg-white/[0.07]">` +
          `<span contenteditable="false" class="inline-block size-3 rounded-[3px] ring-1 ring-inset ring-white/25" style="background-color:${esc(hex)}"></span>` +
          `<span class="font-mono text-[12px] text-foreground/90">${esc(tok)}</span></span>`;
      } else html += esc(tok);
    }
    last = m.index + tok.length;
  }
  if (last < value.length) html += esc(value.slice(last));
  return html;
}

/**
 * A directly-editable rich text field. Click anywhere and type — no
 * double-click. Selection still works, so the comment toolbar can appear.
 * Colour chips inside are non-editable nodes that open the picker.
 */
function EditableText({
  value,
  onCommit,
  onOpenColor,
  className,
  placeholder,
  mono,
  multiline,
  as = "span",
}: {
  value: string;
  onCommit: (v: string) => void;
  onOpenColor: ColorOpen;
  className?: string;
  placeholder?: string;
  mono?: boolean;
  multiline?: boolean;
  as?: "span" | "div";
}) {
  const ref = React.useRef<HTMLElement>(null);
  const focused = React.useRef(false);
  const latest = React.useRef(value);
  latest.current = value;

  React.useEffect(() => {
    const el = ref.current;
    if (!el || focused.current) return;
    const html = inlineHtml(value);
    if (el.innerHTML !== html) el.innerHTML = html || "";
    if (!value) el.dataset.empty = "true";
    else delete el.dataset.empty;
  }, [value]);

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    const text = (el.innerText ?? "").replace(/\u00a0/g, " ");
    if (text !== latest.current) onCommit(text);
  };

  const Tag = as as "span";
  return (
    <Tag
      ref={ref as React.RefObject<HTMLSpanElement>}
      role="textbox"
      aria-multiline={multiline}
      aria-label={placeholder ?? "Edit text"}
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      data-editable="true"
      data-placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; commit(); const el = ref.current; if (el) { const html = inlineHtml(latest.current); if (el.innerHTML !== html) el.innerHTML = html; } }}
      onInput={() => { const el = ref.current; if (el) { el.dataset.empty = el.innerText.trim() ? "false" : "true"; } }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { const el = ref.current; if (el) { el.innerHTML = inlineHtml(latest.current); el.blur(); } }
        if (e.key === "Enter" && !multiline) { e.preventDefault(); (e.target as HTMLElement).blur(); }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
      onClick={(e) => {
        const chip = (e.target as HTMLElement).closest("[data-color-hex]") as HTMLElement | null;
        if (!chip) return;
        e.stopPropagation();
        e.preventDefault();
        const hex = chip.dataset.colorHex ?? "#000000";
        const occ: ColorOccurrence = { start: 0, end: hex.length, value: hex, hex };
        onOpenColor(occ, e.clientX, e.clientY);
      }}
      className={cn(
        "block cursor-text rounded-md px-1.5 py-0.5 -mx-1.5 whitespace-pre-wrap outline-none transition-[background-color,box-shadow]",
        "hover:bg-white/[0.03] focus:bg-white/[0.04] focus:ring-2 focus:ring-taro/25",
        "empty:before:pointer-events-none empty:before:text-muted-foreground/40 empty:before:content-[attr(data-placeholder)]",
        mono && "font-mono text-[12.5px]",
        className
      )}
    />
  );
}

/* ------------------------------------------------------------------
 * Block view
 * ------------------------------------------------------------------ */

function BlockView({
  block,
  lineStart,
  highlighted,
  onChange,
  onRemove,
  onOpenColor,
}: {
  block: Block;
  lineStart: number;
  highlighted: boolean;
  onChange: (b: Block) => void;
  onRemove: () => void;
  onOpenColor: (field: string, occ: ColorOccurrence, x: number, y: number) => void;
}) {
  const colorFor = (field: string): ColorOpen => (occ, x, y) => onOpenColor(field, occ, x, y);

  const wrap = (node: React.ReactNode, extra?: string) => (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      data-line-start={lineStart}
      className={cn(
        "group/block relative -mx-3 rounded-lg px-3 py-0.5 transition-colors",
        highlighted && "bg-taro/15 ring-1 ring-taro/40",
        extra
      )}
    >
      {node}
      <button
        type="button"
        aria-label="Delete block"
        onClick={onRemove}
        className="absolute -right-7 top-1 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/block:opacity-100 hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );

  switch (block.type) {
    case "heading": {
      const cls =
        block.level === 1 ? "my-3 text-2xl font-semibold tracking-tight"
        : block.level === 2 ? "mt-5 mb-2 text-lg font-semibold tracking-tight"
        : "mt-4 mb-1.5 text-base font-semibold";
      return wrap(<EditableText value={block.text} onCommit={(t) => onChange({ ...block, text: t })} onOpenColor={colorFor("text")} className={cls} />);
    }
    case "paragraph":
      return wrap(<EditableText multiline value={block.text} onCommit={(t) => onChange({ ...block, text: t })} onOpenColor={colorFor("text")} className="my-1.5 whitespace-pre-wrap" />);
    case "quote":
      return wrap(
        <blockquote className="my-2 border-l-2 border-taro/50 pl-3 text-[14px] text-foreground/75 italic">
          <EditableText multiline value={block.text} onCommit={(t) => onChange({ ...block, text: t })} onOpenColor={colorFor("text")} />
        </blockquote>
      );
    case "divider":
      return wrap(<hr className="my-4 border-border" />);
    case "code":
      return wrap(
        <div className="my-3 overflow-hidden rounded-lg border border-border bg-[#08080a]">
          <div className="flex items-center gap-2 border-b border-border px-3 py-1">
            <Code className="size-3 text-muted-foreground" />
            <input
              value={block.lang}
              onChange={(e) => onChange({ ...block, lang: e.target.value })}
              aria-label="Code language"
              className="w-20 bg-transparent font-mono text-[11px] text-muted-foreground outline-none"
            />
          </div>
          <div className="p-3">
            <EditableText mono multiline value={block.code} onCommit={(t) => onChange({ ...block, code: t })} onOpenColor={colorFor("code")} />
          </div>
        </div>
      );
    case "date":
      return wrap(
        <label className="my-2 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px]">
          <Calendar className="size-3.5 text-muted-foreground" />
          <input
            type="date"
            value={block.value}
            onChange={(e) => onChange({ ...block, value: e.target.value })}
            aria-label="Date"
            className="bg-transparent text-foreground outline-none [color-scheme:dark]"
          />
        </label>
      );
    case "dropdown":
      return wrap(
        <div className="my-2 flex flex-wrap items-center gap-2">
          <input
            value={block.label}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            aria-label="Dropdown label"
            className="rounded-md bg-transparent px-1 text-[13px] text-muted-foreground outline-none hover:bg-white/[0.03] focus:bg-white/[0.05]"
          />
          <select
            value={block.selected}
            onChange={(e) => onChange({ ...block, selected: Number(e.target.value) })}
            aria-label={block.label}
            className="h-8 rounded-lg border border-border bg-card px-2.5 text-[13px] text-foreground outline-none"
          >
            {block.options.map((o, i) => <option key={i} value={i}>{o}</option>)}
          </select>
          <button
            type="button"
            onClick={() => {
              const o = window.prompt("New option");
              if (o?.trim()) onChange({ ...block, options: [...block.options, o.trim()] });
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >+ option</button>
        </div>
      );
    case "bulleted":
    case "numbered":
      return wrap(
        <ol className="my-2 space-y-1">
          {block.items.map((it, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="flex h-7 w-4 shrink-0 items-center justify-end text-[12px] text-muted-foreground">
                {block.type === "numbered" ? `${i + 1}.` : <span className="size-1.5 rounded-full bg-muted-foreground/50" />}
              </span>
              <div className="min-w-0 flex-1">
                <EditableText
                  value={it}
                  onCommit={(t) => { const items = [...block.items]; items[i] = t; onChange({ ...block, items }); }}
                  onOpenColor={colorFor(`item:${i}`)}
                />
              </div>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => onChange({ ...block, items: [...block.items, "New item"] })} className="ml-6 text-[11px] text-muted-foreground hover:text-foreground">+ item</button>
          </li>
        </ol>
      );
    case "checklist":
      return wrap(
        <ul className="my-2 space-y-1">
          {block.items.map((it, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={it.checked}
                onClick={() => onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)) })}
                className={cn(
                  "mt-[6px] flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                  it.checked ? "border-success/50 bg-success/20 text-success" : "border-border text-transparent hover:border-muted-foreground"
                )}
              >
                <Check className="size-3" strokeWidth={3} />
              </button>
              <div className={cn("min-w-0 flex-1", it.checked && "text-muted-foreground line-through decoration-white/20")}>
                <EditableText
                  value={it.text}
                  onCommit={(t) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, text: t } : x)) })}
                  onOpenColor={colorFor(`item:${i}`)}
                />
              </div>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { checked: false, text: "New task" }] })} className="ml-6 text-[11px] text-muted-foreground hover:text-foreground">+ task</button>
          </li>
        </ul>
      );
    case "table":
      return wrap(
        <div className="my-3">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-white/[0.02]">
                  {block.header.map((h, ci) => (
                    <th key={ci} className="px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      <EditableText value={h} onCommit={(t) => { const header = [...block.header]; header[ci] = t; onChange({ ...block, header }); }} onOpenColor={colorFor(`hdr:${ci}`)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-border last:border-0">
                    {block.header.map((_, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-[13px] text-foreground/85">
                        <EditableText
                          value={row[ci] ?? ""}
                          onCommit={(t) => { const rows = block.rows.map((r) => [...r]); rows[ri][ci] = t; onChange({ ...block, rows }); }}
                          onOpenColor={colorFor(`cell:${ri}:${ci}`)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
            <button type="button" onClick={() => onChange({ ...block, rows: [...block.rows, block.header.map(() => "")] })} className="hover:text-foreground">+ row</button>
            <button type="button" onClick={() => onChange({ ...block, header: [...block.header, `Column ${String.fromCharCode(65 + block.header.length)}`], rows: block.rows.map((r) => [...r, ""]) })} className="hover:text-foreground">+ column</button>
          </div>
        </div>
      );
    case "image":
      return wrap(
        <figure className="my-3 overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <Image className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/85" title={block.src}>
              {imageLabel(block.src)}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground/70">
              {/^https?:/i.test(block.src) ? "web" : "local file"}
            </span>
          </div>
          {block.alt && (
            <figcaption className="border-t border-border px-3 py-1.5 text-[12px] text-muted-foreground">
              <EditableText value={block.alt} onCommit={(t) => onChange({ ...block, alt: t })} onOpenColor={colorFor("text")} placeholder="Caption" />
            </figcaption>
          )}
        </figure>
      );
  }
}
