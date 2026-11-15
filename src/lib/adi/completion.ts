import type { AdiRunState, CompletionDecision, EvidenceRecord } from './types';

export interface VerificationIdentity {
  workspaceIdentity: string;
  sourceFingerprint: string;
  contractDigest: string;
  mutationGeneration: number;
  previewId?: string;
  revisionId?: string;
  threadGeneration?: number;
  auditId?: string;
}
export function evaluateDesignCompletion(state: AdiRunState, evidence: EvidenceRecord[], current?: VerificationIdentity): CompletionDecision {
  if (state.phase === 'interrupted' || state.phase === 'blocked') return { status: 'blocked', missing: state.blockedReasons };
  if (state.context?.intent === 'discussion' || state.context?.intent === 'non-ui') return { status: 'ready', missing: [] };
  if (!state.contract) return { status: 'needs-work', missing: ['Read applicable conventions with ConventionRead and submit decisions with DesignPlan.'] };
  if (!current || current.contractDigest !== state.contract.digest || current.mutationGeneration !== state.mutationGeneration) {
    return { status: 'needs-work', missing: ['Render the current workspace revision and collect a fresh, rule-linked browser audit.'] };
  }
  const eligible = evidence.filter(record => state.evidenceIds.includes(record.id) && record.runId === state.runId &&
    record.contractDigest === current.contractDigest && record.workspaceIdentity === current.workspaceIdentity &&
    record.sourceFingerprint === current.sourceFingerprint && record.previewId === current.previewId && record.revisionId === current.revisionId);
  const missing = state.contract.selection.requiredRuleIds.filter(ruleId => {
    const records = eligible.filter(record => record.ruleIds.includes(ruleId));
    return !records.some(record => record.result === 'pass' || record.result === 'not-applicable') ||
      records.some(record => record.result === 'fail');
  });
  return missing.length ? { status: 'needs-work', missing: missing.map(id => 'Verify ' + id) } : { status: 'ready', missing: [] };
}
