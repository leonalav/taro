import { isTauri } from '@tauri-apps/api/core';
import { chatDb } from './chat-db';
import { createReviewRepository } from './review-store';
import { browserEvidenceStorage, createReviewEvidenceStorage } from './review-evidence-storage';
const browserStorage=()=>createReviewEvidenceStorage(localStorage,browserEvidenceStorage);
let initialized:Promise<void>|undefined;
async function database(){const db=await chatDb();await(initialized??=db.execute('CREATE TABLE IF NOT EXISTS review_sessions (scope TEXT PRIMARY KEY, payload TEXT NOT NULL)').then(()=>{}).catch(error=>{initialized=undefined;throw error;}));return db;}
export const reviewRepository=createReviewRepository({
  async read(key){if(!isTauri())return browserStorage().read(key);const db=await database();const rows=await db.select<{payload:string}[]>('SELECT payload FROM review_sessions WHERE scope=?',[key]);return rows[0]?.payload??null;},
  async write(key,value){if(!isTauri()){await browserStorage().write(key,value);return;}const db=await database();await db.execute('INSERT INTO review_sessions(scope,payload) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload',[key,value]);},
});
