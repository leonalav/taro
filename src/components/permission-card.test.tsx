// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {describe,expect,it,vi} from "vitest";
import {MessageItem} from "./chat-message";

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});

describe("live workspace permission request",()=>{
  it("shows one-time buttons and expanded standing choices",async()=>{
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const onDecide=vi.fn();
    await act(async()=>{root.render(<MessageItem message={{id:"approval",role:"permission",agentId:"planner",mcp:"workspace tool",tool:"Bash pnpm test",live:true}} agentLabel={()=>"Planner agent"} onRevert={()=>{}} onDecide={onDecide}/>);});
    expect(host.textContent).toContain("Allow once");
    await act(async()=>{host.querySelector<HTMLButtonElement>('button[aria-label="More allow once options"]')!.click();});
    expect(host.textContent).toContain("Always allow tool, this session");
    expect(host.textContent).not.toContain("Always allow using this MCP");
    await act(async()=>{[...host.querySelectorAll("button")].find(button=>button.textContent?.includes("Always allow tool, this session"))!.click();});
    expect(onDecide).toHaveBeenCalledWith("approval",expect.objectContaining({allowed:true,target:"tool",duration:"session"}));
    await act(async()=>root.unmount());host.remove();
  });
});

it("uses the plan name without the workspace path and preserves one-time approval", async () => {
  const host=document.createElement("div");const root=createRoot(host);const onDecide=vi.fn();
  await act(async()=>root.render(<MessageItem message={{id:"plan",role:"permission",agentId:"planner",mcp:"workspace tool",tool:"Approve Portable Preview (A:/demo/.taro/plans/preview.md)",live:true}} agentLabel={()=>"Kai"} onRevert={()=>{}} onDecide={onDecide}/>));
  expect(host.querySelector("[data-permission-title]")?.textContent).toBe("Approve the plan Portable Preview?");
  expect(host.textContent).not.toContain(".taro");
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="Approve plan")!.click());
  expect(onDecide).toHaveBeenCalledWith("plan",expect.objectContaining({allowed:true,duration:"once"}));
  await act(async()=>root.unmount());
});

it("renders legacy private design calls as a label and status only", async () => {
  const host=document.createElement("div");const root=createRoot(host);
  await act(async()=>root.render(<MessageItem message={{id:"tools",role:"activity-group",summary:"Using tools",activities:[{id:"export",kind:"mcp",label:"Export design tokens",status:"done",detail:"private css",output:"private css",errorTrace:"private css"}]}} agentLabel={()=>"Kai"} onRevert={()=>{}}/>));
  await act(async()=>host.querySelector("button")!.click());
  expect(host.textContent).toContain("Export design tokens");
  expect(host.textContent).toContain("Done");
  expect(host.textContent).not.toContain("private css");
  expect(host.textContent).not.toContain("View result");
  await act(async()=>root.unmount());
});
