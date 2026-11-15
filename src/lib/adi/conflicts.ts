import type { ConventionSelection, DesignContext } from './types';

export function resolveConventionConflicts(context: DesignContext, selection: ConventionSelection): ConventionSelection {
  const exclusions = selection.excluded.filter(item => item.reason.trim() && item.evidenceIds.length &&
    item.evidenceIds.every(id => context.evidence.includes(id)));
  const excluded = new Set(exclusions.map(item => item.ruleId));
  return {
    ...selection,
    excluded: exclusions,
    advisoryRuleIds: selection.advisoryRuleIds.filter(id => !excluded.has(id)),
    conflicts: selection.conflicts.map(conflict => ({
      ...conflict, blocking: conflict.blocking || conflict.ruleIds.filter(id => selection.requiredRuleIds.includes(id)).length > 1,
    })),
  };
}
