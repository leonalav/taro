import * as React from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, ChevronDown, Circle, Download, Eye, EyeOff,
  Image, Layers, Minus, MousePointer2, Plus, RectangleHorizontal,
  RotateCcw, Shuffle, Square, Trash2, Triangle, Type, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MediaItem } from "@/data/media";
import { cn } from "@/utils/cn";
import type { SkeletalLayerData } from "@/data/mock";

export type ShapeKind = "rect" | "circle" | "triangle" | "text" | "line";
export type LayerKind = ShapeKind | "background";

export type CanvasLayer = SkeletalLayerData;

export interface EditorMedia extends MediaItem {
  libraryOrigin?: "downloaded" | "uploaded";
}

export interface SkeletalEditorProps {
  open: boolean;
  title: string;
  variant: "hero" | "cards" | "dashboard";
  messageId?: string;
  initialLayers?: CanvasLayer[];
  initialWidth?: number;
  initialHeight?: number;
  backgrounds?: EditorMedia[];
  onClose: () => void;
  onSend: (payload: { messageId?: string; title: string; variant: "hero" | "cards" | "dashboard"; layers: CanvasLayer[]; width: number; height: number; instruction: string }) => void;
}

const BASE_W = 520;
const BASE_H = 330;
const MIN_SIZE = 10;
const GRID_SIZE = 8;
const FONT_FAMILIES = ["Geist", "Inter", "Arial", "Georgia", "Times New Roman", "Monospace"];
const TOOLS: { id: ShapeKind | "select"; name: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "select", name: "Select", icon: MousePointer2 },
  { id: "rect", name: "Rectangle", icon: Square },
  { id: "circle", name: "Circle", icon: Circle },
  { id: "triangle", name: "Triangle", icon: Triangle },
  { id: "line", name: "Line", icon: Minus },
  { id: "text", name: "Text", icon: Type },
];
let sequence = 0;
const makeId = () => `layer-${Date.now().toString(36)}-${sequence++}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function createLayer(data: Pick<CanvasLayer, "id" | "kind" | "name" | "x" | "y" | "w" | "h" | "z"> & Partial<CanvasLayer>): CanvasLayer {
  return {
    fill: "#141320", stroke: "#4B4370", strokeWidth: 1, rotation: 0, opacity: 100,
    dashed: true, noFill: true, showLabel: true, hidden: false, radius: 4, preset: "custom",
    fontFamily: "Geist", fontSize: 10, fontWeight: 500, lineHeight: 1.3, letterSpacing: 1.2,
    ...data,
  };
}

function starterLayers(variant: SkeletalEditorProps["variant"]): CanvasLayer[] {
  const chrome = [
    createLayer({ id: "nav", kind: "rect", name: "Nav", x: 14, y: 14, w: 492, h: 28, z: 0, label: "NAV" }),
    createLayer({ id: "announce", kind: "rect", name: "Announcement", x: 14, y: 48, w: 492, h: 26, z: 1, label: "ANNOUNCEMENT" }),
  ];
  if (variant === "cards") return [...chrome, ...Array.from({ length: 6 }, (_, i) => createLayer({ id: `card-${i}`, kind: "rect", name: `Product ${i + 1}`, x: 14 + (i % 3) * 166, y: 90 + Math.floor(i / 3) * 110, w: 154, h: 96, z: 2 + i, label: "PRODUCT" }))];
  if (variant === "dashboard") return [...chrome,
    createLayer({ id: "side", kind: "rect", name: "Sidebar", x: 14, y: 88, w: 112, h: 226, z: 2, label: "SIDEBAR" }),
    createLayer({ id: "chart", kind: "rect", name: "Main chart", x: 136, y: 88, w: 370, h: 110, z: 3, label: "CHART" }),
    ...Array.from({ length: 3 }, (_, i) => createLayer({ id: `kpi-${i}`, kind: "rect", name: `Metric ${i + 1}`, x: 136 + i * 126, y: 210, w: 116, h: 104, z: 4 + i, label: "KPI" }))];
  return [...chrome,
    createLayer({ id: "hero", kind: "rect", name: "Hero display", x: 14, y: 82, w: 492, h: 82, z: 2, label: "HERO DISPLAY" }),
    createLayer({ id: "body", kind: "rect", name: "Body copy", x: 14, y: 172, w: 234, h: 30, z: 3, label: "BODY COPY" }),
    createLayer({ id: "cta", kind: "rect", name: "CTA pair", x: 260, y: 172, w: 246, h: 30, z: 4, label: "CTA PAIR" }),
    ...Array.from({ length: 3 }, (_, i) => createLayer({ id: `product-${i}`, kind: "rect", name: `Product ${i + 1}`, x: 14 + i * 168, y: 212, w: 155, h: 102, z: 5 + i, label: "PRODUCT" }))];
}

interface PointerDrag {
  id: string;
  pointerX: number;
  pointerY: number;
  layer: CanvasLayer;
  handle?: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
}

export function SkeletalEditor({ open, title, variant, messageId, initialLayers, initialWidth, initialHeight, backgrounds = [], onClose, onSend }: SkeletalEditorProps) {
  const [layers, setLayers] = React.useState<CanvasLayer[]>(() => initialLayers?.length ? initialLayers : starterLayers(variant));
  const resetSnapshot = React.useRef<{ layers: CanvasLayer[]; width: number; height: number } | null>(null);
  const [tool, setTool] = React.useState<ShapeKind | "select">("select");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [name, setName] = React.useState(title);
  const [instruction, setInstruction] = React.useState("");
  const [stage, setStage] = React.useState({ width: initialWidth ?? BASE_W, height: initialHeight ?? BASE_H });
  const [zoom, setZoom] = React.useState(100);
  const [grid, setGrid] = React.useState(true);
  const [snap, setSnap] = React.useState(true);
  const [gridSize, setGridSize] = React.useState(GRID_SIZE);
  const [backgroundOpen, setBackgroundOpen] = React.useState(false);
  const [backgroundTab, setBackgroundTab] = React.useState<"gallery" | "your-media">("gallery");
  const [backgroundQuery, setBackgroundQuery] = React.useState("");
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<PointerDrag | null>(null);
  const drawingRef = React.useRef<{ id: string; x: number; y: number } | null>(null);
  const resizeListeners = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const startingLayers = initialLayers?.length ? initialLayers.map((layer) => createLayer(layer)) : starterLayers(variant);
    const startingWidth = initialWidth ?? BASE_W;
    const startingHeight = initialHeight ?? BASE_H;
    resetSnapshot.current = { layers: startingLayers.map((layer) => ({ ...layer })), width: startingWidth, height: startingHeight };
    setLayers(startingLayers);
    setSelectedId([...startingLayers].filter((layer) => layer.kind !== "background").sort((a, b) => a.z - b.z).at(-1)?.id ?? null);
    setName(title);
    setInstruction("");
    setStage({ width: initialWidth ?? BASE_W, height: initialHeight ?? BASE_H });
    setZoom(100);
    setTool("select");
    setBackgroundOpen(false);
  }, [open, variant, title, initialLayers, initialWidth, initialHeight]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
        const target = e.target as HTMLElement;
        if (["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable) return;
        removeLayer(selectedId);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setLayers(starterLayers(variant));
        setSelectedId(null);
      }
      if (e.key.startsWith("Arrow") && selectedId) {
        const layer = layers.find((l) => l.id === selectedId);
        if (!layer || layer.kind === "background") return;
        e.preventDefault();
        const amount = e.shiftKey ? 10 : (snap ? GRID_SIZE : 1);
        const dx = e.key === "ArrowLeft" ? -amount : e.key === "ArrowRight" ? amount : 0;
        const dy = e.key === "ArrowUp" ? -amount : e.key === "ArrowDown" ? amount : 0;
        patchLayer(selectedId, { x: clamp(layer.x + dx, 0, stage.width - layer.w), y: clamp(layer.y + dy, 0, stage.height - layer.h) });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // Keyboard handlers use the current selected layer and stage.
  }, [open, onClose, selectedId, variant, layers, stage, snap]);

  React.useEffect(() => () => { resizeListeners.current?.(); }, []);

  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const sortedLayers = React.useMemo(() => [...layers].sort((a, b) => a.z - b.z), [layers]);
  const layersTopDown = React.useMemo(() => [...layers].sort((a, b) => b.z - a.z), [layers]);
  const q = backgroundQuery.trim().toLowerCase();
  const filteredBackgrounds = backgrounds.filter((media) => {
    const own = Boolean(media.libraryOrigin) || media.creator === "You" || media.source === "upload";
    if (backgroundTab === "your-media" && !own) return false;
    if (backgroundTab === "gallery" && own) return false;
    return !q || `${media.title} ${media.category} ${media.creator}`.toLowerCase().includes(q);
  });
  const currentBackground = layers.find((l) => l.kind === "background");

  const patchLayer = (id: string, props: Partial<CanvasLayer>) => setLayers((prev) => prev.map((layer) => layer.id === id ? { ...layer, ...props } : layer));
  const clampLayer = (layer: CanvasLayer) => ({
    x: clamp(layer.x, 0, Math.max(0, stage.width - layer.w)),
    y: clamp(layer.y, 0, Math.max(0, stage.height - layer.h)),
    w: clamp(layer.w, MIN_SIZE, stage.width),
    h: clamp(layer.h, MIN_SIZE, stage.height),
  });
  const snapValue = (value: number) => snap ? Math.round(value / gridSize) * gridSize : value;

  const canvasPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const scale = zoom / 100;
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  const installDragListeners = (move: (event: PointerEvent) => void) => {
    resizeListeners.current?.();
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      resizeListeners.current = null;
      drag.current = null;
      drawingRef.current = null;
    };
    const up = () => cleanup();
    resizeListeners.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
  };

  const startMove = (event: React.PointerEvent, layer: CanvasLayer) => {
    if (tool !== "select" || layer.kind === "background" || (event.target as HTMLElement).closest("[data-resize-handle]")) return;
    event.stopPropagation();
    setSelectedId(layer.id);
    const point = canvasPoint(event.clientX, event.clientY);
    drag.current = { id: layer.id, pointerX: point.x, pointerY: point.y, layer };
    installDragListeners((moveEvent) => {
      const d = drag.current;
      if (!d || d.handle) return;
      const next = canvasPoint(moveEvent.clientX, moveEvent.clientY);
      const patch = clampLayer({ ...d.layer, x: snapValue(d.layer.x + next.x - d.pointerX), y: snapValue(d.layer.y + next.y - d.pointerY) });
      patchLayer(d.id, patch);
    });
  };

  const startResize = (event: React.PointerEvent, layer: CanvasLayer, handle: NonNullable<PointerDrag["handle"]>) => {
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(layer.id);
    const point = canvasPoint(event.clientX, event.clientY);
    drag.current = { id: layer.id, pointerX: point.x, pointerY: point.y, layer, handle };
    installDragListeners((moveEvent) => {
      const d = drag.current;
      if (!d?.handle) return;
      const p = canvasPoint(moveEvent.clientX, moveEvent.clientY);
      const dx = p.x - d.pointerX, dy = p.y - d.pointerY;
      let { x, y, w, h } = d.layer;
      if (handle.includes("e")) w = clamp(d.layer.w + dx, MIN_SIZE, stage.width - x);
      if (handle.includes("s")) h = clamp(d.layer.h + dy, MIN_SIZE, stage.height - y);
      if (handle.includes("w")) { const nx = clamp(d.layer.x + dx, 0, d.layer.x + d.layer.w - MIN_SIZE); w = d.layer.w + d.layer.x - nx; x = nx; }
      if (handle.includes("n")) { const ny = clamp(d.layer.y + dy, 0, d.layer.y + d.layer.h - MIN_SIZE); h = d.layer.h + d.layer.y - ny; y = ny; }
      patchLayer(d.id, { x: snapValue(x), y: snapValue(y), w: Math.max(MIN_SIZE, snapValue(w)), h: Math.max(MIN_SIZE, snapValue(h)) });
    });
  };

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool === "select") {
      if (event.target === canvasRef.current) setSelectedId(null);
      return;
    }
    if (event.target !== canvasRef.current) return;
    event.preventDefault();
    const p = canvasPoint(event.clientX, event.clientY);
    const id = makeId();
    const initial = { x: snapValue(p.x), y: snapValue(p.y), w: 1, h: 1 };
    const layer = createLayer({ id, kind: tool, name: tool === "text" ? "Text" : `${tool} ${layers.filter((l) => l.kind === tool).length + 1}`, ...initial, z: Math.max(-1, ...layers.map((l) => l.z)) + 1, label: tool === "text" ? "Text" : undefined, dashed: false, noFill: tool === "line" });
    setLayers((prev) => [...prev, layer]);
    setSelectedId(id);
    drawingRef.current = { id, x: p.x, y: p.y };
    installDragListeners((moveEvent) => {
      const origin = drawingRef.current;
      if (!origin) return;
      const next = canvasPoint(moveEvent.clientX, moveEvent.clientY);
      const left = Math.min(origin.x, next.x), top = Math.min(origin.y, next.y);
      const width = Math.max(MIN_SIZE, Math.abs(next.x - origin.x));
      const height = tool === "line" ? 2 : Math.max(MIN_SIZE, Math.abs(next.y - origin.y));
      const newLayer = createLayer({ ...layer, x: snapValue(left), y: snapValue(top), w: snapValue(width), h: snapValue(height) });
      setLayers((prev) => prev.map((item) => item.id === id ? newLayer : item));
    });
  };

  const addLayer = (position: "above" | "below") => {
    const layoutLayers = layers.filter((layer) => layer.kind !== "background");
    const anchor = layoutLayers.find((layer) => layer.id === selectedId);
    const maxZ = Math.max(0, ...layoutLayers.map((layer) => layer.z));
    const minZ = layoutLayers.length ? Math.min(...layoutLayers.map((layer) => layer.z)) : 1;
    const z = anchor ? anchor.z + (position === "above" ? 0.5 : -0.5) : position === "above" ? maxZ + 1 : minZ - 0.5;
    const layer = createLayer({ id: makeId(), kind: "rect", name: `Layout ${layers.filter((l) => l.kind !== "background").length}`, x: snapValue(stage.width * 0.12), y: snapValue(stage.height * 0.35), w: snapValue(stage.width * 0.32), h: snapValue(stage.height * 0.22), z, label: "NEW LAYER" });
    const withoutBg = layers.filter((l) => l.kind !== "background");
    const background = layers.filter((l) => l.kind === "background");
    const next = [...withoutBg, layer].sort((a, b) => a.z - b.z).map((item, index) => ({ ...item, z: index + 1 }));
    setLayers([...background.map((l) => ({ ...l, z: 0 })), ...next]);
    setSelectedId(layer.id);
    setTool("select");
  };

  const applyBackground = (media: EditorMedia) => {
    const bg = createLayer({
      id: "background", kind: "background", name: `Background · ${media.title}`, x: 0, y: 0,
      w: stage.width, h: stage.height, z: 0, label: "", stroke: "transparent", dashed: false,
      noFill: true, showLabel: false, mediaId: media.id, mediaUrl: media.video || undefined, mediaPoster: media.poster || undefined,
    });
    setLayers((prev) => [bg, ...prev.filter((layer) => layer.kind !== "background").map((layer, i) => ({ ...layer, z: i + 1 }))]);
    setSelectedId(bg.id);
  };

  const moveLayer = (id: string, direction: -1 | 1) => {
    setLayers((prev) => {
      const sorted = [...prev].sort((a, b) => a.z - b.z);
      const i = sorted.findIndex((layer) => layer.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= sorted.length) return prev;
      if (sorted[i].kind === "background" || sorted[j].kind === "background") return prev;
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      return sorted.map((layer, z) => ({ ...layer, z }));
    });
  };

  const removeLayer = (id: string) => {
    setLayers((prev) => prev.filter((layer) => layer.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const applyPreset = (id: string, preset: string) => {
    if (preset === "wireframe") patchLayer(id, { preset, fill: "#141320", stroke: "#4B4370", strokeWidth: 1, dashed: true, noFill: true });
    else if (preset === "soft") patchLayer(id, { preset, fill: "#272532", stroke: "#806AB0", strokeWidth: 1, dashed: false, noFill: false, radius: 10 });
    else if (preset === "solid") patchLayer(id, { preset, fill: "#43365E", stroke: "#B48AFF", strokeWidth: 1, dashed: false, noFill: false, radius: 4 });
    else patchLayer(id, { preset });
  };

  const reset = () => {
    setLayers(starterLayers(variant)); setSelectedId(null); setName(title);
    setStage({ width: initialWidth ?? BASE_W, height: initialHeight ?? BASE_H });
    setZoom(100); setGrid(true); setSnap(true); setGridSize(GRID_SIZE);
  };

  const randomize = () => {
    setLayers((prev) => prev.map((layer) => layer.kind === "background" ? layer : ({
      ...layer,
      x: clamp(layer.x + Math.round((Math.random() - 0.5) * 48), 0, stage.width - layer.w),
      y: clamp(layer.y + Math.round((Math.random() - 0.5) * 36), 0, stage.height - layer.h),
    })));
    setSelectedId(null);
  };

  const exportSvg = () => {
    const body = [...layers].sort((a, b) => a.z - b.z).map((layer) => {
      if (layer.kind === "background") return `<rect x="0" y="0" width="${stage.width}" height="${stage.height}" fill="#101016" />`;
      const dash = layer.dashed ? ` stroke-dasharray="5 4"` : "";
      const fill = layer.noFill ? "none" : layer.fill;
      const common = `fill="${fill}" stroke="${layer.stroke}" stroke-width="${layer.strokeWidth}" opacity="${layer.opacity / 100}"${dash}`;
      if (layer.kind === "circle") return `<ellipse cx="${layer.x + layer.w / 2}" cy="${layer.y + layer.h / 2}" rx="${layer.w / 2}" ry="${layer.h / 2}" ${common} />`;
      if (layer.kind === "triangle") return `<polygon points="${layer.x + layer.w / 2},${layer.y} ${layer.x + layer.w},${layer.y + layer.h} ${layer.x},${layer.y + layer.h}" ${common} />`;
      if (layer.kind === "line") return `<line x1="${layer.x}" y1="${layer.y}" x2="${layer.x + layer.w}" y2="${layer.y + layer.h}" stroke="${layer.stroke}" stroke-width="${layer.strokeWidth}" opacity="${layer.opacity / 100}" />`;
      if (layer.kind === "text") return `<text x="${layer.x}" y="${layer.y + layer.h / 2}" fill="${layer.fill}" font-family="${escapeXml(layer.fontFamily)}" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}">${escapeXml(layer.label ?? "Text")}</text>`;
      return `<rect x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" rx="${layer.radius}" ${common} />`;
    }).join("\n");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${stage.width}" height="${stage.height}" viewBox="0 0 ${stage.width} ${stage.height}">\n${body}\n</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const sendChanges = () => onSend({ messageId, title: name, variant, layers, width: stage.width, height: stage.height, instruction });
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-3 sm:p-5">
      <div aria-hidden="true" onMouseDown={onClose} className="animate-fade absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-label="Edit skeletal design" data-skeletal-editor="true" className="animate-dialog relative flex max-h-[calc(100vh-24px)] w-[min(1420px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-[#292632] bg-[#0a090f] shadow-[0_40px_140px_-24px_rgba(0,0,0,1)]">
        {/* Top bar */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <span className="flex size-7 items-center justify-center rounded-md border border-taro/30 bg-taro/10 text-taro"><Layers className="size-3.5" /></span>
          <div className="min-w-0 flex-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Skeletal design name"
              className="h-6 w-64 border-transparent bg-transparent px-1 text-[12px] font-medium hover:border-border focus-visible:border-taro/40"
            />
            <p className="text-[9px] leading-3 text-muted-foreground">Skeletal editor · {layers.length} layers · {stage.width}×{stage.height}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="size-3.5" />Reset</Button>
          <Button variant="ghost" size="sm" onClick={randomize}><Shuffle className="size-3.5" />Randomize</Button>
          <Button variant="secondary" size="sm" onClick={exportSvg}><Download className="size-3.5" />Export SVG</Button>
          <Button size="sm" onClick={sendChanges}>Done</Button>
          <button type="button" aria-label="Close editor" onClick={onClose} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* vertical tool rail */}
          <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border py-2">
            {TOOLS.map(({ id, icon: Icon, name }) => (
              <button key={id} type="button" title={name} aria-label={name} aria-pressed={tool === id} onClick={() => setTool(id)} className={cn("flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", tool === id && "bg-taro/15 text-taro ring-1 ring-inset ring-taro/35")}><Icon className="size-3.5" /></button>
            ))}
            <span className="my-1 h-px w-6 bg-border" />
            <button type="button" disabled={!selectedId} onClick={() => selectedId && removeLayer(selectedId)} title="Delete selection" aria-label="Delete selection" className="mt-auto flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"><Trash2 className="size-3.5" /></button>
          </div>

          {/* canvas + floating change prompt */}
          <div className="relative flex min-w-0 flex-1 flex-col bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.045)_1px,transparent_0)] [background-size:20px_20px]">
            <div className="scrollbar-thin flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
              <div style={{ width: stage.width * zoom / 100, height: stage.height * zoom / 100, flex: "none" }}>
                <div ref={canvasRef} data-editor-canvas="true" onPointerDown={onCanvasPointerDown} style={{ width: stage.width, height: stage.height, transform: `scale(${zoom / 100})`, transformOrigin: "top left", backgroundSize: `${gridSize}px ${gridSize}px` }} className={cn("relative overflow-hidden rounded-lg border border-[#464055] bg-[#101016]", grid && "bg-[linear-gradient(rgba(168,85,247,0.065)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.065)_1px,transparent_1px)]")}>
                  {sortedLayers.map((layer) => {
                    const isSelected = layer.id === selectedId;
                    if (layer.kind === "background") return <BackgroundLayerView key={layer.id} layer={layer} selected={isSelected} onSelect={() => setSelectedId(layer.id)} onResize={startResize} />;
                    return (
                      <div key={layer.id} data-layer-id={layer.id} data-shape={layer.kind} role="button" tabIndex={0} aria-label={`${layer.name} layer`} onPointerDown={(e) => startMove(e, layer)} onKeyDown={(e) => { if (e.key === "Enter") setSelectedId(layer.id); }} style={{ position: "absolute", left: layer.x, top: layer.y, width: layer.w, height: layer.h, zIndex: layer.z, opacity: layer.hidden ? 0 : layer.opacity / 100, transform: `rotate(${layer.rotation}deg)`, backgroundColor: layer.noFill ? "transparent" : layer.fill, borderWidth: layer.kind === "line" ? 0 : layer.strokeWidth, borderColor: layer.stroke, borderStyle: layer.kind === "line" ? "none" : layer.dashed ? "dashed" : "solid", borderRadius: layer.kind === "circle" ? "9999px" : layer.kind === "rect" ? layer.radius : undefined }} className={cn("flex items-center justify-center", layer.kind === "line" && "border-t", tool === "select" ? "cursor-move" : "cursor-crosshair")}>
                        {layer.kind === "triangle" && <span aria-hidden="true" className="pointer-events-none absolute inset-0 m-auto h-0 w-0 border-x-[46px] border-x-transparent border-b-[70px] border-b-white/10" />}
                        {layer.showLabel && layer.label && (
                          <span contentEditable={layer.kind === "text"} suppressContentEditableWarning onBlur={(e) => layer.kind === "text" && patchLayer(layer.id, { label: e.currentTarget.textContent ?? "" })} onPointerDown={(e) => { if (layer.kind !== "text") startMove(e, layer); else e.stopPropagation(); }} className="max-w-[90%] overflow-hidden text-ellipsis px-1 text-center leading-tight outline-none" style={{ fontFamily: layer.fontFamily, fontSize: layer.fontSize, fontWeight: layer.fontWeight, lineHeight: layer.lineHeight, letterSpacing: layer.letterSpacing, color: layer.fill }}>{layer.label}</span>
                        )}
                        {isSelected && <SelectionOutline layer={layer} onResize={startResize} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="absolute bottom-3 left-3 z-40 w-[min(320px,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-[#40394d] bg-[#111016]/95 shadow-xl backdrop-blur">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2"><span className="text-[11px] font-medium text-foreground">Describe the change</span><span className="min-w-0 flex-1 truncate text-[9px] text-muted-foreground uppercase">{selected?.label || selected?.name || ""}</span><button type="button" onClick={() => setInstruction("")} aria-label="Clear change description" className="text-muted-foreground hover:text-foreground"><X className="size-3" /></button></div>
              <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} placeholder="e.g. Make the hero taller, split CTA pair into two buttons, add a circular avatar to the nav..." aria-label="Describe the change you want" className="w-full resize-none bg-transparent px-3 py-2 text-[11px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/60" />
              <div className="flex items-center gap-2 px-3 pb-2"><span className="mr-auto text-[9px] text-muted-foreground/60">⌘↵ to send</span><Button size="sm" className="h-6 rounded-full px-2.5 text-[10px]" onClick={sendChanges} disabled={!instruction.trim() && !selected}><ArrowRight className="size-3" />Send to agent</Button></div>
            </div>
            <div className="flex h-7 shrink-0 items-center gap-4 border-t border-border px-3 text-[9px] text-muted-foreground"><span>{selected ? "1 selected" : "0 selected"}</span><span>{zoom}%</span><span>snap {snap ? GRID_SIZE : "off"}px</span><span className="ml-auto">Drag to move · handles to resize · double-click to rename · ⌫ delete</span></div>
          </div>

          {/* layers + inspector */}
          <aside className="scrollbar-thin flex w-[286px] shrink-0 flex-col overflow-y-auto border-l border-border bg-[#0e0d13]">
            <section className="border-b border-border p-3">
              <div className="flex items-center gap-1.5"><Layers className="size-3.5 text-taro"/><h3 className="flex-1 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Layers</h3><span className="text-[9px] text-muted-foreground">{layers.length}</span></div>
              <div className="mt-2 grid grid-cols-2 gap-1.5"><Button variant="secondary" size="sm" className="h-6 px-2 text-[9px]" onClick={() => addLayer("above")}><Plus className="size-3"/>Above</Button><Button variant="secondary" size="sm" className="h-6 px-2 text-[9px]" onClick={() => addLayer("below")}><Plus className="size-3"/>Below</Button></div>
              <button type="button" onClick={() => setBackgroundOpen((o) => !o)} aria-expanded={backgroundOpen} className={cn("mt-1.5 flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] transition-colors hover:bg-accent", backgroundOpen && "bg-accent text-foreground")}><Image className="size-3.5 text-muted-foreground"/>Add background from media<ChevronDown className={cn("ml-auto size-3 transition-transform", backgroundOpen && "rotate-180")}/></button>
              {backgroundOpen && <BackgroundPicker items={filteredBackgrounds} activeTab={backgroundTab} setTab={setBackgroundTab} query={backgroundQuery} setQuery={setBackgroundQuery} selectedId={currentBackground?.mediaId} onSelect={applyBackground}/>}
              <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
                {layersTopDown.map((layer) => (
                  <div key={layer.id} data-layer-row={layer.id} onClick={() => setSelectedId(layer.id)} className={cn("group/layer flex h-7 items-center gap-1 rounded-md px-1 text-[10px] transition-colors", selectedId === layer.id ? "bg-taro/12 text-foreground ring-1 ring-inset ring-taro/25" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground")}>
                    <button type="button" aria-label={layer.hidden ? `Show ${layer.name}` : `Hide ${layer.name}`} onClick={(e) => { e.stopPropagation(); patchLayer(layer.id, { hidden: !layer.hidden }); }} className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground">{layer.hidden ? <EyeOff className="size-3"/> : <Eye className="size-3"/>}</button>
                    {layer.kind === "background" ? <Image className="size-3 shrink-0"/> : layer.kind === "text" ? <Type className="size-3 shrink-0"/> : <RectangleHorizontal className="size-3 shrink-0"/>}
                    <span className={cn("min-w-0 flex-1 truncate", layer.hidden && "line-through opacity-50")}>{layer.name}</span>
                    {layer.kind !== "background" && <>
                      <button type="button" aria-label={`Move ${layer.name} up`} onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 1); }} className="flex size-4 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/layer:opacity-100 hover:bg-white/10"><ArrowUp className="size-3"/></button>
                      <button type="button" aria-label={`Move ${layer.name} down`} onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, -1); }} className="flex size-4 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/layer:opacity-100 hover:bg-white/10"><ArrowDown className="size-3"/></button>
                    </>}
                  </div>
                ))}
              </div>
            </section>

            {selected && (
              <>
                <section className="border-b border-border p-3">
                  <h3 className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Transform</h3>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">{(["x", "y", "w", "h"] as const).map((field) => <NumberField key={field} label={field.toUpperCase()} value={Math.round(selected[field])} onChange={(value) => patchLayer(selected.id, { [field]: value })}/>)}</div>
                  <RangeRow label="Rotation" value={selected.rotation} min={-180} max={180} suffix="°" onChange={(v) => patchLayer(selected.id, { rotation: v })}/>
                  <RangeRow label="Opacity" value={selected.opacity} min={0} max={100} suffix="%" onChange={(v) => patchLayer(selected.id, { opacity: v })}/>
                  <RangeRow label="Label size" value={selected.fontSize} min={8} max={40} suffix="px" onChange={(v) => patchLayer(selected.id, { fontSize: v })}/>
                </section>
                <section className="border-b border-border p-3">
                  <h3 className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Appearance</h3>
                  <label className="mt-2 block"><span className="mb-1 block text-[9px] text-muted-foreground">Preset</span><select value={selected.preset} onChange={(e) => applyPreset(selected.id, e.target.value)} className="h-7 w-full rounded-md border border-border bg-background px-2 text-[10px] text-foreground outline-none"><option value="custom">Custom per block</option><option value="wireframe">Wireframe</option><option value="soft">Soft surface</option><option value="solid">Solid fill</option></select></label>
                  <div className="mt-2 grid grid-cols-2 gap-2"><ColorField label="Fill" value={selected.fill} disabled={selected.noFill || selected.kind === "background"} onChange={(fill) => patchLayer(selected.id, { fill })}/><ColorField label="Stroke" value={selected.stroke} onChange={(stroke) => patchLayer(selected.id, { stroke })}/></div>
                  <RangeRow label="Stroke width" value={selected.strokeWidth} min={0} max={8} suffix="px" onChange={(v) => patchLayer(selected.id, { strokeWidth: v })}/>
                  <ToggleRow label="Dashed outline" checked={selected.dashed} onChange={(dashed) => patchLayer(selected.id, { dashed })}/><ToggleRow label="No fill" checked={selected.noFill} onChange={(noFill) => patchLayer(selected.id, { noFill })}/><ToggleRow label="Show labels" checked={selected.showLabel} onChange={(showLabel) => patchLayer(selected.id, { showLabel })}/>
                </section>
                <section className="border-b border-border p-3">
                  <h3 className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Typography</h3>
                  <label className="mt-2 block"><span className="mb-1 block text-[9px] text-muted-foreground">Font family · required</span><Input list={`font-list-${selected.id}`} value={selected.fontFamily} onChange={(e) => patchLayer(selected.id, { fontFamily: e.target.value })} aria-label="Font family" placeholder="Type any font family" className="h-7 text-[10px]"/><datalist id={`font-list-${selected.id}`}>{FONT_FAMILIES.map((font) => <option key={font} value={font}/>)}</datalist></label>
                  <label className="mt-2 block"><span className="mb-1 block text-[9px] text-muted-foreground">Layer name</span><Input value={selected.name} onChange={(e) => patchLayer(selected.id, { name: e.target.value })} aria-label="Layer name" className="h-7 text-[10px]"/></label>
                  {selected.kind === "text" && <label className="mt-2 block"><span className="mb-1 block text-[9px] text-muted-foreground">Text content</span><Input value={selected.label ?? ""} onChange={(e) => patchLayer(selected.id, { label: e.target.value })} aria-label="Selection label" className="h-7 text-[10px]"/></label>}
                  <div className="mt-2 grid grid-cols-2 gap-2"><label className="block"><span className="mb-1 block text-[9px] text-muted-foreground">Weight</span><select value={selected.fontWeight} onChange={(e) => patchLayer(selected.id, { fontWeight: Number(e.target.value) })} className="h-7 w-full rounded-md border border-border bg-background px-2 text-[10px] text-foreground outline-none">{[400,500,600,700,800].map((v) => <option key={v} value={v}>{v}</option>)}</select></label><label className="block"><span className="mb-1 block text-[9px] text-muted-foreground">Line height</span><select value={selected.lineHeight} onChange={(e) => patchLayer(selected.id, { lineHeight: Number(e.target.value) })} className="h-7 w-full rounded-md border border-border bg-background px-2 text-[10px] text-foreground outline-none">{[1,1.2,1.3,1.5,1.8].map((v) => <option key={v} value={v}>{v}</option>)}</select></label></div>
                  <RangeRow label="Letter spacing" value={selected.letterSpacing} min={-2} max={12} suffix="px" onChange={(v) => patchLayer(selected.id, { letterSpacing: v })}/>
                  <button
                    type="button"
                    onClick={() => setLayers((prev) => prev.map((layer) => layer.kind === "background" ? layer : { ...layer, fontFamily: selected.fontFamily, fontWeight: selected.fontWeight, fontSize: selected.fontSize, lineHeight: selected.lineHeight, letterSpacing: selected.letterSpacing }))}
                    className="mt-2 h-7 w-full rounded-md border border-border text-[9px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Apply font to all layout layers
                  </button>
                </section>
              </>
            )}

            <section className="mt-auto border-t border-border p-3">
              <h3 className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Stage</h3>
              <div className="mt-2 grid grid-cols-2 gap-2"><NumberField label="Width" value={stage.width} onChange={(width) => setStage((s) => ({ ...s, width }))}/><NumberField label="Height" value={stage.height} onChange={(height) => setStage((s) => ({ ...s, height }))}/></div>
              <RangeRow label="Zoom" value={zoom} min={50} max={150} suffix="%" onChange={setZoom}/>
              <ToggleRow label="Grid" checked={grid} onChange={setGrid}/>
              <RangeRow label="Grid size" value={gridSize} min={4} max={32} suffix="px" onChange={setGridSize}/>
              <ToggleRow label="Snap to grid" checked={snap} onChange={setSnap}/>
              <button type="button" onClick={() => setZoom(100)} className="mt-2 h-7 w-full rounded-md border border-border text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">Reset zoom to 100%</button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function BackgroundLayerView({ layer, selected, onSelect, onResize }: { layer: CanvasLayer; selected: boolean; onSelect: () => void; onResize: (e: React.PointerEvent, layer: CanvasLayer, handle: NonNullable<PointerDrag["handle"]>) => void }) {
  return (
    <div data-layer-id={layer.id} role="button" tabIndex={0} aria-label={`${layer.name} layer`} onPointerDown={(e) => { e.stopPropagation(); onSelect(); }} style={{ position: "absolute", inset: 0, zIndex: layer.z, opacity: layer.hidden ? 0 : layer.opacity / 100, background: layer.mediaPoster && !layer.mediaUrl ? `url(${JSON.stringify(layer.mediaPoster)}) center / cover` : undefined, pointerEvents: "none" }}>
      {layer.mediaUrl?.startsWith("blob:") || layer.mediaUrl?.includes(".mp4") ? <video src={layer.mediaUrl} poster={layer.mediaPoster} autoPlay muted loop playsInline className="pointer-events-none size-full object-cover"/> : layer.mediaUrl && <div className="pointer-events-none size-full bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(layer.mediaUrl)})` }}/>}
      {!layer.mediaUrl && !layer.mediaPoster && <div className="pointer-events-none size-full bg-[#101016]"/>}
      {selected && <SelectionOutline layer={layer} onResize={onResize}/>}
    </div>
  );
}

function SelectionOutline({ layer, onResize }: { layer: CanvasLayer; onResize: (e: React.PointerEvent, layer: CanvasLayer, handle: NonNullable<PointerDrag["handle"]>) => void }) {
  const handles: { id: NonNullable<PointerDrag["handle"]>; pos: string }[] = [
    { id: "nw", pos: "-left-1 -top-1 cursor-nwse-resize" }, { id: "n", pos: "left-1/2 -top-1 -translate-x-1/2 cursor-ns-resize" }, { id: "ne", pos: "-right-1 -top-1 cursor-nesw-resize" },
    { id: "e", pos: "-right-1 top-1/2 -translate-y-1/2 cursor-ew-resize" }, { id: "se", pos: "-right-1 -bottom-1 cursor-nwse-resize" }, { id: "s", pos: "left-1/2 -bottom-1 -translate-x-1/2 cursor-ns-resize" },
    { id: "sw", pos: "-left-1 -bottom-1 cursor-nesw-resize" }, { id: "w", pos: "-left-1 top-1/2 -translate-y-1/2 cursor-ew-resize" },
  ];
  return <><span className="pointer-events-none absolute -inset-[1px] z-20 border border-violet-400"/>{handles.map(({id,pos})=><span key={id} data-resize-handle={id} onPointerDown={(e)=>onResize(e,layer,id)} className={cn("absolute z-30 size-2 rounded-[2px] border border-violet-400 bg-white",pos)}/>)}<span className="pointer-events-none absolute -bottom-5 left-0 z-30 rounded bg-violet-500 px-1 text-[8px] font-medium text-white">{Math.round(layer.w)} × {Math.round(layer.h)}</span></>;
}

function RangeRow({ label, value, min, max, suffix, onChange, disabled }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void; disabled?: boolean }) {
  return <label className={cn("mt-3 block", disabled && "opacity-40")}><span className="flex items-center justify-between text-[9px] text-muted-foreground"><span>{label}</span><span className="font-mono text-foreground/80">{value}{suffix}</span></span><input disabled={disabled} type="range" min={min} max={max} step={1} value={value} onChange={(e)=>onChange(Number(e.target.value))} aria-label={label} className="mt-1.5 h-1 w-full cursor-pointer accent-[#b48aff] disabled:cursor-not-allowed"/></label>;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v:boolean)=>void }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={()=>onChange(!checked)} className="mt-3 flex w-full items-center justify-between text-[10px] text-muted-foreground">{label}<span className={cn("relative h-3 w-6 rounded-full transition-colors",checked?"bg-violet-500":"bg-white/15")}><span className={cn("absolute top-0.5 size-2 rounded-full bg-white transition-transform",checked?"translate-x-3.5":"translate-x-0.5")}/></span></button>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v:number)=>void }) {
  return <label className="block"><span className="mb-1 block text-[9px] text-muted-foreground">{label}</span><input type="number" min={100} max={2048} value={value} onChange={(e)=>onChange(clamp(Number(e.target.value)||100,100,2048))} aria-label={`Stage ${label}`} className="h-7 w-full rounded-md border border-border bg-background px-2 font-mono text-[10px] text-foreground outline-none focus:border-taro/50"/></label>;
}

function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (v:string)=>void }) {
  return <label className={cn("block",disabled&&"opacity-40")}><span className="mb-1 block text-[9px] text-muted-foreground">{label}</span><span className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-1.5"><input disabled={disabled} type="color" value={normalizeColor(value)} onChange={(e)=>onChange(e.target.value)} aria-label={`${label} color`} className="size-4 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed"/><input disabled={disabled} value={value} onChange={(e)=>onChange(e.target.value)} aria-label={`${label} hex`} className="min-w-0 flex-1 bg-transparent font-mono text-[9px] text-foreground outline-none disabled:cursor-not-allowed"/></span></label>;
}

function BackgroundPicker({ items, activeTab, setTab, query, setQuery, selectedId, onSelect }: { items: MediaItem[]; activeTab: "gallery"|"your-media"; setTab: (v:"gallery"|"your-media")=>void; query: string; setQuery: (v:string)=>void; selectedId?: string; onSelect: (m:MediaItem)=>void }) {
  return <div data-background-picker="true" className="animate-pop absolute left-0 top-full z-50 mt-1.5 w-[260px] rounded-xl border border-border bg-[#15141a] p-2 shadow-2xl shadow-black/70"><div className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5"><button type="button" onClick={()=>setTab("gallery")} aria-pressed={activeTab==="gallery"} className={cn("h-6 flex-1 rounded-md px-1.5 text-[9px]",activeTab==="gallery"?"bg-accent text-foreground":"text-muted-foreground")}>Gallery</button><button type="button" onClick={()=>setTab("your-media")} aria-pressed={activeTab==="your-media"} className={cn("h-6 flex-1 rounded-md px-1.5 text-[9px]",activeTab==="your-media"?"bg-accent text-foreground":"text-muted-foreground")}>Your Media</button></div><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search backgrounds…" aria-label="Search backgrounds" className="mt-1.5 h-7 text-[10px]"/><div className="scrollbar-thin mt-1.5 grid max-h-48 grid-cols-3 gap-1 overflow-y-auto">{items.map((item)=><button key={item.id} type="button" title={item.title} aria-label={`Use background ${item.title}`} onClick={()=>onSelect(item)} className={cn("group/item relative aspect-[4/3] overflow-hidden rounded-md border bg-background text-left",selectedId===item.id?"border-violet-400 ring-1 ring-violet-400/50":"border-border hover:border-[#555]")}>{item.poster?<img src={item.poster} alt="" loading="lazy" className="size-full object-cover"/>:<div className="size-full bg-gradient-to-br from-[#222] to-[#111]"/>}<span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1 py-0.5 text-[8px] text-white/85">{item.title}</span></button>)}{items.length===0&&<p className="col-span-3 py-5 text-center text-[9px] text-muted-foreground">No matching backgrounds.</p>}</div><p className="mt-1.5 text-[8px] text-muted-foreground/70">Selected video is added as the bottom layer.</p></div>;
}

function normalizeColor(v:string){return /^#[0-9a-fA-F]{6}$/.test(v)?v:"#141320";}
function escapeXml(v:string){return v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}
