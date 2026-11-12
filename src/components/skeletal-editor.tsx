import * as React from "react";
import { ArrowRight, Check, ChevronDown, Download, Frame, Grid2X2, Layers, Maximize, MessageSquare, Minus, Plus, Redo2, Shapes, Square, Undo2, X } from "lucide-react";
import type { LayoutAnnotation, SkeletalLayerData } from "@/data/mock";
import type { MediaItem } from "@/data/media";
import { clamp, constrainFrame, designerId, feedbackInstruction, layoutSvg, makeLayer, starterLayers, type Stage } from "@/lib/layout-designer";
import { cn } from "@/utils/cn";
import { DesignerInspector } from "./designer-inspector";
import { DesignerCanvas } from "./designer-canvas";
import { DesignerLayers, DesignerNotes, DesignerContextMenu } from "./designer-panels";
import { useDesignerHistory, type DesignerDocument } from "./designer-state";
import { COLORS, DesignerToolbar, IconButton, MARKUP, SHAPES, isMarkup, type DesignerTool, type ShapeKind } from "./designer-tools";
import "./skeletal-editor.css";

export type { ShapeKind } from "./designer-tools";
export type LayerKind = ShapeKind | "background";
export type CanvasLayer = SkeletalLayerData;
export interface EditorMedia extends MediaItem { libraryOrigin?: "downloaded" | "uploaded" }
export interface DesignerPayload {
  messageId?: string; title: string; variant: "hero" | "cards" | "dashboard";
  layers: CanvasLayer[]; annotations: LayoutAnnotation[]; width: number; height: number; instruction: string;
}
export interface SkeletalEditorProps {
  open: boolean; title: string; variant: "hero" | "cards" | "dashboard"; messageId?: string;
  initialLayers?: CanvasLayer[]; initialAnnotations?: LayoutAnnotation[]; initialWidth?: number; initialHeight?: number;
  backgrounds?: EditorMedia[]; onClose: () => void; onSend: (payload: DesignerPayload) => void; onRestore?: () => void;
}
export function SkeletalEditor({ open, title, variant, messageId, initialLayers, initialAnnotations, initialWidth, initialHeight, backgrounds = [], onClose, onSend, onRestore }: SkeletalEditorProps) {
  const initialDocument = (): DesignerDocument => ({ layers: initialLayers ? initialLayers.map(makeLayer) : starterLayers(variant), annotations: (initialAnnotations ?? []).map(annotation => ({ ...annotation, color: COLORS.includes(annotation.color) ? annotation.color : COLORS[0] })), stage: { width: initialWidth ?? 520, height: initialHeight ?? 330 } });
  const { doc, commit, preview, dispatch, gesture, cancelGesture, canUndo, canRedo } = useDesignerHistory(initialDocument);
  const original = React.useRef(doc);
  const [name, setName] = React.useState(title);
  const [tool, setTool] = React.useState<DesignerTool>("select");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [activeNote, setActiveNote] = React.useState<string | null>(null);
  const [rightTab, setRightTab] = React.useState<"design" | "notes">("design");
  const [instruction, setInstruction] = React.useState("");
  const [zoom, setZoom] = React.useState(100);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [grid, setGrid] = React.useState(true);
  const [snap, setSnap] = React.useState(true);
  const [gridSize, setGridSize] = React.useState(8);
  const [color, setColor] = React.useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = React.useState(2);
  const [showMarkup, setShowMarkup] = React.useState(true);
  const [showResolved, setShowResolved] = React.useState(false);
  const [composerOpen, setComposerOpen] = React.useState(true);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; id: string } | null>(null);
  const [sidePanel, setSidePanel] = React.useState<"layers" | "inspector" | null>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const selected = doc.layers.find(l => l.id === selectedId) ?? null;
  const openNotes = doc.annotations.filter(a => !a.resolved);
  const chooseTool = (next: DesignerTool) => { setTool(next); setContextMenu(null); setSidePanel(null); if (isMarkup(next)) { setShowMarkup(true); setRightTab("notes"); } };
  const patchLayer = (id: string, patch: Partial<CanvasLayer>) => commit({ ...doc, layers: doc.layers.map(l => l.id === id ? { ...l, ...patch } : l) });
  const removeLayer = (id: string) => { commit({ ...doc, layers: doc.layers.filter(l => l.id !== id) }); setSelectedId(null); setContextMenu(null); };
  const sendChanges = () => {
    // Contenteditable text has a native editing session until blur. Include its current text even when a shortcut sends before blur.
    const pendingText = new Map([...(dialogRef.current?.querySelectorAll<HTMLElement>("[data-layer-id]") ?? [])].flatMap(element => {
      const editable = element.querySelector<HTMLElement>('[contenteditable="true"]');
      return editable ? [[element.dataset.layerId!, editable.textContent ?? ""] as const] : [];
    }));
    const layers = doc.layers.map(layer => pendingText.has(layer.id) ? { ...layer, label: pendingText.get(layer.id) } : layer);
    onSend({ messageId, title: name, variant, layers, annotations: doc.annotations, width: doc.stage.width, height: doc.stage.height, instruction: feedbackInstruction(instruction, doc.annotations) });
  };
  const duplicateLayer = (layer: CanvasLayer) => {
    if (layer.kind === "background") return;
    const copy = { ...layer, ...constrainFrame({ ...layer, x: layer.x + 16, y: layer.y + 16 }, doc.stage), id: designerId(), name: `${layer.name} copy`, z: Math.max(...doc.layers.map(l => l.z)) + 1, locked: false };
    commit({ ...doc, layers: [...doc.layers, copy] }); setSelectedId(copy.id); setContextMenu(null);
  };
  const reorder = (id: string, direction: number) => {
    const ordered = [...doc.layers].sort((a, b) => a.z - b.z), index = ordered.findIndex(l => l.id === id), other = index + direction;
    if (index < 0 || other < 0 || other >= ordered.length || ordered[other].kind === "background" || ordered[index].kind === "background") return;
    [ordered[index], ordered[other]] = [ordered[other], ordered[index]];
    commit({ ...doc, layers: ordered.map((l, z) => ({ ...l, z })) }); setContextMenu(null);
  };
  const insertShape = (kind: ShapeKind) => {
    const layer = makeLayer({ id: designerId(), kind, name: kind === "text" ? "Text" : `${SHAPES.find(s => s.id === kind)?.label} ${doc.layers.length + 1}`, x: 48, y: 96, w: 160, h: kind === "line" ? 2 : kind === "text" ? 32 : 80, z: Math.max(0, ...doc.layers.map(l => l.z)) + 1, label: kind === "text" ? "Your text" : kind.toUpperCase(), fill: kind === "text" ? "#ededed" : "#1a1a1a", noFill: kind !== "text", dashed: false, fontSize: kind === "text" ? 18 : 10 });
    Object.assign(layer, constrainFrame(layer, doc.stage)); commit({ ...doc, layers: [...doc.layers, layer] }); setSelectedId(layer.id); setTool("select"); setRightTab("design"); setSidePanel(null);
  };
  const fitCanvas = () => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (bounds) setZoom(clamp(Math.floor(Math.min((bounds.width - 90) / doc.stage.width, (bounds.height - 100) / doc.stage.height) * 100), 25, 200));
    setPan({ x: 0, y: 0 });
  };
  const resizeStage = (stage: Stage) => commit({ ...doc, stage, layers: doc.layers.map(l => l.kind === "background" ? { ...l, w: stage.width, h: stage.height } : { ...l, ...constrainFrame(l, stage) }), annotations: doc.annotations.map(a => ({ ...a, points: a.points.map(p => ({ x: clamp(p.x, 0, stage.width), y: clamp(p.y, 0, stage.height) })) })) });
  React.useEffect(() => {
    if (!open) { cancelGesture(); return; }
    const value = initialDocument(); dispatch({ type: "reset", value }); original.current = value;
    setName(title); setSelectedId(value.layers.filter(l => l.kind !== "background").at(-1)?.id ?? null);
    setInstruction(""); setTool("select"); setZoom(100); setPan({ x: 0, y: 0 }); setActiveNote(null);
    setRightTab("design"); setContextMenu(null); setComposerOpen(true); setSidePanel(null);
    const previous = document.activeElement as HTMLElement | null; dialogRef.current?.focus();
    return () => { cancelGesture(); previous?.focus(); };
    // Opening an artifact loads its snapshot; parent re-renders preserve in-progress edits.
  }, [open, messageId]);
  React.useEffect(() => {
    if (!open || !viewportRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const available = Math.max(100, entry.contentRect.width - 50);
      setZoom(current => Math.min(current, clamp(Math.floor(available / doc.stage.width * 100), 25, 100)));
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [open, doc.stage.width]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable || !!target.closest('[contenteditable="true"]');
      if (e.key === "Tab") {
        const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea, select, [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); sendChanges(); return; }
      if (e.key === "Escape") { if (contextMenu) setContextMenu(null); else if (tool !== "select") setTool("select"); else onClose(); return; }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) { e.preventDefault(); dispatch({ type: e.shiftKey || e.key.toLowerCase() === "y" ? "redo" : "undo" }); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selected) { e.preventDefault(); duplicateLayer(selected); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !selected.locked) { e.preventDefault(); removeLayer(selected.id); return; }
      if (e.key.startsWith("Arrow") && selected && !selected.locked && selected.kind !== "background") {
        e.preventDefault(); const amount = e.shiftKey ? 10 : snap ? gridSize : 1;
        patchLayer(selected.id, constrainFrame({ ...selected, x: selected.x + (e.key === "ArrowRight" ? amount : e.key === "ArrowLeft" ? -amount : 0), y: selected.y + (e.key === "ArrowDown" ? amount : e.key === "ArrowUp" ? -amount : 0) }, doc.stage)); return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const shortcuts: Record<string, DesignerTool> = { v: "select", r: "rect", o: "circle", l: "line", t: "text", p: "pen", a: "arrow", h: "highlight", n: "note", " ": "hand" };
      if (shortcuts[e.key.toLowerCase()]) { e.preventDefault(); chooseTool(shortcuts[e.key.toLowerCase()]); }
      if (e.key === "0") fitCanvas();
    };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  });
  const exportSvg = () => {
    const url = URL.createObjectURL(new Blob([layoutSvg(doc.layers, doc.stage, showMarkup ? doc.annotations : [])], { type: "image/svg+xml" }));
    const a = document.createElement("a"); a.href = url; a.download = `${name.replace(/[^\p{L}\p{N}]+/gu, "-") || "layout"}.svg`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
  };
  if (!open) return null;
  const modified = JSON.stringify(doc) !== JSON.stringify(original.current) || name !== title;
  return <div className="ld-backdrop"><div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Layout designer" tabIndex={-1} data-skeletal-editor="true" className="ld-editor" onPointerDown={() => contextMenu && setContextMenu(null)}>
    <header className="ld-header"><div className="ld-logo"><Layers size={18}/></div><div className="ld-document-title"><input aria-label="Skeletal design name" value={name} onChange={e => setName(e.target.value)}/><span>Layout designer <span className="ld-dot"/> {doc.layers.length} layers <span className="ld-title-dim">/ {doc.stage.width} × {doc.stage.height}</span></span></div><div className="ld-history"><IconButton label="Undo" icon={Undo2} disabled={!canUndo} onClick={() => dispatch({ type: "undo" })}/><IconButton label="Redo" icon={Redo2} disabled={!canRedo} onClick={() => dispatch({ type: "redo" })}/></div><span className="ld-save-status"><span className={modified ? "ld-unsent" : ""}/>{modified ? "Unsent changes" : "Ready to edit"}</span><button className="ld-button ld-export" onClick={exportSvg}><Download size={14}/>Export SVG</button>{onRestore && <button className="ld-button" onClick={onRestore}>Restore saved version</button>}<button className="ld-button ld-primary" onClick={sendChanges}>Done<Check size={14}/></button><IconButton label="Close editor" icon={X} onClick={onClose}/></header>
    <div className="ld-mobile-nav"><button onClick={() => setSidePanel(sidePanel === "layers" ? null : "layers")} aria-expanded={sidePanel === "layers"}><Layers size={14}/>Layers & insert</button><button onClick={() => setSidePanel(sidePanel === "inspector" ? null : "inspector")} aria-expanded={sidePanel === "inspector"}><Shapes size={14}/>Design & notes</button></div>
    <div className="ld-body">
      <aside className={cn("ld-sidebar ld-left", sidePanel === "layers" && "ld-panel-open")} aria-label="Layer browser"><DesignerLayers key={`${open}-${messageId}`} doc={doc} selectedId={selectedId} backgrounds={backgrounds} onSelect={id => { setSelectedId(id); setRightTab("design"); }} onPatch={patchLayer} onInsert={insertShape} onTool={next => { chooseTool(next); setSidePanel(null); }} onContext={setContextMenu} onReset={() => { commit(original.current); setSelectedId(null); }} onBackground={media => { const bg = makeLayer({ id: "background", kind: "background", name: media.title, x: 0, y: 0, w: doc.stage.width, h: doc.stage.height, z: -1, mediaId: media.id, mediaUrl: media.video, mediaPoster: media.poster, showLabel: false, locked: true }); commit({ ...doc, layers: [bg, ...doc.layers.filter(l => l.kind !== "background")] }); setSelectedId(bg.id); }}/></aside>
      <main className={cn("ld-workspace", tool === "hand" && "ld-hand", isMarkup(tool) && "ld-marking")}>
        <div className="ld-canvas-heading"><span><Frame size={13}/>Artboard <span>/</span><b>{variant === "hero" ? "Hero layout" : variant === "cards" ? "Product grid" : "Dashboard"}</b></span><button aria-pressed={showMarkup} onClick={() => setShowMarkup(!showMarkup)}>Markup{openNotes.length > 0 && <small>{openNotes.length}</small>}</button></div>
        <DesignerToolbar tool={tool} onTool={chooseTool}/>
        {isMarkup(tool) && <div className="ld-markup-options"><span>{MARKUP.find(m => m.id === tool)?.label}</span><span className="ld-divider"/>{COLORS.map(c => <button key={c} className="ld-swatch" aria-label={`Markup color ${c}`} aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)}/>)}<select aria-label="Markup stroke width" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))}>{[2, 3, 5, 8].map(w => <option key={w} value={w}>{w}px</option>)}</select></div>}
        <DesignerCanvas doc={doc} tool={tool} zoom={zoom} pan={pan} grid={grid} snap={snap} gridSize={gridSize} color={color} strokeWidth={strokeWidth} selectedId={selectedId} activeNote={activeNote} showMarkup={showMarkup} showResolved={showResolved} viewportRef={viewportRef} onPan={setPan} onSelect={setSelectedId} onNote={id => { setActiveNote(id); setRightTab("notes"); setSidePanel("inspector"); }} onTool={setTool} onContext={setContextMenu} commit={commit} preview={preview} gesture={gesture}/>
        <div className="ld-canvas-bottom"><div className="ld-view-controls"><IconButton label="Zoom out" icon={Minus} disabled={zoom <= 25} onClick={() => setZoom(z => Math.max(25, z - 25))}/><button className="ld-zoom" onClick={() => { setZoom(100); setPan({ x: 0, y: 0 }); }}>{zoom}%</button><IconButton label="Zoom in" icon={Plus} disabled={zoom >= 300} onClick={() => setZoom(z => Math.min(300, z + 25))}/><span className="ld-divider"/><IconButton label="Fit artboard" shortcut="0" icon={Maximize} onClick={fitCanvas}/><IconButton label="Toggle grid" icon={Grid2X2} active={grid} onClick={() => setGrid(!grid)}/></div><button className="ld-feedback-toggle" aria-expanded={composerOpen} onClick={() => setComposerOpen(!composerOpen)}><MessageSquare size={14}/>Agent feedback<ChevronDown size={12}/></button></div>
        {composerOpen && <section className="ld-composer" aria-label="Agent feedback"><div className="ld-composer-heading"><span className="ld-agent-dot"/><strong>Describe your changes</strong>{openNotes.length > 0 && <span className="ld-feedback-count">{openNotes.length} annotation{openNotes.length !== 1 ? "s" : ""} attached</span>}<IconButton label="Minimize feedback" icon={Minus} onClick={() => setComposerOpen(false)}/></div><textarea value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Tell the agent what to change. Draw or pin a note to show exactly where." aria-label="Describe the change you want" rows={2}/><div className="ld-composer-footer"><span>{selected ? <><Square size={11}/>{selected.name}</> : <><Frame size={11}/>Entire artboard</>}</span><small>Ctrl / ⌘ + Enter</small>{onRestore && <button className="ld-button" onClick={onRestore}>Restore saved version</button>}<button className="ld-button ld-primary" onClick={sendChanges}><ArrowRight size={14}/>Send to agent</button></div></section>}
        <footer className="ld-status"><span><span className="ld-status-dot"/>{isMarkup(tool) ? tool === "note" ? "Click anywhere to pin a note" : "Drag on the artboard to mark up" : tool === "select" ? selected ? `${selected.name}${selected.locked ? " · locked" : " selected"}` : "Select a layer to begin" : tool === "hand" ? "Drag the artboard to pan" : "Click or drag to create"}</span><span>{snap ? `Snap ${gridSize}px` : "Snap off"}<span className="ld-dot"/>px</span></footer>
      </main>
      <aside className={cn("ld-sidebar ld-right", sidePanel === "inspector" && "ld-panel-open")} aria-label="Properties and notes"><div className="ld-tabs"><button aria-pressed={rightTab === "design"} onClick={() => setRightTab("design")}>Design</button><button aria-pressed={rightTab === "notes"} onClick={() => setRightTab("notes")}>Notes{openNotes.length > 0 && <span className="ld-tab-count">{openNotes.length}</span>}</button></div><div className="ld-sidebar-scroll">{rightTab === "design" ? <DesignerInspector selected={selected} stage={doc.stage} grid={grid} snap={snap} gridSize={gridSize} onPatch={patch => selected && patchLayer(selected.id, patch)} onStage={resizeStage} onGrid={setGrid} onSnap={setSnap} onGridSize={setGridSize} onDuplicate={() => selected && duplicateLayer(selected)} onRemove={() => selected && removeLayer(selected.id)} onReorder={direction => selected && reorder(selected.id, direction)} onApplyFont={() => selected && commit({ ...doc, layers: doc.layers.map(l => l.kind === "background" ? l : { ...l, fontFamily: selected.fontFamily, fontSize: selected.fontSize, fontWeight: selected.fontWeight, lineHeight: selected.lineHeight, letterSpacing: selected.letterSpacing }) })}/> : <DesignerNotes annotations={doc.annotations} layers={doc.layers} activeNote={activeNote} showResolved={showResolved} onShowResolved={setShowResolved} onSelect={setActiveNote} onTool={chooseTool} onChange={annotations => commit({ ...doc, annotations })}/>}</div><div className="ld-inspector-footer"><span className="ld-status-dot"/>Layout & feedback<span>v2</span></div></aside>
    </div>
    {contextMenu && <DesignerContextMenu menu={contextMenu} layer={doc.layers.find(l => l.id === contextMenu.id)} onDuplicate={duplicateLayer} onReorder={reorder} onPatch={(id, patch) => { patchLayer(id, patch); setContextMenu(null); }} onRemove={removeLayer}/>}
  </div></div>;
}
