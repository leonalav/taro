import * as React from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ArrowUp,
  AtSign,
  Check,
  ChevronRight,
  Crown,
  Mic,
  Paperclip,
  FileText,
  X,
  Square,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { MentionChip } from "@/components/mention-chip";
import { FileIcon } from "@/components/explorer-panel";
import {
  effortLevels,
  effortModes,
  mcpIcon,
  type ChipRef,
  type ChipInsertion,
  type EffortMode,
} from "@/data/mentions";
import type { Segment } from "@/data/mock";
import { MAX_FREE_EFFORT } from "@/data/settings";
import { cn } from "@/utils/cn";
import { useSettings, SettingsUpdateContext } from "@/components/settings/settings-context";
import { RepositoryPicker } from "@/components/repository-picker";
import { PermissionGate } from "@/components/permission-gate";
import type { PermissionRule } from "@/lib/permission-rules";

interface ComposerProps {
  conversationId: string;
  workspaceRoot?: string;
  insertion?: ChipInsertion | null;
  draftInsertion?: {requestId:string;text:string};
  onInsertionConsumed: (requestId: string) => void;
  placeholderTarget: string;
  compact?: boolean;
  disabled?: boolean;
  effort: number;
  onEffortChange: (index: number) => void;
  onSend: (segments: Segment[]) => void;
  onStop?: () => void;
  permissionRules: PermissionRule[];
  onSetPermissionRule: (rule: PermissionRule) => void;
  onRemovePermissionRule: (rule: PermissionRule) => void;
}

const CHIP_CHAR = "\u0001";
/** Effort slider: track height & knob travel inset (px). */
const KNOB = 28;

/* ------------------------------------------------------------------
 * Editor helpers — a contenteditable with non-editable chip nodes
 * ------------------------------------------------------------------ */

interface Placement {
  node: Node;
  offset: number;
}

function serialize(root: HTMLElement) {
  let text = "";
  const segments: { node: Node; start: number; length: number }[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const data = (node as Text).data ?? "";
      segments.push({ node, start: text.length, length: data.length });
      text += data;
      return;
    }
    const el = node as HTMLElement;
    if (el.dataset?.chip) {
      segments.push({ node, start: text.length, length: 1 });
      text += CHIP_CHAR;
      return;
    }
    if (el.tagName === "BR") {
      segments.push({ node, start: text.length, length: 1 });
      text += "\n";
      return;
    }
    el.childNodes.forEach(walk);
  };

  root.childNodes.forEach(walk);

  const sel = window.getSelection();
  let caret = text.length;
  if (sel && sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
    const seg = segments.find((s) => s.node === sel.anchorNode);
    if (seg) caret = seg.start + sel.anchorOffset;
  }

  return { text, segments, caret };
}

function locate(
  root: HTMLElement,
  segments: { node: Node; start: number; length: number }[],
  offset: number
): Placement {
  for (const seg of segments) {
    const end = seg.start + seg.length;
    if (offset < seg.start || offset > end) continue;

    if (seg.node.nodeType === Node.TEXT_NODE) {
      return { node: seg.node, offset: Math.min(Math.max(offset - seg.start, 0), seg.length) };
    }
    const parent = seg.node.parentNode;
    if (!parent) continue;
    const index = Array.prototype.indexOf.call(parent.childNodes, seg.node);
    return { node: parent, offset: offset === seg.start ? index : index + 1 };
  }
  return { node: root, offset: root.childNodes.length };
}

interface ActiveToken {
  kind: "mention" | "skill";
  query: string;
  start: number;
  end: number;
}

function findActiveToken(text: string, caret: number): ActiveToken | null {
  if (caret <= 0) return null;
  let start = -1;

  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "@" || ch === "/") {
      const prev = i === 0 ? " " : text[i - 1];
      if (i === 0 || /\s/.test(prev)) start = i;
      break;
    }
    if (/\s/.test(ch) || ch === CHIP_CHAR) break;
  }

  if (start === -1) return null;
  const query = text.slice(start + 1, caret);
  if (/\s/.test(query) || query.includes(CHIP_CHAR)) return null;

  return { kind: text[start] === "@" ? "mention" : "skill", query, start, end: caret };
}

function toSegments(root: HTMLElement): Segment[] {
  const out: Segment[] = [];
  let pending = "";

  const flush = () => {
    if (pending) {
      out.push({ type: "text", text: pending });
      pending = "";
    }
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pending += (node as Text).data ?? "";
      return;
    }
    const el = node as HTMLElement;
    if (el.dataset?.chip) {
      flush();
      try {
        const chip = JSON.parse(el.dataset.chipValue ?? "null") as ChipRef | null;
        if (chip) out.push({ type: "chip", chip });
      } catch {
        /* ignore malformed chip payloads */
      }
      return;
    }
    if (el.tagName === "BR") {
      pending += "\n";
      return;
    }
    if ((el.tagName === "DIV" || el.tagName === "P") && (pending || out.length) && !pending.endsWith("\n")) pending += "\n";
    el.childNodes.forEach(walk);
  };

  root.childNodes.forEach(walk);

  flush();
  return out.filter((s) => s.type === "chip" || (s.text ?? "").length > 0);
}

function plainText(segments: Segment[]): string {
  return segments
    .map((s) => (s.type === "chip" ? s.chip?.label ?? "" : s.text ?? ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------
 * Composer
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
 * Caret & chip insertion (module scope so they can be unit tested)
 * ------------------------------------------------------------------ */

function placeCaret(placement: Placement) {
  const sel = window.getSelection();
  const range = document.createRange();
  range.setStart(placement.node, placement.offset);
  range.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Insert plain text at the caret, adding a leading space when needed. */
function insertTextAtCaret(el: HTMLElement, value: string): number {
  el.focus();
  const { text, segments, caret } = serialize(el);
  const before = caret > 0 ? text[caret - 1] : " ";
  const needsSpace = !/\s/.test(before) && before !== CHIP_CHAR;
  const payload = (needsSpace ? " " : "") + value;

  const at = locate(el, segments, caret);
  const range = document.createRange();
  range.setStart(at.node, at.offset);
  range.collapse(true);
  const node = document.createTextNode(payload);
  range.insertNode(node);
  placeCaret({ node, offset: node.data.length });
  return payload.length;
}

/** Replace the serialized range [start, end) with a non-editable chip. */
function insertChip(el: HTMLElement, chip: ChipRef, range: { start: number; end: number }) {
  el.focus();
  const { segments } = serialize(el);
  const from = locate(el, segments, range.start);
  const to = locate(el, segments, range.end);

  const domRange = document.createRange();
  domRange.setStart(from.node, from.offset);
  domRange.setEnd(to.node, to.offset);
  domRange.deleteContents();

  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(<MentionChip chip={chip} removable />);
  const chipEl = template.content.firstElementChild!;

  domRange.insertNode(chipEl);

  // Always follow a chip with a space so typing continues in text.
  const space = document.createTextNode("\u00A0");
  const after = document.createRange();
  after.setStartAfter(chipEl);
  after.collapse(true);
  after.insertNode(space);
  after.setStartAfter(space);
  after.collapse(true);

  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(after);
}

/** Reuse appends a reference to the current draft, never sends a message. */
function appendArtifactChip(root: HTMLElement, chip: ChipRef): boolean {
  if ([...root.querySelectorAll<HTMLElement>("[data-chip]")].some((node) => node.dataset.chip === chip.id)) return false;
  const { text } = serialize(root);
  if (text && !/\s$/.test(text)) root.appendChild(document.createTextNode(" "));
  const end = serialize(root).text.length;
  insertChip(root, chip, { start: end, end });
  return true;
}

/* ------------------------------------------------------------------
 * Composer
 * ------------------------------------------------------------------ */

export function Composer({
  conversationId,
  workspaceRoot,
  insertion,
  draftInsertion,
  onInsertionConsumed,
  placeholderTarget,
  compact,
  disabled,
  effort: effortIdx,
  onEffortChange: setEffortIdx,
  onSend,
  onStop,
  permissionRules,
  onSetPermissionRule,
  onRemovePermissionRule,
}: ComposerProps) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const draftRequestRef=React.useRef<string|undefined>(undefined);
  React.useEffect(()=>{const editor=editorRef.current;if(!editor||disabled||!draftInsertion||draftRequestRef.current===draftInsertion.requestId)return;draftRequestRef.current=draftInsertion.requestId;insertTextAtCaret(editor,draftInsertion.text);editor.dispatchEvent(new Event("input",{bubbles:true}));},[draftInsertion,disabled]);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const attachmentDrafts = React.useRef(new Map<string, NonNullable<Segment["attachment"]>[]>());
  const [attachments,setAttachments] = React.useState<NonNullable<Segment["attachment"]>[]>([]);
  const [attachmentError,setAttachmentError] = React.useState("");
  const draftsRef = React.useRef(new Map<string, string>());
  const appliedRequestRef = React.useRef<string | null>(null);
  const [token, setToken] = React.useState<ActiveToken | null>(null);
  const [menuDismissed, setMenuDismissed] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const [effortMode, setEffortMode] = React.useState<EffortMode>("thinking");
  const [effortOpen, setEffortOpen] = React.useState(false);
  const [effortView, setEffortView] = React.useState<"main" | "levels" | "modes">("main");
  React.useEffect(()=>{if(disabled){setToken(null);setEffortOpen(false);setMenuDismissed(true);}},[disabled]);

  const effort = effortLevels[Math.min(effortIdx, MAX_FREE_EFFORT)];
  const {skills:settingsSkills,plugins,sourceControl} = useSettings();
  const updateSettings=React.useContext(SettingsUpdateContext);
  const [mentionFiles,setMentionFiles]=React.useState<ChipRef[]>([]);
  React.useEffect(()=>{
    let active=true;
    const load=()=>{if(!workspaceRoot||!isTauri()){setMentionFiles([]);return;}void invoke<string[]>("list_workspace_files",{workspaceRoot}).then(paths=>{if(active)setMentionFiles(paths.map(path=>({id:`file:${path}`,kind:"file" as const,label:path})));}).catch(error=>{console.error(error);if(active)setMentionFiles([]);});};
    load();window.addEventListener("taro:workspace-changed",load);
    return()=>{active=false;window.removeEventListener("taro:workspace-changed",load);};
  },[workspaceRoot]);

  React.useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = draftsRef.current.get(conversationId) ?? "";
    setAttachments(attachmentDrafts.current.get(conversationId) ?? []);
    setToken(null);
    return () => {
      draftsRef.current.set(conversationId, editor.innerHTML);
    };
  }, [conversationId]);

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor || disabled || !insertion || insertion.threadId !== conversationId) return;
    if (appliedRequestRef.current === insertion.requestId) return;
    appliedRequestRef.current = insertion.requestId;
    appendArtifactChip(editor, insertion.chip);
    setToken(null);
    onInsertionConsumed(insertion.requestId);
    // Modal focus restoration runs on unmount; focus the composer after it.
    requestAnimationFrame(() => {
      if (!editor.isConnected) return;
      editor.focus();
      placeCaret({ node: editor, offset: editor.childNodes.length });
    });
  }, [conversationId, insertion, onInsertionConsumed, disabled]);

  /* ---- token tracking ------------------------------------------- */

  const readToken = React.useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const { text, caret } = serialize(el);
    setToken(findActiveToken(text, caret));
  }, []);

  React.useEffect(() => {
    const onSelectionChange = () => {
      const el = editorRef.current;
      const sel = window.getSelection();
      if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) return;
      readToken();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [readToken]);

  /* ---- menu items ------------------------------------------------ */

  const items: ChipRef[] = React.useMemo(() => {
    if (!token) return [];
    const q = token.query.trim().toLowerCase();
    if (token.kind === "mention") {
      const files = mentionFiles.filter((f) => f.label.toLowerCase().includes(q));
      const mcps:ChipRef[] = plugins.filter(plugin=>plugin.kind==="MCP"&&plugin.enabled&&plugin.transport&&(plugin.command||plugin.url)).map(plugin=>({id:`mcp:${plugin.id}`,kind:"mcp" as const,label:plugin.name,description:plugin.description})).filter(m=>m.label.toLowerCase().includes(q));
      return [...files, ...mcps];
    }
    return settingsSkills
      .filter((s) => s.enabled && s.label.toLowerCase().includes(q))
      .map((s) => ({
        id: "skill:" + s.label,
        kind: "skill" as const,
        label: s.label,
        description: s.description,
      }));
  }, [token, settingsSkills, mentionFiles, plugins]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [token?.kind, token?.query]);

  const choose = (chip: ChipRef) => {
    const el = editorRef.current;
    if (!el || !token) return;
    insertChip(el, chip, { start: token.start, end: token.end });
    setToken(null);
    setMenuDismissed(false);
  };

  const handleSend = () => {
    const el = editorRef.current;
    if (!el || disabled) return;
    const segments = [...toSegments(el),...attachments.map(attachment=>({type:"attachment" as const,attachment}))];
    if (!segments.some((segment) => segment.type === "chip" || segment.type === "attachment" || Boolean(segment.text?.trim()))) return;
    onSend(segments);
    el.innerHTML = "";
    setAttachments([]);
    attachmentDrafts.current.delete(conversationId);
    setToken(null);
  };
  const addFiles = async (files: FileList | File[]) => {
    const next: NonNullable<Segment["attachment"]>[]=[];
    for(const file of Array.from(files)) {
      if(file.size > 8*1024*1024) { setAttachmentError(`${file.name} exceeds the 8 MB attachment limit.`); continue; }
      const image=/^image\/(png|jpeg|gif|webp|bmp|avif)$/.test(file.type) || /\.(png|jpe?g|jfif|gif|webp|bmp|avif)$/i.test(file.name);
      const imageMime=/\.png$/i.test(file.name)?"image/png":/\.gif$/i.test(file.name)?"image/gif":/\.webp$/i.test(file.name)?"image/webp":"image/jpeg";
      const mime=image?(file.type.startsWith("image/")?file.type:imageMime):(file.type||"application/octet-stream");
      const rawDataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
      const dataUrl=rawDataUrl.replace(/^data:[^;]*/,`data:${mime}`);
      const readable=/^(text\/|application\/(json|xml|javascript))/.test(mime) || /\.(md|txt|csv|tsv|json|xml|ya?ml|log|py|ts|tsx|js|jsx|css|html|rs)$/i.test(file.name);
      next.push({id:crypto.randomUUID(),name:file.name,mime,size:file.size,dataUrl,text:readable?await file.text():undefined});
    }
    setAttachments(current=>{const merged=[...current,...next];attachmentDrafts.current.set(conversationId,merged);return merged;});
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (token && items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(items[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuDismissed(true);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const menuOpen = Boolean(token) && !menuDismissed && (token?.kind === "skill" || items.length > 0);

  /* ---- render ---------------------------------------------------- */

  return (
    <div className="chat-composer relative">
      {menuOpen && (
        <MenuPanel
          kind={token!.kind}
          items={items}
          activeIndex={activeIndex}
          query={token!.query}
          onHover={setActiveIndex}
          onChoose={choose}
        />
      )}

      <div className="chat-composer__box rounded-2xl border border-input bg-card/90 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur transition-[border-color,box-shadow] focus-within:border-taro/40 focus-within:ring-4 focus-within:ring-taro/10" onDragOver={e=>{if(e.dataTransfer.types.includes("Files"))e.preventDefault();}} onDrop={e=>{if(!e.dataTransfer.files.length)return;e.preventDefault();if(!disabled)void addFiles(e.dataTransfer.files).catch(err=>setAttachmentError(String(err)));}}>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={e=>{if(e.target.files) void addFiles(e.target.files).catch(err=>setAttachmentError(String(err)));e.target.value="";}} />
        {attachments.length>0 && <div className="flex gap-2 overflow-x-auto px-3 pt-3">{attachments.map(file=><div key={file.id} className="group relative shrink-0 overflow-hidden rounded-xl border border-border bg-background/70">{file.dataUrl?<img src={file.dataUrl} alt={file.name} className="size-28 object-cover"/>:<div className="flex h-28 w-36 flex-col items-center justify-center gap-2"><FileText className="size-6 text-muted-foreground"/><span className="w-32 truncate text-center text-xs">{file.name}</span></div>}<button type="button" aria-label={`Remove ${file.name}`} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white" onClick={()=>setAttachments(current=>{const rest=current.filter(f=>f.id!==file.id);attachmentDrafts.current.set(conversationId,rest);return rest;})}><X className="size-3"/></button></div>)}</div>}
        {attachmentError && <p role="alert" className="px-4 pt-2 text-xs text-red-400">{attachmentError}</p>}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label="Message"
          contentEditable={!disabled}
          suppressContentEditableWarning
          data-placeholder={`Send a message about ${placeholderTarget}`}
          onInput={() => {
            setMenuDismissed(false);
            readToken();
          }}
          onKeyDown={onKeyDown}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest("[data-remove-chip]")) e.preventDefault();
          }}
          onClick={(e) => {
            const remove = (e.target as HTMLElement).closest("[data-remove-chip]");
            if (!remove) return;
            remove.closest("[data-chip]")?.remove();
            const editor = editorRef.current;
            if (editor && !editor.querySelector("[data-chip]") && !editor.textContent?.trim()) editor.replaceChildren();
            readToken();
          }}
          onPaste={(e) => {
            if(e.clipboardData.files.length) { e.preventDefault(); void addFiles(e.clipboardData.files).catch(err=>setAttachmentError(String(err))); return; }
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          className={cn(
            "scrollbar-thin max-h-40 min-h-[56px] w-full overflow-y-auto px-4 pt-3.5 text-[15px] leading-7 text-foreground outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
            disabled && "opacity-60"
          )}
        />

        <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5">
          <EffortChooser
            label={effort.label}
            open={effortOpen}
            view={effortView}
            index={effortIdx}
            mode={effortMode}
            onOpenChange={(open) => {
              setEffortOpen(open);
              setEffortView("main");
            }}
            onViewChange={setEffortView}
            onIndexChange={setEffortIdx}
            onModeChange={setEffortMode}
          />

          <Button variant="ghost" size="icon-sm" aria-label="Dictate" title="Dictate">
            <Mic />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Attach files" title="Attach files" disabled={disabled} onClick={()=>fileRef.current?.click()}><Paperclip /></Button>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Mention a file or MCP server"
            title="Mention a file or MCP server (@)"
            onClick={() => {
              const el = editorRef.current;
              if (!el) return;
              setMenuDismissed(false);
              insertTextAtCaret(el, "@");
              readToken();
            }}
          >
            <AtSign />
          </Button>

          <button
            type="button"
            aria-label="Insert a slash command"
            title="Insert a slash command (/)"
            onClick={() => {
              const el = editorRef.current;
              if (!el) return;
              setMenuDismissed(false);
              insertTextAtCaret(el, "/");
              readToken();
            }}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span className="text-[15px] leading-none">/</span>
          </button>

          <RepositoryPicker sourceControl={sourceControl} workspaceRoot={workspaceRoot} patch={patch=>updateSettings({sourceControl:{...sourceControl,...patch}})} />
          <PermissionGate rules={permissionRules} plugins={plugins} onSet={onSetPermissionRule} onRemove={onRemovePermissionRule} />

          <div className="ml-auto flex items-center gap-2">
            {!compact && (
              <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground md:inline-flex">
                <Kbd>⏎</Kbd> send
              </span>
            )}
            <button
              type="button"
              onClick={disabled ? onStop : handleSend}
              aria-label={disabled ? "Stop response" : "Send message"}
              className={cn(
                "chat-composer__send flex size-8 items-center justify-center rounded-full bg-foreground text-background transition-[transform,opacity] duration-150 hover:scale-105 active:scale-95"
              )}
            >
              {disabled ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" strokeWidth={2.25} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
 * Mention / skill menu
 * ------------------------------------------------------------------ */

function MenuPanel({
  kind,
  items,
  activeIndex,
  query,
  onHover,
  onChoose,
}: {
  kind: "mention" | "skill";
  items: ChipRef[];
  activeIndex: number;
  query: string;
  onHover: (index: number) => void;
  onChoose: (chip: ChipRef) => void;
}) {
  const groups = React.useMemo(() => {
    if (kind === "skill") return [{ title: "Skills", items }];
    return [
      { title: "Files", items: items.filter((i) => i.kind === "file") },
      { title: "MCP servers", items: items.filter((i) => i.kind === "mcp") },
    ].filter((g) => g.items.length > 0);
  }, [kind, items]);

  let flatIndex = -1;

  return (
    <div className="animate-pop absolute bottom-full left-0 z-50 mb-2 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-black/70">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] tracking-wide text-muted-foreground uppercase">
        {kind === "mention" ? "Mention files & MCP" : "Skills"}
        <span className="ml-auto font-mono text-[10px] normal-case opacity-70">
          {query ? `“${query}”` : "type to filter"}
        </span>
      </div>

      <div className="scrollbar-thin max-h-64 overflow-y-auto p-1">
        {items.length===0&&<p className='px-3 py-4 text-xs text-muted-foreground'>No enabled workspace skills found. Open a workspace and import or enable skills in Settings → Plugins.</p>}
        {groups.map((group) => (
          <div key={group.title}>
            <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground">{group.title}</p>
            {group.items.map((item) => {
              flatIndex += 1;
              const index = flatIndex;
              const active = index === activeIndex;
              const Icon = item.kind === "mcp" ? mcpIcon[item.id] ?? Plug : undefined;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-menu-item={item.id}
                  onMouseEnter={() => onHover(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onChoose(item)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    active ? "bg-accent text-foreground" : "text-muted-foreground"
                  )}
                >
                  {item.kind === "file" ? <FileIcon name={item.label} className="size-4"/> : Icon ? (
                    <Icon className="size-4 shrink-0 text-emerald-400" strokeWidth={1.75} />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-foreground">
                      {item.kind === "skill" ? `/${item.label}` : item.label}
                    </span>
                    {item.description && (
                      <span className="block truncate text-[11px] text-muted-foreground/80">
                        {item.description}
                      </span>
                    )}
                  </span>
                  {item.kind === "mcp" && (
                    <span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground">
                      MCP
                    </span>
                  )}
                  {active && <span className="shrink-0 text-[10px] text-muted-foreground">⏎</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
 * Thinking effort chooser
 * ------------------------------------------------------------------ */

function EffortChooser({
  label,
  open,
  view,
  index,
  mode,
  onOpenChange,
  onViewChange,
  onIndexChange,
  onModeChange,
}: {
  label: string;
  open: boolean;
  view: "main" | "levels" | "modes";
  index: number;
  mode: EffortMode;
  onOpenChange: (open: boolean) => void;
  onViewChange: (view: "main" | "levels" | "modes") => void;
  onIndexChange: (index: number) => void;
  onModeChange: (mode: EffortMode) => void;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const activeMode = effortModes.find((m) => m.id === mode) ?? effortModes[0];

  // Max is a Lite+ feature: the slider stops at High.
  const safeIndex = Math.min(index, MAX_FREE_EFFORT);
  const lastIndex = effortLevels.length - 1;

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const setFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left - KNOB / 2) / (rect.width - KNOB)));
    let idx = Math.round(pct * lastIndex);
    if (idx > MAX_FREE_EFFORT) idx = MAX_FREE_EFFORT;
    onIndexChange(idx);
  };

  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setFromClientX(e.clientX);

    const move = (ev: PointerEvent) => setFromClientX(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const pct = (safeIndex / lastIndex) * 100;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          onViewChange("main");
          onOpenChange(!open);
        }}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:border-[#333] hover:text-foreground",
          open && "border-taro/40 text-foreground"
        )}
      >
        <span className="tabular-nums">{label}</span>
        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="animate-pop absolute bottom-full left-0 z-50 mb-2 w-[288px] rounded-2xl border border-border bg-popover p-1.5 shadow-2xl shadow-black/70">
          {view === "main" && (
            <>
              <button
                type="button"
                onClick={() => onViewChange("levels")}
                className="mx-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent"
              >
                {label}
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </button>

              <div className="px-1.5 pt-1.5 pb-2">
                <div
                  ref={trackRef}
                  role="slider"
                  tabIndex={0}
                  aria-label="Thinking effort"
                  aria-valuemin={0}
                  aria-valuemax={lastIndex}
                  aria-valuenow={safeIndex}
                  aria-valuetext={label}
                  onPointerDown={onTrackPointerDown}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                      e.preventDefault();
                      onIndexChange(Math.min(index + 1, MAX_FREE_EFFORT));
                    }
                    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                      e.preventDefault();
                      onIndexChange(Math.max(index - 1, 0));
                    }
                  }}
                  className="relative h-7 cursor-pointer touch-none rounded-full bg-white/[0.07] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-blue-600 transition-[width] duration-150"
                    style={{ width: `calc(${KNOB}px + (100% - ${KNOB}px) * ${pct / 100})` }}
                  />
                    {effortLevels.map((level, i) => (
                      <span
                        key={level.label}
                        className={cn(
                          "absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full",
                          i <= safeIndex ? "bg-white/40" : "bg-white/25",
                          level.pro && "bg-white/10"
                        )}
                        style={{ left: `calc(${KNOB / 2}px + (100% - ${KNOB}px) * ${i / lastIndex})` }}
                      />
                    ))}
                  <span
                    className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md shadow-black/40 transition-[left] duration-150"
                    style={{ left: `calc(${KNOB / 2}px + (100% - ${KNOB}px) * ${pct / 100})` }}
                  />
                </div>

                <div className="relative mt-2 h-4 text-[11px]">
                  {effortLevels.map((level, i) => {
                    const first = i === 0;
                    const last = i === lastIndex;
                    const locked = Boolean(level.pro);
                    return (
                      <button
                        key={level.label}
                        type="button"
                        disabled={locked}
                        title={locked ? "Max requires Lite+" : undefined}
                        onClick={() => !locked && onIndexChange(i)}
                        className={cn(
                          "absolute top-0 flex items-center gap-0.5 transition-colors hover:text-foreground",
                          first ? "translate-x-0" : last ? "-translate-x-full" : "-translate-x-1/2",
                          i === safeIndex ? "font-medium text-foreground" : "text-muted-foreground",
                          locked && "cursor-not-allowed opacity-40 hover:text-muted-foreground"
                        )}
                        style={{
                          left: first
                            ? "0px"
                            : last
                              ? "100%"
                              : `calc(${KNOB / 2}px + (100% - ${KNOB}px) * ${i / lastIndex})`,
                        }}
                      >
                        {level.label}
                        {locked && <Crown className="size-2.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-1 border-t border-border px-1 pt-1.5">
                <button
                  type="button"
                  onClick={() => onViewChange("modes")}
                  className="flex h-8 w-full items-center justify-between rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <span className="truncate">{activeMode.label}</span>
                  <ChevronRight className="size-3.5 shrink-0" />
                </button>
              </div>
            </>
          )}

          {view === "levels" && (
            <div className="p-1">
              <button
                type="button"
                onClick={() => onViewChange("main")}
                className="mb-1 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ChevronRight className="size-3 rotate-180" />
                Thinking effort
              </button>
              {effortLevels.map((level, i) => {
                const locked = Boolean(level.pro);
                return (
                <button
                  key={level.label}
                  type="button"
                  disabled={locked}
                  title={locked ? "Max requires Lite+" : undefined}
                  onClick={() => {
                    if (locked) return;
                    onIndexChange(i);
                    onViewChange("main");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    i === safeIndex ? "text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    locked && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px]">
                      {level.label}
                      {locked && <Crown className="size-3 text-amber-400/80" />}
                    </span>
                    <span className="block text-[11px] text-muted-foreground/80">{level.hint}</span>
                  </span>
                  {i === safeIndex && <Check className="size-3.5 shrink-0 text-blue-500" />}
                </button>
              );
              })}
            </div>
          )}

          {view === "modes" && (
            <div className="p-1">
              <button
                type="button"
                onClick={() => onViewChange("main")}
                className="mb-1 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ChevronRight className="size-3 rotate-180" />
                Effort mode
              </button>
              {effortModes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onModeChange(m.id);
                    onViewChange("main");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    m.id === mode ? "text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px]">{m.label}</span>
                    <span className="block text-[11px] text-muted-foreground/80">{m.hint}</span>
                  </span>
                  {m.id === mode && <Check className="size-3.5 shrink-0 text-blue-500" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { plainText };

/** Exposed for headless tests of the editor helpers. */
export const __editor = { serialize, locate, findActiveToken, toSegments, insertChip, insertTextAtCaret, appendArtifactChip };
