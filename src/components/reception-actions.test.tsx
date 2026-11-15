// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {ReceptionActions} from "./reception-actions";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
it("keeps the project field focused through controlled-input updates",async()=>{
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  const create=vi.fn().mockResolvedValue(false);
  await act(async()=>root.render(<ReceptionActions mode="new" onClose={()=>{}} onCreate={create} onImport={async()=>false} onPrompt={()=>{}} onSettings={()=>{}}/>));
  const input=document.querySelector<HTMLInputElement>('input[placeholder="My next build"]')!;input.focus();
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"New project");input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));});
  expect(document.activeElement).toBe(input);
  const submit=document.querySelector<HTMLButtonElement>('button[type="submit"]')!;expect(submit.disabled).toBe(false);
  await act(async()=>input.closest("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(create).toHaveBeenCalledWith("New project");expect(document.activeElement).toBe(input);
  await act(async()=>root.unmount());host.remove();
});
