import {isTauri} from '@tauri-apps/api/core';
import {chatDb} from './chat-db';
import {createTaskRepository} from './task-store';
let initialized:Promise<void>|undefined;
async function database(){const db=await chatDb();await (initialized??=db.execute('CREATE TABLE IF NOT EXISTS task_boards (workspace_id TEXT PRIMARY KEY, payload TEXT NOT NULL)').then(()=>{}));return db;}
export const taskRepository=createTaskRepository({
  async read(workspace){
    if(!isTauri())return localStorage.getItem(`taro-tasks-v1:${workspace}`);
    const db=await database();const rows=await db.select<{payload:string}[]>('SELECT payload FROM task_boards WHERE workspace_id=?',[workspace]);return rows[0]?.payload??null;
  },
  async write(workspace,value){
    if(!isTauri()){localStorage.setItem(`taro-tasks-v1:${workspace}`,value);return;}
    const db=await database();await db.execute('INSERT INTO task_boards(workspace_id,payload) VALUES(?,?) ON CONFLICT(workspace_id) DO UPDATE SET payload=excluded.payload',[workspace,value]);
  },
});
