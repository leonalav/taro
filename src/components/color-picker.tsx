import * as React from "react";
import { X } from "lucide-react";
import { hslToRgb, hexToRgb, rgbToHex, rgbToHsl, type RGB } from "@/lib/color";

interface ColorPickerProps {
  hex: string;
  /** Anchor point (client coords) — the clicked swatch. */
  x: number;
  y: number;
  onChange: (hex: string) => void;
  onClose: () => void;
}

const WHEEL = 150;
const PANEL_W = 248;

const fromHex = (hex: string): RGB => hexToRgb(hex) ?? { r: 255, g: 255, b: 255 };

export function ColorPicker({ hex, x, y, onChange, onClose }: ColorPickerProps) {
  const [rgb, setRgb] = React.useState<RGB>(() => fromHex(hex));
  React.useEffect(() => setRgb(fromHex(hex)), [hex]);

  const hsl = rgbToHsl(rgb);
  const hexStr = rgbToHex(rgb);

  const commit = (next: RGB) => {
    setRgb(next);
    onChange(rgbToHex(next));
  };

  const fromHsl = (h: number, s: number, l: number) => commit(hslToRgb({ h, s, l }));

  /* ---- wheel pointer ------------------------------------------------ */
  const wheelRef = React.useRef<HTMLDivElement>(null);
  const applyPointer = (clientX: number, clientY: number) => {
    const el = wheelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const radius = rect.width / 2;
    const dist = Math.min(radius, Math.hypot(dx, dy));
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    fromHsl(angle, dist / radius, rgbToHsl(rgb).l);
  };

  const onWheelDown = (e: React.PointerEvent) => {
    e.preventDefault();
    applyPointer(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => applyPointer(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* handle position on the wheel */
  const rad = (hsl.h * Math.PI) / 180;
  const dist = hsl.s * (WHEEL / 2);
  const hx = WHEEL / 2 + Math.cos(rad) * dist;
  const hy = WHEEL / 2 + Math.sin(rad) * dist;

  /* Escape closes */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* clamp position to viewport */
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.min(Math.max(8, x + 14), vw - PANEL_W - 8);
  const top = Math.min(Math.max(8, y + 14), vh - 320);

  const setChannel = (channel: keyof RGB, value: number) => {
    if (Number.isNaN(value)) return;
    commit({ ...rgb, [channel]: Math.min(255, Math.max(0, Math.round(value))) });
  };

  const onHexInput = (value: string) => {
    const c = hexToRgb(value);
    if (c) commit(c);
  };

  return (
    <>
      {/* transparent backdrop: click outside closes */}
      <div className="fixed inset-0 z-[190]" onMouseDown={onClose} />

      <div
        style={{ position: "fixed", left, top, width: PANEL_W, zIndex: 200 }}
        className="animate-pop overflow-hidden rounded-2xl border border-border bg-[#141414] p-3 shadow-2xl shadow-black/70"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Color</span>
          <button
            type="button"
            aria-label="Close color picker"
            onClick={onClose}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* wheel */}
        <div className="mt-3 flex justify-center">
          <div
            ref={wheelRef}
            onPointerDown={onWheelDown}
            style={{
              width: WHEEL,
              height: WHEEL,
              borderRadius: "50%",
              cursor: "crosshair",
              background:
                "radial-gradient(circle, #fff 0%, rgba(255,255,255,0) 100%), conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
              filter: `saturate(1)`,
            }}
            className="relative touch-none shadow-inner"
          >
            {/* lightness dimmer overlay so the wheel reflects current lightness */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background: `linear-gradient(to top, rgba(0,0,0,${1 - hsl.l}), transparent)`,
                mixBlendMode: "multiply",
              }}
            />
            <div
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30"
              style={{ left: hx, top: hy, backgroundColor: hexStr }}
            />
          </div>
        </div>

        {/* lightness */}
        <div className="mt-3">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(hsl.l * 100)}
            onChange={(e) => fromHsl(hsl.h, hsl.s, Number(e.target.value) / 100)}
            aria-label="Lightness"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none"
            style={{ background: "linear-gradient(to right, #000, #808080 50%, #fff)" }}
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Lightness {Math.round(hsl.l * 100)}%</span>
          </div>
        </div>

        {/* RGB inputs */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["r", "g", "b"] as const).map((ch) => (
            <label key={ch} className="flex items-center gap-1.5">
              <span className="w-3 text-[11px] uppercase text-muted-foreground">{ch}</span>
              <input
                type="number"
                min={0}
                max={255}
                value={rgb[ch]}
                onChange={(e) => setChannel(ch, Number(e.target.value))}
                aria-label={ch.toUpperCase()}
                className="w-full rounded-md border border-border bg-background px-1.5 py-1 font-mono text-[11px] text-foreground outline-none focus:border-taro/50"
              />
            </label>
          ))}
        </div>

        {/* hex */}
        <div className="mt-2 flex items-center gap-2">
          <span
            className="size-6 shrink-0 rounded-md ring-1 ring-inset ring-white/10"
            style={{ backgroundColor: hexStr }}
          />
          <input
            value={hexStr}
            onChange={(e) => onHexInput(e.target.value)}
            onBlur={() => setRgb(fromHex(hex))}
            aria-label="Hex value"
            spellCheck={false}
            className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-taro/50"
          />
        </div>
      </div>
    </>
  );
}
