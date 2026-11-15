import * as React from "react";
import { Check, LockKeyhole } from "lucide-react";
import type { LayoutAnnotation, SkeletalLayerData } from "@/data/mock";
import { annotationSvg, clamp, constrainFrame, designerId, makeLayer, resizeRotatedFrame, type Handle } from "@/lib/layout-designer";
import { cn } from "@/utils/cn";
import type { DesignerDocument } from "./designer-state";
import { isMarkup, SHAPES, type DesignerTool } from "./designer-tools";

interface Props {
  doc: DesignerDocument; tool: DesignerTool; zoom: number; pan: { x: number; y: number }; grid: boolean; snap: boolean; gridSize: number; color: string; strokeWidth: number;
  selectedId: string | null; activeNote: string | null; showMarkup: boolean; showResolved: boolean;
  viewportRef: React.RefObject<HTMLDivElement | null>; onPan: (p: { x: number; y: number }) => void; onSelect: (id: string | null) => void; onNote: (id: string) => void;
  onTool: (tool: DesignerTool) => void; onContext: (menu: { x: number; y: number; id: string } | null) => void;
  commit: (doc: DesignerDocument) => void; preview: (doc: DesignerDocument) => void; gesture: (move: (e: PointerEvent) => void, end?: () => void) => void;
}
export function DesignerCanvas({ doc, tool, zoom, pan, grid, snap, gridSize, color, strokeWidth, selectedId, activeNote, showMarkup, showResolved, viewportRef, onPan, onSelect, onNote, onTool, onContext, commit, preview, gesture }: Props) {
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const sorted = [...doc.layers].sort((a, b) => a.z - b.z);
  const point = (clientX: number, clientY: number) => {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return { x: clamp((clientX - bounds.left) / (zoom / 100), 0, doc.stage.width), y: clamp((clientY - bounds.top) / (zoom / 100), 0, doc.stage.height) };
  };
  const startMove = (e: React.PointerEvent, layer: SkeletalLayerData, handle?: Handle) => {
    if (e.button !== 0 || tool !== "select") return;
    e.stopPropagation(); onSelect(layer.id);
    if (layer.locked || layer.kind === "background") return;
    e.preventDefault(); const origin = point(e.clientX, e.clientY);
    gesture(event => {
      const next = point(event.clientX, event.clientY), dx = next.x - origin.x, dy = next.y - origin.y, step = snap ? gridSize : 1;
      const frame = handle ? resizeRotatedFrame(layer, handle, dx, dy, doc.stage, step) : constrainFrame({ ...layer, x: Math.round((layer.x + dx) / step) * step, y: Math.round((layer.y + dy) / step) * step }, doc.stage);
      preview({ ...doc, layers: doc.layers.map(l => l.id === layer.id ? { ...l, ...frame } : l) });
    });
  };
  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    onContext(null);
    if (tool === "hand") {
      const origin = { x: e.clientX, y: e.clientY };
      e.preventDefault(); gesture(event => onPan({ x: pan.x + event.clientX - origin.x, y: pan.y + event.clientY - origin.y })); return;
    }
    if (tool === "select") { if (e.target === canvasRef.current) onSelect(null); return; }
    e.preventDefault(); const origin = point(e.clientX, e.clientY), id = designerId();
    if (isMarkup(tool)) {
      let annotation: LayoutAnnotation = { id, kind: tool, points: [origin], color, width: strokeWidth, resolved: false };
      if (tool === "note") {
        annotation = { ...annotation, text: "", layerId: [...sorted].reverse().find(l => !l.hidden && l.kind !== "background" && origin.x >= l.x && origin.x <= l.x + l.w && origin.y >= l.y && origin.y <= l.y + l.h)?.id };
        commit({ ...doc, annotations: [...doc.annotations, annotation] }); onNote(id); return;
      }
      preview({ ...doc, annotations: [...doc.annotations, annotation] });
      gesture(event => {
        const next = point(event.clientX, event.clientY);
        annotation = { ...annotation, points: tool === "pen" ? [...annotation.points, next] : [origin, next] };
        preview({ ...doc, annotations: [...doc.annotations, annotation] });
      }, () => onNote(id)); return;
    }
    const layer = makeLayer({ id, kind: tool, name: tool === "text" ? "Text" : `${SHAPES.find(s => s.id === tool)?.label} ${doc.layers.length + 1}`, x: origin.x, y: origin.y, w: tool === "text" ? 140 : 80, h: tool === "line" ? 2 : tool === "text" ? 32 : 64, z: Math.max(0, ...doc.layers.map(l => l.z)) + 1, label: tool === "text" ? "Your text" : tool.toUpperCase(), fill: tool === "text" ? "#ededed" : "#1a1a1a", dashed: false, noFill: tool !== "text", fontSize: tool === "text" ? 18 : 10 });
    Object.assign(layer, constrainFrame(layer, doc.stage));
    preview({ ...doc, layers: [...doc.layers, layer] }); onSelect(id);
    gesture(event => {
      const next = point(event.clientX, event.clientY), step = snap ? gridSize : 1;
      const frame = constrainFrame({ x: Math.round(Math.min(origin.x, next.x) / step) * step, y: Math.round(Math.min(origin.y, next.y) / step) * step, w: Math.max(4, Math.round(Math.abs(next.x - origin.x) / step) * step), h: Math.max(tool === "line" ? 2 : 4, Math.round(Math.abs(next.y - origin.y) / step) * step) }, doc.stage);
      preview({ ...doc, layers: [...doc.layers, { ...layer, ...frame, lineReverse: tool === "line" ? (next.x - origin.x) * (next.y - origin.y) < 0 : undefined }] });
    }, () => onTool("select"));
  };
  return <div ref={viewportRef} className="ld-viewport" onPointerDown={e => { if (e.target === e.currentTarget) { onSelect(null); onContext(null); } }}>
    <div className="ld-artboard-wrap" style={{ width: doc.stage.width * zoom / 100, height: doc.stage.height * zoom / 100, transform: `translate(${pan.x}px, ${pan.y}px)` }}>
      <div className="ld-artboard-label"><span>DESKTOP</span><span>{doc.stage.width} × {doc.stage.height}</span></div>
      <div ref={canvasRef} data-editor-canvas="true" onPointerDown={onPointer} className={cn("ld-artboard", grid && "ld-grid")} style={{ width: doc.stage.width, height: doc.stage.height, transform: `scale(${zoom / 100})`, backgroundSize: `${gridSize}px ${gridSize}px` }}>
        {sorted.filter(l => !l.hidden).map(layer => <div key={layer.id} data-layer-id={layer.id} data-shape={layer.kind} role="button" tabIndex={tool === "select" ? 0 : -1} aria-label={`${layer.name} layer`} onKeyDown={e => { if (e.key === "Enter") onSelect(layer.id); }} onPointerDown={e => startMove(e, layer)} onContextMenu={e => { e.preventDefault(); onSelect(layer.id); onContext({ x: e.clientX, y: e.clientY, id: layer.id }); }} style={{ position: "absolute", left: layer.x, top: layer.y, width: layer.w, height: layer.h, zIndex: layer.z + 2, transform: `rotate(${layer.rotation}deg)`, opacity: layer.opacity / 100, pointerEvents: tool !== "select" ? "none" : undefined }} className={cn("ld-canvas-layer", layer.locked && "ld-locked")}>
          {layer.kind === "background" ? <>{layer.mediaUrl ? <video src={layer.mediaUrl} poster={layer.mediaPoster} autoPlay muted loop playsInline/> : layer.mediaPoster ? <img src={layer.mediaPoster} alt=""/> : null}</> : <>
            <LayerShape layer={layer}/>
            {layer.showLabel && layer.label && <span className="ld-layer-label" contentEditable={layer.kind === "text" && !layer.locked && tool === "select"} suppressContentEditableWarning onBlur={e => { if (layer.kind === "text" && layer.label !== e.currentTarget.textContent) commit({ ...doc, layers: doc.layers.map(l => l.id === layer.id ? { ...l, label: e.currentTarget.textContent ?? "" } : l) }); }} onPointerDown={e => { if (layer.kind === "text") { e.stopPropagation(); onSelect(layer.id); } }} style={{ fontFamily: layer.fontFamily, fontSize: layer.fontSize, fontWeight: layer.fontWeight, lineHeight: layer.lineHeight, letterSpacing: layer.letterSpacing, color: layer.kind === "text" ? layer.fill : "#ededed" }}>{layer.label}</span>}
          </>}
          {selectedId === layer.id && <div className="ld-selection">{!layer.locked && layer.kind !== "background" && (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as Handle[]).map(h => <span key={h} data-resize-handle={h} onPointerDown={e => startMove(e, layer, h)} className={`ld-handle ld-handle-${h}`}/>)}<span className="ld-selection-size">{layer.locked && <LockKeyhole size={9}/>} {Math.round(layer.w)} × {Math.round(layer.h)}</span></div>}
        </div>)}
        {showMarkup && <svg className="ld-annotations" width={doc.stage.width} height={doc.stage.height} aria-label="Visual markup" dangerouslySetInnerHTML={{ __html: doc.annotations.filter(a => a.kind !== "note").map((a, i) => annotationSvg(a, i + 1)).join("") }}/>}
        {showMarkup && doc.annotations.filter(a => a.kind === "note" && (showResolved || !a.resolved)).map(a => <button key={a.id} className={cn("ld-note-pin", activeNote === a.id && "ld-note-active", a.resolved && "ld-note-resolved")} style={{ left: a.points[0].x, top: a.points[0].y, background: a.color }} aria-label={`Open note ${doc.annotations.indexOf(a) + 1}${a.text ? `: ${a.text}` : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => onNote(a.id)}>{a.resolved ? <Check size={12}/> : doc.annotations.indexOf(a) + 1}</button>)}
      </div>
    </div>
  </div>;
}

function LayerShape({ layer: l }: { layer: SkeletalLayerData }) {
  const appearance = { fill: l.noFill ? "none" : l.fill, stroke: l.stroke, strokeWidth: l.strokeWidth, strokeDasharray: l.dashed ? "4 3" : undefined };
  return <svg className="ld-layer-shape" width="100%" height="100%" overflow="visible" aria-hidden="true">{l.kind === "circle" ? <ellipse cx="50%" cy="50%" rx={Math.max(0, l.w / 2 - l.strokeWidth / 2)} ry={Math.max(0, l.h / 2 - l.strokeWidth / 2)} {...appearance}/> : l.kind === "triangle" ? <polygon points={`${l.w / 2},1 ${l.w - 1},${l.h - 1} 1,${l.h - 1}`} {...appearance}/> : l.kind === "line" ? <line x1="0" y1={l.lineReverse ? l.h : 0} x2={l.w} y2={l.lineReverse ? 0 : l.h} {...appearance}/> : l.kind !== "text" ? <rect x={l.strokeWidth / 2} y={l.strokeWidth / 2} width={Math.max(0, l.w - l.strokeWidth)} height={Math.max(0, l.h - l.strokeWidth)} rx={l.radius} {...appearance}/> : null}</svg>;
}
