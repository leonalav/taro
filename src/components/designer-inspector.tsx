import { AlignCenter, AlignHorizontalJustifyCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Copy, Frame, LockKeyhole, Square, Trash2 } from "lucide-react";
import type { SkeletalLayerData } from "@/data/mock";
import { clamp, constrainFrame, type Stage } from "@/lib/layout-designer";
import { IconButton } from "./designer-tools";

interface Props {
  selected: SkeletalLayerData | null; stage: Stage; grid: boolean; snap: boolean; gridSize: number;
  onPatch: (patch: Partial<SkeletalLayerData>) => void; onStage: (stage: Stage) => void;
  onGrid: (value: boolean) => void; onSnap: (value: boolean) => void; onGridSize: (value: number) => void;
  onDuplicate: () => void; onRemove: () => void; onReorder: (direction: number) => void; onApplyFont: () => void;
}
export function DesignerInspector({ selected: s, stage, grid, snap, gridSize, onPatch, onStage, onGrid, onSnap, onGridSize, onDuplicate, onRemove, onReorder, onApplyFont }: Props) {
  const geometry = (patch: Partial<SkeletalLayerData>) => s && onPatch(constrainFrame({ ...s, ...patch }, stage));
  const preset = (value: string) => onPatch(value === "wireframe" ? { preset: value, stroke: "#505050", fill: "#1a1a1a", dashed: true, noFill: true, radius: 4 } : value === "soft" ? { preset: value, stroke: "#707070", fill: "#1a1a1a", dashed: false, noFill: false, radius: 10 } : value === "solid" ? { preset: value, stroke: "#ededed", fill: "#2e2e2e", dashed: false, noFill: false, radius: 4 } : { preset: value });
  return <>{s ? <>
    <section className="ld-section ld-selection-header"><div><Square size={15}/><input aria-label="Layer name" value={s.name} onChange={e => onPatch({ name: e.target.value })}/>{s.locked && <LockKeyhole size={12}/>}</div><span>{s.kind === "background" ? "Media background" : s.kind === "text" ? "Text layer" : "Layout layer"}</span></section>
    <fieldset className="ld-inspector-fields" disabled={s.locked}>
      <section className="ld-section"><div className="ld-section-heading"><h3>Position & size</h3><div className="ld-small-actions"><IconButton label="Bring forward" icon={ArrowUp} onClick={() => onReorder(1)}/><IconButton label="Send backward" icon={ArrowDown} onClick={() => onReorder(-1)}/></div></div>
        <div className="ld-alignment"><IconButton label="Align left" icon={AlignLeft} onClick={() => onPatch({ x: 0 })}/><IconButton label="Align horizontal center" icon={AlignCenter} onClick={() => onPatch({ x: Math.round((stage.width - s.w) / 2) })}/><IconButton label="Align right" icon={AlignRight} onClick={() => onPatch({ x: stage.width - s.w })}/><span className="ld-divider"/><IconButton label="Align vertical center" icon={AlignHorizontalJustifyCenter} onClick={() => onPatch({ y: Math.round((stage.height - s.h) / 2) })}/></div>
        <div className="ld-field-grid">{(["x", "y", "w", "h"] as const).map(field => <Numeric key={field} label={field.toUpperCase()} ariaLabel={`Layer ${field.toUpperCase()}`} value={s[field]} min={field === "w" || field === "h" ? 4 : 0} max={field === "x" || field === "w" ? stage.width : stage.height} onChange={value => geometry({ [field]: value })}/>)}</div>
        <div className="ld-field-grid"><Numeric label="Rotation" value={s.rotation} min={-180} max={180} suffix="°" onChange={rotation => onPatch({ rotation })}/><Numeric label="Corner" value={s.radius} min={0} max={100} suffix="px" onChange={radius => onPatch({ radius })}/></div>
        <Range label="Opacity" value={s.opacity} max={100} suffix="%" onChange={opacity => onPatch({ opacity })}/>
      </section>
      <section className="ld-section"><h3>Appearance</h3><label className="ld-field"><span>Style</span><select aria-label="Appearance preset" value={s.preset} onChange={e => preset(e.target.value)}><option value="custom">Custom per block</option><option value="wireframe">Wireframe</option><option value="soft">Soft surface</option><option value="solid">Solid fill</option></select></label>
        <div className="ld-field-grid"><Color label="Fill" value={s.fill} disabled={s.noFill || s.kind === "background"} onChange={fill => onPatch({ fill })}/><Color label="Stroke" value={s.stroke} onChange={stroke => onPatch({ stroke })}/></div>
        <div className="ld-field-grid"><Numeric label="Stroke width" value={s.strokeWidth} min={0} max={12} suffix="px" onChange={strokeWidth => onPatch({ strokeWidth })}/><Numeric label="Label size" value={s.fontSize} min={6} max={120} suffix="px" onChange={fontSize => onPatch({ fontSize })}/></div>
        <Toggle label="Dashed outline" checked={s.dashed} onChange={dashed => onPatch({ dashed })}/><Toggle label="No fill" checked={s.noFill} onChange={noFill => onPatch({ noFill })}/><Toggle label="Show labels" checked={s.showLabel} onChange={showLabel => onPatch({ showLabel })}/>
      </section>
      <section className="ld-section"><h3>Typography</h3><label className="ld-field"><span>Font family</span><input aria-label="Font family" list="ld-fonts" value={s.fontFamily} onChange={e => onPatch({ fontFamily: e.target.value })}/><datalist id="ld-fonts">{["Geist Variable", "Inter", "Arial", "Georgia", "Times New Roman", "monospace"].map(font => <option key={font}>{font}</option>)}</datalist></label><label className="ld-field"><span>{s.kind === "text" ? "Text content" : "Label"}</span><input aria-label="Selection label" value={s.label ?? ""} onChange={e => onPatch({ label: e.target.value })}/></label>
        <div className="ld-field-grid"><label className="ld-field"><span>Weight</span><select aria-label="Font weight" value={s.fontWeight} onChange={e => onPatch({ fontWeight: Number(e.target.value) })}>{[400, 500, 600, 700, 800].map(w => <option key={w}>{w}</option>)}</select></label><Numeric label="Line height" value={s.lineHeight} min={.5} max={3} step={.1} onChange={lineHeight => onPatch({ lineHeight })}/></div><Numeric label="Letter spacing" value={s.letterSpacing} min={-2} max={10} step={.1} suffix="px" onChange={letterSpacing => onPatch({ letterSpacing })}/><button className="ld-button ld-full" onClick={onApplyFont}>Apply typography to all layers</button>
      </section>
    </fieldset>
    <div className="ld-selection-actions"><button className="ld-button" onClick={onDuplicate} disabled={s.kind === "background"}><Copy size={13}/>Duplicate</button><button className="ld-button ld-danger" onClick={onRemove} disabled={s.locked}><Trash2 size={13}/>Delete</button></div>
  </> : <section className="ld-inspector-empty"><Frame size={25}/><strong>Your canvas, your call</strong><p>Select a layer to adjust its position, appearance, and typography.</p></section>}
    <section className="ld-section ld-stage-section"><div className="ld-section-heading"><h3>Artboard</h3><Frame size={13}/></div><div className="ld-field-grid"><Numeric label="Width" ariaLabel="Stage Width" value={stage.width} min={100} max={4096} onChange={width => onStage({ ...stage, width })}/><Numeric label="Height" ariaLabel="Stage Height" value={stage.height} min={100} max={4096} onChange={height => onStage({ ...stage, height })}/></div><Toggle label="Show grid" checked={grid} onChange={onGrid}/><Toggle label="Snap to grid" checked={snap} onChange={onSnap}/><Numeric label="Grid size" value={gridSize} min={2} max={64} suffix="px" onChange={onGridSize}/></section>
  </>;
}

function Numeric({ label, ariaLabel, value, min, max, onChange, suffix, step = 1 }: { label: string; ariaLabel?: string; value: number; min: number; max: number; onChange: (value: number) => void; suffix?: string; step?: number }) {
  return <label className="ld-field"><span>{label}</span><div className="ld-number"><input type="number" aria-label={ariaLabel ?? label} value={Number(value.toFixed(2))} min={min} max={max} step={step} onChange={e => { if (Number.isFinite(e.currentTarget.valueAsNumber)) onChange(clamp(e.currentTarget.valueAsNumber, min, max)); }}/>{suffix && <small>{suffix}</small>}</div></label>;
}
function Color({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <label className="ld-field"><span>{label}</span><div className="ld-color-field"><input type="color" aria-label={`${label} color`} disabled={disabled} value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#1a1a1a"} onChange={e => onChange(e.target.value)}/><input aria-label={`${label} hex`} disabled={disabled} value={value} onChange={e => onChange(e.target.value)}/></div></label>;
}
function Range({ label, value, max, suffix, onChange }: { label: string; value: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="ld-range"><span>{label}<small>{value}{suffix}</small></span><input type="range" aria-label={label} min={0} max={max} value={value} onChange={e => onChange(Number(e.target.value))}/></label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" className="ld-toggle" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span>{label}</span><span className="ld-toggle-track"><span/></span></button>;
}
