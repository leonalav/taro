import * as React from "react";
import {isTauri} from "@tauri-apps/api/core";
import {LockKeyhole,Plus,TerminalSquare,X} from "lucide-react";
import {Terminal} from "@xterm/xterm";
import {FitAddon} from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {closeUserTerminal,createUserTerminal,listAgentTerminals,readAgentTerminal,readUserTerminal,resizeUserTerminal,subscribeTerminals,userTerminals,writeUserTerminal,type AgentTerminal,type TerminalShell,type UserTerminal} from "@/lib/terminal-sessions";
import {cn} from "@/utils/cn";
import {TerminalOutputWriter,terminalLogText} from "@/lib/terminal-output";

const shellNames:Record<TerminalShell,string>={cmd:"CMD",powershell:"PowerShell",bash:"Bash"};
const button="inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-taro";

export function TerminalPanel({root,visible=true}:{root?:string;visible?:boolean}){
  const [owner,setOwner]=React.useState<"user"|"agent">("user");
  const [shell,setShell]=React.useState<TerminalShell>("powershell");
  const [selected,setSelected]=React.useState("");
  const [agentId,setAgentId]=React.useState("");
  const [sessions,setSessions]=React.useState<UserTerminal[]>(()=>root?userTerminals(root):[]);
  const [agents,setAgents]=React.useState<AgentTerminal[]>([]);
  const [creating,setCreating]=React.useState(false);
  const [error,setError]=React.useState("");
  React.useEffect(()=>{setAgents([]);setAgentId("");setError("");},[root]);
  React.useEffect(()=>{const sync=()=>setSessions(root?userTerminals(root):[]);sync();return subscribeTerminals(sync);},[root]);
  React.useEffect(()=>{if(!sessions.some(session=>session.id===selected))setSelected(sessions.at(-1)?.id??"");},[sessions,selected]);
  React.useEffect(()=>{
    if(!root||!isTauri()||!visible)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{const items=await listAgentTerminals(root);if(!cancelled){setAgents(items);setAgentId(id=>items.some(item=>item.task_id===id)?id:items[0]?.task_id??"");}}catch(e){if(!cancelled&&owner==="agent")setError(String(e));}finally{if(!cancelled)timer=setTimeout(poll,1000);}};
    void poll();return()=>{cancelled=true;clearTimeout(timer);};
  },[root,visible,owner]);
  const create=async()=>{if(!root||creating)return;setCreating(true);setError("");try{const session=await createUserTerminal(root,shell);setSelected(session.id);}catch(e){setError(String(e));}finally{setCreating(false);}};
  const close=async(id:string)=>{try{await closeUserTerminal(id);setError("");}catch(e){setError(String(e));}};
  return <section aria-label="Workspace terminals" className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
      <div className="flex items-center rounded-md border border-border bg-background p-0.5" role="group" aria-label="Terminal owner">
        <button className={cn(button,"h-6",owner==="user"&&"bg-white/[0.08] text-foreground")} aria-pressed={owner==="user"} onClick={()=>{setOwner("user");setError("");}}>User{sessions.length>0&&<span className="text-[10px] text-muted-foreground">{sessions.length}</span>}</button>
        <button className={cn(button,"h-6",owner==="agent"&&"bg-white/[0.08] text-foreground")} aria-pressed={owner==="agent"} onClick={()=>{setOwner("agent");setError("");}}>Agent{agents.length>0&&<span className="text-[10px] text-muted-foreground">{agents.length}</span>}</button>
      </div>
      {owner==="user"?<div className="ml-auto flex items-center gap-1"><select aria-label="Terminal shell" value={shell} onChange={e=>setShell(e.target.value as TerminalShell)} className="h-7 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground outline-none focus-visible:border-taro">{Object.entries(shellNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button className={button} aria-label="New terminal" onClick={()=>{void create();}} disabled={!root||creating||!isTauri()}><Plus className="size-3.5"/>{creating?"Starting…":"New"}</button></div>:<span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><LockKeyhole className="size-3"/>Read only</span>}
    </div>
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3 text-[11px] text-muted-foreground"><TerminalSquare className="size-3 shrink-0"/><span className="min-w-0 truncate" title={root}>{root||"No folder selected"}</span></div>
    {error&&<p role="alert" className="border-b border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">{error}</p>}
    {!root?<EmptyTerminal title="Choose a workspace" text="Open a folder to start a terminal in that directory."/>:!isTauri()?<EmptyTerminal title="Terminals run in the desktop app" text="Open Taro desktop to use CMD, PowerShell and Bash."/>:owner==="user"?<>
      {sessions.length>0&&<div className="scrollbar-none flex h-9 shrink-0 overflow-x-auto border-b border-border" role="tablist" aria-label="User terminals">{sessions.map((session,i)=><div key={session.id} className={cn("flex shrink-0 items-center gap-1 border-r border-border pr-2",selected===session.id&&"bg-white/[0.04]")}><button role="tab" aria-selected={selected===session.id} onClick={()=>setSelected(session.id)} className={cn(button,"h-8 rounded-none",selected===session.id&&"text-foreground")}>{shellNames[session.shell]} {i+1}</button><button aria-label={`Close ${shellNames[session.shell]} terminal ${i+1}`} title="Close terminal" onClick={()=>{void close(session.id);}} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="size-3"/></button></div>)}</div>}
      {selected?<UserTerminalView key={selected} id={selected} visible={visible}/>:<EmptyTerminal title="Your terminal, your workspace" text="Choose a shell above, then start a terminal."/>}
    </>:<>
      {agents.length>0?<><div className="border-b border-border p-2"><select className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-taro" aria-label="Agent command" value={agentId} onChange={e=>setAgentId(e.target.value)}>{agents.map(task=><option key={task.task_id} value={task.task_id}>{task.status} · {task.description||task.command}</option>)}</select></div>{agentId&&<AgentTerminalView key={`${root}:${agentId}`} root={root} id={agentId} visible={visible}/>}</>:<EmptyTerminal title="Agent commands appear here" text="Follow live command output while the agent works. Input stays with the agent."/>}
    </>}
  </section>;
}

function EmptyTerminal({title,text}:{title:string;text:string}){return <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-2 px-8 text-center"><TerminalSquare className="mb-1 size-6 text-muted-foreground/50"/><p className="text-[13px] font-medium text-foreground">{title}</p><p className="max-w-64 text-xs leading-5 text-muted-foreground">{text}</p></div>;}

function UserTerminalView({id,visible}:{id:string;visible:boolean}){
  const host=React.useRef<HTMLDivElement>(null);
  const [status,setStatus]=React.useState("Connecting…");
  React.useEffect(()=>{
    if(!host.current)return;
    let cancelled=false,cursor=0,timer:ReturnType<typeof setTimeout>,write=Promise.resolve<unknown>(undefined);
    const term=new Terminal({allowProposedApi:true,fontFamily:'"Geist Mono Variable", monospace',fontSize:12,lineHeight:1.4,cursorBlink:true,scrollback:3000,theme:{background:"#0b0b0b",foreground:"#d4d4d4",cursor:"#b199ff",selectionBackground:"#8a67d43d"}});
    const fit=new FitAddon();term.loadAddon(fit);term.open(host.current);
    const outputWriter=new TerminalOutputWriter(term);
    const resize=()=>{if(!host.current?.clientWidth||!host.current.clientHeight)return;fit.fit();void resizeUserTerminal(id,term.cols,term.rows).catch(e=>{if(!cancelled)setStatus(String(e));});};
    const observer=new ResizeObserver(resize);observer.observe(host.current);resize();
    const input=term.onData(data=>{write=write.then(()=>writeUserTerminal(id,data)).catch(e=>{if(!cancelled)setStatus(String(e));});});
    const poll=async()=>{try{const data=await readUserTerminal(id,cursor);if(cancelled)return;if(data.truncated)term.writeln("\r\n[Earlier output is no longer in the terminal buffer]\r\n");if(data.data)await outputWriter.write(Uint8Array.from(atob(data.data),char=>char.charCodeAt(0)));if(cancelled)return;cursor=data.cursor;if(data.error){setStatus(data.error);return;}if(data.exited){await outputWriter.finish();term.options.disableStdin=true;term.options.cursorBlink=false;setStatus(`Exited${data.exitCode!=null?` · ${data.exitCode}`:""}`);return;}setStatus("Running");}catch(e){if(!cancelled)setStatus(String(e));return;}if(!cancelled)timer=setTimeout(poll,120);};
    void poll();if(visible)term.focus();
    return()=>{cancelled=true;clearTimeout(timer);observer.disconnect();input.dispose();term.dispose();};
  },[id]);
  return <><div className="relative min-h-0 min-w-0 flex-1 p-3"><div ref={host} className="absolute inset-3"/></div><div role="status" className="flex h-7 shrink-0 items-center border-t border-border px-3 text-[10px] text-muted-foreground">{status}</div></>;
}

function AgentTerminalView({root,id,visible}:{root:string;id:string;visible:boolean}){
  const [task,setTask]=React.useState<AgentTerminal>();
  const [error,setError]=React.useState("");
  const output=React.useRef<HTMLPreElement>(null);
  React.useEffect(()=>{if(!visible)return;let cancelled=false,timer:ReturnType<typeof setTimeout>;const poll=async()=>{try{const next=await readAgentTerminal(root,id);if(!cancelled){const el=output.current;const nearEnd=!el||el.scrollHeight-el.scrollTop-el.clientHeight<48;setTask(next);if(nearEnd)requestAnimationFrame(()=>{if(!cancelled&&output.current)output.current.scrollTop=output.current.scrollHeight;});}}catch(e){if(!cancelled)setError(String(e));}finally{if(!cancelled)timer=setTimeout(poll,500);}};void poll();return()=>{cancelled=true;clearTimeout(timer);};},[root,id,visible]);
  return <>{task&&<div className="space-y-1 border-b border-border px-3 py-2"><p className="break-words font-mono text-[11px] text-foreground">{task.command}</p><p className="text-[10px] text-muted-foreground">{task.task_type==="local_bash"?"Bash":"PowerShell"} · {task.status}{task.exitCode!=null?` · exit ${task.exitCode}`:""}{task.truncated?" · output truncated":""}</p></div>}{error&&<p role="alert" className="p-3 text-xs text-red-300">{error}</p>}<pre ref={output} aria-label="Agent terminal output" className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap break-words text-foreground/85">{terminalLogText(task?.output||"")||"Waiting for output…"}</pre><p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">Agent owned · input and process controls are managed by the runtime.</p></>;
}
