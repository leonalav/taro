import {describe,it,expect} from "vitest";
import {activityFromTool,agentToolDefinitions,approvalRequired,isInspectionBash,toolKind} from "./agent-tools";

describe("coding tool registry",()=>{
 it("exposes every requested tool to OpenAI-compatible models",()=>{
  expect(agentToolDefinitions.map(t=>t.function.name)).toEqual(["Read","Write","Edit","ListFiles","Glob","Grep","NotebookEdit","Bash","MCP"]);
  for(const tool of agentToolDefinitions){expect(tool.function.parameters).toMatchObject({type:"object",additionalProperties:false});}
 });
 it("requires approval for mutations, shell, and MCP",()=>{
  expect([...approvalRequired]).toEqual(["Write","Edit","NotebookEdit","Bash","MCP","PowerShell","LSP"]);
  expect(approvalRequired.has("Read")).toBe(false);
  expect(approvalRequired.has("ListFiles")).toBe(false);
  expect(approvalRequired.has("Glob")).toBe(false);
  expect(approvalRequired.has("Grep")).toBe(false);
 });
 it("maps tools to Nike-style grouped artifact kinds",()=>{
  expect(["Read","Write","Edit","ListFiles","Glob","Grep","NotebookEdit","Bash","MCP"].map(toolKind)).toEqual(["file-read","file-edit","file-edit","file-list","search","search","file-edit","terminal","mcp"]);
 });
 it("creates a diff artifact for file changes",()=>{
  const item=activityFromTool({id:"1",name:"Edit",arguments:"{}"},{file_path:"a.txt"},{text:"Edited a.txt",artifact:{kind:"edit",path:"a.txt",before:"old",after:"new"}},undefined,12);
  expect(item.status).toBe("done");expect(item.edit?.diff).toEqual([{kind:"remove",text:"old"},{kind:"add",text:"new"}]);
 });
 it("keeps search results and failures as inspectable rows",()=>{
  const found=activityFromTool({id:"2",name:"Grep",arguments:"{}"},{pattern:"hello"},{text:"a.ts:1: hello",artifact:{kind:"grep",matches:["a.ts:1: hello"]}},undefined,2);
  expect(found.output).toContain("a.ts:1: hello");expect(found.kind).toBe("search");
  const failed=activityFromTool({id:"3",name:"Bash",arguments:"{}"},{command:"false"},undefined,"denied",1);
  expect(failed.status).toBe("failed");expect(failed.errorTrace).toBe("denied");
 });
 it("retains image reads for visual artifacts",()=>{
  const item=activityFromTool({id:"4",name:"Read",arguments:"{}"},{file_path:"a.png"},{text:"Image: a.png",artifact:{kind:"image",dataUrl:"data:image/png;base64,AAAA"}},undefined,1);
  expect(item.imageDataUrl).toBe("data:image/png;base64,AAAA");
 });
 it("marks nonzero shell exits as failed artifacts",()=>{
  const item=activityFromTool({id:"5",name:"Bash",arguments:"{}"},{command:"false"},{text:"Exit code: 1",artifact:{kind:"bash",exitCode:1}},undefined,10);
  expect(item.status).toBe("failed");expect(item.output).toContain("Exit code: 1");
  const timedOut=activityFromTool({id:"ps",name:"PowerShell",arguments:"{}"},{command:"Start-Sleep 10"},{text:"Timed out",artifact:{kind:"terminal",exitCode:null,status:"timed_out"}},undefined,100);
  expect(timedOut.status).toBe("failed");expect(timedOut.kind).toBe("terminal");
 });
 it("routes shell listing and search commands to read-only tools",()=>{
  expect(isInspectionBash("ls -la src")).toBe(true);
  expect(isInspectionBash('cd "A:\\project" && ls src && find src -name "*.ts"')).toBe(true);
  expect(isInspectionBash("rg TODO src")).toBe(true);
  expect(isInspectionBash("npm test")).toBe(false);
  expect(isInspectionBash("git status")).toBe(false);
 });
});
