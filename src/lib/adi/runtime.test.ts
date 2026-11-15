import { describe, expect, it } from 'vitest';
import { createAdiRuntime, designTargetPath } from './runtime';
import { loadBundledRegistry } from './bundled-registry';
import { createAdiRepository } from './store';

async function setup() {
  const registry = await loadBundledRegistry();
  let raw: string | null = null;
  const repository = createAdiRepository({ read: async () => raw, compareAndSwap: async (_key, _generation, payload) => { raw = payload; return true; } });
  const runtime = createAdiRuntime({ registry, repository }, { scope: { workspace: '/demo', sessionId: 'root' }, runId: 'run' });
  await runtime.prepare({ text: 'Fix the database', referenceIds: [] }, { files: ['src/app.css'], componentKinds: [], platformEvidence: ['web'], fingerprint: 'x' });
  return runtime;
}
describe('ADI runtime', () => {
  it('upgrades a backend request before a stylesheet write', async () => {
    const runtime = await setup();
    expect(await runtime.beforeTool('Edit', { file_path: 'server/main.rs' }, { id: 'root', readOnly: false })).toMatchObject({ allowed: true });
    expect(await runtime.beforeTool('Edit', { file_path: 'src/app.css' }, { id: 'child', readOnly: false })).toMatchObject({ allowed: false, nextTool: 'ConventionRead' });
    expect(await runtime.evaluateCompletion()).toMatchObject({ status: 'needs-work' });
  });
  it('uses exact IDs and receipts to recover from an invalid plan and unlock a planned HTML write', async () => {
    const runtime = await setup();
    const owner = { id: 'root', readOnly: false };
    await runtime.beforeTool('Write', { file_path: 'preview/index.html' }, owner);
    const { selection } = JSON.parse((await runtime.execute('DesignContext', {}, owner)).text);
    const submit = (ruleIds: string[], acceptanceChecks: string[]) => runtime.execute('DesignPlan', { action: 'submit', decisions: [{
      ruleIds, acceptanceChecks, componentIds: [], targetFiles: ['preview/index.html'],
      decision: 'Build the planned preview.', rationale: 'Establish verifiable coverage before editing.',
    }] }, owner);
    await expect(submit(['wrong-id'], ['Check the preview'])).rejects.toThrow('Copy exact IDs from DesignContext');
    await expect(submit(selection.requiredRuleIds, [])).rejects.toThrow('observable acceptance check');
    await expect(submit(selection.requiredRuleIds, ['Check the preview'])).rejects.toThrow('Read these exact IDs');
    let remaining = selection.requiredRuleIds.length;
    while (remaining > 0) {
      const batch = JSON.parse((await runtime.execute('ConventionRead', { missing_required: true }, owner)).text);
      expect(batch.remaining).toBeLessThan(remaining);
      remaining = batch.remaining;
    }
    const plan = await submit(selection.requiredRuleIds, ['Check the preview']);
    expect(plan.artifact.contractChanged).toBe(true);
    expect(await runtime.beforeTool('Write', { file_path: '/demo/preview/index.html' }, owner)).toMatchObject({ allowed: true });
    expect(await runtime.beforeTool('Write', { file_path: 'preview/other.html' }, owner)).toMatchObject({ allowed: false });
  });
  it('normalizes Windows workspace paths without treating other drives as relative', () => {
    expect(designTargetPath('//?/A:/DEMO/preview/index.html', 'A:/demo')).toBe('preview/index.html');
    expect(designTargetPath('B:/demo/preview/index.html', 'A:/demo')).toBe('b:/demo/preview/index.html');
  });
  it('requires real receipt lookups and refuses caller-provided evidence', async () => {
    const runtime = await setup();
    await runtime.beforeTool('MCP', {}, { id: 'root', readOnly: false });
    await expect(runtime.execute('DesignPlan', { action: 'submit', decisions: [], receipts: ['fake'] }, { id: 'root', readOnly: false })).rejects.toThrow('Missing decision');
    await expect(runtime.execute('DesignDecision', { decisions: [] }, { id: 'child', readOnly: true })).rejects.toThrow('read-only');
  });
});
