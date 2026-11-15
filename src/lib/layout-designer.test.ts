import { describe, expect, it } from "vitest";
import { constrainFrame, feedbackInstruction, layoutSvg, makeLayer, resizeFrame, resizeRotatedFrame } from "./layout-designer";

describe("layout designer document operations", () => {
  it("keeps small layers inside the artboard while allowing position zero", () => {
    expect(constrainFrame({ x: -12, y: 500, w: 40, h: 25 }, { width: 520, height: 330 })).toEqual({ x: 0, y: 305, w: 40, h: 25 });
    expect(constrainFrame({ x: 0, y: 0, w: 900, h: 800 }, { width: 520, height: 330 })).toEqual({ x: 0, y: 0, w: 520, h: 330 });
  });

  it("resizes from the west without moving the opposite edge", () => {
    expect(resizeFrame({ x: 80, y: 40, w: 100, h: 50 }, "w", 30, 0, { width: 520, height: 330 }, 1)).toEqual({ x: 110, y: 40, w: 70, h: 50 });
  });
  it("resizes a rotated east handle along its visible direction and anchors its west edge", () => {
    const result = resizeRotatedFrame({ x: 100, y: 100, w: 100, h: 80, rotation: 90 }, "e", 0, 20, { width: 520, height: 330 }, 1);
    expect(result).toEqual({ x: 90, y: 110, w: 120, h: 80 });
  });
  it("allows a rotated frame's logical bounds outside the stage when its visible corners fit", () => {
    expect(resizeRotatedFrame({ x: 10, y: 100, w: 100, h: 80, rotation: 90 }, "e", 0, 40, { width: 520, height: 330 }, 1)).toEqual({ x: -10, y: 120, w: 140, h: 80 });
  });
  it("stops a rotated resize at the artboard edge without shifting its anchored side", () => {
    const result = resizeRotatedFrame({ x: 100, y: 100, w: 100, h: 80, rotation: 90 }, "e", 0, 200, { width: 520, height: 330 }, 1);
    expect(result.w).toBeCloseTo(240, 5);
    expect(result.x).toBeCloseTo(30, 5);
    expect(result.y).toBeCloseTo(170, 5);
  });

  it("includes precise note targets and unresolved visual markup in agent feedback", () => {
    const result = feedbackInstruction("Make this clearer", [
      { id: "n1", kind: "note", points: [{ x: 50, y: 80 }], color: "#fbbf24", width: 2, text: "Move the CTA here", layerId: "cta", resolved: false },
      { id: "a1", kind: "arrow", points: [{ x: 5, y: 8 }, { x: 30, y: 40 }], color: "#fbbf24", width: 2, resolved: false },
      { id: "n2", kind: "note", points: [{ x: 0, y: 0 }], color: "#fbbf24", width: 2, text: "Old feedback", resolved: true },
    ]);
    expect(result).toContain("Move the CTA here");
    expect(result).toContain("cta");
    expect(result).toContain("50, 80");
    expect(result).toContain("arrow");
    expect(result).not.toContain("Old feedback");
  });

  it("exports visible rotated layers and safely escapes user text", () => {
    const layers = [makeLayer({ id: "text", kind: "text", name: "Title", x: 0, y: 0, w: 100, h: 30, z: 1, label: "<CTA & go>", rotation: 15 }), makeLayer({ id: "hidden", kind: "rect", name: "Hidden", x: 0, y: 0, w: 20, h: 20, z: 2, hidden: true })];
    const svg = layoutSvg(layers, { width: 520, height: 330 });
    expect(svg).toContain("&lt;CTA &amp; go&gt;");
    expect(svg).toContain('rotate(15');
    expect(svg).toContain('data-taro-layer="text"');
    expect(svg).not.toContain('width="20"');
  });
});
