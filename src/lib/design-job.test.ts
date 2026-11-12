import { describe, expect, it } from 'vitest';
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

const scope: ReviewScope = { workspace: 'A:/relay', sessionId: 'relay' };
const workspace = 'path:a:/relay';
const call = (name: string, input: unknown) => ({ id: crypto.randomUUID(), name, arguments: JSON.stringify(input) });
const submit = (artifact: unknown) => call('SubmitDesignHandoff', { artifact });

function repositories() {
  function storage() {
    const data = new Map<string, string>();
    return { read: async (key: string) => data.get(key) ?? null, write: async (key: string, value: string) => { data.set(key, value); } };
  }
  return { tasks: createTaskRepository(storage()), review: createReviewRepository(storage()) };
}

function setup(settings: { deny?: boolean; omitIntent?: boolean; revise?: boolean; stale?: boolean; editIntent?: boolean; browser?: ReviewServices['browser']; worktree?: () => Promise<void> } = {}) {
  const scope: ReviewScope = { workspace: 'A:/relay', sessionId: crypto.randomUUID() };
  const { tasks, review } = repositories();
  const sequence: string[] = [];
  let qaRuns = 0;
  let lastStage = '';
  let stageCalls = 0;
  let plan = '';
  let source = '';
  let planName = '';
  const model = { id: 'm', label: 'Test model', endpoint: 'https://example.invalid' };
  const intent = {
    design: createArtifactDesign('expressive'),
    layers: [{ id: 'hero', x: 0, y: 0, width: 320, height: 320 }],
    motion: ['Respect reduced motion.'],
    accessibility: ['Use a visible focus ring.'],
    plan: ['Build the hero in a standalone document.'],
  };
  const options: RuntimeOptions = {
    ...scope, sessionId: scope.sessionId, workspaceRoot: scope.workspace, tasks, agentId: 'parent', model, models: [model], plugins: [],
    agents: ['Designer', 'Code', 'Type & QA'].map(role => ({ id: role, name: role, role, model: model.id, enabled: true, autonomy: 'auto', canWriteCode: true })),
    reviewServices: {
      repository: review,
      browser: settings.browser??(async request=>{
        const viewport = request.viewport ?? { width: 920, height: 720 };
        const audit = request.action === 'audit' ? auditFixture() : undefined;
        if (audit) audit.id = crypto.randomUUID();
        return { url: 'about:blank', title: 'Hero', viewport, document: { ...viewport, scrollX: 0, scrollY: 0 }, components: [], anchors: {}, screenshot: 'data:image/png;base64,example', audit };
      }),
    },
    async native(tool, input, owner, approved) {
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
        plan = String(input.content);
        return { text: 'Saved', artifact: { kind: 'write' } };
      }
      if(tool.name==='Read'&&input.file_path==='index.html')return {text:source,artifact:{kind:'read',content:source}};
      if (tool.name === 'ExitPlanMode') {
        if (!approved&&settings.editIntent) plan=plan.replace('#702c91','#88205d');
        if (approved) sequence.push('approved plan');
        return { text: plan, artifact: { kind: 'plan', name: planName, path: 'plan.md', markdown: plan, planKind: 'Design Plan' } };
      }
      return { text: 'Authorized', artifact: { kind: 'authorization', workspaceRoot: owner.workspaceRoot } };
    },
    approve: async tool => !(settings.deny && tool.name === 'ExitPlanMode'),
    emit: () => {}, updateChild: () => {}, stopRequest: async () => {},
    async stream(request, delta) {
      const messages = request.messages as { role: string; content: string }[];
      const stage = messages.find(message => message.role === 'user')!.content.includes('complete DesignIntent') ? 'designer'
        : messages.find(message => message.role === 'user')!.content.includes('Implement the approved plan') ? 'code' : 'qa';
      if (stage !== lastStage) {
        lastStage = stage;
        stageCalls = 0;
        sequence.push(stage);
        if (stage === 'qa') qaRuns++;
      }
      stageCalls++;
      if (stage === 'designer') {
        if (settings.omitIntent) { delta('Free prose does not complete this stage.'); return []; }
        return [submit(intent)];
      }
      if (stage === 'code') {
        expect(messages.find(message => message.role === 'user')!.content).toContain('Build the hero in a standalone document.');
        if (stageCalls === 1) return [call('ArtifactDesign',{action:'export'})];
        if (stageCalls === 2) {
          const css=messages.find(message=>message.role==='tool'&&message.content.includes('--art-accent'))?.content;
          expect(css).toContain(settings.editIntent?'#88205d':'#702c91');
          return [
          call('Write',{file_path:'index.html',content:`<!doctype html><html lang="en"><style>${css}</style><body data-taro-artifact style="margin:0"><main data-taro-layer="hero"><h1 class="art-display">Hero</h1><p>Revision ${qaRuns+1}</p></main></body></html>`}),
          call('BrowserPreview', { file_path:'index.html' }),
          ];
        }
        const preview = previewById(review.snapshot(scope).state);
        return [submit({ previewId: preview.id, revisionId: preview.revisionId, checklist: ['Inspect hero'], files: ['index.html'] })];
      }
      if (stageCalls === 1) return [call('BrowserInspect', {}), call('BrowserAudit', { run: false, case_index: 0 })];
      if (settings.stale) {
        const preview = previewById(review.snapshot(scope).state);
        await review.change(scope, state => revisePreview(state, preview.id, { html: '<main>New revision</main>' }));
      }
      const passed = !settings.revise || qaRuns > 1;
      return [submit({ passed, findings: [passed ? 'Inspected the rendered hero.' : 'Adjust heading spacing.'] })];
    },
  };
  const runtime = new ProfessionalToolRuntime(options);
  const start = () => {
    const kickoff=runtime.kickoff(`Build a responsive landing page for the studio${settings.worktree?'':' without a worktree'}.`)!;
    return runtime.execute(kickoff,JSON.parse(kickoff.arguments));
  };
  return { tasks, review, sequence, start, scope, runtime };
}

describe('design relay', () => {
  it.skipIf(process.env.TARO_RELAY_REAL_BROWSER!=='1')('runs the relay with Chromium and a scripted provider',async()=>{
    const browser=createReviewBrowser();
    try{
      const {start,review,scope}=setup({browser:request=>browser.request({...request})});
      await expect(start()).resolves.toMatchObject({artifact:{phase:'verified'}});
      const preview=previewById(review.snapshot(scope).state);
      expect(preview.revisions.at(-1)?.audits?.[0].cases).toHaveLength(8);
    }finally{await browser.close();}
  },60000);
  it('approves the native plan, carries Designer intent through a revision pass and persists verified evidence', async () => {
    const { start, tasks, review, sequence, scope } = setup({ revise: true });
    await expect(start()).resolves.toMatchObject({ artifact: { phase: 'verified' } });
    expect(sequence).toEqual(['designer', 'approved plan', 'code', 'qa', 'code', 'qa']);
    const job = tasks.snapshot(workspace).tasks[0];
    expect(job.status).toBe('Done');
    expect(job.designJob?.previousPreviews).toHaveLength(1);
    expect(job.designJob?.auditId).toBeTruthy();
    expect(job.designJob?.code?.files).toEqual(['A:/relay/index.html']);
    expect(previewById(review.snapshot(scope).state).revisionId).toBe(job.designJob?.code?.revisionId);
  });
  it('retains the structured intent when approval is denied and prevents Code from running', async () => {
    const { start, tasks, sequence } = setup({ deny: true });
    await expect(start()).rejects.toThrow(/approval denied/i);
    expect(sequence).toEqual(['designer']);
    expect(tasks.snapshot(workspace).tasks[0].designJob).toMatchObject({ phase: 'interrupted', planPath: 'plan.md', intent: { plan: ['Build the hero in a standalone document.'] } });
  });
  it('exports the contract from the exact approved plan when its tokens were edited',async()=>{
    const {start,tasks}=setup({editIntent:true});
    await expect(start()).resolves.toMatchObject({artifact:{phase:'verified'}});
    expect(tasks.snapshot(workspace).tasks[0].designJob?.intent?.design.themes.light.accent).toBe('#88205d');
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
