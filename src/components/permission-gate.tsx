import * as React from "react";
import {Check,ChevronDown,ShieldCheck,Trash2,X} from "lucide-react";
import {permissionAllow,permissionDeny,type PermissionChoice} from "@/data/mock";
import type {Plugin} from "@/data/settings";
import {permissionRuleFromChoice,type PermissionRule} from "@/lib/permission-rules";
import {cn} from "@/utils/cn";

const workspaceTools=["Bash","PowerShell","LSP","Write","Edit","NotebookEdit","EnterWorktree"];
const standingChoices=[...permissionAllow,...permissionDeny].filter(choice=>choice.duration!=="once");

interface PermissionGateProps {
  rules:PermissionRule[];
  plugins:Plugin[];
  onSet:(rule:PermissionRule)=>void;
  onRemove:(rule:PermissionRule)=>void;
}

export function PermissionGate({rules,plugins,onSet,onRemove}:PermissionGateProps) {
  const [open,setOpen]=React.useState(false);
  const [selected,setSelected]=React.useState("workspace:Bash");
  const [mcpTool,setMcpTool]=React.useState("");
  const root=React.useRef<HTMLDivElement>(null);
  const servers=plugins.filter(plugin=>plugin.kind==="MCP"&&plugin.enabled&&plugin.transport&&(plugin.command||plugin.url));
  const isWorkspace=selected.startsWith("workspace:");
  const server=isWorkspace?"workspace":selected.slice(4);
  const tool=isWorkspace?selected.slice(10):mcpTool.trim();

  React.useEffect(()=>{
    if(!open)return;
    const outside=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);};
    document.addEventListener("mousedown",outside);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("mousedown",outside);document.removeEventListener("keydown",escape);};
  },[open]);

  const choose=(choice:PermissionChoice)=>{
    if(choice.target==="mcp"&&isWorkspace)return;
    if(choice.target==="tool"&&!tool)return;
    const rule=permissionRuleFromChoice(choice,server,tool);
    if(rule)onSet(rule);
  };
  const description=(rule:PermissionRule)=>`${rule.server==="workspace"?rule.tool:servers.find(plugin=>plugin.id===rule.server)?.name??rule.server}${rule.server!=="workspace"&&rule.tool?` · ${rule.tool}`:""} · ${rule.allowed?"Allow":"Deny"} ${rule.duration==="session"?"this session":"across sessions"}`;

  return <div ref={root} className="relative">
    <button type="button" aria-label="Permission" aria-expanded={open} title="Permission rules" onClick={()=>setOpen(value=>!value)} className={cn("flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",open&&"bg-accent text-foreground")}><ShieldCheck className="size-3.5"/><span>Permission</span><ChevronDown className="size-3"/></button>
    {open&&<div role="dialog" aria-label="Permission rules" className="animate-pop absolute bottom-full left-0 z-50 mb-2 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-[#0a0a0a] shadow-2xl shadow-black/70">
      <div className="border-b border-border px-3 py-2.5"><p className="text-xs font-medium text-foreground">Permission</p><p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">Standing rules stay active until you change or remove them. Single-call choices remain on request cards.</p></div>
      <div className="scrollbar-thin max-h-[min(440px,65vh)] overflow-y-auto p-2">
        <label className="mb-1 block px-1 text-[11px] text-muted-foreground" htmlFor="permission-target">Tool or MCP server</label>
        <select id="permission-target" aria-label="Permission target" value={selected} onChange={event=>{setSelected(event.target.value);setMcpTool("");}} className="mb-2 h-8 w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none">
          {workspaceTools.map(name=><option key={name} value={`workspace:${name}`}>{name} · workspace tool</option>)}
          {servers.map(plugin=><option key={plugin.id} value={`mcp:${plugin.id}`}>{plugin.name} · MCP server</option>)}
        </select>
        {!isWorkspace&&<input aria-label="MCP tool name" value={mcpTool} onChange={event=>setMcpTool(event.target.value)} placeholder="Tool name (optional for whole MCP)" className="mb-2 h-8 w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/70"/>}
        <div className="space-y-1">
          {standingChoices.map(choice=>{
            const disabled=choice.target==="mcp"&&isWorkspace||choice.target==="tool"&&!tool;
            return <button key={choice.label} type="button" disabled={disabled} onClick={()=>choose(choice)} className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35",choice.allowed?"hover:text-success":"hover:text-destructive")}>
              {choice.allowed?<Check className="size-3 shrink-0 text-success"/>:<X className="size-3 shrink-0 text-destructive"/>}<span className="min-w-0 flex-1">{choice.label}</span>
            </button>;
          })}
        </div>
        {rules.length>0&&<div className="mt-3 border-t border-border pt-2"><p className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">Active rules</p>{rules.map((rule,index)=><div key={`${rule.server}:${rule.tool??"*"}:${rule.duration}:${index}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-foreground/80"><span className="min-w-0 flex-1 truncate">{description(rule)}</span><button type="button" aria-label={`Remove ${description(rule)}`} title="Remove rule" onClick={()=>onRemove(rule)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"><Trash2 className="size-3"/></button></div>)}</div>}
      </div>
    </div>}
  </div>;
}
