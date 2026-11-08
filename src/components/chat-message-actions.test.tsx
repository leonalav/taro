// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {describe,expect,it,vi} from "vitest";
import {MessageItem} from "./chat-message";

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});

describe("past message actions",()=>{
  it("offers separate Retry and Revert actions",async()=>{
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
    const onRetry=vi.fn(),onRevert=vi.fn();
    await act(async()=>{root.render(<MessageItem message={{id:"u1",role:"user",segments:[{type:"text",text:"Hello"}]}} agentLabel={()=>"Planner agent"} onRetry={onRetry} onRevert={onRevert}/>);});
    await act(async()=>{host.querySelector<HTMLButtonElement>('button[aria-label="Retry message"]')!.click();});
    expect(onRetry).toHaveBeenCalledWith("u1");
    await act(async()=>{host.querySelector<HTMLButtonElement>('button[aria-label="Revert to edit message"]')!.click();});
    expect(onRevert).toHaveBeenCalledWith("u1");
    await act(async()=>root.unmount());host.remove();
  });
  it("edits a clicked user message and retains its image",async()=>{
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const onEditMessage=vi.fn();
    await act(async()=>{root.render(<MessageItem message={{id:"u1",role:"user",segments:[{type:"text",text:"Original"},{type:"attachment",attachment:{id:"img",name:"image.png",mime:"image/png",size:1,dataUrl:"data:image/png;base64,AA"}}]}} agentLabel={()=>"Planner agent"} onRevert={()=>{}} onEditMessage={onEditMessage}/>);});
    await act(async()=>{host.querySelector<HTMLElement>('[aria-label="Edit message"]')!.click();});
    const editor=host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Edit message text"]')!;
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(editor,"Revised");editor.dispatchEvent(new Event("input",{bubbles:true}));});
    await act(async()=>{host.querySelector<HTMLButtonElement>('button[aria-label="Send edited message"]')!.click();});
    expect(onEditMessage).toHaveBeenCalledWith("u1",[{type:"text",text:"Revised"},{type:"attachment",attachment:expect.objectContaining({id:"img"})}]);
    await act(async()=>root.unmount());host.remove();
  });
  it("opens the requested message editor when Revert targets it",async()=>{
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
    const message={id:"u1",role:"user" as const,segments:[{type:"text" as const,text:"Original"}]};
    await act(async()=>{root.render(<MessageItem message={message} agentLabel={()=>"Planner agent"} onRevert={()=>{}} editRequestToken={0} onEditMessage={()=>{}}/>);});
    expect(host.querySelector('textarea[aria-label="Edit message text"]')).toBeNull();
    await act(async()=>{root.render(<MessageItem message={message} agentLabel={()=>"Planner agent"} onRevert={()=>{}} editRequestToken={1} onEditMessage={()=>{}}/>);});
    expect(host.querySelector('textarea[aria-label="Edit message text"]')).not.toBeNull();
    await act(async()=>root.unmount());host.remove();
  });
});
