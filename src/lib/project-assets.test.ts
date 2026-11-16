import { beforeEach, expect, it, vi } from "vitest";
import { cropBounds, executeProjectAssetTool, fitAssetImage, projectAssetContext, stageProjectAssetsForWorktree } from "./project-assets";

const desktop = vi.hoisted(() => ({ available: true, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: desktop.invoke, isTauri: () => desktop.available }));

const scope = { workspaceRoot: "A:/project", readOnly: false, planning: false };
const item = {
  id: "asset-a", kind: "model", revision: 3, candidate: false, usage: ["main scene"],
  original: { filename: "product.glb", path: "taro-assets/hash/original.glb", available: true },
  source: { origin: "imported" },
  variants: [],
};

beforeEach(() => {
  desktop.invoke.mockReset();
  desktop.available = true;
});

it("calculates centered and bounded focal crops without shifting the output aspect", () => {
  expect(cropBounds(800, 600, 400, 600, { x: 0.5, y: 0.5 })).toEqual({ x: 200, y: 0, width: 400, height: 600 });
  expect(cropBounds(800, 600, 400, 600, { x: 1, y: 0.5 })).toEqual({ x: 400, y: 0, width: 400, height: 600 });
  expect(cropBounds(800, 600, 800, 300, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, width: 800, height: 300 });
  expect(() => cropBounds(800, 600, 0, 300, { x: 0.5, y: 0.5 })).toThrow();
});

it("includes workspace-relative paths, usage and risks without private generation prompts", async () => {
  desktop.invoke.mockResolvedValue([{ ...item, candidate: true, source: { origin: "generated", request: "Private reference filename" } }]);
  const context = await projectAssetContext(scope.workspaceRoot);
  expect(desktop.invoke).toHaveBeenCalledWith("project_assets", { workspaceRoot: scope.workspaceRoot, request: { action: "list" } });
  expect(context).toContain("taro-assets/hash/original.glb");
  expect(context).toContain("generated");
  expect(context).toContain("rights unverified");
  expect(context).toContain("main scene");
  expect(context).not.toContain("Private reference filename");
});

it("includes selected worktree assets beyond the usual context limit", async () => {
  const earlier = Array.from({ length: 25 }, (_, index) => ({ ...item, id: `unrelated-${index}` }));
  desktop.invoke.mockResolvedValue([...earlier, item]);
  const context = await projectAssetContext(scope.workspaceRoot, new Set([item.id]));
  expect(context).toContain('"id":"asset-a"');
  expect(context).not.toContain('"id":"unrelated-24"');
});

it("reports rights inherited by an approved delivery version from its source version", async () => {
  const parent = { id: "candidate", file: { path: "candidate.png", available: true }, candidate: true,
    options: { purpose: "background_edit", source: { origin: "generated", license: "Campaign rights" } } };
  const child = { id: "delivery", file: { path: "delivery.webp", available: true }, candidate: true,
    options: { purpose: "delivery", parentVariant: "candidate" } };
  desktop.invoke.mockResolvedValue([{ ...item, approval: { variantId: "delivery" }, variants: [child, parent] }]);
  const context = await projectAssetContext(scope.workspaceRoot);
  expect(context).toContain('"approval":{"variantId":"delivery","path":"delivery.webp","available":true,"generated":true,"rights":"Campaign rights"}');
});

it("rejects mutations while planning and preserves errors before returning any asset", async () => {
  const input = { action: "import_url", url: "https://example.com/product.glb", filename: "product.glb" };
  await expect(executeProjectAssetTool(input, { ...scope, readOnly: true })).rejects.toThrow(/read-only/i);
  await expect(executeProjectAssetTool(input, { ...scope, planning: true })).rejects.toThrow(/plan/i);
  expect(desktop.invoke).not.toHaveBeenCalled();
  desktop.invoke.mockRejectedValue("Web server returned HTTP 410");
  await expect(executeProjectAssetTool(input, scope)).rejects.toThrow(/410/);
  expect(desktop.invoke).toHaveBeenCalledTimes(1);
});

it("describes an unavailable connection without inventing a completed asset", async () => {
  desktop.available = false;
  await expect(projectAssetContext(scope.workspaceRoot)).rejects.toThrow(/desktop/i);
  await expect(executeProjectAssetTool({ action: "list" }, scope)).rejects.toThrow(/desktop/i);
  expect(desktop.invoke).not.toHaveBeenCalled();
});
it("fits a delivery image within both limits without cropping or enlarging it", () => {
  expect(fitAssetImage(1600, 900, 900, 360)).toEqual({ width: 640, height: 360 });
  expect(fitAssetImage(900, 1600, 360, 900)).toEqual({ width: 360, height: 640 });
  expect(fitAssetImage(400, 200, 600, 600)).toEqual({ width: 400, height: 200 });
  expect(() => fitAssetImage(400, 200, 4097, 600)).toThrow(/4096/);
});

it("passes the exact stored model version to native compaction", async () => {
  desktop.invoke.mockResolvedValue({ file: { path: "taro-assets/hash/variants/id/content.glb" } });
  const result = await executeProjectAssetTool({ action: "compact_glb", id: item.id, parent_variant: "source-version" }, scope);
  expect(desktop.invoke).toHaveBeenCalledWith("project_assets", {
    workspaceRoot: scope.workspaceRoot,
    request: { action: "compact_glb", id: item.id, parentVariant: "source-version" },
  });
  expect(result.text).toContain("taro-assets/hash/variants/id/content.glb");
});

it("propagates a failed generation without reporting a saved candidate", async () => {
  desktop.invoke.mockRejectedValue("Google Gemini did not return a completed image.");
  await expect(executeProjectAssetTool({
    action: "generate_image", request: "Create a graphic",
  }, scope)).rejects.toThrow(/did not return a completed image/);
  expect(desktop.invoke).toHaveBeenCalledWith("project_assets", {
    workspaceRoot: scope.workspaceRoot,
    request: { action: "generate_image", prompt: "Create a graphic" },
  });
});

it("stages selected asset IDs only through the owner worktree scope", async () => {
  desktop.invoke.mockResolvedValue([item]);
  await expect(stageProjectAssetsForWorktree(scope.workspaceRoot, "session-1", "A:/project/.taro/worktrees/design-1", [item.id])).resolves.toEqual([item]);
  expect(desktop.invoke).toHaveBeenCalledWith("project_assets", {
    workspaceRoot: scope.workspaceRoot,
    request: {
      action: "stage_worktree", sessionId: "session-1",
      expectedWorktree: "A:/project/.taro/worktrees/design-1", assetIds: [item.id],
    },
  });
});
