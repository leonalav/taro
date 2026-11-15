import { validateRule, validateSource } from './schema';
import type { ConventionQuery, ConventionRule, CoverageReport, SourceRecord } from './types';

const overlaps = (needles?: string[], haystack?: string[]) =>
  !needles?.length || !haystack?.length || needles.some(value => haystack.includes(value));

export function createConventionRegistry(sources: SourceRecord[], rules: ConventionRule[]) {
  const sourceIndex = new Map<string, SourceRecord>();
  const ruleIndex = new Map<string, ConventionRule>();
  for (const item of sources) {
    const source = validateSource(item);
    if (sourceIndex.has(source.id)) throw Error('Duplicate convention source: ' + source.id);
    sourceIndex.set(source.id, source);
  }
  for (const item of rules) {
    const rule = validateRule(item, sourceIndex);
    if (ruleIndex.has(rule.id)) throw Error('Duplicate convention rule: ' + rule.id);
    ruleIndex.set(rule.id, rule);
  }
  for (const rule of ruleIndex.values()) {
    for (const id of rule.relatedRuleIds) if (!ruleIndex.has(id)) throw Error('Unknown related convention: ' + id);
  }
  const ordered = [...ruleIndex.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return {
    getRule: (id: string) => ruleIndex.get(id),
    getSource: (id: string) => sourceIndex.get(id),
    rules: () => ordered.slice(),
    search(query: ConventionQuery = {}) {
      const tokens = query.text?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
      const limit = Number.isFinite(query.limit) ? Math.min(50, Math.max(1, Math.floor(query.limit!))) : 20;
      const matches = ordered.filter(rule => {
        if (query.categories?.length && !query.categories.includes(rule.category)) return false;
        if (!overlaps(query.platforms, rule.applicability.platforms) || !overlaps(query.componentKinds, rule.applicability.componentKinds)) return false;
        const searchable = [rule.id, rule.title, rule.interpretation, rule.exactText].join(' ').toLowerCase();
        return tokens.every(token => searchable.includes(token));
      });
      const start = query.cursor ? matches.findIndex(rule => rule.id === query.cursor) + 1 : 0;
      if (query.cursor && !start) throw Error('Invalid convention search cursor.');
      const page = matches.slice(start, start + limit);
      return { rules: page, nextCursor: start + limit < matches.length ? page.at(-1)?.id : undefined };
    },
    coverage(): CoverageReport {
      const sources = [...sourceIndex.values()].map(source => {
        const sections = source.sectionManifest;
        return {
          id: source.id, edition: source.edition, enumerated: sections.map(section => section.id),
          imported: sections.filter(section => section.status === 'imported').map(section => section.id),
          licensedLocal: sections.filter(section => section.status === 'licensed-local').map(section => section.id),
          unavailable: sections.filter(section => section.status === 'unavailable').map(section => section.id),
          excluded: sections.filter(section => section.status === 'excluded').map(({ id, reason }) => ({ id, reason })),
        };
      });
      return { complete: !!sources.length && sources.every(source => !source.unavailable.length), sources };
    },
  };
}
export type ConventionRegistry = ReturnType<typeof createConventionRegistry>;
