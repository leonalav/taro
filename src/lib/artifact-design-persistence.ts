import { isTauri } from '@tauri-apps/api/core';
import { chatDb } from './chat-db';
import { createArtifactDesignRepository } from './artifact-design';
let initialized:Promise<void>|undefined;
async function database(){const db=await chatDb();await(initialized??=db.execute('CREATE TABLE IF NOT EXISTS artifact_designs (workspace TEXT PRIMARY KEY, payload TEXT NOT NULL)').then(()=>{}).catch(error=>{initialized=undefined;throw error;}));return db;}
export const artifactDesignRepository=createArtifactDesignRepository({
  async read(key){if(!isTauri())return localStorage.getItem(`taro-artifact-design-v1:${key}`);const db=await database();const rows=await db.select<{payload:string}[]>('SELECT payload FROM artifact_designs WHERE workspace=?',[key]);return rows[0]?.payload??null;},
  async write(key,value){if(!isTauri()){localStorage.setItem(`taro-artifact-design-v1:${key}`,value);return;}const db=await database();await db.execute('INSERT INTO artifact_designs(workspace,payload) VALUES(?,?) ON CONFLICT(workspace) DO UPDATE SET payload=excluded.payload',[key,value]);},
  async compareAndSwap(key,expectedRevision,value){
    if(!isTauri()){
      if(!navigator.locks)throw Error('Project design memory requires browser storage locks. Use the desktop app or localhost with a supported browser.');
      return navigator.locks.request(`taro-artifact-design-v1:${key}`,()=>{
        const storageKey=`taro-artifact-design-v1:${key}`,raw=localStorage.getItem(storageKey);
        if((raw?JSON.parse(raw).revision:0)!==expectedRevision)return false;
        localStorage.setItem(storageKey,value);return true;
      });
    }
    const db=await database();
    const result=expectedRevision===0
      ?await db.execute('INSERT INTO artifact_designs(workspace,payload) VALUES(?,?) ON CONFLICT(workspace) DO NOTHING',[key,value])
      :await db.execute("UPDATE artifact_designs SET payload=? WHERE workspace=? AND json_extract(payload,'$.revision')=?",[value,key,expectedRevision]);
    return result.rowsAffected===1;
  },
});
