// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {describe,expect,it,vi} from "vitest";
import {PermissionGate} from "./permission-gate";

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
describe("Permission button",()=>{
  it("offers standing allow and deny rules, and no one-time actions",async()=>{
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const onSet=vi.fn();
    await act(async()=>{root.render(<PermissionGate rules={[]} plugins={[{id:"github",name:"GitHub",description:"",kind:"MCP",enabled:true,status:"connected",transport:"http",url:"https://example.com"}]} onSet={onSet} onRemove={()=>{}}/>);});
    await act(async()=>{host.querySelector<HTMLButtonElement>('button[aria-label="Permission"]')!.click();});
    expect(host.textContent).toContain("Always allow tool, this session");
    expect(host.textContent).toContain("Always deny tool");
    expect(host.textContent).not.toContain("Allow once");
    const choice=[...host.querySelectorAll("button")].find(button=>button.textContent?.trim()==="Always allow tool, this session")!;
    await act(async()=>{choice.click();});
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({server:"workspace",tool:"Bash",allowed:true,duration:"session"}));
    await act(async()=>root.unmount());host.remove();
  });
  it("supports MCP-wide choices and removing a saved rule",async()=>{
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const onSet=vi.fn();const onRemove=vi.fn();
    const rule={server:"github",allowed:false,duration:"always" as const,target:"mcp" as const,updatedAt:1};
    await act(async()=>{root.render(<PermissionGate rules={[rule]} plugins={[{id:"github",name:"GitHub",description:"",kind:"MCP",enabled:true,status:"connected",transport:"http",url:"https://example.com"}]} onSet={onSet} onRemove={onRemove}/>);});
    await act(async()=>{host.querySelector<HTMLButtonElement>('button[aria-label="Permission"]')!.click();});
    await act(async()=>{const select=host.querySelector<HTMLSelectElement>('#permission-target')!;select.value="mcp:github";select.dispatchEvent(new Event("change",{bubbles:true}));});
    const allowMcp=[...host.querySelectorAll("button")].find(button=>button.textContent?.trim()==="Always allow using this MCP")!;
    await act(async()=>{allowMcp.click();});
    expect(onSet).toHaveBeenCalledWith(expect.objectContaining({server:"github",tool:undefined,target:"mcp",allowed:true,duration:"always"}));
    await act(async()=>{host.querySelector<HTMLButtonElement>('button[title="Remove rule"]')!.click();});
    expect(onRemove).toHaveBeenCalledWith(rule);
    await act(async()=>root.unmount());host.remove();
  });
});
