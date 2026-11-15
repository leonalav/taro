// @vitest-environment jsdom
import * as React from "react";
import {act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {agents,type Thread} from "@/data/mock";
import {ChatPanel} from "./chat-panel";

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
beforeEach(()=>{localStorage.clear();HTMLElement.prototype.scrollTo=vi.fn();});

const base:Thread={id:"chat",name:"Chat",folderId:"folder",updated:"now",messages:Array.from({length:8},(_,index)=>({id:`m${index}`,role:"agent",agentId:agents[0].id,text:`Message ${index}`}))};
const noop=()=>{};

function Harness({visible}:{visible:boolean}){
  const [messages,setMessages]=React.useState(base.messages);
  const thread:Thread={...base,messages};
  return <>
    <button type="button" onClick={()=>setMessages(previous=>[...previous,
      {id:"u1",role:"user",segments:[{type:"text",text:"Generate a design brief"}]},
      {id:"a1",role:"agent",agentId:agents[0].id,text:"Starting the design brief."}
    ])}>append</button>
    <ChatPanel threads={[thread]} folderName="Project" thread={thread} agent={agents[0]} thinking={false} visible={visible} panel={null}
      onTogglePanel={noop} onSelectThread={noop} onRenameThread={noop} onNewThread={noop} onRevert={noop} onRetry={noop}
      onEditMessage={noop} onDecide={noop} onOpenDoc={noop} docForMessage={()=>undefined} onAnswerQuestion={noop}
      onAcceptSkeletal={noop} onEditSkeletal={noop} onInsertionConsumed={noop} onSend={noop} onStop={noop} effort={1}
      onEffortChange={noop} permissionRules={[]} onSetPermissionRule={noop} onRemovePermissionRule={noop}/>
  </>;
}

describe("chat generation entrance",()=>{
  let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
  afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
  const mount=async(visible:boolean)=>{
    host=document.createElement("div");document.body.append(host);root=createRoot(host);
    await act(async()=>root.render(<Harness visible={visible}/>));
    return [...host.querySelectorAll<HTMLElement>(".chat-message-item")];
  };

  it("shows already-written history without replaying every message",async()=>{
    const items=await mount(true);
    expect(items).toHaveLength(8);
    expect(items.every(item=>item.classList.contains("chat-message-item--instant"))).toBe(true);
  });

  it("cascades the thread tail on first view and staggers newly generated messages",async()=>{
    await mount(false);
    await act(async()=>root.render(<Harness visible={true}/>));
    const revealed=[...host.querySelectorAll<HTMLElement>(".chat-message-item")];
    expect(revealed.slice(0,2).every(item=>item.classList.contains("chat-message-item--instant"))).toBe(true);
    const replay=revealed.slice(-6);
    expect(replay.every(item=>item.classList.contains("chat-message-item--replay"))).toBe(true);
    expect(replay.map(item=>item.style.animationDelay)).toEqual(["0ms","60ms","120ms","180ms","240ms","300ms"]);
    await act(async()=>{host.querySelector<HTMLButtonElement>("button")!.click();});
    const fresh=[...host.querySelectorAll<HTMLElement>(".chat-message-item")].slice(-2);
    expect(fresh.map(item=>item.style.animationDelay)).toEqual(["0ms","90ms"]);
    expect(fresh.some(item=>item.classList.contains("chat-message-item--instant"))).toBe(false);
  });
});
