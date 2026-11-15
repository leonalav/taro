import type { ConventionRegistry } from './registry';
import type { ConventionSelection, DesignContext } from './types';
import { resolveConventionConflicts } from './conflicts';

export function selectConventions(context: DesignContext, registry: ConventionRegistry): ConventionSelection {
  const selection: ConventionSelection = { requiredRuleIds: [], advisoryRuleIds: [], excluded: [], conflicts: [], sourceVersions: {} };
  if (context.intent === 'discussion' || context.intent === 'non-ui') return selection;
  const platforms = new Set(context.platforms);
  const web = platforms.has('web') || platforms.has('desktop-web') || [...platforms].some(platform => ['macos', 'windows', 'linux'].includes(platform));
  if (web) platforms.add('web');
  for (const rule of registry.rules()) {
    const { platforms: allowed, componentKinds, domain } = rule.applicability;
    if (allowed?.length && !allowed.some(platform => platforms.has(platform))) continue;
    if (componentKinds?.length && !componentKinds.some(kind => context.surfaces.includes(kind))) continue;
    if (domain?.length && !domain.some(name => context.domain.includes(name))) continue;
    if (rule.level === 'AAA') continue;
    const source = registry.getSource(rule.sourceId);
    if (!source) continue;
    selection.sourceVersions[source.id] = { edition: source.edition, contentHash: source.contentHash };
    if (rule.authority === 'normative' || rule.authority === 'project-policy') selection.requiredRuleIds.push(rule.id);
    else selection.advisoryRuleIds.push(rule.id);
  }
  return resolveConventionConflicts(context, selection);
}
