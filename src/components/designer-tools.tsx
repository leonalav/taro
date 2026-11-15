import { ArrowUpRight, Circle, Hand, Highlighter, Minus, MousePointer2, Pencil, Square, StickyNote, Triangle, Type, type LucideIcon } from "lucide-react";
import type { LayoutAnnotation } from "@/data/mock";
import { cn } from "@/utils/cn";

export type ShapeKind = "rect" | "circle" | "triangle" | "text" | "line";
export type DesignerTool = ShapeKind | "select" | "hand" | LayoutAnnotation["kind"];
export const SHAPES: { id: ShapeKind; label: string; icon: LucideIcon; key: string }[] = [
  { id: "rect", label: "Rectangle", icon: Square, key: "R" }, { id: "circle", label: "Ellipse", icon: Circle, key: "O" },
  { id: "triangle", label: "Triangle", icon: Triangle, key: "" }, { id: "line", label: "Line", icon: Minus, key: "L" }, { id: "text", label: "Text", icon: Type, key: "T" },
];
export const MARKUP: { id: LayoutAnnotation["kind"]; label: string; icon: LucideIcon; key: string }[] = [
  { id: "pen", label: "Pen", icon: Pencil, key: "P" }, { id: "arrow", label: "Arrow", icon: ArrowUpRight, key: "A" },
  { id: "highlight", label: "Highlight", icon: Highlighter, key: "H" }, { id: "note", label: "Pin a note", icon: StickyNote, key: "N" },
];
export const COLORS = ["#ededed", "#a1a1a1", "#707070", "#505050", "#ffffff"];
export const isMarkup = (tool: DesignerTool): tool is LayoutAnnotation["kind"] => ["pen", "arrow", "highlight", "note"].includes(tool);
export function IconButton({ label, icon: Icon, onClick, active, disabled, shortcut, markup }: { label: string; icon: LucideIcon; onClick: () => void; active?: boolean; disabled?: boolean; shortcut?: string; markup?: boolean }) {
  return <button type="button" className={cn("ld-icon-button", active && "ld-active", markup && "ld-markup-button")} aria-label={label} aria-pressed={active} disabled={disabled} title={`${label}${shortcut ? ` (${shortcut})` : ""}`} onClick={onClick}><Icon size={15}/></button>;
}
export function DesignerToolbar({ tool, onTool }: { tool: DesignerTool; onTool: (tool: DesignerTool) => void }) {
  return <div className="ld-toolbar" role="toolbar" aria-label="Canvas tools"><IconButton label="Select" shortcut="V" icon={MousePointer2} active={tool === "select"} onClick={() => onTool("select")}/><IconButton label="Hand" shortcut="Space" icon={Hand} active={tool === "hand"} onClick={() => onTool("hand")}/><span className="ld-divider"/>{SHAPES.filter(s => s.id !== "triangle").map(s => <IconButton key={s.id} label={s.label} shortcut={s.key} icon={s.icon} active={tool === s.id} onClick={() => onTool(s.id)}/>)}<span className="ld-divider"/>{MARKUP.map(m => <IconButton key={m.id} label={m.label} shortcut={m.key} icon={m.icon} active={tool === m.id} markup onClick={() => onTool(m.id)}/>)}</div>;
}
