import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checksum } from './import-sources.mjs';

export async function verifyCorpus(root) {
  const path = resolve(root, 'src/lib/adi/data');
  const read = async file => JSON.parse(await readFile(resolve(path, file), 'utf8'));
  const { sources } = await read('sources.json');
  const inventory = await read('coverage.json');
  const ids = new Set();
  const reports = [];
  for (const source of sources) {
    if (ids.has(source.id) || !inventory.families.includes(source.id)) throw Error('Unexpected or duplicate source ' + source.id);
    ids.add(source.id);
    if (checksum(JSON.stringify(source.sectionManifest)) !== source.contentHash) throw Error('Manifest checksum mismatch for ' + source.id);
    const pack = await read('packs/' + source.id + '.json');
    if (pack.sourceId !== source.id || pack.edition !== source.edition) throw Error('Pack edition mismatch for ' + source.id);
    const entries = new Map([...pack.sections.map(s => [s.id, s]), ...pack.rules.map(r => [r.locator, r])]);
    const seen = new Set();
    const report = { id: source.id, edition: source.edition, imported: [], licensedLocal: [], unavailable: [], excluded: [] };
    for (const section of source.sectionManifest) {
      if (seen.has(section.id)) throw Error('Duplicate section ' + section.id);
      seen.add(section.id);
      if (section.status === 'unavailable' || section.status === 'excluded') {
        if (!section.reason || entries.has(section.id)) throw Error('Invalid unavailable section ' + section.id);
        report[section.status].push(section.id);
        continue;
      }
      const entry = entries.get(section.id);
      const data = entry?.exactText ?? entry?.interpretation;
      if (typeof data !== 'string' || checksum(data) !== section.contentHash) throw Error('Missing or mismatched section ' + section.id);
      if (entry.exactText && source.rights === 'metadata-only') throw Error('Original text in metadata-only source ' + source.id);
      if (section.status === 'licensed-local' && source.rights !== 'licensed-local') throw Error('Invalid licensed section ' + section.id);
      report[section.status === 'licensed-local' ? 'licensedLocal' : 'imported'].push(section.id);
    }
    if ([...entries.keys()].some(id => !seen.has(id))) throw Error('Unlisted pack content in ' + source.id);
    if (source.id === 'wcag-2.2') {
      if (pack.rules.length !== inventory.wcagCriteria || pack.rules.filter(rule => ['A', 'AA'].includes(rule.level)).length !== inventory.wcagBaseline) {
        throw Error('Pinned WCAG baseline does not match the release inventory.');
      }
    }
    reports.push(report);
  }
  if (inventory.families.some(id => !ids.has(id))) throw Error('Missing source family.');
  return { complete: reports.every(source => !source.unavailable.length), sources: reports };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyCorpus(process.cwd());
  console.log(JSON.stringify({ status: result.complete ? 'complete' : 'partial',
    sources: result.sources.map(source => ({ id: source.id, edition: source.edition,
      imported: source.imported.length, unavailable: source.unavailable, excluded: source.excluded.length })) }, null, 2));
  if (!result.complete && process.argv.includes('--complete')) process.exitCode = 1;
}
