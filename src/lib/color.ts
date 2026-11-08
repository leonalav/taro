/* Color parsing/serialization used by the design-doc swatches and picker. */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function hexToRgb(hex: string): RGB | null {
  let h = hex.replace(/^#/, "").trim();
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return (`#${to(r)}${to(g)}${to(b)}`).toUpperCase();
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rr: h = (gg - bb) / d + (gg < bb ? 6 : 0); break;
      case gg: h = (bb - rr) / d + 2; break;
      default: h = (rr - gg) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hh < 60) { r = c; g = x; }
  else if (hh < 120) { r = x; g = c; }
  else if (hh < 180) { g = c; b = x; }
  else if (hh < 240) { g = x; b = c; }
  else if (hh < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** Parse a hex or rgb()/rgba() literal into RGB. */
export function parseColor(input: string): RGB | null {
  const t = input.trim();
  if (t.startsWith("#")) return hexToRgb(t);
  const m = t.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

export function colorToHex(input: string): string | null {
  const c = parseColor(input);
  return c ? rgbToHex(c) : null;
}

/* Matches a hex or rgb()/rgba() literal. */
export const COLOR_RE = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;

export interface ColorOccurrence {
  start: number;
  end: number;
  value: string;
  hex: string;
}

/** Every color literal in `text`, in document order. */
export function findColors(text: string): ColorOccurrence[] {
  const out: ColorOccurrence[] = [];
  const re = new RegExp(COLOR_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const hex = colorToHex(m[0]);
    if (hex) out.push({ start: m.index, end: m.index + m[0].length, value: m[0], hex });
  }
  return out;
}
