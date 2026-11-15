import { reviewScopeKey, type ReviewScope } from '../review-store';
import type { ConventionRegistry } from './registry';
import type { AdiContract, ConventionSelection, DesignContext, DesignDecision, PlanRef, SourceReadReceipt } from './types';

export async function digestValue(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  }));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function compileDesignContract(
  context: DesignContext, selection: ConventionSelection, decisions: DesignDecision[], planRef: PlanRef,
  artifactDesignRevision: number, { scope, generation }: { scope: ReviewScope; generation: number },
): Promise<AdiContract> {
  const contract = { version: 1 as const, id: 'adi-' + crypto.randomUUID(), scope, generation,
    context, selection, decisions, planRef, artifactDesignRevision };
  return { ...contract, digest: await digestValue(contract) };
}
interface CoverageIssue { ruleId?: string; sourceId?: string; message: string }

export function validateDecisionCoverage(contract: AdiContract, receipts: SourceReadReceipt[], options: {
  registry?: ConventionRegistry; runId?: string; ownerId?: string;
} = {}): CoverageIssue[] {
  const issues: CoverageIssue[] = [];
  const decided = new Set(contract.decisions.flatMap(decision => decision.ruleIds));
  const selected = new Set([...contract.selection.requiredRuleIds, ...contract.selection.advisoryRuleIds]);
  for (const ruleId of contract.selection.requiredRuleIds) {
    if (!decided.has(ruleId)) issues.push({ ruleId, message: 'Missing decision for ' + ruleId });
  }
  for (const ruleId of decided) {
    if (!selected.has(ruleId)) issues.push({ ruleId, message: 'Decision references an unselected rule: ' + ruleId });
  }
  for (const [sourceId, version] of Object.entries(contract.selection.sourceVersions)) {
    const current = receipts.filter(receipt => receipt.sourceId === sourceId && receipt.contentHash === version.contentHash &&
      (!options.runId || receipt.runId === options.runId) && (!options.ownerId || receipt.ownerId === options.ownerId) &&
      (!receipt.scopeKey || receipt.scopeKey === reviewScopeKey(contract.scope)));
    const sections = new Set(current.flatMap(receipt => receipt.sectionIds));
    const required = [...new Set([...contract.selection.requiredRuleIds, ...decided])].flatMap(ruleId => {
      const rule = options.registry?.getRule(ruleId);
      return rule?.sourceId === sourceId ? [rule.locator] : [];
    });
    if ((!options.registry || required.length) && (!current.length || required.some(id => !sections.has(id)))) {
      issues.push({ sourceId, message: 'Read the pinned source sections for ' + sourceId });
    }
  }
  for (const conflict of contract.selection.conflicts) {
    if (conflict.blocking) issues.push({ message: conflict.reason });
  }
  return issues;
}
