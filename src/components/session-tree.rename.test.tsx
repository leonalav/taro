// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {describe,expect,it} from "vitest";
import {SessionTree} from "./session-tree";

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
describe("session rename",()=>{
  it("opens an inline name editor on a chat double click",async()=>{
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const noop=()=>{};
    await act(async()=>{root.render(<SessionTree folders={[{id:"folder-1",name:"project"}]} threads={[{id:"chat-1",name:"Old title",folderId:"folder-1",updated:"now",messages:[]}]} activeThreadId="chat-1" onSelectThread={noop} onTogglePin={noop} onArchive={noop} onNewThread={noop} onSelectFolder={noop} onRenameFolder={noop} onDeleteFolder={noop} onRenameThread={noop} onMoveThread={noop} onRestoreThread={noop}/>);});
    const row=[...host.querySelectorAll("button")].find(button=>button.textContent?.includes("Old title"))!;
    await act(async()=>{row.dispatchEvent(new MouseEvent("dblclick",{bubbles:true}));});
    expect(host.querySelector('input[aria-label="Rename Old title"]')).not.toBeNull();
    await act(async()=>root.unmount());host.remove();
  });
});
