import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { checksum, extractSections } from './import-sources.mjs';

const retrievedAt = '2026-11-13';
const wcagUrl = 'https://www.w3.org/TR/2024/REC-WCAG22-20241212/';
const apgUrl = 'https://www.w3.org/WAI/ARIA/apg/';
const data = new URL('../../src/lib/adi/data/', import.meta.url);
const save = (path, value) => writeFile(new URL(path, data), JSON.stringify(value, null, 2) + '\n');
const snapshotDirectory = process.argv[2];
if (!snapshotDirectory) throw Error('Supply the directory containing archived W3C snapshot JSON files.');
const pages = await readFile(resolve(snapshotDirectory, 'w3c-snapshots.json'), 'utf8').then(JSON.parse);
function manifest(id, publisher, title, edition, canonicalUrl, sections, extra = {}) {
  return { id, publisher, title, edition, canonicalUrl, snapshotUrl: canonicalUrl, retrievedAt,
    sectionManifest: sections, contentHash: checksum(JSON.stringify(sections)),
    status: 'published', rights: 'metadata-only', approvedHosts: [new URL(canonicalUrl).hostname], ...extra };
}
function notice(title, url, date, status) {
  return 'Copyright © ' + date + ' World Wide Web Consortium. Copyright © 2023 W3C®. This software includes material copied from or derived from ' +
    title + ' (' + url + '). ' + status + '. https://www.w3.org/copyright/document-license-2023/';
}
const section = (item, id = item.id) => ({ id, status: 'imported', contentHash: checksum(item.exactText) });
const wcagSections = extractSections('wcag-2.2', pages[wcagUrl]);
const criteria = wcagSections.filter(item => item.number);
if (criteria.length !== 86) throw Error('Unexpected WCAG success criterion count.');
const wcag = manifest('wcag-2.2', 'W3C', 'Web Content Accessibility Guidelines (WCAG) 2.2', '2024-12-12',
  wcagUrl, wcagSections.map(item => section(item)), {
    rights: 'redistributable', notice: notice('Web Content Accessibility Guidelines (WCAG) 2.2', wcagUrl, '2020–2024', 'W3C Recommendation, 12 December 2024'),
  });
const snapshot = await readFile(resolve(snapshotDirectory, 'apg-snapshot.json'), 'utf8').then(JSON.parse);
const rawRoot = 'https://raw.githubusercontent.com/w3c/aria-practices/' + snapshot.sha + '/';
const apgSections = snapshot.inventory.map(path => {
  const id = rawRoot + path + '#main';
  const [item] = extractSections('aria-apg', snapshot.pages[path] ?? '');
  return item ? { ...item, id, slug: path.split('/').at(-2), pattern: path.startsWith('content/patterns/') }
    : { id, error: 'Missing archived publisher page.' };
});
const apg = manifest('aria-apg', 'W3C WAI', 'ARIA Authoring Practices Guide', snapshot.sha,
  apgUrl, apgSections.map(item => item.error ? { id: item.id, status: 'unavailable', reason: item.error } : section(item)), {
    rights: 'redistributable', snapshotUrl: rawRoot, approvedHosts: ['raw.githubusercontent.com'],
    notice: 'Copyright © World Wide Web Consortium. ARIA Authoring Practices Guide (' + apgUrl +
      '), informative W3C WAI resource. Repository license: ' + rawRoot + 'LICENSE.md',
  });
function rule(source, item, details) {
  return { id: source.id + ':' + (item.number ?? item.slug), sourceId: source.id, edition: source.edition,
    locator: item.id, contentHash: checksum(item.exactText), title: item.title, exactText: item.exactText,
    exceptions: item.exceptions ?? [], relatedRuleIds: [], ...details };
}
const wcagRules = criteria.map(item => rule(wcag, item, {
  category: 'accessibility', authority: 'normative', level: item.level,
  interpretation: 'Assess whether the affected interface meets the source condition, including exceptions and linked definitions.',
  applicability: { platforms: ['web', 'desktop-web'] }, verificationMethods: ['human'],
  relatedRuleIds: (item.references ?? []).flatMap(id => criteria.filter(candidate => candidate.id === id).map(candidate => 'wcag-2.2:' + candidate.number)),
}));
const apgRules = apgSections.filter(item => !item.error).map(item => rule(apg, item, {
  category: 'interaction', authority: 'informative',
  interpretation: 'Prefer native HTML semantics where suitable. Test the source keyboard and focus behaviors for ' + item.title + '.',
  applicability: { platforms: ['web', 'desktop-web'], componentKinds: item.pattern ? [item.slug] : undefined },
  verificationMethods: ['interaction', 'human'],
}));
const pack = (source, rules, sections = []) => ({ sourceId: source.id, edition: source.edition, notice: source.notice, rules, sections });
await save('packs/wcag-2.2.json', pack(wcag, wcagRules, wcagSections.filter(item => !item.number)));
await save('packs/aria-apg.json', pack(apg, apgRules));
await save('sources.json', { version: 1, sources: [wcag, apg] });
console.log(JSON.stringify({ criteria: wcagRules.length, baseline: wcagRules.filter(rule => rule.level !== 'AAA').length,
  definitionsAndConformance: wcagSections.length - criteria.length, apg: apgRules.length,
  unavailable: apgSections.filter(item => item.error) }, null, 2));
