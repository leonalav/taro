import { invoke } from "@tauri-apps/api/core";
import type { ActivityKind, ToolActivity } from "@/data/mock";
import type { ToolCall } from "@/lib/model-stream";
import { reviewToolDefinitions } from './review-tool-definitions';
import { artifactToolDefinitions } from './artifact-tool-definitions';
import { webToolDefinitions, webActivity, webLabel } from './web-research';

const object=(properties:Record<string,unknown>,required:string[])=>({type:"object",properties,required,additionalProperties:false});
const str={type:"string"};
const fn=(name:string,description:string,parameters:unknown)=>({type:"function",function:{name,description,parameters}});
export const agentToolDefinitions=[
 ...artifactToolDefinitions,
 ...reviewToolDefinitions,
 ...webToolDefinitions,
 fn("Read","Read a workspace file, line range, PDF text, or image",object({file_path:str,offset:{type:"integer"},limit:{type:"integer"}},["file_path"])),
 fn("Write","Create or overwrite a workspace file",object({file_path:str,content:str},["file_path","content"])),
 fn("Edit","Replace exact text in a workspace file",object({file_path:str,old_string:str,new_string:str,replace_all:{type:"boolean"}},["file_path","old_string","new_string"])),
 fn("ListFiles","List files and folders in a workspace directory without using Bash; use recursive true for a tree",object({path:str,recursive:{type:"boolean"}},[])),
 fn("Glob","Find workspace files by glob pattern",object({pattern:str,path:str},["pattern"])),
 fn("Grep","Search text in workspace files with a regular expression",object({pattern:str,path:str},["pattern"])),
 fn("NotebookEdit","Replace, insert, or delete a Jupyter notebook cell by zero-based index",object({notebook_path:str,cell_index:{type:"integer"},new_source:str,edit_mode:{type:"string",enum:["replace","insert","delete"]},cell_type:{type:"string",enum:["code","markdown"]}},["notebook_path","cell_index"])),
 fn("Bash","Run a shell command in the selected workspace",object({command:str},["command"])),
 fn("MCP","Call a configured MCP server tool",object({server:str,tool:str,arguments:{type:"object"}},["server","tool","arguments"])),
];
export const approvalRequired=new Set(["Write","Edit","NotebookEdit","Bash","MCP","PowerShell","LSP"]);
/** Keep read-only filesystem inspection on dedicated tools instead of permissioned Bash. */
export function isInspectionBash(command:string):boolean {
 return command.split(/&&|\|\||[;\n]/).some(part=>/^\s*(?:ls|find|dir|pwd|cat|head|tail|wc|rg|grep|fd|tree)\b/i.test(part));
}
export const toolKind=(name:string):ActivityKind=>name==='WebSearch'?'web-search':name==='WebFetch'?'web-fetch':name.startsWith('Browser')?'browser':name==="Read"||name==="LSP"||name==="TaskOutput"?"file-read":name==="ListFiles"?"file-list":name==="Write"||name==="Edit"||name==="NotebookEdit"?"file-edit":name==="Glob"||name==="Grep"||name==="ToolSearch"?"search":name==="Bash"||name==="PowerShell"||name==="TaskStop"?"terminal":name==="Skill"?"skill":name.includes("Worktree")||name==="Agent"?"plugin":"mcp";
export function toolLabel(name:string,input:Record<string,unknown>) {
 if(name==="DesignJob")return input.action==="resume"?"Resume design job":input.action==="read"?"Read workspace jobs":`Start design job · ${String(input.title??"Design")}`;
 if(name==="ArtifactDesign")return input.action==="export"?"Export design tokens":input.action==="template"?"Create design starter":input.action==="save"?"Save project design":"Load project design tokens";
 const subject=String(input.file_path??input.filePath??input.notebook_path??input.pattern??input.command??input.tool??input.task_id??input.skill??input.query??input.description??(name==="ListFiles"?input.path??".":""));
 return name==="Skill"?`Invoked skill: /${subject}`:`${name==="PowerShell"?"Ran":name} ${subject}`.trim();
}
export interface ToolOutput {text:string;artifact:{kind:string;path?:string;before?:string;after?:string;content?:string;matches?:string[];output?:string;dataUrl?:string;[key:string]:unknown}};
export interface McpConfig {id:string;transport?:string;command?:string;args?:string[];url?:string}
export async function listMcpTools(config:McpConfig,workspaceRoot:string):Promise<{tools:{name:string;description?:string;inputSchema?:unknown}[]}>{return invoke("list_mcp_tools",{config,workspaceRoot});}
export async function executeAgentTool(call:ToolCall,input:Record<string,unknown>,workspaceRoot:string,approved:boolean,mcpConfig?:McpConfig,requestId?:string,scope?:{sessionId:string;readOnly?:boolean;planningAncestors?:{workspaceRoot:string;sessionId:string}[]}):Promise<ToolOutput>{
 return invoke<ToolOutput>("execute_agent_tool",{request:{name:call.name,input,workspaceRoot,approved,mcpConfig,requestId,sessionId:scope?.sessionId,readOnly:scope?.readOnly??false,planningAncestors:scope?.planningAncestors??[]}});
}
export function activityFromTool(call:ToolCall,input:Record<string,unknown>,result:ToolOutput|undefined,error:unknown,durationMs:number):ToolActivity {
 const artifact=result?.artifact;
 const web=webActivity(call.name,input,artifact);
 if(web){const status=error?(/stopp|abort|cancel|interrupt/i.test(String(error))?'stopped':'failed'):'done';return {id:call.id,kind:toolKind(call.name),...web,label:webLabel(web.web,status),status,durationMs,errorTrace:error?String(error):undefined};}
 const before=artifact?.before?.split("\n")??[];const after=artifact?.after?.split("\n")??[];
 const edit=artifact?.kind==="edit"||artifact?.kind==="notebook"?{file:String(artifact.path??"file"),added:after.length,removed:before.length,diff:[...before.slice(0,80).map(text=>({kind:"remove" as const,text})),...after.slice(0,80).map(text=>({kind:"add" as const,text}))]}:undefined;
 const shellFailure=(artifact?.kind==="bash"||artifact?.kind==="powershell"||artifact?.kind==="terminal")&&((artifact.exitCode!=null&&artifact.exitCode!==0)||["failed","timed_out","stopped"].includes(String(artifact.status)));
 return {id:call.id,kind:toolKind(call.name),label:toolLabel(call.name,input),status:error||shellFailure||artifact?.status==="failed"?"failed":"done",durationMs,detail:result?.text.slice(0,180),output:result?.text.slice(0,20000),imageDataUrl:artifact?.kind==="image"?artifact.dataUrl:undefined,errorTrace:error?String(error):undefined,edit};
}
