import { reviewScopeKey, type ReviewScope } from '../review-store';
import type { AdiRunState } from './types';

export interface AdiStorage {
  read(key: string): Promise<string | null>;
  compareAndSwap(key: string, expectedGeneration: number, payload: string): Promise<boolean>;
}
export interface AdiSnapshot { generation: number; state: AdiRunState }
const runKey = (scope: ReviewScope, runId: string) => JSON.stringify([reviewScopeKey(scope), runId]);

export function createAdiRepository(storage: AdiStorage) {
  const listeners = new Set<(snapshot: AdiSnapshot) => void>();
  const read = async (scope: ReviewScope, runId: string, { recover = false } = {}): Promise<AdiSnapshot | null> => {
    const raw = await storage.read(runKey(scope, runId));
    if (raw === null) return null;
    const snapshot = JSON.parse(raw) as AdiSnapshot;
    if (!Number.isSafeInteger(snapshot.generation) || snapshot.generation < 1 || snapshot.state?.version !== 1 ||
      snapshot.state.runId !== runId || reviewScopeKey(snapshot.state.scope) !== reviewScopeKey(scope)) {
      throw Error('Saved ADI state has an invalid identity. Existing data was preserved.');
    }
    if (recover && ['classified', 'selected', 'planned', 'implementing', 'auditing', 'revising'].includes(snapshot.state.phase)) {
      return { ...snapshot, state: { ...snapshot.state, phase: 'interrupted', blockedReasons: ['The previous design run was interrupted.'] } };
    }
    return snapshot;
  };
  return {
    read,
    async transact(scope: ReviewScope, runId: string, expectedGeneration: number, update: (state: AdiRunState | null) => AdiRunState) {
      const current = await read(scope, runId);
      if ((current?.generation ?? 0) !== expectedGeneration) throw Error('Design run changed. Reload before retrying.');
      const state = update(current?.state ?? null);
      if (state.runId !== runId || reviewScopeKey(state.scope) !== reviewScopeKey(scope)) throw Error('Design run identity changed.');
      const snapshot = { generation: expectedGeneration + 1, state };
      if (!await storage.compareAndSwap(runKey(scope, runId), expectedGeneration, JSON.stringify(snapshot))) {
        throw Error('Design run changed. Reload before retrying.');
      }
      listeners.forEach(listener => listener(snapshot));
      return snapshot;
    },
    subscribe(listener: (snapshot: AdiSnapshot) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
export type AdiRepository = ReturnType<typeof createAdiRepository>;
