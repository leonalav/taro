import Database from "@tauri-apps/plugin-sql";
import type { Folder, Thread } from "@/data/mock";
import { seedThreads,ensureNikeSubagentArtifact } from "@/data/mock";
import type {PermissionRule} from "@/lib/permission-rules";
import type {Settings} from '@/data/settings';
import { recoverThoughts } from "@/lib/agent-progress";
let db: Promise<Database> | undefined;
export const chatDb = () => db ??= Database.load("sqlite:taro.db");
async function schema(d: Database) {
 await d.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,name TEXT NOT NULL,folder_id TEXT NOT NULL,updated TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,messages TEXT NOT NULL)");
 await d.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)");
}
export async function loadChat() {
 const d=await chatDb(); await schema(d);
 const rows=await d.select<{id:string;name:string;folder_id:string;updated:string;archived:number;messages:string}[]>("SELECT * FROM sessions ORDER BY rowid DESC");
 const values=await d.select<{key:string;value:string}[]>("SELECT key,value FROM settings");
 const prefs=Object.fromEntries(values.map(v=>[v.key,v.value]));
 const folders:Folder[]=(prefs.folders?JSON.parse(prefs.folders):[{id:"taro",name:"taro"}]).filter((f:Folder)=>f.id==="taro"||f.id.startsWith("folder-"));
 if(!folders.some(f=>f.id==="taro")) folders.unshift({id:"taro",name:"taro"});
 const valid=new Set(folders.map(f=>f.id));
 const threads=rows.filter(r=>valid.has(r.folder_id) && !["scaffold","tokens"].includes(r.id)).map(r=>({id:r.id,name:r.name,folderId:r.folder_id,updated:r.updated,archived:!!r.archived,messages:(JSON.parse(r.messages) as Thread["messages"]).map(message=>message.role==="permission"&&message.live&&!message.decision?{...message,decision:{label:"Interrupted",allowed:false,target:"tool" as const,duration:"once" as const}}:message)})) as Thread[];
 for(const thread of threads)thread.messages=recoverThoughts(thread.messages);
 const reference=threads.find(t=>t.id==="brand");
 if(reference) { reference.name="Nike/Brand Discovery"; reference.folderId="taro"; reference.archived=false; reference.messages=ensureNikeSubagentArtifact(reference).messages; }
 else threads.push(seedThreads[0]);
 return {threads,folders,activeThreadId:prefs.activeThreadId ?? undefined,preferences:prefs.workspacePreferences?JSON.parse(prefs.workspacePreferences):undefined,models:prefs.models?JSON.parse(prefs.models):undefined,plugins:prefs.plugins?JSON.parse(prefs.plugins):undefined,workspaceRoot:prefs.workspaceRoot??undefined,workspaceRules:prefs.workspaceRules?JSON.parse(prefs.workspaceRules):undefined,permissionRules:prefs.permissionRules?JSON.parse(prefs.permissionRules) as PermissionRule[]:[]};
}
let preferenceWrite:Promise<void>=Promise.resolve();
export function persistWorkspaceSettings(settings:Settings){const value=JSON.stringify(settings),models=JSON.stringify(settings.models),plugins=JSON.stringify(settings.plugins);preferenceWrite=preferenceWrite.catch(()=>{}).then(async()=>{const db=await chatDb();await schema(db);await db.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('workspacePreferences',?),('models',?),('plugins',?),('workspaceRoot',?)",[value,models,plugins,settings.workspaceRoot??'']);});return preferenceWrite;}
let ruleWrite:Promise<void>=Promise.resolve();
export function persistWorkspaceRules(rules:unknown){const serialized=JSON.stringify(rules);ruleWrite=ruleWrite.catch(()=>{}).then(async()=>{const d=await chatDb();await schema(d);await d.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('workspaceRules',?)",[serialized]);});return ruleWrite;}
export async function persistPermissionRules(rules:PermissionRule[]) { const d=await chatDb(); await schema(d); await d.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('permissionRules',?)",[JSON.stringify(rules)]); }
export async function persistModels(models: unknown, plugins?:unknown, workspaceRoot?:string) { const d=await chatDb(); await schema(d); await d.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('models',?),('plugins',?),('workspaceRoot',?)",[JSON.stringify(models),JSON.stringify(plugins??[]),workspaceRoot??""]); }
let chatWrite: Promise<void> = Promise.resolve();
export function persistChat(folders: Folder[], threads: Thread[], activeThreadId: string): Promise<void> {
 chatWrite=chatWrite.catch(()=>{}).then(()=>writeChat(folders,threads,activeThreadId));
 return chatWrite;
}
async function writeChat(folders: Folder[], threads: Thread[], activeThreadId: string) {
 const d=await chatDb(); await schema(d);
 const ids=threads.map(t=>t.id);
 if(ids.length) await d.execute(`DELETE FROM sessions WHERE id NOT IN (${ids.map(()=>"?").join(",")})`,ids); else await d.execute("DELETE FROM sessions");
 for(const t of threads) await d.execute("INSERT OR REPLACE INTO sessions (id,name,folder_id,updated,archived,messages) VALUES (?,?,?,?,?,?)",[t.id,t.name,t.folderId,t.updated,t.archived?1:0,JSON.stringify(t.messages)]);
 await d.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('folders',?),('activeThreadId',?)",[JSON.stringify(folders),activeThreadId]);
}
