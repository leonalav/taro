// @vitest-environment jsdom
import * as React from "react";
import {act} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {agents,type Thread} from "@/data/mock";
import {ChatPanel} from "./chat-panel";
import {revertToEdit} from "@/lib/chat-history";

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
beforeEach(()=>{localStorage.clear();HTMLElement.prototype.scrollTo=vi.fn();});

describe("editing a past chat message",()=>{
  it("waits for warning confirmation before replacing history",async()=>{
    const thread:Thread={id:"chat",name:"Chat",folderId:"folder",updated:"now",messages:[{id:"u1",role:"user",segments:[{type:"text",text:"Original"}]},{id:"a1",role:"agent",agentId:"planner",text:"Answer"}]};
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const onEditMessage=vi.fn();
    await act(async()=>{root.render(<ChatPanel threads={[thread]} folderName="Project" thread={thread} agent={agents[0]} thinking={false} panel={null} onTogglePanel={()=>{}} onSelectThread={()=>{}} onRenameThread={()=>{}} onNewThread={()=>{}} onRevert={()=>{}} onRetry={()=>{}} onEditMessage={onEditMessage} onDecide={()=>{}} onOpenDoc={()=>{}} docForMessage={()=>undefined} onAnswerQuestion={()=>{}} onAcceptSkeletal={()=>{}} onEditSkeletal={()=>{}} onInsertionConsumed={()=>{}} onSend={()=>{}} onStop={()=>{}} effort={1} onEffortChange={()=>{}} permissionRules={[]} onSetPermissionRule={()=>{}} onRemovePermissionRule={()=>{}}/>);});
    await act(async()=>{host.querySelector<HTMLElement>('[aria-label^="Edit message"]')!.click();});
    await act(async()=>{host.querySelector<HTMLButtonElement>('button[aria-label="Send edited message"]')!.click();});
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("all later messages");
    expect(onEditMessage).not.toHaveBeenCalled();
    await act(async()=>{(document.querySelector('[role="dialog"] input[type="checkbox"]') as HTMLInputElement).click();});
    await act(async()=>{[...document.querySelectorAll('[role="dialog"] button')].find(button=>button.textContent?.includes("Send edited message"))!.dispatchEvent(new MouseEvent("click",{bubbles:true}));});
    expect(onEditMessage).toHaveBeenCalledWith("u1",[{type:"text",text:"Original"}]);
    expect(localStorage.getItem("taro-skip-edit-history-warning")).toBe("true");
    await act(async()=>root.unmount());host.remove();
  });
  it("Revert removes agent output and immediately opens the user message for editing",async()=>{
    const initial:Thread={id:"chat",name:"Chat",folderId:"folder",updated:"now",messages:[{id:"u1",role:"user",segments:[{type:"text",text:"Original"}]},{id:"g1",role:"activity-group",summary:"Read",activities:[]},{id:"a1",role:"agent",agentId:"planner",text:"Answer"}]};
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const onEditMessage=vi.fn();
    function Harness(){const [thread,setThread]=React.useState(initial);return <ChatPanel threads={[thread]} folderName="Project" thread={thread} agent={agents[0]} thinking={false} panel={null} onTogglePanel={()=>{}} onSelectThread={()=>{}} onRenameThread={()=>{}} onNewThread={()=>{}} onRevert={id=>setThread(prev=>({...prev,messages:revertToEdit(prev.messages,id)!.history}))} onRetry={()=>{}} onEditMessage={onEditMessage} onDecide={()=>{}} onOpenDoc={()=>{}} docForMessage={()=>undefined} onAnswerQuestion={()=>{}} onAcceptSkeletal={()=>{}} onEditSkeletal={()=>{}} onInsertionConsumed={()=>{}} onSend={()=>{}} onStop={()=>{}} effort={1} onEffortChange={()=>{}} permissionRules={[]} onSetPermissionRule={()=>{}} onRemovePermissionRule={()=>{}}/>;}
    await act(async()=>{root.render(<Harness/>);});
    await act(async()=>{host.querySelectorAll<HTMLButtonElement>('button[aria-label="Revert to edit message"]')[1].click();});
    expect(host.textContent).not.toContain("Answer");
    expect(host.textContent).not.toContain("Read");
    expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Edit message text"]')?.value).toBe("Original");
    await act(async()=>{host.querySelector<HTMLButtonElement>('button[aria-label="Send edited message"]')!.click();});
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(onEditMessage).toHaveBeenCalledWith("u1",[{type:"text",text:"Original"}]);
    await act(async()=>root.unmount());host.remove();
  });
});
