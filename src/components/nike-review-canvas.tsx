import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Frame,
  Gauge,
  Hash,
  Layers,
  LayoutGrid,
  Loader2,
  Lock,
  MessageSquarePlus,
  Minus,
  Monitor,
  MousePointer2,
  Play,
  Plus,
  RectangleHorizontal,
  RotateCw,
  Scan,
  type LucideIcon,
} from "lucide-react";
import { CommentComposer, ReviewThreadCard } from './review-comments';
import { useReviewComments } from './review-state';
import { reviewRepository } from '@/lib/review-persistence';
import { browserPreviewKey, type BrowserCapture, type BrowserRequest } from '@/lib/review-browser';
import { registerReviewInspector } from '@/lib/review-tools';
import { activeRevision, reviewScopeKey, setReviewViewport, type ReviewPreview, type ReviewScope, type ReviewComponent, type ReviewRect } from '@/lib/review-store';
import { cn } from "@/utils/cn";
import { useSettings } from "@/components/settings/settings-context";

export function EmptyReviewCanvas() {
  return <section aria-label="Review mode" className="flex min-w-0 flex-1 flex-col bg-[#0b0b0b]">
    <div className="flex h-10 shrink-0 items-center border-b border-border px-4 text-xs font-medium text-muted-foreground">Review mode</div>
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-white/[0.02]"><Layers className="size-5 text-muted-foreground/65"/></div>
      <h2 className="text-sm font-medium text-foreground">Nothing has appeared yet</h2>
      <p className="max-w-60 text-xs leading-5 text-muted-foreground">Build a screen with an agent to see it here.</p>
    </div>
  </section>;
}

/* ------------------------------------------------------------------
 * Types & seed data
 * ------------------------------------------------------------------ */

type ToolId = "select" | "annotate" | "frame" | "device" | "shape";
type Mode = "inspect" | "prototype";
type SelectableId = "hero" | "banner" | "ctas" | "cards";
type ZoomMode = "fit" | number;

interface Pin {
  id: string;
  x: number;
  y: number;
  author: string;
  role: string;
  time: string;
  text: string;
}

interface Dimension {
  id: string; // "responsive" | preset id | "custom"
  width: number;
  height: number;
}

const TOOLS: { id: ToolId; icon: LucideIcon; label: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select (V)" },
  { id: "annotate", icon: MessageSquarePlus, label: "Annotate (C)" },
  { id: "frame", icon: Frame, label: "Frame (F)" },
  { id: "device", icon: Monitor, label: "Device preview" },
  { id: "shape", icon: RectangleHorizontal, label: "Shape (R)" },
];

const TOKENS = [
  { name: "paper", hex: "#FAFAF8" },
  { name: "ink", hex: "#0A0A0A" },
  { name: "ember", hex: "#FF4D00" },
  { name: "moss", hex: "#1A2E1F" },
  { name: "sand", hex: "#E8E1D5" },
];

const CARDS = [
  {
    label: "Best seller",
    bg: "#101010",
    img: "https://images.pexels.com/photos/17918935/pexels-photo-17918935.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    alt: "Black, white and red sneakers on a black background",
  },
  {
    label: "Reissue",
    bg: "#E8E1D5",
    img: "https://images.pexels.com/photos/28645957/pexels-photo-28645957.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    alt: "White sport shoe floating against an orange backdrop",
  },
  {
    label: "Gore-tex",
    bg: "#1A2E1F",
    img: "https://images.pexels.com/photos/12284354/pexels-photo-12284354.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    alt: "Sports shoes in low light",
  },
];

const SEED_PINS: Pin[] = [
  {
    id: "pin-1",
    x: 11,
    y: 33,
    author: "Aria",
    role: "Designer agent",
    time: "09:42",
    text: "Tracking at −0.045em keeps the serif calm against the bold sans. Ship it?",
  },
  {
    id: "pin-2",
    x: 23,
    y: 66,
    author: "Aria",
    role: "Designer agent",
    time: "09:44",
    text: "Ember CTA now passes AA — contrast fixed 3.1:1 → 4.8:1.",
  },
  {
    id: "pin-3",
    x: 79,
    y: 84,
    author: "Theo",
    role: "Type & QA",
    time: "09:51",
    text: "Gore-tex card reads muddy at small sizes. Try the sand treatment here?",
  },
];

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const RESPONSIVE: Dimension = { id: "responsive", width: 920, height: 370 };

const DEVICE_GROUPS: { group: string; items: { id: string; name: string; width: number; height: number }[] }[] = [
  {
    group: "Mobile",
    items: [
      { id: "iphone-se", name: "iPhone SE", width: 375, height: 667 },
      { id: "iphone-16", name: "iPhone 16", width: 393, height: 852 },
      { id: "iphone-16-pm", name: "iPhone 16 Pro Max", width: 440, height: 956 },
      { id: "pixel-9", name: "Pixel 9", width: 412, height: 915 },
      { id: "pixel-9-pro", name: "Pixel 9 Pro", width: 412, height: 915 },
      { id: "pixel-10", name: "Pixel 10", width: 412, height: 915 },
      { id: "galaxy-a55", name: "Samsung Galaxy A55", width: 360, height: 780 },
    ],
  },
  {
    group: "Foldables",
    items: [
      { id: "pixel-9-pro-fold", name: "Pixel 9 Pro Fold", width: 603, height: 860 },
      { id: "galaxy-z-fold-6", name: "Galaxy Z Fold 6", width: 673, height: 856 },
    ],
  },
  {
    group: "Tablets & Desktops",
    items: [
      { id: "ipad-mini", name: "iPad Mini", width: 744, height: 1133 },
      { id: "ipad-pro-13", name: "iPad Pro 13", width: 1032, height: 1376 },
      { id: "surface-pro-10", name: "Surface Pro 10", width: 1280, height: 800 },
    ],
  },
  {
    group: "Smart Displays",
    items: [{ id: "nest-hub-max", name: "Nest Hub Max", width: 1280, height: 600 }],
  },
];


const dimensionName = (id: string) => {
  if (id === "responsive") return "Responsive";
  if (id === "custom") return "Custom";
  for (const { items } of DEVICE_GROUPS) {
    const hit = items.find((d) => d.id === id);
    if (hit) return hit.name;
  }
  return "Custom";
};

/* ------------------------------------------------------------------
 * Dismiss helper (outside click + Escape)
 * ------------------------------------------------------------------ */

function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, onClose]);
}

/* ------------------------------------------------------------------
 * Review canvas
 * ------------------------------------------------------------------ */

export function NikeReviewCanvas({scope,preview}:{scope:ReviewScope;preview:ReviewPreview}) {
  const { canvasGrid } = useSettings().appearance;
  const [tool, setTool] = React.useState<ToolId>("select");
  const [mode, setMode] = React.useState<Mode>("inspect");
  const [zoom, setZoom] = React.useState<ZoomMode>("fit");
  const [dimension, setDimension] = React.useState<Dimension>({...preview.viewport,id:'custom'});
  const [showGuides, setShowGuides] = React.useState(true);
  const [showOverlays, setShowOverlays] = React.useState(true);
  const [showPins, setShowPins] = React.useState(true);
  const [selected, setSelected] = React.useState<SelectableId>("hero");
  const artboardRef=React.useRef<HTMLDivElement>(null);
  const [artboardHeight,setArtboardHeight]=React.useState(720);
  const comments=useReviewComments(scope,preview.id,preview.revisionId);
  const [draft,setDraft]=React.useState<{x:number;y:number}|null>(null);
  const [measure,setMeasure]=React.useState<ReviewComponent>();
  const [anchorRects,setAnchorRects]=React.useState<Record<string,ReviewRect>>({});
  const anchorSelectors=preview.threads.flatMap(t=>t.anchor.selector?[t.anchor.selector]:[]),anchorKey=JSON.stringify(anchorSelectors);
  const pins:Pin[]=preview.threads.filter(t=>!t.resolved&&t.revisionId===preview.revisionId).map(t=>{const rect=t.anchor.selector?anchorRects[t.anchor.selector]:undefined;return {id:t.id,x:rect?(rect.x+rect.width/2)/preview.viewport.width*100:t.anchor.percent?t.anchor.x:t.anchor.x/preview.viewport.width*100,y:rect?(rect.y+rect.height/2)/artboardHeight*100:t.anchor.percent?t.anchor.y:t.anchor.y/artboardHeight*100,author:t.messages[0].author,role:t.messages[0].role,time:SEED_PINS.find(p=>p.id===t.id)?.time??new Date(t.messages[0].createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),text:t.messages[0].body};});
  const [openPinId, setOpenPinId] = React.useState<string | null>("pin-1");

  const [dimOpen, setDimOpen] = React.useState(false);
  const [zoomOpen, setZoomOpen] = React.useState(false);
  const dimRef = React.useRef<HTMLDivElement>(null);
  const zoomRef = React.useRef<HTMLDivElement>(null);
  useDismiss(dimOpen, dimRef, React.useCallback(() => setDimOpen(false), []));
  useDismiss(zoomOpen, zoomRef, React.useCallback(() => setZoomOpen(false), []));

  // Web-page load
  const [reloadKey, setReloadKey] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const reload = React.useCallback(() => {
    if (loading) return;
    setLoading(true);
    window.setTimeout(() => {
      setReloadKey((k) => k + 1);
      setLoading(false);
    }, 500);
  }, [loading]);

  // Measure the scroll container so "Fit to window" is real.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [available, setAvailable] = React.useState(0);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvailable(el.clientWidth));
    ro.observe(el);
    setAvailable(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const baseWidth = dimension.id === "responsive" ? RESPONSIVE.width : dimension.width;
  const scale = zoom === "fit" ? (available > 0 ? Math.min(1, (available - 48) / baseWidth) : 1) : zoom;
  const displayWidth = Math.max(160, Math.round(baseWidth * scale));
  const displayHeight = Math.round(dimension.height * scale);

  const overlaysVisible = mode === "inspect" && showOverlays;
  const pinsVisible = showPins && overlaysVisible;
  const openPin = pins.find((p) => p.id === openPinId) ?? null;
  const openThread=preview.threads.find(t=>t.id===openPinId);
  const key=browserPreviewKey(reviewScopeKey(scope),preview.id,activeRevision(preview).id);
  React.useEffect(()=>{
    const node=artboardRef.current;if(!node)return;
    const observer=new ResizeObserver(()=>setArtboardHeight(node.offsetHeight));observer.observe(node);setArtboardHeight(node.offsetHeight);return()=>observer.disconnect();
  },[reloadKey]);
  const inspect=React.useCallback(async(request:BrowserRequest):Promise<BrowserCapture>=>{
    if(request.viewport){setDimension({...request.viewport,id:'custom'});await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));}
    const root=artboardRef.current;if(!root)throw Error('Nike artboard is not mounted.');
    const rootRect=root.getBoundingClientRect(),ratio=rootRect.width/root.offsetWidth;
    const component=(element:Element):ReviewComponent=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return {selector:element.hasAttribute('data-review-component')?`[data-review-component="${element.getAttribute('data-review-component')}"]`:element.tagName.toLowerCase(),tag:element.tagName.toLowerCase(),text:(element.textContent??'').slice(0,300),rect:{x:(rect.x-rootRect.x)/ratio,y:(rect.y-rootRect.y)/ratio,width:rect.width/ratio,height:rect.height/ratio},styles:Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','display','padding','gap'].map(name=>[name,(style as unknown as Record<string,string>)[name]]))};};
    const nodes=[...root.querySelectorAll('[data-review-component]')],components=nodes.map(component);
    const selectedNode=request.selector?root.querySelector(request.selector):root.querySelector(`[data-review-component="${selected}"]`);
    if(request.selector&&!selectedNode)throw Error(`Component not found: ${request.selector}`);
    const selection=selectedNode?component(selectedNode):undefined;if(selection)setMeasure(selection);
    if(selectedNode?.hasAttribute('data-review-component'))setSelected(selectedNode.getAttribute('data-review-component') as SelectableId);
    const anchors:BrowserCapture['anchors']={};for(const selector of new Set([...(request.anchors??[]),...anchorSelectors])){const target=root.querySelector(selector);if(target)anchors[selector]=component(target).rect;}setAnchorRects(anchors);
    return {url:'nike:discovery/variant-b',title:'Discovery · Variant B',viewport:request.viewport??{width:baseWidth,height:dimension.height},document:{width:root.offsetWidth,height:root.offsetHeight,scrollX:0,scrollY:0},components,selection,anchors,screenshot:''};
  },[selected,baseWidth,dimension.height,anchorKey]);
  React.useEffect(()=>registerReviewInspector(key,inspect),[key,inspect]);
  React.useEffect(()=>{void inspect({key,action:'inspect'});},[inspect,key]);
  React.useEffect(()=>{if(preview.viewport.width!==baseWidth||preview.viewport.height!==dimension.height)void reviewRepository.change(scope,state=>setReviewViewport(state,preview.id,{width:baseWidth,height:dimension.height})).catch(()=>{});},[baseWidth,dimension.height]);

  const zoomLabel = zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`;
  const zoomIn = () => setZoom((z) => ZOOM_STEPS[Math.min(ZOOM_STEPS.indexOf(z === "fit" ? 1 : z) + 1, ZOOM_STEPS.length - 1)]);
  const zoomOut = () => setZoom((z) => ZOOM_STEPS[Math.max(ZOOM_STEPS.indexOf(z === "fit" ? 1 : z) - 1, 0)]);

  const setCustomSize = (width: number, height: number) => {
    const w = Math.min(2560, Math.max(100, Math.round(width)));
    const h = Math.min(2560, Math.max(100, Math.round(height)));
    setDimension({ id: "custom", width: w, height: h });
  };

  const handleSelect = (e: React.MouseEvent, id: SelectableId) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSelected(id);
  };

  // The comment button toggles the annotation circles.
  const togglePins = () => {
    const next = !showPins;
    setShowPins(next);
    if (next) setTool("annotate");
    else {
      if (tool === "annotate") setTool("select");
      setOpenPinId(null);
    }
  };

  const handleArtboardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== "annotate" || !pinsVisible) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(97, Math.max(3, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(97, Math.max(3, ((e.clientY - rect.top) / rect.height) * 100));
    setDraft({x,y});setOpenPinId(null);
  };

  return (
    <section className="animate-pop flex min-w-0 flex-1 flex-col bg-[#08080a]">
      {/* ---- Tools toolbar ------------------------------------------- */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
          {TOOLS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
                tool === id && "bg-accent text-foreground ring-1 ring-inset ring-white/[0.06]"
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5">
          <button type="button" onClick={zoomOut} title="Zoom out" aria-label="Zoom out" className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Minus className="size-3.5" />
          </button>
          <span className="w-14 text-center text-xs text-muted-foreground tabular-nums">{zoomLabel}</span>
          <button type="button" onClick={zoomIn} title="Zoom in" aria-label="Zoom in" className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Plus className="size-3.5" />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
          <button
            type="button"
            onClick={() => setMode("inspect")}
            aria-pressed={mode === "inspect"}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
              mode === "inspect" && "bg-blue-600/15 text-blue-400 ring-1 ring-inset ring-blue-500/40 hover:text-blue-400"
            )}
          >
            <Scan className="size-3.5" />
            Inspect
          </button>
          <button
            type="button"
            onClick={() => setMode("prototype")}
            aria-pressed={mode === "prototype"}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
              mode === "prototype" && "bg-accent text-foreground ring-1 ring-inset ring-white/[0.06]"
            )}
          >
            <Play className="size-3.5" />
            Prototype
          </button>
        </div>
      </div>

      {/* ---- Web bar (browser chrome + dimensions) -------------------- */}
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border bg-card/80 px-3">
        <button type="button" disabled title="Back" aria-label="Back" className="flex size-7 items-center justify-center rounded-md text-muted-foreground/50">
          <ArrowLeft className="size-3.5" />
        </button>
        <button type="button" disabled title="Forward" aria-label="Forward" className="flex size-7 items-center justify-center rounded-md text-muted-foreground/50">
          <ArrowRight className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={reload}
          title="Reload preview"
          aria-label="Reload preview"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RotateCw className={cn("size-3.5", loading && "animate-spin")} />
        </button>

        <div className="ml-1 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5">
          <Lock className="size-3 shrink-0 text-success/70" />
          <span className="truncate font-mono text-[11px] text-muted-foreground">discovery.taro.app/fig/variant-b</span>
          {loading && (
            <span className="ml-auto h-1 w-16 shrink-0 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full w-1/2 animate-pulse rounded-full bg-taro" />
            </span>
          )}
        </div>

        <span className="hidden shrink-0 pl-1 text-[11px] whitespace-nowrap text-muted-foreground lg:inline">Dimensions:</span>

        {/* Dimension preset menu */}
        <div ref={dimRef} className="relative shrink-0">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={dimOpen}
            onClick={() => setDimOpen((o) => !o)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] text-foreground/90 transition-colors hover:border-[#333]",
              dimOpen && "border-taro/40"
            )}
          >
            {dimensionName(dimension.id)}
            <svg viewBox="0 0 24 24" className={cn("size-3 text-muted-foreground transition-transform", dimOpen && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {dimOpen && (
            <div className="animate-pop absolute top-full right-0 z-50 mt-1.5 max-h-[340px] w-60 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-2xl shadow-black/70 scrollbar-thin" role="menu">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={dimension.id === "responsive"}
                onClick={() => {
                  setDimension(RESPONSIVE);
                  setDimOpen(false);
                }}
                className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent", dimension.id === "responsive" ? "text-foreground" : "text-muted-foreground")}
              >
                Responsive
                <span className="font-mono text-[10px] text-muted-foreground">{RESPONSIVE.width} × {RESPONSIVE.height}</span>
              </button>

              {DEVICE_GROUPS.map(({ group, items }) => (
                <div key={group}>
                  <p className="px-2.5 pt-2 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">{group}</p>
                  {items.map((device) => (
                    <button
                      key={device.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={dimension.id === device.id}
                      onClick={() => {
                        setDimension({ id: device.id, width: device.width, height: device.height });
                        setDimOpen(false);
                      }}
                      className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent", dimension.id === device.id ? "text-foreground" : "text-muted-foreground")}
                    >
                      {device.name}
                      <span className="font-mono text-[10px] text-muted-foreground">{device.width} × {device.height}</span>
                    </button>
                  ))}
                </div>
              ))}

              <div className="mx-2 my-1 h-px bg-border" />
              <div
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px]",
                  dimension.id === "custom" ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Custom
                {dimension.id === "custom" && <span className="font-mono text-[10px] text-muted-foreground">{dimension.width} × {dimension.height}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Custom width × height */}
        <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <input
            type="number"
            value={dimension.id === "responsive" ? RESPONSIVE.width : dimension.width}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setCustomSize(v, dimension.id === "responsive" ? RESPONSIVE.height : dimension.height);
            }}
            aria-label="Viewport width"
            className="h-7 w-[54px] rounded-md border border-border bg-background px-1.5 text-center font-mono text-[11px] text-foreground outline-none focus:border-taro/50"
          />
          <span>×</span>
          <input
            type="number"
            value={dimension.id === "responsive" ? RESPONSIVE.height : dimension.height}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setCustomSize(dimension.id === "responsive" ? RESPONSIVE.width : dimension.width, v);
            }}
            aria-label="Viewport height"
            className="h-7 w-[54px] rounded-md border border-border bg-background px-1.5 text-center font-mono text-[11px] text-foreground outline-none focus:border-taro/50"
          />
        </div>

        {/* Zoom menu */}
        <div ref={zoomRef} className="relative shrink-0">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={zoomOpen}
            onClick={() => setZoomOpen((o) => !o)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] text-foreground/90 transition-colors hover:border-[#333]",
              zoomOpen && "border-taro/40"
            )}
          >
            {zoom === "fit" ? "Fit to window" : `${Math.round(zoom * 100)}%`}
            <svg viewBox="0 0 24 24" className={cn("size-3 text-muted-foreground transition-transform", zoomOpen && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {zoomOpen && (
            <div className="animate-pop absolute top-full right-0 z-50 mt-1.5 w-36 rounded-xl border border-border bg-popover p-1 shadow-2xl shadow-black/70" role="menu">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={zoom === "fit"}
                onClick={() => {
                  setZoom("fit");
                  setZoomOpen(false);
                }}
                className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent", zoom === "fit" ? "text-foreground" : "text-muted-foreground")}
              >
                Fit to window
                {zoom === "fit" && <Check className="size-3.5 text-taro" />}
              </button>
              {ZOOM_STEPS.map((step) => (
                <button
                  key={step}
                  type="button"
                  role="menuitemradio"
                  aria-checked={zoom === step}
                  onClick={() => {
                    setZoom(step);
                    setZoomOpen(false);
                  }}
                  className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent", zoom === step ? "text-foreground" : "text-muted-foreground")}
                >
                  {Math.round(step * 100)}%
                  {zoom === step && <Check className="size-3.5 text-taro" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- File / variant bar -------------------------------------- */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card/60 px-4 text-xs">
        <Hash className="size-3.5 text-muted-foreground" />
        <span className="text-foreground/85">Screens/discovery.fig</span>
        <span className="text-muted-foreground/50">·</span>
        <span className="text-muted-foreground">{baseWidth}px</span>
        <span className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-blue-600/15 px-1.5 py-0.5 text-[11px] font-medium text-blue-400 ring-1 ring-inset ring-blue-500/30">
          <span className="size-1.5 animate-pulse rounded-full bg-blue-400" />
          Variant B · live
        </span>
        <div className="ml-auto flex items-center gap-4 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Layers className="size-3.5" />
            48 layers
          </span>
          <span className="flex items-center gap-1.5 tabular-nums">
            <Eye className="size-3.5" />
            {Math.round(scale * 100)}% · sRGB
          </span>
        </div>
      </div>

      {/* ---- Canvas: preview directly below the tools ----------------- */}
      <div
        ref={scrollRef}
        className={cn(
          "scrollbar-thin min-h-0 flex-1 overflow-auto",
          canvasGrid &&
            "bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.055)_1px,transparent_0)] [background-size:22px_22px]"
        )}
      >
        <div className="px-10 py-10">
          <div
            className="relative mx-auto"
            style={{ width: displayWidth, height:Math.max(displayHeight,artboardHeight*scale) }}
          >
            {/* Annotation dock — straddles the preview's left border */}
            <div className="absolute top-24 -left-6 z-40 flex flex-col items-center gap-0.5 rounded-2xl border border-border bg-popover/95 p-1 shadow-2xl shadow-black/60 backdrop-blur">
              <DockButton icon={MousePointer2} label="Select (V)" active={tool === "select"} onClick={() => setTool("select")} />
              <DockButton
                icon={MessageSquarePlus}
                label={pinsVisible ? "Hide comments (C)" : "Show comments (C)"}
                active={pinsVisible}
                dimmed={!showPins}
                onClick={togglePins}
                badge={pins.length}
              />
              <span className="my-0.5 h-px w-5 bg-border" />
              <DockButton icon={LayoutGrid} label="Toggle column guides" active={overlaysVisible && showGuides} onClick={() => setShowGuides((g) => !g)} />
              <DockButton icon={showOverlays ? Eye : EyeOff} label="Toggle borders & annotations" active={overlaysVisible} onClick={() => setShowOverlays((o) => !o)} />
            </div>

            {/* The mock web page — keyed so reload remounts it */}
            <div key={reloadKey} style={{width:baseWidth,transform:`scale(${scale})`,transformOrigin:'top left'}} className={cn("transition-opacity duration-300", loading && "opacity-40")}>
              <div
                ref={artboardRef}
                data-artboard="true"
                onClick={handleArtboardClick}
                className={cn(
                  "@container relative w-full rounded-xl bg-[#FAFAF8] text-[#0A0A0A] shadow-[0_24px_80px_-16px_rgba(0,0,0,0.85)] ring-1 ring-white/10",
                  tool === "annotate" && pinsVisible && "cursor-crosshair"
                )}
              >
                {/* Page nav */}
                <div className="flex items-center gap-7 px-10 pt-6 text-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-black">
                    <span className="size-3.5 rounded-full border-[2.5px] border-white" />
                  </span>
                  <span className="font-semibold">Discover</span>
                  <span className="hidden text-neutral-500 @[420px]:inline">Collections</span>
                  <span className="hidden text-neutral-500 @[520px]:inline">Athletes</span>
                  <span className="hidden text-neutral-500 @[620px]:inline">Journal</span>
                  <span className="ml-auto hidden w-40 shrink-0 rounded-full bg-neutral-200/70 px-3 py-1.5 text-[13px] text-neutral-400 @[480px]:block">
                    Search drops…
                  </span>
                  <span className="shrink-0 rounded-full bg-black px-4 py-1.5 text-[13px] font-medium text-white">
                    Shop
                  </span>
                </div>

                {/* Banner sticker */}
                <div
                  data-review-component="banner"
                  onClick={(e) => handleSelect(e, "banner")}
                  className="relative mx-10 mt-6 flex items-center gap-3 rounded-lg border border-dashed border-orange-400/90 bg-orange-50/70 px-4 py-2.5 text-[13px]"
                >
                  <span className="font-semibold whitespace-nowrap text-orange-600">New · Air Velocity Pack</span>
                  <span className="truncate text-neutral-500">Drop 04 — engineered for motion</span>
                  <span className="ml-auto flex shrink-0 items-center gap-0.5 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
                    8pt
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                  {overlaysVisible && selected === "banner" && <SelectionFrame />}
                </div>

                {/* Hero */}
                <div data-review-component="hero" onClick={(e) => handleSelect(e, "hero")} className="relative mx-10 mt-10">
                  <h1 className="text-[8.8cqw] leading-[0.96]">
                    <span className="block font-bold tracking-[-0.03em]">Move in</span>
                    <span className="block font-serif italic">the future.</span>
                  </h1>
                  {overlaysVisible && selected === "hero" && (
                    <SelectionFrame>
                      <span className="absolute -top-[11px] left-1/2 -translate-x-1/2 rounded bg-blue-600 px-1.5 py-px text-[10px] leading-4 font-medium whitespace-nowrap text-white">
                        12 col · 24px gutter
                      </span>
                      <span className="absolute -bottom-[13px] left-2 flex gap-1.5">
                        <span className="flex items-center rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] text-sky-700 ring-1 ring-sky-300">
                          Display XL · 76/72 · −0.045em
                        </span>
                        <span className="flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 ring-1 ring-emerald-300">
                          AA 14.2:1
                          <Check className="size-2.5" strokeWidth={3} />
                        </span>
                      </span>
                    </SelectionFrame>
                  )}
                </div>

                {/* Copy + CTAs */}
                <div data-review-component="ctas" onClick={(e) => handleSelect(e, "ctas")} className="relative mx-10 mt-12">
                  <p className="max-w-[52ch] text-[15px] leading-relaxed text-neutral-600">
                    Discovery reimagined — curated drops, athlete stories and adaptive fit. Designed
                    with Aria, tuned for conversion.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <span className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800">
                      Explore collection
                    </span>
                    <span className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium transition hover:border-neutral-900">
                      Watch film
                    </span>
                  </div>
                  {overlaysVisible && selected === "ctas" && <SelectionFrame />}
                </div>

                {/* Product cards */}
                <div
                  data-review-component="cards"
                  onClick={(e) => handleSelect(e, "cards")}
                  className="relative mx-10 mt-10 grid grid-cols-1 gap-4 pb-10 @[420px]:grid-cols-3"
                >
                  {CARDS.map((card) => (
                    <div
                      key={card.label}
                      className="relative h-[150px] overflow-hidden rounded-2xl"
                      style={{ backgroundColor: card.bg }}
                    >
                      <img src={card.img} alt={card.alt} className="absolute inset-0 h-full w-full object-cover" />
                      <span className="absolute top-3 left-3 z-10 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-black backdrop-blur">
                        {card.label}
                      </span>
                      {overlaysVisible && (
                        <span className="pointer-events-none absolute inset-0 z-10 rounded-2xl border border-dashed border-violet-400/80" />
                      )}
                    </div>
                  ))}
                  {overlaysVisible && selected === "cards" && <SelectionFrame />}
                </div>

                {/* 12-column guides */}
                {overlaysVisible && showGuides && (
                  <div className="pointer-events-none absolute inset-y-0 right-10 left-10 z-10 grid grid-cols-12 gap-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span key={i} className="border-x border-dashed border-sky-400/25 bg-sky-400/[0.04]" />
                    ))}
                  </div>
                )}

                {/* Annotation pins — hidden by the comment button */}
                {pinsVisible &&
                  pins.map((pin) => (
                    <button
                      key={pin.id}
                      type="button"
                      aria-label={`Annotation by ${pin.author}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenPinId((cur) => (cur === pin.id ? null : pin.id));
                      }}
                      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                      className={cn(
                        "absolute z-30 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-violet-600 text-[11px] font-semibold text-white shadow-lg ring-2 ring-white/80 transition-transform hover:scale-110",
                        openPinId === pin.id && "scale-110 bg-violet-500"
                      )}
                    >
                      {pins.indexOf(pin) + 1}
                    </button>
                  ))}

                {/* Open annotation card */}
                {pinsVisible && openPin && openThread && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ left: `${openPin.x}%`, top: `${openPin.y}%` }}
                    className={cn(
                      "animate-pop absolute z-40 w-60 -translate-y-1/2",
                      openPin.x > 55 ? "-translate-x-[calc(100%+16px)]" : "translate-x-4"
                    )}
                  >
                    <ReviewThreadCard thread={openThread} onClose={()=>setOpenPinId(null)} onReply={body=>comments.reply(openThread.id,body)} onResolve={resolved=>comments.resolve(openThread.id,resolved)}/>
                  </div>
                )}

                {pinsVisible&&draft&&<div className="review-floating-comment" style={{left:`${Math.min(draft.x,65)}%`,top:`${Math.min(draft.y,65)}%`}} onClick={event=>event.stopPropagation()}><div className="review-thread"><strong>New comment</strong><CommentComposer onCancel={()=>setDraft(null)} onSubmit={async body=>{await comments.add(body,{...draft,percent:true,viewport:preview.viewport});setDraft(null);}}/></div></div>}

                {/* Reloading overlay */}
                {loading && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-[#08080a]/30">
                    <Loader2 className="size-6 animate-spin text-taro" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Tokens / design score bar -------------------------------- */}
      {measure&&<div className="review-footer"><code>{measure.selector}</code><span>{Math.round(measure.rect.width)} × {Math.round(measure.rect.height)} px</span><span>Measured in CSS pixels</span></div>}
      <div className="flex h-12 shrink-0 items-center gap-2 border-t border-border bg-card px-4">
        <span className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground">TOKENS</span>
        {TOKENS.map((token, i) => (
          <button
            key={token.name}
            type="button"
            title={`${token.name} ${token.hex}`}
            className={cn(
              "items-center gap-1.5 rounded-full border border-border px-2 py-1 transition-colors hover:border-[#333]",
              i > 2 ? "hidden xl:inline-flex" : "inline-flex"
            )}
          >
            <span
              className="size-3 rounded-full ring-1 ring-inset ring-white/15"
              style={{ backgroundColor: token.hex }}
            />
            <span className="font-mono text-[11px] text-muted-foreground">{token.hex}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2.5">
          <Gauge className="size-4 text-emerald-400" />
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full w-[92%] rounded-full bg-emerald-400" />
          </span>
          <span className="text-sm font-semibold">92</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">design score</span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
 * Pieces
 * ------------------------------------------------------------------ */

function SelectionFrame({ children }: { children?: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute -inset-2 z-20 rounded-lg border-[1.5px] border-sky-500">
      <span className="absolute -top-1 -left-1 size-2 rounded-[2px] border border-sky-600 bg-white" />
      <span className="absolute -top-1 -right-1 size-2 rounded-[2px] border border-sky-600 bg-white" />
      <span className="absolute -bottom-1 -left-1 size-2 rounded-[2px] border border-sky-600 bg-white" />
      <span className="absolute -right-1 -bottom-1 size-2 rounded-[2px] border border-sky-600 bg-white" />
      {children}
    </div>
  );
}

function DockButton({
  icon: Icon,
  label,
  active,
  dimmed,
  onClick,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-taro/15 text-taro ring-1 ring-inset ring-taro/30 hover:text-taro",
        dimmed && "opacity-50 hover:opacity-90"
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-taro text-[9px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
