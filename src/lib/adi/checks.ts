import type { ConventionRegistry } from './registry';
import type { AdiContract, EvidenceRecord, VerificationMethod } from './types';

export function buildCheckPlan(contract: AdiContract, registry: ConventionRegistry) {
  return {
    contractDigest: contract.digest,
    checks: contract.selection.requiredRuleIds.flatMap(ruleId => {
      const rule = registry.getRule(ruleId);
      if (!rule) throw Error('Missing source for ' + ruleId);
      return rule.verificationMethods.map((method: VerificationMethod) => ({
        id: ruleId + ':' + method, ruleIds: [ruleId], method, blocking: true,
        acceptance: contract.decisions.filter(decision => decision.ruleIds.includes(ruleId)).flatMap(decision => decision.acceptanceChecks),
      }));
    }),
  };
}
export type DesignCheckPlan = ReturnType<typeof buildCheckPlan>;
export function evaluateCheckCoverage(plan: DesignCheckPlan, evidence: EvidenceRecord[]) {
  return plan.checks.map(check => {
    const records = evidence.filter(record => record.contractDigest === plan.contractDigest && record.provenance === check.method &&
      check.ruleIds.every(id => record.ruleIds.includes(id)));
    return { ...check, result: records.some(record => record.result === 'fail') ? 'fail'
      : records.some(record => record.result === 'pass') ? 'pass'
      : records.some(record => record.result === 'not-applicable') ? 'not-applicable'
      : check.method === 'human' ? 'needs-human' : 'unmeasured' };
  });
}
