import { describe, expect, it } from 'vitest';
import { createAdiRepository, type AdiStorage } from './store';
import { compileDesignContract, validateDecisionCoverage } from './contract';
import { classifyDesignContext } from './context';
import type { AdiRunState, ConventionSelection } from './types';
const scope = { workspace: '/demo', sessionId: 'root' };
const initial: AdiRunState = { version: 1, scope, runId: 'run', phase: 'implementing', sourceReceipts: [], evidenceIds: [], mutationGeneration: 0, blockedReasons: [] };
const context = classifyDesignContext({ request: { text: 'Fix the button', referenceIds: [] }, workspace: { files: [], componentKinds: [], platformEvidence: ['web'], fingerprint: 'base' } });
const selection: ConventionSelection = { requiredRuleIds: ['a', 'b'], advisoryRuleIds: [], excluded: [], conflicts: [], sourceVersions: { wcag: { edition: '1', contentHash: 'a'.repeat(64) } } };
describe('persisted design contracts', () => {
  it('compares generations and recovers an interrupted run', async () => {
    const data = new Map<string, string>();
    const storage: AdiStorage = {
      read: async key => data.get(key) ?? null,
      compareAndSwap: async (key, expected, next) => {
        if (JSON.parse(data.get(key) ?? '{"generation":0}').generation !== expected) return false;
        data.set(key, next);
        return true;
      },
    };
    const repo = createAdiRepository(storage);
    await repo.transact(scope, 'run', 0, () => initial);
    await expect(repo.transact(scope, 'run', 0, () => initial)).rejects.toThrow('changed');
    const restarted = createAdiRepository(storage);
    expect((await restarted.read(scope, 'run', { recover: true }))?.state.phase).toBe('interrupted');
    expect(await restarted.read({ ...scope, workspace: '/other' }, 'run')).toBeNull();
  });
  it('detects uncovered requirements and rejects stale read receipts', async () => {
    const contract = await compileDesignContract(context, selection, [
      { id: 'd', ruleIds: ['a'], componentIds: ['button'], targetFiles: ['ui.tsx'], decision: 'Keep a visible focus ring.', rationale: 'Keyboard navigation', acceptanceChecks: ['Tab to button'] },
    ], { id: 'plan', contentHash: 'f'.repeat(64) }, 1, { scope, generation: 1 });
    expect(validateDecisionCoverage(contract, [
      { id: 'x', runId: 'run', ownerId: 'root', sourceId: 'wcag', sectionIds: ['x'], contentHash: 'b'.repeat(64), createdAt: 0 },
    ])).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'b' }), expect.objectContaining({ sourceId: 'wcag' })]));
  });
});
