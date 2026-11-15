import * as React from "react";
import { ArrowDown, ArrowUp, Check, CheckCheck, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Frame, Image, Layers, LockKeyhole, MessageSquare, Plus, RotateCcw, Search, Square, StickyNote, Trash2, UnlockKeyhole } from "lucide-react";
import type { LayoutAnnotation, SkeletalLayerData } from "@/data/mock";
import type { EditorMedia } from "./skeletal-editor";
import type { DesignerDocument } from "./designer-state";
import { IconButton, MARKUP, SHAPES, type DesignerTool, type ShapeKind } from "./designer-tools";
import { cn } from "@/utils/cn";

interface LayersProps {
  doc: DesignerDocument; selectedId: string | null; backgrounds: EditorMedia[];
  onSelect: (id: string) => void; onPatch: (id: string, patch: Partial<SkeletalLayerData>) => void;
  onInsert: (kind: ShapeKind) => void; onTool: (tool: DesignerTool) => void;
  onContext: (menu: { x: number; y: number; id: string }) => void; onReset: () => void; onBackground: (media: EditorMedia) => void;
}
export function DesignerLayers({ doc, selectedId, backgrounds, onSelect, onPatch, onInsert, onTool, onContext, onReset, onBackground }: LayersProps) {
  const [tab, setTab] = React.useState<"layers" | "insert">("layers");
  const [search, setSearch] = React.useState("");
  const [mediaTab, setMediaTab] = React.useState<"all" | "your">("all");
  const filtered = [...doc.layers].sort((a, b) => b.z - a.z).filter(l => l.name.toLowerCase().includes(search.toLowerCase()));
  const media = backgrounds.filter(m => (mediaTab === "all" || m.libraryOrigin || m.creator === "You" || m.source === "upload") && `${m.title} ${m.category}`.toLowerCase().includes(search.toLowerCase()));
  return <><div className="ld-tabs"><button aria-pressed={tab === "layers"} onClick={() => { setTab("layers"); setSearch(""); }}><Layers size={14}/>Layers</button><button aria-pressed={tab === "insert"} onClick={() => { setTab("insert"); setSearch(""); }}><Plus size={14}/>Insert</button></div><label className="ld-search"><Search size={13}/><input aria-label={tab === "layers" ? "Search layers" : "Search media"} placeholder={tab === "layers" ? "Find a layer…" : "Search media…"} value={search} onChange={e => setSearch(e.target.value)}/></label><div className="ld-sidebar-scroll">{tab === "layers" ? <>
    <div className="ld-tree-title"><ChevronDown size={13}/><Frame size={13}/><span>Artboard</span><small>{doc.stage.width} × {doc.stage.height}</small></div>
    <div className="ld-layer-list">{filtered.map(layer => { const Icon = layer.kind === "background" ? Image : SHAPES.find(s => s.id === layer.kind)?.icon ?? Square; return <div key={layer.id} data-layer-row={layer.id} className={cn("ld-layer-row", selectedId === layer.id && "ld-layer-selected", layer.hidden && "ld-layer-hidden")}><button className="ld-layer-name" onClick={() => onSelect(layer.id)} onContextMenu={e => { e.preventDefault(); onSelect(layer.id); onContext({ x: e.clientX, y: e.clientY, id: layer.id }); }} aria-label={`Select ${layer.name}`} aria-pressed={selectedId === layer.id}><ChevronRight size={10}/><Icon size={13}/><span>{layer.name}</span></button><IconButton label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`} icon={layer.locked ? LockKeyhole : UnlockKeyhole} active={layer.locked} onClick={() => onPatch(layer.id, { locked: !layer.locked })}/><IconButton label={`${layer.hidden ? "Show" : "Hide"} ${layer.name}`} icon={layer.hidden ? EyeOff : Eye} onClick={() => onPatch(layer.id, { hidden: !layer.hidden })}/></div>; })}</div>
    {!filtered.length && <p className="ld-empty">No matching layers.</p>}<button className="ld-add-layer" onClick={() => onInsert("rect")}><Plus size={13}/>Add a layer</button>
  </> : <>
    <section className="ld-section"><h3>Shapes & text</h3><div className="ld-insert-grid">{SHAPES.map(s => <button key={s.id} onClick={() => onInsert(s.id)}><s.icon size={20}/><span>{s.label}</span><kbd>{s.key}</kbd></button>)}</div></section>
    <section className="ld-section"><h3>Visual feedback</h3><div className="ld-insert-grid">{MARKUP.map(m => <button key={m.id} onClick={() => onTool(m.id)}><m.icon size={19}/><span>{m.label}</span><kbd>{m.key}</kbd></button>)}</div></section>
    <section className="ld-section"><h3>Media backgrounds</h3><div className="ld-media-tabs"><button aria-pressed={mediaTab === "all"} onClick={() => setMediaTab("all")}>Library</button><button aria-pressed={mediaTab === "your"} onClick={() => setMediaTab("your")}>Your media</button></div><div className="ld-media-grid">{media.slice(0, 30).map(m => <button key={m.id} title={m.title} aria-label={`Use background ${m.title}`} onClick={() => onBackground(m)}>{m.poster ? <img src={m.poster} alt="" loading="lazy"/> : <Image size={24}/>}<span>{m.title}</span></button>)}</div>{!media.length && <p className="ld-empty">No matching media in your library.</p>}</section>
  </>}</div><div className="ld-left-footer"><span><Frame size={13}/>One artboard</span><IconButton label="Reset layout" icon={RotateCcw} onClick={onReset}/></div></>;
}

interface NotesProps {
  annotations: LayoutAnnotation[]; layers: SkeletalLayerData[]; activeNote: string | null; showResolved: boolean;
  onSelect: (id: string) => void; onTool: (tool: DesignerTool) => void; onShowResolved: (value: boolean) => void; onChange: (annotations: LayoutAnnotation[]) => void;
}
export function DesignerNotes({ annotations, layers, activeNote, showResolved, onSelect, onTool, onShowResolved, onChange }: NotesProps) {
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { if (activeNote) inputRef.current?.focus(); }, [activeNote]);
  const patch = (id: string, values: Partial<LayoutAnnotation>) => onChange(annotations.map(a => a.id === id ? { ...a, ...values } : a));
  const visible = annotations.filter(a => showResolved || !a.resolved), count = annotations.filter(a => !a.resolved).length;
  return <><section className="ld-section ld-notes-intro"><div><StickyNote size={17}/><h3>Make your feedback visual</h3></div><p>Point to the detail. Tell the agent what should change.</p><button className="ld-button ld-note-button" onClick={() => onTool("note")}><Plus size={13}/>Pin a note<kbd>N</kbd></button></section><div className="ld-notes-filter"><span>{count} open</span><button aria-pressed={showResolved} onClick={() => onShowResolved(!showResolved)}><CheckCheck size={13}/>{showResolved ? "Hide resolved" : "Show resolved"}</button></div>
    {visible.map(a => <article key={a.id} data-annotation-id={a.id} className={cn("ld-note-card", activeNote === a.id && "ld-note-card-active", a.resolved && "ld-note-card-resolved")} onClick={() => onSelect(a.id)}><div className="ld-note-card-heading"><span className="ld-note-number" style={{ background: a.color }}>{annotations.indexOf(a) + 1}</span><strong>{a.kind === "note" ? "Pinned note" : a.kind === "pen" ? "Freehand markup" : a.kind === "arrow" ? "Arrow" : "Highlight"}</strong><IconButton label={a.resolved ? "Reopen annotation" : "Resolve annotation"} icon={Check} active={a.resolved} onClick={() => patch(a.id, { resolved: !a.resolved })}/><IconButton label="Delete annotation" icon={Trash2} onClick={() => onChange(annotations.filter(item => item.id !== a.id))}/></div><small>{a.layerId ? layers.find(l => l.id === a.layerId)?.name ?? "Deleted layer" : "Artboard"}<span className="ld-dot"/>{Math.round(a.points[0].x)}, {Math.round(a.points[0].y)}</small>{activeNote === a.id ? <textarea ref={inputRef} aria-label="Annotation text" placeholder="What should change here?" value={a.text ?? ""} onChange={e => patch(a.id, { text: e.target.value })} rows={3}/> : <p>{a.text || "Add a description…"}</p>}</article>)}
    {!visible.length && <div className="ld-notes-empty"><MessageSquare size={25}/><strong>{annotations.length ? "All feedback resolved" : "A picture is worth a prompt"}</strong><p>Use the pen, arrow, highlighter, or note tool to describe the changes you have in mind.</p></div>}{visible.length > 0 && <div className="ld-note-hint">Open annotations are attached when you send to the agent.</div>}</>;
}

export function DesignerContextMenu({ menu, layer, onDuplicate, onReorder, onPatch, onRemove }: { menu: { x: number; y: number }; layer?: SkeletalLayerData; onDuplicate: (layer: SkeletalLayerData) => void; onReorder: (id: string, direction: number) => void; onPatch: (id: string, patch: Partial<SkeletalLayerData>) => void; onRemove: (id: string) => void }) {
  if (!layer) return null;
  return <div className="ld-context-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 210), top: Math.min(menu.y, window.innerHeight - 250) }} onPointerDown={e => e.stopPropagation()}><button role="menuitem" onClick={() => onDuplicate(layer)} disabled={layer.kind === "background"}><Copy size={14}/>Duplicate<kbd>Ctrl D</kbd></button><button role="menuitem" onClick={() => onReorder(layer.id, 1)}><ArrowUp size={14}/>Bring forward</button><button role="menuitem" onClick={() => onReorder(layer.id, -1)}><ArrowDown size={14}/>Send backward</button><hr/><button role="menuitem" onClick={() => onPatch(layer.id, { locked: !layer.locked })}><LockKeyhole size={14}/>{layer.locked ? "Unlock" : "Lock"} layer</button><button role="menuitem" onClick={() => onPatch(layer.id, { hidden: !layer.hidden })}><EyeOff size={14}/>{layer.hidden ? "Show" : "Hide"} layer</button><hr/><button role="menuitem" className="ld-danger" disabled={layer.locked} onClick={() => onRemove(layer.id)}><Trash2 size={14}/>Delete<kbd>Del</kbd></button></div>;
}
