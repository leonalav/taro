import type { ConventionRegistry } from './registry';
import type { AdiContract, ConventionRule, SourceRecord } from './types';

const hash = /^[a-f0-9]{64}$/;
const key = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/;
export const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const member = (value: unknown, values: string[]) => typeof value === 'string' && values.includes(value);
export const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const matches = (value: unknown, expression: RegExp) => typeof value === 'string' && expression.test(value);
const sha256 = (value: unknown) => matches(value, hash);
const isId = (value: unknown) => matches(value, key);
const isHttps = (value: unknown) => {
  if (!text(value)) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}

export function validateSource(value: unknown): SourceRecord {
  assert(isRecord(value), 'Invalid convention source.');
  assert(isId(value.id) && text(value.publisher) && text(value.title) && text(value.edition), 'Missing source identity or edition.');
  assert(isHttps(value.canonicalUrl) && isHttps(value.snapshotUrl), 'Source locators require HTTPS.');
  assert(matches(value.retrievedAt, /^\d{4}-\d{2}-\d{2}$/) && sha256(value.contentHash), 'Invalid source retrieval date or checksum.');
  assert(member(value.status, ['published', 'superseded', 'unverified']) &&
    member(value.rights, ['redistributable', 'licensed-local', 'metadata-only']), 'Invalid source status or rights.');
  assert(Array.isArray(value.sectionManifest) && value.sectionManifest.length > 0, 'Source section inventory is required.');
  const ids = new Set<string>();
  for (const section of value.sectionManifest) {
    assert(isRecord(section) && text(section.id) && !ids.has(section.id), 'Invalid or duplicate source section.');
    ids.add(section.id);
    assert(member(section.status, ['imported', 'licensed-local', 'excluded', 'unavailable']), 'Invalid source section status.');
    assert(section.status === 'imported' || section.status === 'licensed-local' ? sha256(section.contentHash) : text(section.reason),
      'Each source section requires a checksum or an explanation of its omission.');
  }
  return value as unknown as SourceRecord;
}

export function validateRule(value: unknown, sources: ReadonlyMap<string, SourceRecord>): ConventionRule {
  assert(isRecord(value) && text(value.sourceId) && isId(value.id) && text(value.locator) && text(value.title), 'Invalid convention identity.');
  const source = sources.get(value.sourceId);
  assert(source && source.status === 'published' && source.edition === value.edition, 'Unknown or unavailable convention source edition.');
  const section = source.sectionManifest.find(section => section.id === value.locator);
  assert(section && (section.status === 'imported' || section.status === 'licensed-local') &&
    section.contentHash === value.contentHash, 'Unknown section or mismatched convention checksum.');
  assert(value.exactText === undefined || (source.rights !== 'metadata-only' && text(value.exactText)), 'Original text requires content-use rights.');
  assert(member(value.category, ['accessibility', 'interaction', 'composition', 'typography-color', 'platform', 'domain']) &&
    member(value.authority, ['normative', 'informative', 'heuristic', 'aesthetic', 'project-policy']), 'Invalid convention category or authority.');
  assert(value.level === undefined || member(value.level, ['A', 'AA', 'AAA']), 'Invalid conformance level.');
  assert(text(value.interpretation) && stringList(value.exceptions) && stringList(value.relatedRuleIds), 'Incomplete interpretation or exception list.');
  assert(isRecord(value.applicability) && Object.values(value.applicability).every(stringList), 'Invalid convention applicability.');
  assert(Array.isArray(value.verificationMethods) && value.verificationMethods.length > 0 &&
    value.verificationMethods.every(method => member(method, ['machine', 'visual', 'interaction', 'human'])), 'Invalid verification methods.');
  return value as unknown as ConventionRule;
}

export function validateContract(value: unknown, registry: ConventionRegistry): AdiContract {
  assert(isRecord(value) && value.version === 1 && isId(value.id) && sha256(value.digest), 'Invalid ADI contract identity.');
  assert(isRecord(value.scope) && text(value.scope.workspace) && text(value.scope.sessionId) &&
    Number.isSafeInteger(value.generation) && Number(value.generation) > 0, 'Invalid contract scope or generation.');
  assert(isRecord(value.context) && text(value.context.fingerprint), 'Missing design context.');
  assert(isRecord(value.selection) && stringList(value.selection.requiredRuleIds) &&
    stringList(value.selection.advisoryRuleIds) && isRecord(value.selection.sourceVersions), 'Invalid convention selection.');
  const rules = new Set([...value.selection.requiredRuleIds, ...value.selection.advisoryRuleIds]);
  for (const id of rules) {
    const rule = registry.getRule(id);
    const source = rule && registry.getSource(rule.sourceId);
    assert(source, 'Contract references an unknown convention.');
    const version = value.selection.sourceVersions[source.id];
    assert(isRecord(version) && version.edition === source.edition && version.contentHash === source.contentHash, 'Contract references a stale source.');
  }
  assert(isRecord(value.planRef) && text(value.planRef.id) && sha256(value.planRef.contentHash), 'A persisted design plan is required.');
  assert(Array.isArray(value.decisions), "Missing design decisions.");
  const ids = new Set<string>();
  for (const [index, decision] of value.decisions.entries()) {
    const label = "Design decision " + (index + 1);
    assert(isRecord(decision) && text(decision.id) && !ids.has(decision.id), label + ' has an invalid or duplicate ID.');
    assert(stringList(decision.ruleIds) && decision.ruleIds.length > 0, label + ' needs at least one selected rule ID in ruleIds.');
    const unselected = decision.ruleIds.filter(id => !rules.has(id));
    assert(!unselected.length, label + ' references unselected IDs: ' + unselected.join(', ') + '. Copy exact IDs from DesignContext.');
    assert(text(decision.decision) && text(decision.rationale), label + ' needs a concrete decision and rationale.');
    assert(stringList(decision.acceptanceChecks) && decision.acceptanceChecks.length > 0, label + ' needs at least one observable acceptance check.');
    assert(stringList(decision.componentIds) && stringList(decision.targetFiles) &&
      decision.targetFiles.every(path=>!path.split(/[\\/]/).includes('..')), label + ' needs valid component IDs and target paths without parent traversal.');
    ids.add(decision.id);
  }
  return value as unknown as AdiContract;
}
