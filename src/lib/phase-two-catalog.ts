import { agentToolDefinitions } from "./agent-tools";

export type ToolDefinition=typeof agentToolDefinitions[number];
const string={type:"string"};const boolean={type:"boolean"};const integer={type:"integer"};
const tool=(name:string,description:string,properties:Record<string,unknown>,required:string[]=[]):ToolDefinition=>({type:"function",function:{name,description,parameters:{type:"object",properties,required,additionalProperties:false}}});
export const phaseTwoDefinitions:ToolDefinition[]=[
  tool("LSP","Query an installed/configured language server for code intelligence. Positions are 1-based UTF-16 editor positions. Missing servers return setup guidance.",{operation:{type:"string",enum:["goToDefinition","findReferences","hover","documentSymbol","workspaceSymbol","goToImplementation","prepareCallHierarchy","incomingCalls","outgoingCalls"]},filePath:string,line:integer,character:integer},["operation","filePath","line","character"]),
  tool("PowerShell","Execute a real PowerShell command in the active workspace. Requires approval. Background execution returns a task ID and output file for Read or TaskOutput; TaskStop cancels it.",{command:string,description:string,timeout:{...integer,minimum:1,maximum:600000},run_in_background:boolean},["command"]),
  tool("Agent","Delegate a bounded model/tool run to a configured Designer, Type & QA, Code or Orchestrator agent. Legacy Explore and Plan are read-only. Configured model, enablement and parent restrictions apply. General-purpose agents retain normal approvals. Background children return a task_id for TaskOutput/TaskStop. Model overrides must name a configured model.",{description:string,prompt:string,subagent_type:{type:"string",enum:["Explore","Plan","general-purpose","Designer","Type & QA","Code","Orchestrator"]},model:string,run_in_background:boolean,isolation:{type:"string",enum:["worktree"]}},["description","prompt"]),
  tool("TaskOutput","Retrieve current or completed background shell/agent output. block defaults true; timeout defaults 30000ms. A retrieval timeout does not stop the task. Prefer Read when an output file is available.",{task_id:string,block:boolean,timeout:{...integer,minimum:0,maximum:600000}},["task_id"]),
  tool("TaskStop","Stop a running background shell or child agent in this chat. Retains partial output and does not undo file changes.",{task_id:string},["task_id"]),
  tool("EnterPlanMode","Enter planning mode. Only read-only tools and Write/Edit to the returned plan path are permitted until the user approves ExitPlanMode. Choose Design Plan or Plan.",{name:string,kind:{type:"string",enum:["Design Plan","Plan"]}}),
  tool("ExitPlanMode","Read the actual Markdown plan, present its document artifact, and request user approval to leave plan mode. Denial keeps planning restrictions active.",{}),
  tool("EnterWorktree","Create an isolated Git worktree and switch subsequent tools into it. Requires approval and an existing Git repository.",{name:string}),
  tool("ExitWorktree","Return to the original workspace. keep preserves files and branch; remove deletes the tracked worktree and branch. Removal needs approval and discard_changes=true for dirty or unmerged work.",{action:{type:"string",enum:["keep","remove"]},discard_changes:boolean},["action"]),
  tool("Skill","Load an actual workspace SKILL.md by name with optional arguments. Use skill=list to discover available skills. Inline instructions are returned to the current conversation; context:fork runs in a child agent. Tool permissions remain in force.",{skill:string,args:string},["skill"]),
  tool("ToolSearch","Discover deferred tools by keywords or select:ToolA,ToolB. Matching schemas become available on the next model request. Search does not execute tools.",{query:string,max_results:{...integer,minimum:1,maximum:20}},["query"]),
];

export const readOnlyTools=new Set(["Read","ListFiles","Glob","Grep","LSP","ToolSearch","Skill","TaskOutput"]);
const allDefinitions=[...agentToolDefinitions,...phaseTwoDefinitions];
export class DeferredToolCatalog {
  private loaded=new Set([...agentToolDefinitions.map(tool=>tool.function.name),"ToolSearch","Skill"]);
  constructor(private readonly readOnly=false,private readonly allowedTools?:ReadonlySet<string>){ }
  allowed(name:string){return allDefinitions.some(tool=>tool.function.name===name)&&(!this.readOnly||readOnlyTools.has(name)||name==="Agent")&&(!this.allowedTools||this.allowedTools.has(name)||name==="ToolSearch");}
  definitions(){return allDefinitions.filter(tool=>this.loaded.has(tool.function.name)&&this.allowed(tool.function.name));}
  search(query:string,maxResults=5){
    if(!query.trim())throw Error("query must not be empty");
    if(!Number.isInteger(maxResults)||maxResults<1||maxResults>20)throw Error("max_results must be between 1 and 20");
    const candidates=allDefinitions.filter(tool=>this.allowed(tool.function.name));
    const direct=query.match(/^select:(.+)$/i);
    const names=direct?.[1].split(",").map(name=>name.trim().toLowerCase());
    const terms=query.toLowerCase().split(/\s+/).filter(Boolean);
    const required=terms.filter(term=>term.startsWith("+")).map(term=>term.slice(1));
    const ranked=candidates.map(tool=>{const name=tool.function.name.toLowerCase(),text=`${name} ${tool.function.description}`.toLowerCase();return {tool,score:required.every(term=>text.includes(term))?terms.reduce((sum,term)=>{const word=term.replace(/^\+/,"");return sum+(name.includes(word)?3:text.includes(word)?1:0);},0):0};}).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).map(item=>item.tool);
    const matches=(names?names.flatMap(name=>candidates.filter(tool=>tool.function.name.toLowerCase()===name)):ranked).filter((tool,index,list)=>list.findIndex(other=>other.function.name===tool.function.name)===index).slice(0,maxResults).map(tool=>tool.function.name);
    for(const name of matches)this.loaded.add(name);
    return {query,matches,total_deferred_tools:phaseTwoDefinitions.filter(tool=>tool.function.name!=="ToolSearch"&&this.allowed(tool.function.name)).length};
  }
}
