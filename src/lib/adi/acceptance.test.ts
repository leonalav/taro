import { expect, it } from 'vitest';
import { createAdiRuntime } from './runtime';
import { createAdiRepository } from './store';
import { loadBundledRegistry } from './bundled-registry';
import { createConventionRegistry } from './registry';
import type { ArtifactAuditReport } from '../artifact-audit';

it('requires trusted, current evidence from planning through completion and invalidates it on the next write', async () => {
  const bundled = await loadBundledRegistry();
  const rule = bundled.getRule('wcag-2.2:1.4.3')!;
  const registry = createConventionRegistry([bundled.getSource(rule.sourceId)!], [{ ...rule, relatedRuleIds: [] }]);
  const storage = new Map<string,string>();
  const repository = createAdiRepository({
    read: async key => storage.get(key) ?? null,
    compareAndSwap: async (key, expected, value) => {
      if ((JSON.parse(storage.get(key) ?? '{}').generation ?? 0) !== expected) return false;
      storage.set(key, value);
      return true;
    },
  });
  const scope = { workspace: '/fixture', sessionId: 'chat' };
  const runtime = createAdiRuntime({ registry, repository }, { scope, runId: 'fixture' });
  const agent = { id: 'chat', readOnly: false };
  await runtime.prepare({ text: 'Make this button clearer', referenceIds: [] },
    { files: ['src/app.css'], componentKinds: ['button'], platformEvidence: ['web'], fingerprint: 'before' });
  const plan = { action: 'submit', decisions: [{ ruleIds: [rule.id], componentIds: ['button'], targetFiles: ['src/app.css'],
    decision: 'Use a dark button label on a white background.', rationale: 'The action must remain legible.',
    acceptanceChecks: ['Check the rendered foreground-to-background contrast.'] }] };
  await expect(runtime.execute('DesignPlan', plan, agent)).rejects.toThrow('Read the pinned');
  await runtime.execute('ConventionRead', { rule_ids: [rule.id] }, { id: 'child', readOnly: true });
  await runtime.execute('DesignPlan', plan, agent);
  expect(await runtime.beforeTool('Edit', { file_path: 'src/other.css' }, agent)).toMatchObject({ allowed: false });
  expect(await runtime.beforeTool('Edit', { file_path: 'src/app.css' }, agent)).toMatchObject({ allowed: true });

  const sourceHash='a'.repeat(64);
  const audit:ArtifactAuditReport={version:1,id:'trusted-audit',sourceHash,createdAt:1,sourceKind:'html',status:'measured-clear',manualChecks:[],limitations:[],
    cases:[{scheme:'light',mode:'desktop',findings:[],viewport:{width:1000,height:700},zoom:1,reducedMotion:false,
      screenshot:'data:image/png;base64,AA',sourceHash,unmeasured:[],truncated:false,measuredText:1}]};
  const generation = runtime.mutationGeneration();
  await runtime.recordBrowserAudit('preview', 'r2', audit, generation, 'b'.repeat(64));
  expect(await runtime.evaluateCompletion()).toMatchObject({ status: 'needs-work' });

  const payload = { generation, contract_digest: runtime.contract()!.digest, audit_id: audit.id,
    checks: [{ rule_id: rule.id, result: 'pass', observation: 'Measured the button text on white at 12:1.', target_selectors: ['#save'] }] };
  await expect(runtime.attest({ ...payload, audit_id: 'invented' }, agent)).rejects.toThrow('changed');
  await runtime.attest(payload, agent);
  const { receiptId } = await runtime.sealCompletion();
  expect(receiptId).toBeTruthy();
  expect((await repository.read(scope, 'fixture'))?.state.phase).toBe('verified');
  expect(await runtime.beforeTool('Edit', { file_path: 'src/app.css' }, agent)).toMatchObject({ allowed: true });
  expect(await runtime.sealCompletion()).toMatchObject({ status: 'needs-work' });
  await runtime.recordBrowserAudit('preview', 'r2', audit, generation);
  expect(runtime.verification()).toBeUndefined();
});
