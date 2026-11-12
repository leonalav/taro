import type { LayoutAnnotation, SkeletalLayerData } from "@/data/mock";

export type Frame = { x: number; y: number; w: number; h: number };
export type Stage = { width: number; height: number };
export interface SavedLayout {
  title: string;
  width: number;
  height: number;
  layers: SkeletalLayerData[];
  annotations: LayoutAnnotation[];
}
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(min, max), Math.max(min, value));
let sequence = 0;
export const designerId = () => `layout-${Date.now().toString(36)}-${sequence++}`;

export function makeLayer(data: Pick<SkeletalLayerData, "id" | "kind" | "name" | "x" | "y" | "w" | "h" | "z"> & Partial<SkeletalLayerData>): SkeletalLayerData {
  const legacy: Record<string, string> = { "#141320": "#1a1a1a", "#282431": "#1a1a1a", "#332b42": "#1a1a1a", "#4b4370": "#505050", "#75618f": "#505050", "#272532": "#1a1a1a", "#806ab0": "#707070", "#43365e": "#2e2e2e", "#b48aff": "#ededed", "#e2d7f4": "#ededed" };
  const layer = { fill: "#1a1a1a", stroke: "#505050", strokeWidth: 1, rotation: 0, opacity: 100, dashed: true, noFill: true, showLabel: true, hidden: false, locked: false, radius: 4, preset: "wireframe", fontFamily: "Geist Variable", fontSize: 10, fontWeight: 500, lineHeight: 1.3, letterSpacing: 1.2, ...data };
  return { ...layer, fill: legacy[layer.fill.toLowerCase()] ?? layer.fill, stroke: legacy[layer.stroke.toLowerCase()] ?? layer.stroke };
}

export function starterLayers(variant: "hero" | "cards" | "dashboard") {
  const create = (id: string, name: string, x: number, y: number, w: number, h: number, z: number) => makeLayer({ id, kind: "rect", name, label: name.toUpperCase(), x, y, w, h, z });
  const chrome = [create("nav", "Navigation", 14, 14, 492, 28, 0), create("announce", "Announcement", 14, 50, 492, 26, 1)];
  if (variant === "cards") return [...chrome, ...Array.from({ length: 6 }, (_, i) => create(`product-${i}`, `Product ${i + 1}`, 14 + i % 3 * 168, 90 + Math.floor(i / 3) * 114, 155, 102, i + 2))];
  if (variant === "dashboard") return [...chrome, create("side", "Sidebar", 14, 88, 112, 226, 2), create("chart", "Main chart", 136, 88, 370, 110, 3), ...Array.from({ length: 3 }, (_, i) => create(`metric-${i}`, `Metric ${i + 1}`, 136 + i * 126, 210, 116, 104, i + 4))];
  return [...chrome, create("hero", "Hero display", 14, 84, 492, 80, 2), create("body", "Body copy", 14, 174, 234, 28, 3), create("cta", "CTA pair", 260, 174, 246, 28, 4), ...Array.from({ length: 3 }, (_, i) => create(`product-${i}`, `Product ${i + 1}`, 14 + i * 168, 214, 155, 100, i + 5))];
}

export function constrainFrame(frame: Frame, stage: Stage): Frame {
  const w = clamp(frame.w, 4, stage.width), h = clamp(frame.h, 2, stage.height);
  return { x: clamp(frame.x, 0, stage.width - w), y: clamp(frame.y, 0, stage.height - h), w, h };
}

export function resizeFrame(frame: Frame, handle: Handle, dx: number, dy: number, stage: Stage, grid: number): Frame {
  const snap = (n: number) => Math.round(n / grid) * grid;
  let { x, y, w, h } = frame;
  if (handle.includes("e")) w = clamp(snap(w + dx), 4, stage.width - x);
  if (handle.includes("s")) h = clamp(snap(h + dy), 4, stage.height - y);
  if (handle.includes("w")) { x = clamp(snap(frame.x + dx), 0, frame.x + frame.w - 4); w = frame.x + frame.w - x; }
  if (handle.includes("n")) { y = clamp(snap(frame.y + dy), 0, frame.y + frame.h - 4); h = frame.y + frame.h - y; }
  return { x, y, w, h };
}

/** Convert pointer deltas to the layer's axes, then rotate its center shift back to artboard space. */
export function resizeRotatedFrame(frame: Frame & { rotation: number }, handle: Handle, dx: number, dy: number, stage: Stage, grid: number): Frame {
  if (!frame.rotation) return resizeFrame(frame, handle, dx, dy, stage, grid);
  const angle = frame.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const localX = dx * cos + dy * sin, localY = -dx * sin + dy * cos;
  const snap = (value: number) => Math.max(4, Math.round(value / grid) * grid);
  const width = handle.includes("e") ? snap(frame.w + localX) : handle.includes("w") ? snap(frame.w - localX) : frame.w;
  const height = handle.includes("s") ? snap(frame.h + localY) : handle.includes("n") ? snap(frame.h - localY) : frame.h;
  const resized = (ratio: number): Frame => {
    const w = frame.w + (width - frame.w) * ratio, h = frame.h + (height - frame.h) * ratio;
    const cx = (w - frame.w) / 2 * (handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0);
    const cy = (h - frame.h) / 2 * (handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0);
    return { x: frame.x + frame.w / 2 + cx * cos - cy * sin - w / 2, y: frame.y + frame.h / 2 + cx * sin + cy * cos - h / 2, w, h };
  };
  const fits = (f: Frame) => {
    const halfX = Math.abs(f.w / 2 * cos) + Math.abs(f.h / 2 * sin), halfY = Math.abs(f.w / 2 * sin) + Math.abs(f.h / 2 * cos);
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    return cx - halfX >= -1e-7 && cy - halfY >= -1e-7 && cx + halfX <= stage.width + 1e-7 && cy + halfY <= stage.height + 1e-7;
  };
  const candidate = resized(1);
  if (fits(candidate) || !fits(frame)) return candidate;
  // Clamp against visible rotated corners by shortening the gesture, preserving its opposite anchor.
  let low = 0, high = 1;
  for (let i = 0; i < 32; i++) { const mid = (low + high) / 2; if (fits(resized(mid))) low = mid; else high = mid; }
  return resized(low);
}

export function feedbackInstruction(instruction: string, annotations: LayoutAnnotation[]): string {
  const feedback = annotations.filter(a => !a.resolved).map((a, i) => {
    const coordinates = a.points.map(p => `${Math.round(p.x)}, ${Math.round(p.y)}`);
    return `${i + 1}. ${a.kind}${a.layerId ? ` on layer ${a.layerId}` : ""} at (${coordinates[0]})${a.kind !== "note" ? ` to (${coordinates.at(-1)})` : ""}${a.text ? `: ${a.text}` : ""}`;
  });
  return [instruction.trim(), feedback.length ? `Visual feedback (artboard pixel coordinates):\n${feedback.join("\n")}` : ""].filter(Boolean).join("\n\n");
}

export const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
export function annotationSvg(a: LayoutAnnotation, number: number): string {
  const p = a.points[0], end = a.points.at(-1);
  if (!p || !end || a.resolved) return "";
  const color = escapeXml(a.color);
  if (a.kind === "note") return `<g><circle cx="${p.x}" cy="${p.y}" r="10" fill="${color}"/><text x="${p.x}" y="${p.y + 3}" text-anchor="middle" font-size="10" fill="#111111">${number}</text><title>${escapeXml(a.text ?? "")}</title></g>`;
  if (a.kind === "highlight") return `<rect x="${Math.min(p.x, end.x)}" y="${Math.min(p.y, end.y)}" width="${Math.abs(end.x - p.x)}" height="${Math.abs(end.y - p.y)}" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-dasharray="4 3"/>`;
  const path = `<polyline points="${a.points.map(p => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${a.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (a.kind !== "arrow") return path;
  const angle = Math.atan2(end.y - p.y, end.x - p.x), len = 10;
  return path + `<polyline points="${end.x - len * Math.cos(angle - .5)},${end.y - len * Math.sin(angle - .5)} ${end.x},${end.y} ${end.x - len * Math.cos(angle + .5)},${end.y - len * Math.sin(angle + .5)}" fill="none" stroke="${color}" stroke-width="${a.width}" stroke-linecap="round"/>`;
}

export function layoutSvg(layers: SkeletalLayerData[], stage: Stage, annotations: LayoutAnnotation[] = []): string {
  const body = [...layers].sort((a, b) => a.z - b.z).filter(l => !l.hidden).map(l => {
    const common = `fill="${l.noFill ? "none" : escapeXml(l.fill)}" stroke="${escapeXml(l.stroke)}" stroke-width="${l.strokeWidth}" opacity="${l.opacity / 100}"${l.dashed ? ' stroke-dasharray="5 4"' : ""}`;
    let shape = "";
    if (l.kind === "background") shape = l.mediaPoster ? `<image href="${escapeXml(l.mediaPoster)}" width="${stage.width}" height="${stage.height}" preserveAspectRatio="xMidYMid slice"/>` : `<rect width="${stage.width}" height="${stage.height}" fill="#1a1a1a"/>`;
    else if (l.kind === "circle") shape = `<ellipse cx="${l.x + l.w / 2}" cy="${l.y + l.h / 2}" rx="${l.w / 2}" ry="${l.h / 2}" ${common}/>`;
    else if (l.kind === "triangle") shape = `<polygon points="${l.x + l.w / 2},${l.y} ${l.x + l.w},${l.y + l.h} ${l.x},${l.y + l.h}" ${common}/>`;
    else if (l.kind === "line") shape = `<line x1="${l.x}" y1="${l.y + (l.lineReverse ? l.h : 0)}" x2="${l.x + l.w}" y2="${l.y + (l.lineReverse ? 0 : l.h)}" ${common}/>`;
    else if (l.kind !== "text") shape = `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${l.radius}" ${common}/>`;
    if (l.showLabel && l.label) shape += `<text x="${l.x + l.w / 2}" y="${l.y + l.h / 2}" dominant-baseline="middle" text-anchor="middle" fill="${escapeXml(l.kind === "text" ? l.fill : "#ededed")}" font-family="${escapeXml(l.fontFamily)}" font-size="${l.fontSize}" font-weight="${l.fontWeight}" letter-spacing="${l.letterSpacing}" opacity="${l.opacity / 100}">${escapeXml(l.label)}</text>`;
    return `<g data-taro-layer="${escapeXml(l.id)}" transform="rotate(${l.rotation} ${l.x + l.w / 2} ${l.y + l.h / 2})">${shape}</g>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${stage.width}" height="${stage.height}" viewBox="0 0 ${stage.width} ${stage.height}">${body}${annotations.map((a, i) => annotationSvg(a, i + 1)).join("")}</svg>`;
}
