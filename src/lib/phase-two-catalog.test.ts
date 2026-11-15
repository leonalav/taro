import { describe, expect, it } from "vitest";
import { DeferredToolCatalog, phaseTwoDefinitions } from "./phase-two-catalog";

describe("Phase 2 callable catalog",()=>{
  it('exposes the Skill loader on the first model request, including read-only agents',()=>{
    expect(new DeferredToolCatalog().definitions().map(t=>t.function.name)).toContain('Skill');
    expect(new DeferredToolCatalog(true).definitions().map(t=>t.function.name)).toContain('Skill');
  });
  it("defines all nine requested tool families and loads deferred schemas through search",()=>{
    const names=phaseTwoDefinitions.map(tool=>tool.function.name);
    expect(names).toEqual(expect.arrayContaining(["LSP","PowerShell","Agent","TaskOutput","TaskStop","EnterPlanMode","ExitPlanMode","EnterWorktree","ExitWorktree","Skill","ToolSearch"]));
    const catalog=new DeferredToolCatalog();
    expect(catalog.definitions().some(tool=>tool.function.name==="PowerShell")).toBe(false);
    expect(catalog.search("select:PowerShell,TaskOutput",5).matches).toEqual(["PowerShell","TaskOutput"]);
    expect(catalog.definitions().map(tool=>tool.function.name)).toEqual(expect.arrayContaining(["PowerShell","TaskOutput"]));
  });
  it("filters discovery and invocation capabilities for read-only child agents",()=>{
    const catalog=new DeferredToolCatalog(true);
    expect(catalog.search("select:PowerShell,Write,LSP",5).matches).toEqual(["LSP"]);
    expect(catalog.allowed("Write")).toBe(false);
    expect(catalog.allowed("LSP")).toBe(true);
    expect(()=>catalog.search("tools",500)).toThrow(/max_results/);
  });
  it("finds tools from natural keyword queries without requiring every word",()=>{
    expect(new DeferredToolCatalog().search("background tasks output",5).matches).toContain("TaskOutput");
  });
});
