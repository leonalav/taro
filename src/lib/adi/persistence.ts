import { isTauri } from '@tauri-apps/api/core';
import { chatDb } from '../chat-db';
import { createAdiRepository } from './store';

let initialized: Promise<void> | undefined;
async function database() {
  const db = await chatDb();
  await (initialized ??= db.execute('CREATE TABLE IF NOT EXISTS adi_runs (scope_run TEXT PRIMARY KEY, generation INTEGER NOT NULL, payload TEXT NOT NULL)')
    .then(() => {}).catch(error => { initialized = undefined; throw error; }));
  return db;
}

const browserKey = (key: string) => 'taro-adi-v1:' + key;
export const adiRepository = createAdiRepository({
  async read(key) {
    if (!isTauri()) return localStorage.getItem(browserKey(key));
    const db = await database();
    const rows = await db.select<{ payload: string }[]>('SELECT payload FROM adi_runs WHERE scope_run=?', [key]);
    return rows[0]?.payload ?? null;
  },
  async compareAndSwap(key, expected, value) {
    if (!isTauri()) {
      if (!navigator.locks) throw Error('ADI requires a browser with storage locks.');
      return navigator.locks.request(browserKey(key), () => {
        const current = localStorage.getItem(browserKey(key));
        if ((current ? JSON.parse(current).generation : 0) !== expected) return false;
        localStorage.setItem(browserKey(key), value);
        return true;
      });
    }
    const db = await database();
    const result = expected === 0
      ? await db.execute('INSERT INTO adi_runs(scope_run,generation,payload) VALUES(?,?,?) ON CONFLICT(scope_run) DO NOTHING', [key, 1, value])
      : await db.execute('UPDATE adi_runs SET generation=?,payload=? WHERE scope_run=? AND generation=?', [expected + 1, value, key, expected]);
    return result.rowsAffected === 1;
  },
});
