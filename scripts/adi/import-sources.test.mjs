import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSections, importSource } from './import-sources.mjs';

const snapshotUrl = 'https://example.com/v1';
const source = { id: 'wcag-2.2', edition: '1', snapshotUrl, approvedHosts: ['example.com'], rights: 'redistributable', sectionManifest: [{ id: 'keyboard', status: 'imported' }] };
const html = '<main><section id="keyboard"><div class="header-wrapper"><h4>Success Criterion 2.1.1 Keyboard</h4></div><p class="conformance-level">(Level A)</p><p>Some   text.</p><nav>Skip me</nav></section><footer id="invalid">Navigation</footer></main>';

test('normalizes criterion text and does not accept navigation or footer as criteria', () => {
  assert.deepEqual(extractSections('wcag-2.2', html).map(s => [s.id, s.exactText]), [['keyboard', 'Some text.']]);
});
test('reports lost anchors and checks edition before import', async () => {
  const result = await importSource(source, { offline: true, snapshots: { [snapshotUrl]: { edition: '1', content: html.replace('id="keyboard"', 'id="changed"') } } });
  assert.deepEqual(result.missing, ['keyboard']);
  await assert.rejects(importSource(source, { offline: true, snapshots: { [snapshotUrl]: { edition: '2', content: html } } }), /edition/i);
});
test('refuses off-host redirects before downloading redirected content', async () => {
  let calls = 0;
  await assert.rejects(importSource(source, { offline: false, fetchPage: async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: 'https://unapproved.test/v1' } });
  } }), /approved/i);
  assert.equal(calls, 1);
});
test('reports unavailable licensed sections without fetching the source', async () => {
  const result = await importSource({ ...source, rights: 'metadata-only', sectionManifest: [{ id: 'clauses', status: 'unavailable' }] }, { offline: true });
  assert.deepEqual(result.missing, ['clauses']);
  assert.deepEqual(result.sections, []);
});
