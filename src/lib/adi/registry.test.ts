import { describe, expect, it } from 'vitest';
import { createConventionRegistry } from './registry';
import { validateRule, validateSource } from './schema';
import type { ConventionRule, SourceRecord } from './types';

const hash = 'a'.repeat(64);
const source: SourceRecord = {
  id: 'standard', publisher: 'Example', title: 'Example standard', edition: '1',
  canonicalUrl: 'https://example.com/standard', snapshotUrl: 'https://example.com/1',
  retrievedAt: '2026-11-13', contentHash: hash, status: 'published', rights: 'redistributable',
  sectionManifest: [{ id: 'criterion', status: 'imported', contentHash: hash }, { id: 'missing', status: 'unavailable', reason: 'Licensed' }],
};
const rule: ConventionRule = {
  id: 'standard:1', sourceId: source.id, edition: '1', contentHash: hash, locator: 'criterion',
  title: 'Keyboard operation', category: 'accessibility', authority: 'normative', level: 'A',
  exactText: 'Example content', interpretation: 'Test the keyboard interaction.',
  applicability: { platforms: ['web'] }, exceptions: [], relatedRuleIds: [], verificationMethods: ['interaction'],
};

describe('convention registry', () => {
  it('rejects missing source or sections, mismatched checksums and fabricated editions', () => {
    const sources = new Map([[source.id, source]]);
    expect(() => validateRule({ ...rule, sourceId: 'absent' }, sources)).toThrow();
    expect(() => validateRule({ ...rule, locator: 'absent' }, sources)).toThrow();
    expect(() => validateRule({ ...rule, contentHash: 'b'.repeat(64) }, sources)).toThrow();
    expect(() => validateRule({ ...rule, edition: '3' }, sources)).toThrow();
    expect(() => validateRule({ ...rule, exceptions: undefined }, sources)).toThrow();
    expect(() => validateSource({ ...source, contentHash: 'no checksum' })).toThrow();
  });

  it('rejects original prose on metadata-only sources and duplicate rule IDs', () => {
    expect(() => validateRule(rule, new Map([[source.id, { ...source, rights: 'metadata-only' }]]))).toThrow();
    expect(() => createConventionRegistry([source], [rule, rule])).toThrow();
  });

  it('filters rules and reports gaps without counting unavailable sections as imported', () => {
    const registry = createConventionRegistry([source], [rule]);
    expect(registry.search({ text: 'keyboard', platforms: ['web'] }).rules).toEqual([rule]);
    expect(registry.search({ platforms: ['windows'] }).rules).toEqual([]);
    expect(registry.coverage()).toMatchObject({ complete: false, sources: [{ imported: ['criterion'], unavailable: ['missing'] }] });
  });
});
