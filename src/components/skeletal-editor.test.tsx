// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkeletalEditor, type DesignerPayload } from "./skeletal-editor";
import type { LayoutAnnotation } from "@/data/mock";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement, root: Root;
const send = vi.fn();
const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === label)!;
const click = async (label: string) => act(async () => button(label).click());
const key = async (target: Element, key: string, ctrlKey = false) => act(async () => target.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey, bubbles: true, cancelable: true })));
const pointer = async (target: EventTarget, type: string, x: number, y: number) => act(async () => target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true })));
const fill = async (label: string, value: string) => {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
};
const render = async (annotations?: LayoutAnnotation[], open = true, layers?: DesignerPayload["layers"]) => act(async () => root.render(<SkeletalEditor open={open} title="Feedback canvas" variant="hero" messageId="layout" initialAnnotations={annotations} initialLayers={layers} onClose={() => {}} onSend={send}/>));
beforeEach(() => { send.mockClear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("layout designer workflows", () => {
  it("undoes individual changes and discards redo after a new edit", async () => {
    await render(); await click("Add a layer");
    expect(host.querySelectorAll("[data-layer-row]")).toHaveLength(9);
    await click("Undo"); expect(host.querySelectorAll("[data-layer-row]")).toHaveLength(8);
    await click("Redo"); expect(host.querySelectorAll("[data-layer-row]")).toHaveLength(9);
    await click("Undo"); await click("Hide Product 3");
    expect(button("Redo").disabled).toBe(true);
    expect(host.querySelector('[data-layer-id="product-2"]')).toBeNull();
  });
  it("keeps editing shortcuts inside input fields and respects locked layers", async () => {
    await render(); const x = host.querySelector<HTMLInputElement>('[aria-label="Layer X"]')!;
    await key(x, "ArrowRight"); expect(x.value).toBe("350");
    await key(x, "Delete"); expect(host.querySelectorAll("[data-layer-row]")).toHaveLength(8);
    await key(x, "z", true); expect(button("Undo").disabled).toBe(true);
    await click("Lock Product 3"); await key(host.querySelector('[role="dialog"]')!, "Delete");
    expect(host.querySelectorAll("[data-layer-row]")).toHaveLength(8);
    expect(host.querySelector('fieldset')?.disabled).toBe(true);
  });
  it("records a complete drawing gesture as one undo step with zoom-correct coordinates", async () => {
    await render(); await click("Zoom in"); await click("Arrow");
    const canvas = host.querySelector<HTMLElement>("[data-editor-canvas]")!;
    canvas.getBoundingClientRect = () => ({ left: 100, top: 100, width: 650, height: 412.5 } as DOMRect);
    await pointer(canvas, "pointerdown", 125, 150);
    await pointer(window, "pointermove", 225, 250); await pointer(window, "pointermove", 350, 300); await pointer(window, "pointerup", 350, 300);
    await click("Send to agent");
    const payload = send.mock.calls[0][0] as DesignerPayload;
    expect(payload.annotations[0].points).toEqual([{ x: 20, y: 40 }, { x: 200, y: 160 }]);
    await click("Undo"); expect(host.querySelectorAll("[data-annotation-id]")).toHaveLength(0);
    expect(button("Undo").disabled).toBe(true);
    await click("Redo"); expect(host.querySelectorAll("[data-annotation-id]")).toHaveLength(1);
  });
  it("pins notes to layers, submits their text, and restores them when reopened", async () => {
    await render(); await click("Pin a note");
    await pointer(host.querySelector("[data-editor-canvas]")!, "pointerdown", 200, 120);
    await fill("Annotation text", "Make this hero taller");
    await fill("Describe the change you want", "Please apply these changes");
    await click("Send to agent"); const payload = send.mock.calls[0][0] as DesignerPayload;
    expect(payload.annotations[0]).toMatchObject({ kind: "note", layerId: "hero", text: "Make this hero taller", points: [{ x: 200, y: 120 }] });
    expect(payload.instruction).toContain("Please apply these changes"); expect(payload.instruction).toContain("Make this hero taller");
    await render(payload.annotations, false, payload.layers); await render(payload.annotations, true, payload.layers);
    await click("Notes1"); expect(host.textContent).toContain("Make this hero taller");
    await click("Resolve annotation"); await click("Send to agent");
    expect(send.mock.calls.at(-1)![0].annotations[0].resolved).toBe(true);
    expect(send.mock.calls.at(-1)![0].instruction).not.toContain("Make this hero taller");
  });
  it("preserves an intentionally empty artboard when reopened", async () => {
    await render([], true, []); expect(host.querySelectorAll("[data-layer-row]")).toHaveLength(0);
    await click("Send to agent"); expect(send.mock.calls[0][0].layers).toEqual([]);
  });
  it("sends the latest inline text when using the keyboard shortcut without blur", async () => {
    await render(); await click("Insert"); await click("TextT");
    const text = host.querySelector<HTMLElement>('[contenteditable="true"]')!;
    await act(async () => { text.textContent = "Unsaved inline text"; text.dispatchEvent(new Event("input", { bubbles: true })); });
    await key(text, "Enter", true);
    expect((send.mock.calls[0][0] as DesignerPayload).layers.find(l => l.kind === "text")?.label).toBe("Unsaved inline text");
  });
  it("keeps a diagonal line's direction and both endpoints", async () => {
    await render(); await click("Line");
    await pointer(host.querySelector("[data-editor-canvas]")!, "pointerdown", 100, 200);
    await pointer(window, "pointermove", 200, 100); await pointer(window, "pointerup", 200, 100);
    await click("Send to agent");
    const line = (send.mock.calls[0][0] as DesignerPayload).layers.find(l => l.kind === "line")!;
    expect(line.h).toBeGreaterThan(90); expect(line.lineReverse).toBe(true);
  });
});
