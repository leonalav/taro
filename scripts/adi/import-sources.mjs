import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

export const checksum = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.trim().replace(/\s+/g, ' ');
const clean = element => {
  const copy = element.cloneNode(true);
  copy.querySelectorAll('script, style, nav, footer, .doclinks, .self-link, .screenreader, .change').forEach(node => node.remove());
  return normalize(copy.textContent);
};

export function extractSections(sourceId, content) {
  const { document } = new JSDOM(content).window;
  if (sourceId === 'wcag-2.2') {
    const criteria = [...document.querySelectorAll('section[id]')].flatMap(section => {
      const heading = section.querySelector(':scope > .header-wrapper h4');
      const level = section.querySelector(':scope > .conformance-level')?.textContent.match(/Level (A{1,3})/);
      const match = heading?.textContent.trim().match(/^Success Criterion ([\d.]+) (.+)$/);
      if (!match || !level) return [];
      const body = section.cloneNode(true);
      body.querySelectorAll(':scope > .header-wrapper, :scope > .conformance-level').forEach(node => node.remove());
      const exceptions = [...section.querySelectorAll(':scope > dl > dd')].map(clean);
      for (const paragraph of section.querySelectorAll(':scope > p')) {
        if (/\b(?:except|unless)\b/i.test(paragraph.textContent)) exceptions.push(clean(paragraph));
      }
      return [{ id: section.id, title: match[2], number: match[1], level: level[1], exactText: clean(body),
        exceptions: [...new Set(exceptions)], references: [...new Set([...body.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href').slice(1)))] }];
    });
    const supporting = [...document.querySelectorAll('#conformance, #conformance section[id], dfn[id]')].map(element => {
      const definition = element.matches('dfn');
      const title = normalize((definition ? element : element.querySelector('h2,h3,h4,h5')).textContent);
      return { id: element.id, title, exactText: clean(definition ? element.closest('dt')?.nextElementSibling ?? element : element) };
    });
    return [...criteria, ...supporting];
  }
  if (sourceId === 'aria-apg') {
    const main = document.querySelector('main');
    const heading = main?.querySelector('h1');
    if (!main || !heading) return [];
    return [{ id: 'main', title: clean(heading), exactText: clean(main), exceptions: [] }];
  }
  return [];
}

async function fetchApproved(url, approvedHosts, fetchPage) {
  for (let redirects = 0; redirects < 6; redirects++) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.username || target.password || !approvedHosts.includes(target.hostname)) {
      throw Error('Source URL or redirect is outside the approved hosts.');
    }
    const response = await fetchPage(target, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, target).href;
      continue;
    }
    if (!response.ok) throw Error('Source returned HTTP ' + response.status);
    return response.text();
  }
  throw Error('Source redirected too many times.');
}

export async function importSource(source, { offline, snapshots = {}, licensedPath, fetchPage = fetch } = {}) {
  const report = { new: [], changed: [], missing: [], rejected: [], sections: [] };
  const pages = new Map();
  for (const section of source.sectionManifest) {
    if (section.status === 'excluded') continue;
    if (section.status === 'unavailable' || (source.rights === 'licensed-local' && !licensedPath)) {
      report.missing.push(section.id);
      continue;
    }
    const [url, fragment] = section.id.startsWith('https:') ? section.id.split('#') : [source.snapshotUrl, section.id];
    if (!pages.has(url)) {
      const snapshot = snapshots[url];
      if (offline && !snapshot && !licensedPath) { report.missing.push(section.id); continue; }
      if (snapshot && snapshot.edition !== source.edition) throw Error('Source edition does not match the pinned manifest.');
      const content = snapshot?.content ?? (licensedPath ? await readFile(licensedPath, 'utf8')
        : await fetchApproved(url, source.approvedHosts ?? [new URL(source.snapshotUrl).hostname], fetchPage));
      if (!snapshot && source.id === 'wcag-2.2' && !content.includes(source.snapshotUrl)) {
        throw Error('Source edition could not be verified from the publisher document.');
      }
      pages.set(url, extractSections(source.id, content));
    }
    const extracted = pages.get(url).find(item => item.id === (fragment ?? 'main'));
    if (!extracted) { report.missing.push(section.id); continue; }
    const contentHash = checksum(extracted.exactText);
    if (!section.contentHash) report.new.push(section.id);
    else if (section.contentHash !== contentHash) report.changed.push(section.id);
    report.sections.push({ ...extracted, id: section.id, contentHash,
      exactText: source.rights === 'metadata-only' ? undefined : extracted.exactText });
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { sources } = JSON.parse(await readFile(new URL('../../src/lib/adi/data/sources.json', import.meta.url), 'utf8'));
  const source = sources.find(source => source.id === process.argv[2]);
  if (!source) throw Error('Supply a source ID from the ADI manifest.');
  const report = await importSource(source, { offline: process.argv.includes('--offline') });
  const { sections, ...status } = report;
  console.log(JSON.stringify({ source: source.id, edition: source.edition, ...status, checked: sections.length }, null, 2));
  if (report.changed.length || report.missing.length || report.rejected.length) process.exitCode = 1;
}
