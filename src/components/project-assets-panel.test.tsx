// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectAssetsPanel } from "./project-assets-panel";

const desktop = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: desktop.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: desktop.open }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  desktop.invoke.mockReset();
  desktop.open.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function asset(filename: string) {
  return {
    id: filename, revision: 1, kind: "model", usage: [], variants: [], candidate: false,
    source: { origin: "imported" },
    original: { filename, size: 123, path: `taro-assets/${filename}`, available: true, mime: "model/gltf-binary" },
  };
}

it("discards an old workspace listing after changing workspace", async () => {
  let finishOld!: (value: unknown) => void;
  desktop.invoke.mockImplementation((_command, { workspaceRoot }) => workspaceRoot === "A:/old"
    ? new Promise(resolve => { finishOld = resolve; })
    : Promise.resolve([asset("new.glb")]));
  await act(async () => root.render(<ProjectAssetsPanel workspaceRoot="A:/old" />));
  await act(async () => root.render(<ProjectAssetsPanel workspaceRoot="A:/new" />));
  await act(async () => finishOld([asset("old.glb")]));
  expect(host.textContent).toContain("new.glb");
  expect(host.textContent).not.toContain("old.glb");
});

it("shows a file import failure without a success notice", async () => {
  desktop.open.mockResolvedValue("A:/downloads/model.glb");
  desktop.invoke.mockResolvedValueOnce([]).mockRejectedValueOnce("Asset contents do not match the filename extension.");
  await act(async () => root.render(<ProjectAssetsPanel workspaceRoot="A:/project" />));
  const file = host.querySelector<HTMLButtonElement>('button[value="file"]')!;
  await act(async () => file.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("contents do not match");
  expect(host.textContent).not.toContain("Saved");
  expect(desktop.invoke).toHaveBeenCalledWith("project_assets", {
    workspaceRoot: "A:/project",
    request: { action: "import_file", path: "A:/downloads/model.glb", source: expect.objectContaining({ origin: "imported" }), options: { texture: false } },
  });
});

it("keeps a completed import when the initial list arrives later", async () => {
  let finishInitial!: (value: unknown) => void;
  desktop.open.mockResolvedValue("A:/downloads/new.glb");
  desktop.invoke.mockImplementationOnce(() => new Promise(resolve => { finishInitial = resolve; }))
    .mockResolvedValueOnce(asset("new.glb")).mockResolvedValueOnce([asset("new.glb")]);
  await act(async () => root.render(<ProjectAssetsPanel workspaceRoot="A:/project" />));
  await act(async () => host.querySelector<HTMLButtonElement>('button[value="file"]')!.click());
  await act(async () => finishInitial([]));
  expect(host.querySelector("li")?.textContent).toContain("new.glb");
});

it("uses an attached still when the selected model cannot render", async () => {
  const model = {
    ...asset("product.glb"),
    variants: [{
      id: "still", candidate: false, options: { purpose: "preview", request: "Model still" },
      file: { filename: "model-still.png", available: true, mime: "image/png" },
    }],
  };
  const createObjectURL = vi.fn(() => "blob:model-still");
  vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL() {} }));
  try {
    desktop.invoke.mockImplementation(async (command, args) => {
      if (command === "project_assets") return [model];
      if (args.variantId === "still") return new ArrayBuffer(8);
      throw Error("The imported model could not be opened.");
    });
    await act(async () => root.render(<ProjectAssetsPanel workspaceRoot="A:/project" />));
    await act(async () => host.querySelector<HTMLButtonElement>("li button")!.click());
    expect(host.textContent).toContain("The imported model could not be opened.");
    expect(host.querySelector('img[alt="model-still.png"]')?.getAttribute("src")).toBe("blob:model-still");
  } finally {
    vi.unstubAllGlobals();
  }
});
