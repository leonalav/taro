// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FoundationRow } from "./foundation-row";
import { foundationCases } from "@/data/foundation-previews";
import { foundationActions, availableActions } from "@/data/foundation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let cleanup = () => {};
afterEach(() => cleanup());
describe("foundation operational rows", () => {
  it("opens the grouped document without nesting its action in the disclosure", () => {
    const host=document.createElement("div");document.body.append(host);
    const root=createRoot(host);cleanup=()=>{act(()=>root.unmount());host.remove();};
    const onOpenDocument=vi.fn();
    const operation=foundationCases.find(c=>c.kind==="design-plan"&&c.reason==="available")!;
    act(()=>root.render(<FoundationRow operation={operation} onOpenDocument={onOpenDocument}/>));
    const open=[...host.querySelectorAll("button")].find(b=>b.textContent==="Open")!;
    expect(open).toBeTruthy();
    expect(open.closest("[aria-expanded]")).toBeNull();
    act(()=>open.click());expect(onOpenDocument).toHaveBeenCalledOnce();
  });
  it("keeps sample actions local, supports disclosure and renders every case", () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); cleanup = () => {act(()=>root.unmount());host.remove();};
    const onAction = vi.fn();
    const op = foundationCases.find(c => c.kind === "restore" && c.state === "partially-succeeded")!;
    act(() => root.render(<FoundationRow operation={op} onAction={onAction}/>));
    const toggle = host.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    act(() => toggle.click()); expect(toggle.getAttribute("aria-expanded")).toBe("false");
    act(() => toggle.click());
    const action = [...host.querySelectorAll("button")].find(b => b.textContent === "View details")!;
    act(() => action.click());
    expect(onAction).not.toHaveBeenCalled(); expect(host.textContent).toContain("Sample only");
    act(()=>root.render(<>{foundationCases.map(operation=><FoundationRow key={operation.id} operation={operation}/>)}</>));
    expect(host.querySelectorAll("[data-foundation-row]").length).toBe(foundationCases.length);
    expect(host.querySelector("button button")).toBeNull();
  });
  it("admits actions by kind/state and disables unsafe or unavailable live actions", () => {
    const expected = ["View details","Open","Open file","Open diff","Review changes","Reload","Refresh","Retry","Resume","Continue","Cancel","Confirm restore","Restore","Redo","Stage","Unstage","Commit"];
    expect(Object.values(foundationActions).map(a=>a.label)).toEqual(expect.arrayContaining(expected));
    const op = foundationCases.find(c=>c.kind==="restore"&&c.reason==="stale_preview")!;
    expect(availableActions(op).some(a=>a.id==="confirm-restore")).toBe(false);
    expect(availableActions(op).some(a=>a.id==="refresh")).toBe(true);
    const commit=foundationCases.find(c=>c.kind==="commit"&&c.reason==="uncertain_outcome")!;
    expect(availableActions(commit).some(a=>a.id==="retry")).toBe(false);
    const staging=foundationCases.find(c=>c.kind==="staging"&&c.state==="awaiting-approval")!;
    expect(availableActions(staging).map(a=>a.id)).toContain("stage");
    const unstage={...staging,result:{paths:["src/index.css"],direction:"unstage" as const}} as typeof staging;
    expect(availableActions(unstage).map(a=>a.id)).toContain("unstage");
    expect(availableActions(unstage).map(a=>a.id)).not.toContain("stage");
    const limit=foundationCases.find(c=>c.kind==="limits"&&c.state==="blocked")!;
    expect(availableActions(limit).map(a=>a.id)).toEqual(expect.arrayContaining(["continue","cancel"]));
    const failed=foundationCases.find(c=>c.kind==="commit"&&c.reason==="hook_rejected")!;
    expect(availableActions(failed).map(a=>a.id)).toContain("refresh");
    expect(availableActions(failed).map(a=>a.id)).not.toContain("retry");
  });
  it("keeps a user's collapsed choice when an operation changes to an actionable state", () => {
    const host=document.createElement("div");document.body.append(host);
    const root=createRoot(host);cleanup=()=>{act(()=>root.unmount());host.remove();};
    const operation=foundationCases.find(c=>c.kind==="checkpoint"&&c.reason==="saving")!;
    act(()=>root.render(<FoundationRow operation={operation}/>));
    const toggle=host.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    act(()=>toggle.click());act(()=>toggle.click());
    act(()=>root.render(<FoundationRow operation={{...operation,state:"failed",reason:"backup_unavailable"}}/>));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
  it("disables native actions without a runtime handler and never spins for queued work", () => {
    const host=document.createElement("div");document.body.append(host);
    const root=createRoot(host);cleanup=()=>{act(()=>root.unmount());host.remove();};
    const operation=foundationCases.find(c=>c.kind==="undo-preview"&&c.state==="awaiting-approval")!;
    act(()=>root.render(<FoundationRow operation={{...operation,sample:false}}/>));
    const confirm=[...host.querySelectorAll("button")].find(b=>b.textContent==="Confirm restore")!;
    expect(confirm.disabled).toBe(true);
    expect(host.textContent).toContain("runtime handler is not connected");
    act(()=>root.render(<FoundationRow operation={{...operation,state:"queued"}}/>));
    expect(host.querySelector('.animate-spin')).toBeNull();
  });
});
