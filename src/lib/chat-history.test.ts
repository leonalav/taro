import {describe,expect,it} from "vitest";
import type {ChatMessage,Segment} from "@/data/mock";
import {historyBeforeMessage,retryFromMessage,revertToEdit,editedSegments} from "./chat-history";

const messages:ChatMessage[]=[
  {id:"u1",role:"user",segments:[{type:"text",text:"First"}]},
  {id:"a1",role:"agent",agentId:"planner",text:"Answer one"},
  {id:"u2",role:"user",segments:[{type:"text",text:"Second"}]},
  {id:"g2",role:"activity-group",summary:"Read",activities:[]},
  {id:"a2",role:"agent",agentId:"planner",text:"Answer two"},
];

describe("chat history branching",()=>{
  it("reverts to strictly before the selected message",()=>{
    expect(historyBeforeMessage(messages,"u2")?.map(message=>message.id)).toEqual(["u1","a1"]);
    expect(historyBeforeMessage(messages,"a1")?.map(message=>message.id)).toEqual(["u1"]);
    expect(historyBeforeMessage(messages,"missing")).toBeNull();
  });
  it("retries the selected user turn using only earlier context",()=>{
    expect(retryFromMessage(messages,"u2")).toEqual({history:messages.slice(0,2),segments:[{type:"text",text:"Second"}]});
    expect(retryFromMessage(messages,"a2")).toEqual({history:messages.slice(0,2),segments:[{type:"text",text:"Second"}]});
    expect(retryFromMessage(messages,"a1")).toEqual({history:[],segments:[{type:"text",text:"First"}]});
  });
  it("reverts an agent turn to its user message and opens that message for editing",()=>{
    expect(revertToEdit(messages,"u2")).toEqual({history:messages.slice(0,3),editMessageId:"u2"});
    expect(revertToEdit(messages,"a2")).toEqual({history:messages.slice(0,3),editMessageId:"u2"});
    expect(revertToEdit(messages,"a1")).toEqual({history:messages.slice(0,1),editMessageId:"u1"});
    expect(revertToEdit(messages,"missing")).toBeNull();
  });
  it("keeps chips and retained attachments when editing text",()=>{
    const original:Segment[]=[{type:"text",text:"Inspect "},{type:"chip",chip:{id:"file:a",kind:"file",label:"src/a.ts"}},{type:"attachment",attachment:{id:"img",name:"a.png",mime:"image/png",size:1,dataUrl:"data:image/png;base64,AA"}}];
    expect(editedSegments(original,"Review",["img"])).toEqual([{type:"text",text:"Review"},original[1],original[2]]);
    expect(editedSegments(original,"Review",[])).toEqual([{type:"text",text:"Review"},original[1]]);
  });
});
