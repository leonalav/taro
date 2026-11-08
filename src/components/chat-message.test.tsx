import {describe,it,expect} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {MessageItem} from "./chat-message";
import {agentName,seedThreads,type ChatMessage} from "@/data/mock";

const render=(message:ChatMessage)=>renderToStaticMarkup(<MessageItem message={message} agentLabel={agentName} onRevert={()=>{}}/>);
describe("Nike reference and live tool artifacts",()=>{
 it.each(["cancelled","skipped","queued","unchanged"] as const)("keeps ordinary %s activities neutral",status=>{
  const html=render({id:"group",role:"activity-group",summary:"Work",activities:[{id:"ordinary",kind:"terminal",label:"Run check",status}]});
  expect(html).not.toContain("text-success");
  expect(html).toContain(status[0].toUpperCase()+status.slice(1));
 });
 it("keeps the Nike reference activity group and its tool rows",()=>{
  const group=seedThreads[0].messages.find(m=>m.role==="activity-group")!;
  const html=render(group);
  expect(html).toContain("Invoked /visual-qa");expect(html).toContain("Read src/index.css");expect(html).toContain("Searched 4 files");
 });
 it("shows a grouped live edit with diff",()=>{
  const html=render({id:"group",role:"activity-group",summary:"1 tool call",activities:[{id:"edit",kind:"file-edit",label:"Edit src/a.ts",status:"done",edit:{file:"src/a.ts",added:1,removed:1,diff:[{kind:"remove",text:"old"},{kind:"add",text:"new"}]}}]});
  expect(html).toContain("Edit src/a.ts");expect(html).toContain("Edited");expect(html).toContain("src/a.ts");
 });
 it("shows read output and image previews inside grouped rows",()=>{
  const html=render({id:"group",role:"activity-group",summary:"2 tool calls",activities:[{id:"read",kind:"file-read",label:"Read a.txt",status:"done",output:"line ".repeat(100)},{id:"image",kind:"file-read",label:"Read a.png",status:"done",imageDataUrl:"data:image/png;base64,AAAA"}]});
  expect(html).toContain("View result");expect(html).toContain("data:image/png;base64,AAAA");
 });
 it("does not offer to change an already applied live permission",()=>{
  const html=render({id:"permission",role:"permission",agentId:"planner",mcp:"GitHub",tool:"get_content",live:true,decision:{label:"Allowed once",allowed:true,target:"tool",duration:"once"}});
  expect(html).toContain("Allowed once");
  expect(html).not.toContain("Change decision");
 });
});
