// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {EditHistoryWarning,shouldWarnOnEdit} from "./edit-history-warning";

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
beforeEach(()=>localStorage.clear());

describe("editing earlier chat history",()=>{
  it("requires confirmation and can remember Don't ask again",async()=>{
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const onContinue=vi.fn();const onCancel=vi.fn();
    await act(async()=>{root.render(<EditHistoryWarning open onContinue={onContinue} onCancel={onCancel}/>);});
    const dialog=document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("all later messages");
    expect(shouldWarnOnEdit()).toBe(true);
    await act(async()=>{(dialog.querySelector('input[type="checkbox"]') as HTMLInputElement).click();});
    await act(async()=>{[...dialog.querySelectorAll("button")].find(button=>button.textContent?.includes("Send edited message"))!.click();});
    expect(onContinue).toHaveBeenCalledOnce();
    expect(shouldWarnOnEdit()).toBe(false);
    await act(async()=>root.unmount());host.remove();
  });
});
