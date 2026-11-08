import {invoke} from "@tauri-apps/api/core";

export type TerminalShell="cmd"|"powershell"|"bash";
export interface UserTerminal {id:string;owner:"user";shell:TerminalShell;workspaceRoot:string;cols:number;rows:number;pid?:number}
export interface TerminalRead {data:string;cursor:number;truncated:boolean;exited:boolean;exitCode:number|null;error:string|null}
export interface AgentTerminal {task_id:string;task_type:string;command:string;description:string;status:string;workspaceRoot:string;cwd?:string;scope:string;output?:string;exitCode?:number;truncated?:boolean;error?:string}
const sessions=new Map<string,UserTerminal>();
const listeners=new Set<()=>void>();
const key=(path:string)=>path.replace(/^\\\\\?\\/,"").replace(/\\/g,"/").replace(/\/+$/,"").toLowerCase();
const notify=()=>listeners.forEach(listener=>listener());
export const subscribeTerminals=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const terminalSnapshot=()=>[...sessions.values()];
export const userTerminals=(root:string)=>[...sessions.values()].filter(session=>key(session.workspaceRoot)===key(root));
export async function createUserTerminal(workspaceRoot:string,shell:TerminalShell){
  const session=await invoke<UserTerminal>("terminal_create",{workspaceRoot,shell,cols:80,rows:24});
  sessions.set(session.id,session);notify();return session;
}
export async function closeUserTerminal(id:string){
  if(!sessions.has(id))return;
  await invoke("terminal_close",{id});sessions.delete(id);notify();
}
export async function writeUserTerminal(id:string,data:string){
  if(!sessions.has(id))throw Error("Input is only available for a user terminal");
  return invoke("terminal_write",{id,data});
}
export const readUserTerminal=(id:string,cursor:number)=>invoke<TerminalRead>("terminal_read",{id,cursor});
export const resizeUserTerminal=(id:string,cols:number,rows:number)=>invoke("terminal_resize",{id,cols,rows});
export const listAgentTerminals=(workspaceRoot:string)=>invoke<AgentTerminal[]>("agent_terminal_list",{workspaceRoot});
export const readAgentTerminal=(workspaceRoot:string,id:string)=>invoke<AgentTerminal>("agent_terminal_read",{workspaceRoot,id});
