import { createHash, randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const commonViewports = [[393, 852], [768, 1024], [1440, 900]];
export const briefs = [
  ['editorial','website','Build an editorial portfolio from a gallery reference. Lead with a named case study and write a clear View work link. Preserve the supplied serif and project image.',['lead link', 'long headline', 'mobile hierarchy']],
  ['case-study','website','Extend an existing portfolio with a case study and a next-project link. Keep its current type, header and image crop.',['next project', 'unchanged neighboring layout', 'keyboard focus']],
  ['carousel','website','Build a product carousel with long product names and a view-details action. Support pointer, buttons and touch.',['pointer and keyboard selection', 'current slide exposed', 'narrow no overflow']],
  ['gallery','website','Build an image gallery with a deliberately missing asset. Keep its useful caption and let people inspect other images.',['missing image state', 'open and dismiss image', 'focus return']],
  ['checkout','website','Build a checkout demonstration with invalid, saving, success and retry states. Resume midway without changing the chosen direction.',['error recovery', 'keyboard submit', 'saved direction on resume']],
  ['navigation','website','Fix one broken keyboard action in responsive navigation by following a Review comment. Keep neighboring controls and visible styling.',['keyboard open and close', 'stale comment rejection', 'unchanged neighbors']],
  ['product-viewer','3d','Build a page for the supplied product model. Provide pointer rotation, keyboard rotation and a clear Details action. Show a useful still when 3D fails.',['visible rotation', 'details action', 'static fallback']],
  ['materials','3d','Make a material and lighting showcase while preserving the supplied product geometry. Give options a usable text description.',['material selection changes image', 'keyboard selection', 'stable geometry']],
  ['particles','3d','Build a particle composition with a focal point and an accessible pause action. Honor reduced motion immediately.',['pause stops movement', 'reduced motion', 'primary action remains available']],
  ['camera','3d','Build a scroll-controlled camera story with three named moments and readable section links. Preserve readability on mobile.',['named moments differ', 'scroll reaches each scene', 'reduced-motion equivalent']],
  ['selection','3d','Build an object selector from part of a layout reference. Make each object selectable with a pointer and from an accessible companion control.',['object activates details', 'companion control', 'selection persists while viewing']],
  ['adaptive','3d','Add adaptive quality to the existing scene without changing its main object or information. Handle a missing texture and a lost graphics context.',['appropriate fallback', 'controls survive lost graphics', 'approved identity preserved']],
].map(([id,track,brief,checks],index)=>({id,track,brief,checks,withheld:index===4||index===11}));

const sides=['baseline','candidate'];
const grades=['pass','fail','unknown'];
const dimensions=['functional','accessibility','motion','performance','recovery'];
const indices=[1,2,3];
const scopes=['settingsDigest','assetDigest','effort','device'];
const pairKey=(id,trial)=>`${id}:${trial}`;
const digest=value=>createHash('sha256').update(value).digest('hex');
const text=value=>typeof value==='string'&&value.trim().length>0;
const count=value=>Number.isSafeInteger(value)&&value>=0;
const receipt=value=>text(value?.path)&&/^[a-f\d]{64}$/.test(value?.sha256);

function validateTrial(value) {
  const fixture=briefs.find(entry=>entry.id===value?.id);
  if(!fixture||!sides.includes(value.side)||!indices.includes(value.trial)||!text(value.runId)||!scopes.every(key=>text(value[key]))||!text(value.revision)||!receipt(value.evidence)||!['desktop','fixture'].includes(value.origin))throw Error('Each trial needs a known brief, side, trial number, scope, source revision, run origin and evidence receipt.');
  if(value.preview!==undefined&&!receipt(value.preview))throw Error('A preview needs a path and SHA-256 digest.');
  if(JSON.stringify(value.viewports)!==JSON.stringify(commonViewports))throw Error('All trials must use the fixed viewport sizes.');
  if(!count(value.elapsedMs)||!count(value.requests)||!count(value.toolCalls)||!(value.cost===null||typeof value.cost==='number'&&Number.isFinite(value.cost)&&value.cost>=0))throw Error('Record elapsed time, requests, tool calls and known or unknown cost.');
  if(value.usage!==null&&!(count(value.usage?.input)&&count(value.usage?.output)))throw Error('Model usage must be recorded or explicitly unknown.');
  if(!dimensions.every(key=>grades.includes(value.outcomes?.[key])))throw Error('Record each independent outcome.');
  for (const check of fixture.checks)if(!grades.includes(value.checks?.[check]))throw Error(`Missing result for ${check}.`);
  return value;
}

function matched(trials) {
  if(!Array.isArray(trials))throw Error('Supply a trial list.');
  const keys=new Set(),identities=new Set(),pairs=new Map(),fixedScopes=new Map(),revisions=new Map();
  for(const trial of trials.map(validateTrial)) {
    const key=pairKey(trial.id,trial.trial), slot=`${key}:${trial.side}`;
    if(keys.has(slot)||identities.has(trial.runId))throw Error('A trial or run identifier was entered twice.');
    keys.add(slot);identities.add(trial.runId);
    const pair=pairs.get(key)??{};
    const counterpart=pair[sides.find(side=>side!==trial.side)];
    if(counterpart) {
      for(const field of scopes)if(counterpart[field]!==trial[field])throw Error(`Matched trials used different ${field}.`);
      if(counterpart.revision===trial.revision)throw Error('A matched comparison must use distinct application revisions.');
    }
    const previous=fixedScopes.get(trial.id);
    if(previous&&previous.trial!==trial.trial) {
      for(const field of scopes)if(previous[field]!==trial[field])throw Error(`Matched repetitions used different ${field}.`);
    }
    if(!previous)fixedScopes.set(trial.id,trial);
    if(revisions.has(trial.side)&&revisions.get(trial.side)!==trial.revision)throw Error('Use one application revision per side for the entire benchmark.');
    revisions.set(trial.side,trial.revision);
    pair[trial.side]=trial;pairs.set(key,pair);
  }
  return pairs;
}

export function blindReview(trials) {
  const mapping=[],review=[];
  for(const [key,pair] of matched(trials)){
    if(!pair.baseline||!pair.candidate)continue;
    const id=randomUUID();
    const order=randomInt(2)?sides:[...sides].reverse();
    mapping.push({id,key,left:order[0],right:order[1],trialDigests:order.map(side=>digest(JSON.stringify(pair[side])))});
    review.push({id,brief:briefs.find(entry=>entry.id===pair.baseline.id).brief,leftArtifact:`${id}-left`,rightArtifact:`${id}-right`});
  }
  return {review,mapping};
}

export function scoreDesignBenchmarks(trials,mapping=[],votes=[]) {
  const pairs=matched(trials),voteByPair=new Map();
  const blind=new Map(),assignedPairs=new Set();
  for(const entry of mapping){
    const pair=pairs.get(entry.key);
    if(!text(entry.id)||blind.has(entry.id)||assignedPairs.has(entry.key)||!pair?.baseline||!pair?.candidate||!sides.includes(entry.left)||!sides.includes(entry.right)||entry.left===entry.right||!Array.isArray(entry.trialDigests)||entry.trialDigests.length!==2||!entry.trialDigests.every((hash,index)=>hash===digest(JSON.stringify(pair[index===0?entry.left:entry.right]))))throw Error('Invalid or stale blind review assignment.');
    blind.set(entry.id,entry);
    assignedPairs.add(entry.key);
  }
  for(const vote of votes){
    const assignment=blind.get(vote.id);
    if(!assignment||voteByPair.has(assignment.key)||!['left','right','tie'].includes(vote.preference)||!['left','right','tie'].includes(vote.adherence)||!text(vote.reason))throw Error('Blind review requires one preference, one brief-adherence vote and a reason per assigned pair.');
    voteByPair.set(assignment.key,{ preference:assignment[vote.preference]??'tie', adherence:assignment[vote.adherence]??'tie', reason:vote.reason });
  }
  const result=briefs.flatMap(fixture=>indices.map(trial=>{
    const key=pairKey(fixture.id,trial),pair=pairs.get(key)??{},vote=voteByPair.get(key);
    const regressions=pair.baseline&&pair.candidate?[...dimensions.filter(check=>pair.baseline.outcomes[check]==='pass'&&pair.candidate.outcomes[check]!=='pass'),...fixture.checks.filter(check=>pair.baseline.checks[check]==='pass'&&pair.candidate.checks[check]!=='pass')]:[];
    const eligible=pair.baseline?.origin==='desktop'&&pair.candidate?.origin==='desktop'&&fixture.checks.every(check=>pair.candidate.checks[check]==='pass')&&dimensions.every(check=>pair.candidate.outcomes[check]==='pass');
    return {caseId:fixture.id,track:fixture.track,trial,baseline:pair.baseline??null,candidate:pair.candidate??null,vote:vote??null,regressions,eligible};
  }));
  const tracks=Object.fromEntries(['website','3d'].map(track=>{
    const rows=result.filter(row=>row.track===track),complete=rows.filter(row=>row.baseline&&row.candidate).length,reviewed=rows.filter(row=>row.vote).length;
    const preference=Object.fromEntries([...sides,'tie'].map(side=>[side,rows.filter(row=>row.vote?.preference===side).length]));
    const adherence=Object.fromEntries([...sides,'tie'].map(side=>[side,rows.filter(row=>row.vote?.adherence===side).length]));
    const status=complete<rows.length||reviewed<rows.length?'incomplete':rows.every(row=>row.eligible&&!row.regressions.length)&&preference.candidate>preference.baseline&&adherence.candidate>=adherence.baseline?'improved':'hold';
    return [track,{expected:rows.length,complete,reviewed,preference,adherence,status}];
  }));
  return {tracks,release:Object.values(tracks).every(track=>track.status==='improved')?'eligible':'hold',results:result};
}

async function readReceipt(root,reference) {
  if(isAbsolute(reference.path))throw Error('Evidence and previews must use paths relative to the input file.');
  const path=await realpath(resolve(root,reference.path));
  const fromRoot=relative(root,path);
  if(!fromRoot||fromRoot==='..'||fromRoot.startsWith(`..${sep}`)||isAbsolute(fromRoot))throw Error('Evidence and previews must be inside the input directory.');
  const bytes=await readFile(path);
  if(digest(bytes)!==reference.sha256)throw Error(`Evidence digest mismatch for ${reference.path}.`);
  return bytes;
}

async function loadFixtureBundle(fixture, operatorManifest) {
  const directory=fileURLToPath(new URL('./design-benchmark-fixtures/',import.meta.url));
  const manifestPath=operatorManifest?resolve(operatorManifest):join(directory,'bundles.json');
  if(fixture.withheld&&!operatorManifest)throw Error('Held-out briefs require an operator manifest.');
  const bundle=JSON.parse(await readFile(manifestPath,'utf8'))[fixture.id];
  if(!bundle||!text(bundle.brief)||!Array.isArray(bundle.files)||!bundle.files.length)throw Error('The brief requires a fixed input bundle.');

  const root=await realpath(dirname(manifestPath));
  const usedDestinations=new Set();
  const files=await Promise.all(bundle.files.map(async ({path,sha256,destination})=>{
    const key=typeof destination==='string'?destination.toLowerCase():undefined;
    const segments=key?.split('/');
    if(!segments?.every(segment=>/^[a-z0-9][a-z0-9._-]*$/.test(segment)&&!segment.endsWith('.'))||usedDestinations.has(key)||!receipt({path,sha256}))throw Error('Supply unique relative destinations and SHA-256 receipts for the fixture files.');
    usedDestinations.add(key);
    return {destination,sha256,bytes:await readReceipt(root,{path,sha256})};
  }));
  if(bundle.attachment&&!files.some(file=>file.destination===bundle.attachment))throw Error('The brief attachment must be a staged fixture file.');
  if([...usedDestinations].some(path=>path.split('/').slice(0,-1).some((_, index, parts)=>usedDestinations.has(parts.slice(0,index+1).join('/')))))throw Error('A fixture file cannot also be a directory.');

  const inputs=files.map(({destination,sha256})=>({destination,sha256})).sort((a,b)=>a.destination.localeCompare(b.destination,'en'));
  const contract={brief:bundle.brief,attachment:bundle.attachment??null,inputs};
  return {files,contract,assetDigest:digest(JSON.stringify(contract))};
}

async function prepareWorkspace(id, output, operatorManifest) {
  const fixture=briefs.find(brief=>brief.id===id);
  if(!fixture||!output)throw Error('Use prepare <brief id> <new workspace> [operator manifest].');
  const {files,contract,assetDigest}=await loadFixtureBundle(fixture,operatorManifest);
  const workspace=resolve(output);

  await mkdir(workspace);
  for(const {destination,bytes} of files){
    const target=join(workspace,destination);
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,bytes,{flag:'wx'});
  }
  return {id,workspace,viewports:commonViewports,checks:fixture.checks,...contract,assetDigest};
}

async function fixturePreflight(operatorManifest) {
  const missing=briefs.filter(brief=>brief.withheld&&!operatorManifest).map(brief=>brief.id);
  const ready=await Promise.all(briefs.filter(brief=>!missing.includes(brief.id)).map(async fixture=>{
    const {assetDigest}=await loadFixtureBundle(fixture,fixture.withheld?operatorManifest:undefined);
    return {id:fixture.id,assetDigest};
  }));
  return {viewports:commonViewports,ready,missing};
}

async function verifyEvidence(trials,root) {
  const previews=new Map();
  for(const trial of trials) {
    const fixture=briefs.find(entry=>entry.id===validateTrial(trial).id);
    const report=JSON.parse(await readReceipt(root,trial.evidence));
    if(report?.runId!==trial.runId||report.revision!==trial.revision||report.origin!==trial.origin)throw Error('The evidence report must identify the same run, source revision and origin.');
    if(!Array.isArray(report.observations)||!report.observations.length||!report.observations.every(text))throw Error('The evidence report needs observed behavior or a reason why it is unknown.');
    if(!dimensions.every(key=>trial.outcomes[key]===report.outcomes?.[key])||
      !fixture.checks.every(key=>trial.checks[key]===report.checks?.[key]))throw Error('Evidence records different outcomes or required check results.');
    if(trial.preview)previews.set(trial.runId,await readReceipt(root,trial.preview));
  }
  return previews;
}

const pngSignature=Buffer.from('89504e470d0a1a0a','hex');
const visualChunks=new Set(['IHDR','PLTE','IDAT','IEND','tRNS','cHRM','gAMA','iCCP','sRGB','cICP']);

function anonymizePng(bytes) {
  if(!bytes?.subarray(0,8).equals(pngSignature))throw Error('Each blind review side needs a PNG preview.');
  const chunks=[pngSignature];
  let offset=8, hasImage=false;
  while(offset+12<=bytes.length) {
    const end=offset+12+bytes.readUInt32BE(offset), type=bytes.toString('ascii',offset+4,offset+8);
    if(end>bytes.length||(offset===8&&type!=='IHDR'))break;
    if(visualChunks.has(type))chunks.push(bytes.subarray(offset,end));
    if(type==='IDAT')hasImage=true;
    if(type==='IEND'&&hasImage&&end===bytes.length)return Buffer.concat(chunks);
    offset=end;
  }
  throw Error('Invalid PNG preview.');
}

const escapeHtml=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);

async function writeBlindPacket(trials,previews,output) {
  const {review,mapping}=blindReview(trials);
  const pairs=matched(trials);
  const images=mapping.flatMap(entry=>['left','right'].map(position=>{
    const trial=pairs.get(entry.key)[entry[position]];
    return [`${entry.id}-${position}.png`,anonymizePng(previews.get(trial.runId))];
  }));
  const share=join(output,'review');
  await mkdir(output);
  await mkdir(share);
  const sections=review.map(entry=>`<article><h2>${entry.id}</h2><p>${escapeHtml(entry.brief)}</p><div class="pair"><figure><figcaption>Left</figcaption><img alt="Left design" src="${entry.leftArtifact}.png"></figure><figure><figcaption>Right</figcaption><img alt="Right design" src="${entry.rightArtifact}.png"></figure></div></article>`).join('\n');
  const page=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Taro design review</title><style>body{max-width:96rem;margin:2rem auto;padding:0 1rem;font:1rem system-ui}article{margin:3rem 0}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}figure{margin:0}img{width:100%;height:auto}</style><main><h1>Taro design review</h1><p>For each pair, choose left, right, or tie independently for visual preference and adherence to the brief. Record the pair ID, both choices, and the reason in votes.json.</p>${sections}</main></html>`;
  const blankVotes=review.map(({id})=>({id,preference:'',adherence:'',reason:''}));
  const files=[...images,['index.html',page],['votes.json',JSON.stringify(blankVotes,null,2)]];
  await Promise.all(files.map(([name,bytes])=>writeFile(join(share,name),bytes)));
  await writeFile(join(output,'mapping.json'),JSON.stringify(mapping,null,2));
  return {pairs:review.length,review:share,mapping:join(output,'mapping.json')};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [command='score',path,output,operatorManifest]=process.argv.slice(2);
  if(command==='briefs') {
    console.log(JSON.stringify({commonViewports,briefs:path==='--include-withheld'?briefs:briefs.filter(brief=>!brief.withheld)},null,2));
  } else if(command==='preflight') {
    console.log(JSON.stringify(await fixturePreflight(path),null,2));
  } else if(command==='prepare') {
    console.log(JSON.stringify(await prepareWorkspace(path,output,operatorManifest),null,2));
  } else {
    if(!['blind','score'].includes(command))throw Error('Choose briefs, preflight, prepare, blind, or score.');
    if(command==='blind'&&(!path||!output))throw Error('Use blind <runs.json> <new packet directory>.');
    const input=path?JSON.parse(await readFile(path,'utf8')):{trials:[]};
    if(!Array.isArray(input.trials))throw Error('Supply a trial list.');
    const previews=await verifyEvidence(input.trials,await realpath(path?dirname(resolve(path)):'.'));
    const result=command==='blind'
      ?await writeBlindPacket(input.trials,previews,output)
      :scoreDesignBenchmarks(input.trials,input.mapping,input.votes);
    console.log(JSON.stringify(result,null,2));
  }
}
