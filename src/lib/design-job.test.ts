import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createArtifactDesign } from './artifact-design';
import { ProfessionalToolRuntime, type RuntimeOptions } from './professional-runtime';
import { createReviewRepository, previewById, revisePreview, type ReviewScope } from './review-store';
import { createTaskRepository } from './task-store';
import { auditFixture } from './test-fixtures/artifact-audit';
import { saveLayoutRevision, undoLayoutRevision } from './layout-revisions';
import { makeLayer } from './layout-designer';
import { syncReviewWorkItem } from './review-work-items';
import type { ReviewServices } from './review-tools';
import { createReviewBrowser } from '../../scripts/review-browser.mjs';
import { modelCapabilityIdentity } from './model-capabilities';
import { createProjectDirectionRepository } from './project-direction';
import { designRecipes, renderDesignRecipe } from './design-recipes';
import { createAdiRepository } from './adi/store';

const scope: ReviewScope = { workspace: 'A:/relay', sessionId: 'relay' };
const workspace = 'path:a:/relay';
const call = (name: string, input: unknown) => ({ id: crypto.randomUUID(), name, arguments: JSON.stringify(input) });
const submit = (artifact: unknown) => call('SubmitDesignHandoff', { artifact });
const alternateDesign=createArtifactDesign('editorial');
const alternateLayers=[{id:'lead',x:0,y:0,width:320,height:280}];

function repositories() {
  function storage() {
    const data = new Map<string, string>();
    return { read: async (key: string) => data.get(key) ?? null, write: async (key: string, value: string) => { data.set(key, value); } };
  }
  return { tasks: createTaskRepository(storage()), review: createReviewRepository(storage()) };
}

function setup(settings: { deny?: boolean; omitIntent?: boolean; revise?: boolean; stale?: boolean; editIntent?: boolean; explore?: boolean; chooseAlternative?: boolean; productViewer?: boolean; regression?: boolean; restoreConflict?: boolean; correctionOnlyFile?: 'existing'|'created'; userEditBeforeCorrection?: boolean; partialRestore?: boolean; interruptRestore?: boolean; exhaust?: boolean; interruptQa?: boolean; uncheckedModel?: boolean; invalidHandoff?: boolean; adi?: boolean; checkPlanOffer?: boolean; browser?: ReviewServices['browser']; worktree?: () => Promise<void> } = {}) {
  const scope: ReviewScope = { workspace: 'A:/relay', sessionId: crypto.randomUUID() };
  const { tasks, review } = repositories();
  const sequence: string[] = [];
  const failures: string[]=[];
  const offered: {stage:string; toolNames:string[]}[]=[];
  let qaRuns = 0;
  let lastStage = '';
  let lastPrompt = '';
  let qaInterrupted=false;
  let stageCalls = 0;
  let plan = '';
  let source = '';
  let footer = '';
  let correctionFile = settings.correctionOnlyFile==='existing' ? 'Approved stylesheet\r\n' : undefined;
  let planName = '';
  const profile = { id: 'm', label: 'Test model', endpoint: 'https://example.invalid' };
  const model = {...profile,designCheck:settings.uncheckedModel?undefined:{identity:modelCapabilityIdentity(profile),checkedAt:1,image:'passed' as const,tools:'passed' as const,handoff:'passed' as const,detail:'Fixture' }};
  const data=new Map<string,string>();
  const sourceCopies=new Map<string,{path:string;content:string}[]>();
  const projectDirections=createProjectDirectionRepository({read:async key=>data.get(key)??null,write:async (key,value)=>{data.set(key,value);}});
  const viewer=settings.productViewer?designRecipes.find(recipe=>recipe.id==='product-viewer'):undefined;
  const viewerHtml=viewer?renderDesignRecipe(viewer,{}).html:undefined;
  // Vitest can omit raw CSS imports. Use the exact shipped stylesheet for the browser fixture.
  const viewerStyles=viewerHtml?.includes('.scene-stage {')?'':viewerHtml?readFileSync(new URL('./design-recipes/base.css',import.meta.url),'utf8'):'';
  const viewerCheck={type:'click',target:'[data-checkpoint="detail"]',expect:{selector:'[data-checkpoint="detail"][aria-pressed="true"]',present:true}};
  const intent = {
    design: createArtifactDesign('expressive'),
    layers: [{ id: 'hero', x: 0, y: 0, width: 320, height: 320 }],
    motion: ['Respect reduced motion.'],
    accessibility: ['Use a visible focus ring.'],
    plan: ['Build the hero in a standalone document.'],
    direction: {selectedDirection:'Gallery',audience:'Studio clients',primaryAction:'See work',reason:'Prioritize the work',constraints:[],questions:[],approvedAssetIds:[],nextAction:'Confirm the narrow layout'},
    behavior: {layouts:[{layerId:'hero',alignment:'Left',growth:'Full width',wrapping:'Wrap long headings',mobile:'One column'}],interactions:viewer?[{id:'detail-view',trigger:'Select detail view',change:'Rotate speaker to detail view',progress:'Respond to view selection',reducedMotion:'Switch immediately',alternative:'Use the text description',proof:viewerCheck}]:[],...(viewer&&{preserveRegions:['[data-taro-layer="scene-stage"]'],scene:{objects:[{name:'Speaker',assetId:'recipe:product-viewer',material:'Terracotta'}],camera:'Front and close-up detail',lighting:'Ambient with key and rim lights',controls:'Rotate with mouse, keyboard and named views',loading:'Show still preview',fallback:'Keep details readable in HTML',quality:'Use adaptive pixel ratio'}})},
    ...(settings.explore&&{proposal:{options:[{id:'gallery',name:'Gallery',composition:'image-led',typography:'serif',rationale:'Use a wide hero image',headline:'Studio works',action:'View work'},{id:'type',name:'Type',composition:'type-led',typography:'sans-serif',rationale:'Lead with the studio name',headline:'Studio works',action:'See projects'}],selectedId:'gallery',reason:'Works first',observations:[]},alternativeIntents:{type:{design:alternateDesign,layers:alternateLayers,motion:['Respect system preferences'],accessibility:['Use a labelled link'],plan:['Lead with text and use the project image second.'],behavior:{layouts:[{layerId:'lead',alignment:'Left',growth:'Fit width',wrapping:'Use two lines',mobile:'Stack below title'}],interactions:[]}}}}),
  };
  const options: RuntimeOptions = {
    ...scope, sessionId: scope.sessionId, workspaceRoot: scope.workspace, tasks, boardTasks: true, agentId: 'parent', model, models: [model], plugins: [],
    projectDirections,
    adi:settings.adi?createAdiRepository({
      read:async key=>data.get(key)??null,
      compareAndSwap:async (key,expected,payload)=>{
        const previous=data.get(key);
        if((previous?JSON.parse(previous).generation:0)!==expected)return false;
        data.set(key,payload);
        return true;
      },
    }):undefined,
    saveDesignAttemptSource:async (_workspace,_job,revision,files)=>{sourceCopies.set(revision,files);return files.map(file=>({path:file.path,digest:file.content}));},
    loadDesignAttemptSource:async (_workspace,_job,revision)=>{
      if(settings.restoreConflict&&!source.includes('User kept this edit'))source+='\n<!-- User kept this edit -->';
      return sourceCopies.get(revision)!;
    },
    agents: ['Designer', 'Code', 'Type & QA'].map(role => ({ id: role, name: role, role, model: model.id, enabled: true, autonomy: 'auto', canWriteCode: true })),
    reviewServices: {
      repository: review,
      browser: settings.browser??(async request=>{
        const viewport = request.viewport ?? { width: 920, height: 720 };
        if(!settings.chooseAlternative&&request.html?.includes('type-led')&&request.html?.includes('Lead with the studio name'))throw Error('Alternate navigation failed.');
        const audit = request.action === 'audit' ? auditFixture() : undefined;
        if (audit) audit.id = crypto.randomUUID();
        return { url: 'about:blank', title: 'Hero', viewport, document: { ...viewport, scrollX: 0, scrollY: 0 }, components: [], anchors: {}, screenshot: 'data:image/png;base64,example', audit };
      }),
    },
    async native(tool, input, owner, approved) {
      if(tool.name==='Edit'&&input.match_entire_file){
        if(String(input.file_path).endsWith('correction.css')){
          if(correctionFile!==input.old_string)throw Error('File changed since it was checked');
          const before=correctionFile;
          correctionFile=input.delete_created_file?undefined:String(input.new_string);
          return {text:'Restored stylesheet',artifact:{kind:'edit',path:'A:/relay/correction.css',before,after:correctionFile,removed:input.delete_created_file===true}};
        }
        if(String(input.file_path).endsWith('z-footer.txt'))throw Error('The second file could not be replaced');
        if(source!==input.old_string)throw Error('File changed since it was checked');
        const before=source;
        source=String(input.new_string);
        sequence.push('restore source');
        return {text:'Restored source',artifact:{kind:'edit',path:'A:/relay/index.html',before,after:source}};
      }
      if(tool.name==='EnterWorktree'){
        await settings.worktree?.();
        return {text:'Created worktree',artifact:{kind:'worktree',worktreePath:'A:/relay/.taro/worktrees/job'}};
      }
      if(tool.name==='ExitWorktree')sequence.push('released worktree');
      if (tool.name === 'EnterPlanMode') {
        planName = String(input.name);
        return { text: 'Planning', artifact: { kind: 'plan-mode', path: 'plan.md', name: planName } };
      }
      if (tool.name === 'Write') {
        if(input.file_path==='index.html'){
          const before=source;
          source=String(input.content);
          return {text:'Saved source',artifact:{kind:'edit',path:'A:/relay/index.html',before,after:source}};
        }
        if(input.file_path==='z-footer.txt'){
          const before=footer;footer=String(input.content);
          return {text:'Saved footer',artifact:{kind:'edit',path:'A:/relay/z-footer.txt',before,after:footer}};
        }
        if(input.file_path==='correction.css'){
          const before=correctionFile;
          correctionFile=String(input.content);
          return {text:'Saved stylesheet',artifact:{kind:'edit',path:'A:/relay/correction.css',before:before??'',after:correctionFile,created:before===undefined,sourceIdentity:'correction-file'}};
        }
        plan = String(input.content);
        return { text: 'Saved', artifact: { kind: 'write' } };
      }
      if(tool.name==='Read'&&String(input.file_path).endsWith('index.html'))return {text:source,artifact:{kind:'read',content:source}};
      if(tool.name==='Read'&&String(input.file_path).endsWith('z-footer.txt'))return {text:footer,artifact:{kind:'read',content:footer}};
      if(tool.name==='Read'&&String(input.file_path).endsWith('correction.css')){
        if(correctionFile===undefined)throw Error('File does not exist');
        return {text:correctionFile,artifact:{kind:'read',content:correctionFile,sourceIdentity:'correction-file'}};
      }
      if (tool.name === 'ExitPlanMode') {
        if (!approved&&settings.editIntent) plan=plan.replace('## Accessibility','## Accessibility\n\nUse the approved keyboard behavior.');
        if (!approved&&settings.chooseAlternative) plan=plan.replace('Selected direction ID: gallery','Selected direction ID: type');
        if (approved) sequence.push('approved plan');
        return { text: plan, artifact: { kind: 'plan', name: planName, path: 'plan.md', markdown: plan, planKind: 'Design Plan' } };
      }
      return { text: 'Authorized', artifact: { kind: 'authorization', workspaceRoot: owner.workspaceRoot } };
    },
    approve: async tool => !(settings.deny && tool.name === 'ExitPlanMode'),
    emit: () => {}, updateChild: (_id,patch) => {for(const activity of patch.activities??[])if(activity.errorTrace&&!failures.includes(activity.errorTrace))failures.push(activity.errorTrace);}, stopRequest: async () => {},
    async stream(request, delta, onUsage) {
      onUsage?.({input:4,output:2});
      const messages = request.messages as { role: string; content: string }[];
      for(const message of messages)if(message.role==='tool'&&typeof message.content==='string'&&message.content.startsWith('Error:')&&!failures.includes(message.content))failures.push(message.content);
      const prompt=messages.find(message => message.role === 'user')!.content;
      const stage = prompt.includes('complete DesignIntent') ? 'designer'
        : prompt.includes('Implement the approved plan') ? 'code' : 'qa';
      offered.push({stage,toolNames:(request.tools as {function:{name:string}}[]).map(tool=>tool.function.name)});
      if (stage !== lastStage||prompt!==lastPrompt) {
        lastStage = stage;
        lastPrompt = prompt;
        stageCalls = 0;
        sequence.push(stage);
        if (stage === 'qa') qaRuns++;
      }
      stageCalls++;
      if(stage==='qa'&&settings.interruptQa&&!qaInterrupted){qaInterrupted=true;throw Error('Fixture interrupted before QA inspected the saved preview');}
      if(stage==='qa'&&settings.interruptRestore&&qaRuns===3&&stageCalls===1)throw Error('Fixture interrupted during restored QA');
      if (stage === 'designer') {
        if (settings.omitIntent) { delta('Free prose does not complete this stage.'); return []; }
        if (settings.invalidHandoff) return [submit({...intent,design:{base:'unsupported-style'}})];
        return [submit(intent)];
      }
      if (stage === 'code') {
        if(settings.checkPlanOffer){
          if(stageCalls===1)return [call('DesignContext',{})];
          const last=JSON.parse(messages.filter(message=>message.role==='tool').at(-1)!.content);
          if(last.remaining!==0)return [call('ConventionRead',{missing_required:true})];
          const tools=request.tools as {function:{name:string;parameters:unknown}}[];
          expect(tools.find(tool=>tool.function.name==='DesignPlan')?.function.parameters).toMatchObject({required:['action','decisions'],properties:{action:{enum:['submit']}}});
          for(const name of ['DesignContext','ConventionRead','DesignDecision'])expect(tools.some(tool=>tool.function.name===name)).toBe(false);
          throw Error('Stop after verifying the Code plan tool');
        }
        expect(messages.find(message => message.role === 'user')!.content).toContain('Build the hero in a standalone document.');
        if (stageCalls === 1) return [call('ArtifactDesign',{action:'export'}),...(viewer?[call('DesignRecipe',{action:'source',id:viewer.id,version:viewer.version})]:[])];
        if (stageCalls === 2) {
          const css=messages.find(message=>message.role==='tool'&&message.content.includes('--art-accent'))?.content;
          expect(css).toContain(settings.chooseAlternative?'#a63716':'#702c91');
          if(settings.editIntent){
            const brief=JSON.parse(messages.find(message => message.role === 'user')!.content.split('\n').slice(1).join('\n'));
            expect(brief.approvedPlan).toContain('Use the approved keyboard behavior.');
            expect(brief.approvedPlan).not.toContain('#702c91');
          }
          const fixtureStyle=viewerHtml?`<style>${viewerStyles}${qaRuns===0?'button,select{min-height:0!important;height:18px}':''}</style>`:'';
          if(settings.userEditBeforeCorrection&&qaRuns===1)source+='\n<!-- User kept this edit -->';
          return [
          call('Write',{file_path:'index.html',content:viewerHtml?viewerHtml.replace('</head>',fixtureStyle+'</head>'):`<!doctype html><html lang="en"><style>${css}</style><body data-taro-artifact style="margin:0"><main data-taro-layer="hero"><h1 class="art-display">Hero</h1><p>Revision ${qaRuns+1}</p></main></body></html>${settings.userEditBeforeCorrection&&qaRuns===1?'\n<!-- User kept this edit -->':''}`}),
          ...(settings.partialRestore?[call('Write',{file_path:'z-footer.txt',content:`Footer ${qaRuns+1}`})]:[]),
          ...(settings.correctionOnlyFile&&qaRuns===1?[call('Write',{file_path:'correction.css',content:'Rejected stylesheet'})]:[]),
          call('BrowserPreview', { file_path:'index.html' }),
          ];
        }
        const preview = previewById(review.snapshot(scope).state);
        return [submit({ previewId: preview.id, revisionId: preview.revisionId, checklist: ['Inspect hero'], files: ['index.html',...(settings.partialRestore?['z-footer.txt']:[]),...(settings.correctionOnlyFile&&qaRuns===1?['correction.css']:[])] })];
      }
      if (stageCalls === 1) return [call('BrowserInspect', {}), ...Array.from({length:8},(_,case_index)=>call('BrowserAudit', { run: false, case_index }))];
      if(viewer&&stageCalls===2)return [393,1440].map(width=>call('BrowserReplay',{name:'detail-view',width,height:900,steps:[{input:{type:'scroll',x:180,y:650,deltaY:625}},{input:{type:'click',selector:'[data-load]'}},{input:{type:'click',selector:viewerCheck.target},expect:viewerCheck.expect}]}));
      if (settings.stale) {
        const preview = previewById(review.snapshot(scope).state);
        await review.change(scope, state => revisePreview(state, preview.id, { html: '<main>New revision</main>' }));
      }
      const passed = !settings.exhaust&&(settings.regression?qaRuns>2:!(settings.revise||viewer)||qaRuns>1);
      const broken=settings.exhaust||settings.regression&&qaRuns===2;
      const concern=broken?{region:'Main action',issue:'It no longer opens',effect:'Users cannot continue',correction:'Repair the details action',category:'functional',severity:'required'}:{region:'Hero heading',issue:'The letters collide',effect:'Title is hard to read',correction:'Increase heading line spacing',category:'visual',severity:'required'};
      return [submit({ passed, findings: [passed ? 'Inspected the rendered hero.' : concern.correction], review:{functional:broken?'The main action failed':'Main content visible',accessibility:'Inspected focus',visual:'Inspected actual hero',motion:'Unverified',concerns:passed?[]:[concern]} })];
    },
  };
  const runtime = new ProfessionalToolRuntime(options);
  const start = async () => {
    const inputs={title:"Build the studio landing page",description:"A responsive introduction to the studio",details:"Use the hero layout and validate it at all breakpoints.",priority:"High",tags:["landing"],solution:["Build the responsive studio hero.","Verify the preview across viewport sizes."]};
    const card=await runtime.execute(call("TaskCreate",inputs),inputs);
    const args={action:"start",task_id:card.artifact.taskId,brief:"Build a responsive landing page for the studio.",worktree:!!settings.worktree,mode:settings.explore?'explore':'focused'};
    return runtime.execute(call("DesignJob",args),args);
  };
  const resume=async()=>{
    const restarted=new ProfessionalToolRuntime({...options,sessionId:crypto.randomUUID(),reviewScope:scope});
    const args={action:'resume',job_id:tasks.snapshot(workspace).tasks[0].id};
    return restarted.execute(call('DesignJob',args),args);
  };
  return { tasks, review, sequence, start, resume, scope, runtime, failures, offered, source:()=>source, correctionFile:()=>correctionFile };
}

describe('design relay', () => {
  it.skipIf(process.env.TARO_RELAY_REAL_BROWSER!=='1')('runs the relay with Chromium and a scripted provider',async()=>{
    const browser=createReviewBrowser();
    try{
      const {start,review,scope,failures}=setup({browser:request=>browser.request({...request})});
      const result=await start().catch(cause=>{throw Error(`Browser relay failed: ${failures.join(' | ')}. ${String(cause)}`);});
      expect(result).toMatchObject({artifact:{phase:'verified'}});
      const preview=previewById(review.snapshot(scope).state);
      expect(preview.revisions.at(-1)?.audits?.[0].cases).toHaveLength(8);
    }finally{await browser.close();}
  },60000);
  it.skipIf(process.env.TARO_RELAY_REAL_BROWSER!=='1')('requires the 3D detail action to pass real desktop and mobile replay before completing',async()=>{
    const browser=createReviewBrowser();
    try{
      const {start,review,scope,tasks,failures}=setup({browser:request=>browser.request({...request}),productViewer:true});
      const result=await start().catch(cause=>{
        const job=tasks.snapshot(workspace).tasks[0]?.designJob;
        const audit=job?.code&&previewById(review.snapshot(scope).state,job.code.previewId).revisions.at(-1)?.audits?.at(-1);
        const findings=audit?.cases.flatMap(item=>item.findings.map(finding=>`${finding.rule}: ${finding.message}`));
        throw Error(`3D browser relay failed: ${failures.join(' | ')}. ${JSON.stringify(job?.verdict)}. ${[...new Set(findings)].join(' | ')}. ${String(cause)}`);
      });
      expect(result.artifact.phase).toBe('verified');
      const attempts=tasks.snapshot(workspace).tasks[0].designJob?.attempts;
      expect(attempts?.map(attempt=>attempt.verdict.passed)).toEqual([false,true]);
      expect(attempts?.at(-1)?.code.recipes).toEqual([expect.objectContaining({id:'product-viewer',version:'1.0.0',settings:{finish:'terracotta',quality:'auto'}})]);
      expect(attempts?.[0].preservedRegions?.map(region=>region.width)).toEqual([393,1440]);
      expect(attempts?.[1].preservedRegions).toEqual(attempts?.[0].preservedRegions);
      const first=attempts?.[0];
      expect(first?.verdict.findings).toContain('Browser audit returned issues.');
      expect(first&&previewById(review.snapshot(scope).state,first.code.previewId).revisions[0].audits?.[0].cases.flatMap(item=>item.findings)).toContainEqual(expect.objectContaining({rule:'target-size'}));
      const evidence=previewById(review.snapshot(scope).state).revisions.at(-1)?.browserEvidence;
      expect(evidence?.filter(report=>report.kind==='replay').map(report=>[report.status,report.frames[0].evidence.viewport.width])).toEqual([['passed',393],['passed',1440]]);
    }finally{await browser.close();}
  },120000);
  it('approves the native plan, carries Designer intent through a revision pass and persists verified evidence', async () => {
    const { start, tasks, review, sequence, scope } = setup({ revise: true });
    await expect(start()).resolves.toMatchObject({ artifact: { phase: 'verified' } });
    expect(sequence).toEqual(['designer', 'approved plan', 'code', 'qa', 'code', 'qa']);
    const job = tasks.snapshot(workspace).tasks[0];
    expect(job.status).toBe('Done');
    expect(job.designJob?.previousPreviews).toHaveLength(1);
    expect(job.designJob?.auditId).toBeTruthy();
    expect(job.designJob?.code?.files).toEqual(['A:/relay/index.html']);
    expect(job.designJob?.attempts?.map(attempt=>attempt.verdict.passed)).toEqual([false,true]);
    expect(job.designJob?.attempts?.map(attempt=>attempt.sourceFiles[0].digest)).toEqual([expect.stringContaining('Revision 1'),expect.stringContaining('Revision 2')]);
    expect(previewById(review.snapshot(scope).state).revisionId).toBe(job.designJob?.code?.revisionId);
  });
  it('keeps a successful selected direction when rendering another option fails',async()=>{
    const {start,tasks}=setup({explore:true});
    await expect(start()).resolves.toMatchObject({artifact:{phase:'verified'}});
    expect(tasks.snapshot(workspace).tasks[0].designJob).toMatchObject({projectDirectionRevision:1,directionPreviews:[{id:'gallery',previewId:expect.any(String),revisionId:expect.any(String)},{id:'type',error:expect.stringContaining('Alternate navigation failed')}]});
  });
  it('switches the source contract and layer geometry when the approved plan selects another option',async()=>{
    const {start,tasks}=setup({explore:true,chooseAlternative:true});
    await expect(start()).resolves.toMatchObject({artifact:{phase:'verified'}});
    expect(tasks.snapshot(workspace).tasks[0].designJob?.intent).toMatchObject({layers:alternateLayers,design:alternateDesign,proposal:{selectedId:'type'},direction:{selectedDirection:'Type'}});
  });
  it('restores an earlier eligible version after a required action regresses and only completes on a new audit',async()=>{
    const {start,tasks,sequence,source}=setup({regression:true});
    await expect(start()).resolves.toMatchObject({artifact:{phase:'verified'}});
    const job=tasks.snapshot(workspace).tasks[0].designJob!;
    expect(job.attempts?.map(attempt=>[attempt.eligible,attempt.verdict.passed])).toEqual([[true,false],[false,false],[true,true]]);
    expect(job.attempts?.[2].restoredFrom).toBe(job.attempts?.[0].code.revisionId);
    expect(new Set(job.attempts?.map(attempt=>attempt.auditId)).size).toBe(3);
    expect(job.preferredRevisionId).toBe(job.attempts?.[2].code.revisionId);
    expect(sequence.slice(-3)).toEqual(['qa','restore source','qa']);
    expect(source()).toContain('Revision 1');
  });
  it('preserves a newer user edit if restoring an earlier version would replace it',async()=>{
    const {start,tasks,sequence,source}=setup({regression:true,restoreConflict:true});
    await expect(start()).rejects.toThrow('A newer edit was found');
    expect(sequence).not.toContain('restore source');
    expect(source()).toContain('User kept this edit');
    const job=tasks.snapshot(workspace).tasks[0].designJob!;
    expect(job.phase).toBe('interrupted');
    expect(job.preferredRevisionId).toBe(job.attempts?.[0].code.revisionId);
  });
  it.each([
    { kind:'existing', expected:'Approved stylesheet\r\n' },
    { kind:'created', expected:undefined },
  ] as const)('reverts a correction-only $kind stylesheet before fresh verification',async({kind,expected})=>{
    const {start,tasks,sequence,source,correctionFile}=setup({regression:true,correctionOnlyFile:kind});
    await expect(start()).resolves.toMatchObject({artifact:{phase:'verified'}});
    expect(correctionFile()).toBe(expected);
    expect(source()).toContain('Revision 1');
    const attempts=tasks.snapshot(workspace).tasks[0].designJob?.attempts;
    expect(attempts?.[1].sourceFiles.some(file=>file.path.endsWith('correction.css'))).toBe(true);
    expect(attempts?.[2].sourceFiles.some(file=>file.path.endsWith('correction.css'))).toBe(kind==='existing');
    expect(new Set(attempts?.map(attempt=>attempt.auditId)).size).toBe(3);
    expect(sequence.filter(stage=>stage==='qa')).toHaveLength(3);
  });
  it('preserves a user edit already present when the correction began',async()=>{
    const {start,sequence,source}=setup({regression:true,userEditBeforeCorrection:true});
    await expect(start()).rejects.toThrow('A newer edit was found');
    expect(sequence).not.toContain('restore source');
    expect(source()).toContain('User kept this edit');
  });
  it('resumes the restored candidate after interruption during its fresh QA',async()=>{
    const {start,resume,tasks,sequence}=setup({regression:true,interruptRestore:true});
    await expect(start()).rejects.toThrow('interrupted during restored QA');
    const interrupted=tasks.snapshot(workspace).tasks[0].designJob!;
    expect(interrupted.code?.restoredFrom).toBe(interrupted.attempts?.[0].code.revisionId);
    await expect(resume()).resolves.toMatchObject({artifact:{phase:'verified'}});
    const job=tasks.snapshot(workspace).tasks[0].designJob!;
    expect(job.attempts?.[2].restoredFrom).toBe(interrupted.code?.restoredFrom);
    expect(job.auditId).not.toBe(interrupted.auditId);
    expect(sequence.filter(stage=>stage==='restore source')).toHaveLength(1);
  });
  it('journals a partial restore and never submits the mixed source for QA',async()=>{
    const {start,resume,tasks,sequence}=setup({regression:true,partialRestore:true});
    await expect(start()).rejects.toThrow('1 file replacements were confirmed');
    const job=tasks.snapshot(workspace).tasks[0].designJob!;
    expect(job.restoreProgress).toMatchObject({attemptedPaths:['A:/relay/index.html','A:/relay/z-footer.txt'],appliedPaths:['A:/relay/index.html']});
    expect(job.phase).toBe('interrupted');
    expect(sequence.filter(stage=>stage==='qa')).toHaveLength(2);
    await expect(resume()).rejects.toThrow('restore was interrupted');
  });
  it('resumes a saved candidate in a new runtime without repeating design or rewriting its source',async()=>{
    const {start,resume,tasks,sequence,source}=setup({interruptQa:true});
    await expect(start()).rejects.toThrow('interrupted before QA');
    const interrupted=tasks.snapshot(workspace).tasks[0].designJob!;
    await expect(resume()).resolves.toMatchObject({artifact:{phase:'verified',revisionId:interrupted.code?.revisionId}});
    const finished=tasks.snapshot(workspace).tasks[0].designJob!;
    expect(finished.intent).toEqual(interrupted.intent);
    expect(finished.auditId).not.toBe(interrupted.auditId);
    expect(finished.metrics).toMatchObject({cost:'unknown',inputTokens:expect.any(Number),reportedRequests:expect.any(Number)});
    expect(finished.metrics!.inputTokens).toBe(4*finished.metrics!.reportedRequests);
    expect(sequence.filter(label=>label==='code'||label==='designer')).toEqual(['designer','code']);
    expect(source()).toContain('Revision 1');
  });
  it('keeps two failed versions and enforces the correction limit after a restart',async()=>{
    const {start,resume,tasks,sequence}=setup({exhaust:true});
    await expect(start()).rejects.toThrow('remaining issues');
    const job=tasks.snapshot(workspace).tasks[0].designJob!;
    expect(job.attempts?.map(attempt=>attempt.eligible)).toEqual([false,false]);
    expect(job.stopReason).toContain('repeated the same findings');
    await expect(resume()).rejects.toThrow('used its correction allowance');
    expect(sequence.filter(label=>label==='code')).toHaveLength(2);
  });
  it('blocks an unchecked design model before any specialist or workspace write',async()=>{
    const {start,sequence}=setup({uncheckedModel:true});
    await expect(start()).rejects.toThrow('Designer needs a verified model');
    expect(sequence).toEqual([]);
  });
  it('retains the structured intent when approval is denied and prevents Code from running', async () => {
    const { start, tasks, sequence } = setup({ deny: true });
    await expect(start()).rejects.toThrow(/approval denied/i);
    expect(sequence).toEqual(['designer']);
    expect(tasks.snapshot(workspace).tasks[0].designJob).toMatchObject({ phase: 'interrupted', planPath: 'plan.md', intent: { plan: ['Build the hero in a standalone document.'] } });
  });
  it('offers only read tools for project design policy to the Designer and stops repeated rejected handoffs', async () => {
    const { start, tasks, offered, failures, sequence, source } = setup({ adi: true, invalidHandoff: true });
    await expect(start()).rejects.toThrow('Design handoff was rejected three times for the same reason. The style failed validation.');
    expect(offered).toHaveLength(3);
    for (const { stage, toolNames } of offered) {
      expect(stage).toBe('designer');
      expect(toolNames).toEqual(expect.arrayContaining(['DesignContext','ConventionSearch','ConventionRead','SubmitDesignHandoff']));
      for (const name of ['DesignPlan','DesignDecision','DesignChecks','Write','Edit','BrowserAction','BrowserReplay']) expect(toolNames).not.toContain(name);
    }
    expect(failures).toContain('The style failed validation. Start from the assigned style and send only supported changes.');
    expect(sequence).toEqual(['designer']);
    expect(source()).toBe('');
    expect(tasks.snapshot(workspace).tasks[0].designJob).toMatchObject({metrics:{modelRequests:3}});
  });
  it('preserves an exhausted job request budget across sessions without dropping saved work', async () => {
    const { start, resume, tasks, offered, source } = setup({ deny: true });
    await expect(start()).rejects.toThrow(/approval denied/i);
    const prior = tasks.snapshot(workspace).tasks[0];
    await tasks.mutate(workspace,prior.id,task=>({...task,designJob:{...task.designJob!,metrics:{...task.designJob!.metrics!,modelRequests:128}}}));
    await expect(resume()).rejects.toThrow('This job exhausted its shared model request budget.');
    expect(offered).toHaveLength(1);
    expect(source()).toBe('');
    expect(tasks.snapshot(workspace).tasks[0].designJob).toMatchObject({intent:prior.designJob!.intent,metrics:{modelRequests:128}});
  });
  it('directs Code to submit its implementation plan after all required reads finish',async()=>{
    const {start,sequence,source}=setup({adi:true,checkPlanOffer:true});
    await expect(start()).rejects.toThrow('Stop after verifying the Code plan tool');
    expect(sequence).toEqual(['designer','approved plan','code']);
    expect(source()).toBe('');
  });
  it('does not restart a job after its active time has been spent', async () => {
    const {start,resume,tasks,offered,source}=setup({deny:true});
    await expect(start()).rejects.toThrow(/approval denied/i);
    const prior=tasks.snapshot(workspace).tasks[0];
    await tasks.mutate(workspace,prior.id,task=>({...task,designJob:{...task.designJob!,metrics:{...task.designJob!.metrics!,activeMs:1_800_000}}}));
    await expect(resume()).rejects.toThrow('This job exhausted its shared active time budget.');
    expect(offered).toHaveLength(1);
    expect(source()).toBe('');
    expect(tasks.snapshot(workspace).tasks[0].designJob).toMatchObject({intent:prior.designJob!.intent,metrics:{activeMs:1_800_000}});
  });
  it('carries approved Markdown edits separately from the private design intent',async()=>{
    const {start,tasks}=setup({editIntent:true});
    await expect(start()).resolves.toMatchObject({artifact:{phase:'verified'}});
    expect(tasks.snapshot(workspace).tasks[0].designJob?.intent?.design.themes.light.accent).toBe('#702c91');
  });
  it('rejects a prose-only Designer response before opening a plan', async () => {
    const { start, sequence } = setup({ omitIntent: true });
    await expect(start()).rejects.toThrow(/structured handoff/);
    expect(sequence).toEqual(['designer']);
  });
  it('rejects a QA verdict when the implementation revision is replaced during review', async () => {
    const { start, tasks } = setup({ stale: true });
    await expect(start()).rejects.toThrow(/preview revision changed/i);
    expect(tasks.snapshot(workspace).tasks[0].status).toBe('Failed');
  });
  it('records and releases a worktree that finishes creation after the parent stops',async()=>{
    let entered!:()=>void,finish!:()=>void;
    const opening=new Promise<void>(resolve=>{entered=resolve;});
    const pending=new Promise<void>(resolve=>{finish=resolve;});
    const {start,runtime,tasks,sequence}=setup({worktree:async()=>{entered();await pending;}});
    const job=start();
    const interrupted=expect(job).rejects.toThrow(/stopped/i);
    await opening;
    runtime.stop();
    finish();
    await interrupted;
    expect(tasks.snapshot(workspace).tasks[0].designJob).toMatchObject({phase:'interrupted',worktree:'A:/relay/.taro/worktrees/job'});
    expect(sequence).toEqual(['designer','approved plan','released worktree']);
  });
});

it('restores layout geometry and its generated source together and rejects stale saves', async () => {
  const { review } = repositories();
  const layer = makeLayer({ id: 'hero', kind: 'rect', name: 'Hero', x: 0, y: 0, w: 80, h: 40, z: 1 });
  const layout = { title: 'Hero', width: 320, height: 320, layers: [layer], annotations: [] };
  const first = await saveLayoutRevision(review, scope, 'layout', layout);
  const second = await saveLayoutRevision(review, scope, 'layout', { ...layout, layers: [{ ...layer, w: 130 }] }, first);
  await expect(saveLayoutRevision(review, scope, 'layout', layout, first)).rejects.toThrow(/changed/);
  const restored = await undoLayoutRevision(review, scope, 'layout', second);
  expect(restored.layout?.layers[0].w).toBe(80);
  expect(restored.html).toContain('width="80"');
  expect(restored.id).toBe(first);
});

it('projects review threads idempotently with their original revision and measured anchor', async () => {
  const { review, tasks } = repositories();
  const layout = { title: 'Hero', width: 320, height: 320, layers: [], annotations: [] };
  const revisionId = await saveLayoutRevision(review, scope, 'layout', layout);
  const preview = previewById(review.snapshot(scope).state);
  const thread = { id: 'comment', revisionId, anchor: { x: 80, y: 40, selector: '#hero' }, resolved: false, messages: [{ id: 'msg', body: 'Increase spacing', author: 'QA', role: 'QA', createdAt: 1 }] };
  await syncReviewWorkItem(scope, preview, thread, tasks);
  await syncReviewWorkItem(scope, preview, { ...thread, resolved: true }, tasks);
  const items = tasks.snapshot(workspace).tasks;
  expect(items).toHaveLength(1);
  expect(items[0].reviewItem).toMatchObject({ revisionId, anchor: { selector: '#hero', x: 80, y: 40 }, resolved: true });
});

it('takes over a running child after stopping its processes and releasing its retained worktree',async()=>{
  const operations:string[]=[];
  let started!:()=>void;
  const streaming=new Promise<void>(resolve=>{started=resolve;});
  const model={id:'test',label:'Test',endpoint:'https://example.invalid'};
  const runtime=new ProfessionalToolRuntime({
    sessionId:crypto.randomUUID(),workspaceRoot:scope.workspace,agentId:'parent',model,models:[model],plugins:[],
    emit:()=>{},updateChild:()=>{},approve:async()=>true,stopRequest:async()=>{},
    stream:async()=>{started();return new Promise(()=>{});},
    native:async(tool,_input,owner)=>{
      operations.push(tool.name);
      const artifact=tool.name==='EnterWorktree'
        ? {kind:'worktree',worktreePath:'A:/relay/.taro/worktrees/child'}
        : {kind:'native',workspaceRoot:owner.workspaceRoot};
      return {text:'OK',artifact};
    },
  });
  const launch={description:'Child implementation',prompt:'Create the preview',run_in_background:true,isolation:'worktree'};
  const child=await runtime.execute(call('Agent',launch),launch);
  await streaming;
  const input={task_id:child.artifact.task_id};
  const takeover=await runtime.execute(call('TaskTakeover',input),input);
  expect(operations).toEqual(['Agent','EnterWorktree','StopChildTasks','ExitWorktree']);
  expect(takeover.artifact).toMatchObject({status:'stopped',worktree:'A:/relay/.taro/worktrees/child'});
  await expect(runtime.settleChildren()).resolves.toBeUndefined();
});
