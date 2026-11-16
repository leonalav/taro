import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { blindReview, briefs, commonViewports, scoreDesignBenchmarks } from './design-benchmark.mjs';

function trials(){
  return briefs.flatMap(brief=>[1,2,3].flatMap(trial=>['baseline','candidate'].map(side=>({
    id:brief.id,trial,side,runId:`${brief.id}-${trial}-${side}`,settingsDigest:'same settings',assetDigest:'same assets',effort:'Quick',device:'Named test system',revision:side,viewports:commonViewports,
    evidence:{path:`evidence/${brief.id}/${trial}/${side}`,sha256:'0'.repeat(64)},origin:'desktop',elapsedMs:1000,requests:4,toolCalls:10,usage:null,cost:null,
    outcomes:{functional:'pass',accessibility:'pass',motion:'pass',performance:'pass',recovery:'pass'},checks:Object.fromEntries(brief.checks.map(check=>[check,'pass'])),
  }))));
}

const chooseCandidate = mapping => mapping.map(pair=>({id:pair.id,preference:pair.left==='candidate'?'left':'right',adherence:pair.left==='candidate'?'left':'right',reason:'Clear hierarchy and no loss of context'}));

test('hold release until all 36 matched pairs and blind judgments have been collected',()=>{
  assert.equal(briefs.filter(brief=>brief.track==='website').length,6);
  assert.equal(briefs.filter(brief=>brief.track==='3d').length,6);
  const records=trials(), packet=blindReview(records);
  assert.equal(records.length,72);
  assert.equal(packet.review.length,36);
  assert.ok(!JSON.stringify(packet.review).includes('baseline')&&!JSON.stringify(packet.review).includes('candidate'));
  assert.equal(scoreDesignBenchmarks(records).release,'hold');
  assert.equal(scoreDesignBenchmarks(records,packet.mapping,chooseCandidate(packet.mapping).slice(0,35)).release,'hold');
  assert.equal(scoreDesignBenchmarks(records,packet.mapping,chooseCandidate(packet.mapping)).release,'eligible');
});

test('prevent visual votes from obscuring a failed accessibility or missing asset check',()=>{
  const records=trials();
  const result=records.find(record=>record.id==='adaptive'&&record.trial===2&&record.side==='candidate');
  result.outcomes.accessibility='fail';
  result.checks['appropriate fallback']='unknown';
  const {mapping}=blindReview(records);
  const report=scoreDesignBenchmarks(records,mapping,chooseCandidate(mapping));
  assert.equal(report.release,'hold');
  assert.equal(report.tracks.website.status,'improved');
  assert.equal(report.tracks['3d'].status,'hold');
  assert.deepEqual(report.results.find(row=>row.caseId==='adaptive'&&row.trial===2).regressions,['accessibility','appropriate fallback']);
});

test('reject mismatched assets, repeated runs and stale reviewer packets',()=>{
  const records=trials();
  assert.throws(()=>blindReview([...records,records[0]]),/entered twice/);
  const {mapping}=blindReview(records);
  records[1].assetDigest='different';
  assert.throws(()=>scoreDesignBenchmarks(records,mapping),/different assetDigest/);
  records[1].assetDigest=records[0].assetDigest;
  records[1].elapsedMs++;
  assert.throws(()=>scoreDesignBenchmarks(records,mapping),/stale blind review/);
});

test('reject drift across repetitions and mixed application builds',()=>{
  const records=trials();
  records[2].settingsDigest=records[3].settingsDigest='new model';
  assert.throws(()=>blindReview(records),/repetitions used different settingsDigest/);
  records[2].settingsDigest=records[3].settingsDigest=records[0].settingsDigest;
  records[8].revision='a different baseline build';
  assert.throws(()=>scoreDesignBenchmarks(records),/one.*revision per side/);
});

test('withhold fixture records from release eligibility even with favorable votes',()=>{
  const records=trials();
  records[0].origin='fixture';
  const {mapping}=blindReview(records);
  assert.equal(scoreDesignBenchmarks(records,mapping,chooseCandidate(mapping)).release,'hold');
});

const run=promisify(execFile);
const cli=(...args)=>run(process.execPath,['scripts/design-benchmark.mjs',...args]);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1UAAAAASUVORK5CYII=','base64');
const sha256=value=>createHash('sha256').update(value).digest('hex');

test('prepare stages fixed pilot files in a fresh workspace and reports the same input digest for repeating runs',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'taro-benchmark-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const first=join(dir,'baseline');
  const second=join(dir,'candidate');
  const prepare=async output=>JSON.parse((await cli('prepare','editorial',output)).stdout);
  const baseline=await prepare(first);
  const candidate=await prepare(second);
  assert.equal(baseline.assetDigest,candidate.assetDigest);
  assert.match(baseline.brief,/A quiet place to make things/);
  assert.equal(baseline.attachment,'inputs/layout-reference.png');
  assert.deepEqual(await readFile(join(first,baseline.attachment)),await readFile(join(second,candidate.attachment)));
  await assert.rejects(prepare(first),/EEXIST/);
});

test('preflight verifies all public bundles and keeps held-out inputs with the operator',async()=>{
  const report=JSON.parse((await cli('preflight')).stdout);
  assert.deepEqual(report.ready.map(entry=>entry.id),briefs.filter(brief=>!brief.withheld).map(brief=>brief.id));
  assert.ok(report.ready.every(entry=>/^[a-f0-9]{64}$/.test(entry.assetDigest)));
  assert.deepEqual(report.missing,briefs.filter(brief=>brief.withheld).map(brief=>brief.id));
});

test('blind CLI verifies evidence and packages only neutral reviewer files',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'taro-benchmark-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const input=join(dir,'runs.json'), output=join(dir,'packet');
  const records=trials().slice(0,2);
  for(const record of records){
    const report=JSON.stringify({runId:record.runId,revision:record.revision,origin:record.origin,outcomes:record.outcomes,checks:record.checks,observations:['Fixture observations for scorecard unit tests']});
    const path=`${record.runId}.json`;
    const preview=`${record.runId}.png`;
    await writeFile(join(dir,path),report);
    await writeFile(join(dir,preview),png);
    record.origin='desktop';
    record.evidence={path,sha256:sha256(report)};
    record.preview={path:preview,sha256:sha256(png)};
  }
  await writeFile(input,JSON.stringify({trials:records}));
  const {stdout}=await cli('blind',input,output);
  assert.equal(JSON.parse(stdout).pairs,1);
  const share=join(output,'review');
  const files=await readdir(share);
  assert.equal(files.filter(file=>file.endsWith('.png')).length,2);
  assert.ok(!files.some(file=>/baseline|candidate|mapping/.test(file)));
  const html=await readFile(join(share,'index.html'),'utf8');
  assert.match(html,/Left/);
  assert.doesNotMatch(html,/editorial-1-(baseline|candidate)/);
  const mapping=JSON.parse(await readFile(join(output,'mapping.json'),'utf8'));
  await writeFile(input,JSON.stringify({trials:records,mapping,votes:chooseCandidate(mapping)}));
  const score=JSON.parse((await cli('score',input)).stdout);
  assert.equal(score.tracks.website.reviewed,1);
  await writeFile(join(dir,records[0].evidence.path),'changed');
  await assert.rejects(cli('score',input),/Evidence digest mismatch/);
  const mismatched=JSON.stringify({runId:records[0].runId,revision:records[0].revision,origin:records[0].origin,outcomes:{...records[0].outcomes,accessibility:'fail'},checks:records[0].checks,observations:['An accessibility failure was observed']});
  await writeFile(join(dir,records[0].evidence.path),mismatched);
  records[0].evidence.sha256=sha256(mismatched);
  await writeFile(input,JSON.stringify({trials:records}));
  await assert.rejects(cli('score',input),/Evidence records different outcomes/);
});
