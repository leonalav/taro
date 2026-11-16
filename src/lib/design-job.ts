import { createArtifactDesign, validateArtifactDesign, type ArtifactDesign } from './artifact-design';
import type { ReviewScope } from './review-store';
import { parseDirectionProposal, parseProjectDirection, parseVisualHandoff, type DesignReference, type DirectionPreview, type DirectionProposal, type ProjectDirection, type VisualHandoff } from './project-direction';
import { designHandoffShape } from './design-handoff-schema';
import type { AttemptSourceDigest } from './design-attempt-source';

export interface DesignIntent {
  design: ArtifactDesign;
  layers: { id: string; x: number; y: number; width: number; height: number }[];
  motion: string[];
  accessibility: string[];
  plan: string[];
  direction?: ProjectDirection;
  proposal?: DirectionProposal;
  behavior?: VisualHandoff;
  alternativeIntents?: Record<string, DesignIntent>;
}
export interface CodeHandoff {
  previewId: string;
  revisionId: string;
  checklist: string[];
  files: string[];
  previewSource?: { file_path: string } | { url: string };
  sourceFingerprint?: string;
  restoredFrom?: string;
  correctionSource?: { revisionId:string; files:AttemptSourceDigest[] };
  removedFiles?: string[];
  recipes?: import('./design-recipes').DesignRecipeSelection[];
}
export interface DesignVerdict {
  passed: boolean; findings: string[];
  checks?: {rule_id:string;result:'pass'|'not-applicable';observation:string;target_selectors?:string[]}[];
  review?: DesignCritique;
  missingInteractions?: string[];
}
export interface DesignCritique {
  functional: string;
  accessibility: string;
  visual: string;
  motion: string;
  concerns: { region: string; issue: string; effect: string; correction: string; category: 'functional' | 'accessibility' | 'visual' | 'motion'; severity: 'required' | 'advisory' }[];
}
export interface DesignJob {
  version: number;
  scope: ReviewScope;
  brief: string;
  phase: 'design' | 'approval' | 'code' | 'qa' | 'verified' | 'interrupted';
  intent?: DesignIntent;
  planPath?: string;
  planWritten?: boolean;
  code?: CodeHandoff;
  auditId?: string;
  verdict?: DesignVerdict;
  worktree?: string;
  isolate?: boolean;
  runIds?: string[];
  lastRun?: { id:string; sessionId:string; startingRequests:number };
  layout?: { previewId: string; revisionId: string };
  previousPreviews?: CodeHandoff[];
  directionVersion?: 1;
  mode?: 'explore' | 'focused';
  references?: DesignReference[];
  referencePreviews?: DirectionPreview[];
  directionPreviews?: DirectionPreview[];
  projectDirectionRevision?: number;
  attempts?: DesignAttempt[];
  preferredRevisionId?: string;
  restoreProgress?: { fromRevisionId:string; replacedRevisionId:string; attemptedPaths:string[]; appliedPaths:string[] };
  stopReason?: string;
  metrics?: { elapsedMs:number; activeMs?:number; modelRequests:number; toolCalls:number; reportedRequests:number; inputTokens:number; outputTokens:number; cost:'unknown' };
}

export interface DesignAttempt {
  code: CodeHandoff;
  auditId: string;
  verdict: DesignVerdict;
  sourceFiles: AttemptSourceDigest[];
  eligible?: boolean;
  restoredFrom?: string;
  preservedRegions?: {selector:string;width:number;digest:string}[];
}

/** Mandatory behavioral and accessibility evidence decides eligibility before visual judgment. */
export function preferDesignAttempt(attempts:DesignAttempt[]) {
  const penalty=(attempt:DesignAttempt)=>{
    const concerns=attempt.verdict.review?.concerns??[];
    return Number(!attempt.verdict.passed)*1000+concerns.reduce((score,item)=>score+(item.severity==='required'?30:1),0);
  };
  return attempts.reduce<DesignAttempt|undefined>((best,item)=>item.eligible&&(!best||penalty(item)<=penalty(best))?item:best,undefined);
}

export function selectDesignOption(intent:DesignIntent,id:string,reason?:string):DesignIntent {
  const option=intent.proposal?.options.find(option=>option.id===id);
  if(!intent.proposal||!option)throw Error('Choose a saved direction.');
  const handoff=intent.alternativeIntents?.[id];
  if(!handoff)throw Error('The selected option has no implementation handoff.');
  return {...intent,...handoff,proposal:{...intent.proposal,selectedId:id,reason:reason??intent.proposal.reason},direction:intent.direction&&{...intent.direction,selectedDirection:option.name,reason:reason??option.rationale}};
}

export type DesignStage = 'designer' | 'code' | 'qa';
export type DesignSubmission = DesignIntent | CodeHandoff | DesignVerdict;
interface SubmissionContext {
  references?: DesignReference[];
  assets?: string[];
  rich?: boolean;
  mode?: DesignJob['mode'];
  nested?: boolean;
  projectStyle?: ArtifactDesign;
}

function mergeStyle(base:unknown,changes:unknown):unknown {
  if(!changes||typeof changes!=='object'||Array.isArray(changes))return changes;
  const previous=base&&typeof base==='object'&&!Array.isArray(base)?base as Record<string,unknown>:{};
  const entries=Object.entries(changes);
  if(entries.some(([key])=>['__proto__','constructor','prototype'].includes(key)))throw Error('Unsupported design style change.');
  return {...previous,...Object.fromEntries(entries.map(([key,value])=>[key,mergeStyle(Object.prototype.hasOwnProperty.call(previous,key)?previous[key]:undefined,value)]))};
}

function parseHandoffStyle(value:unknown,projectStyle?:ArtifactDesign){
  if(!value||typeof value!=='object'||!Object.prototype.hasOwnProperty.call(value,'base'))return validateArtifactDesign(value);
  const {base,changes}=value as {base:unknown;changes?:unknown};
  if(Object.keys(value).some(key=>key!=='base'&&key!=='changes'))throw Error('A compact style accepts only base and changes.');
  if(base!=='project'&&base!=='editorial'&&base!=='product'&&base!=='expressive')throw Error('Select project, editorial, product or expressive as the style base.');
  const startingStyle=base==='project'?projectStyle:createArtifactDesign(base);
  if(!startingStyle)throw Error('There is no saved project style for this handoff. Use a starter base.');
  if(changes!==undefined&&(!changes||typeof changes!=='object'||Array.isArray(changes)||JSON.stringify(changes).length>24000))throw Error('Supply a bounded object of changes to the assigned style.');
  return validateArtifactDesign(changes===undefined?startingStyle:mergeStyle(startingStyle,changes));
}
const strings = (value: unknown, label: string, minimum = 1): string[] => {
  if (!Array.isArray(value) || value.length < minimum || value.length > 30 ||
      value.some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) {
    throw Error(`Supply ${label} as a bounded array of non-empty strings.`);
  }
  return value;
};

export function parseDesignSubmission(stage: 'designer', value: unknown, context?: SubmissionContext): DesignIntent;
export function parseDesignSubmission(stage: 'code', value: unknown, context?: SubmissionContext): CodeHandoff;
export function parseDesignSubmission(stage: 'qa', value: unknown, context?: SubmissionContext): DesignVerdict;
export function parseDesignSubmission(stage: DesignStage, value: unknown, context?: SubmissionContext): DesignSubmission;
export function parseDesignSubmission(stage: DesignStage, value: unknown, context: SubmissionContext = {}): DesignSubmission {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Submit a structured handoff.');
  const data = value as Record<string, unknown>;
  if (stage === 'designer') {
    const layers = data.layers as DesignIntent['layers'];
    if (!Array.isArray(layers) || !layers.length || layers.length > 80 ||
        layers.some(layer => !layer || !/^[a-z0-9_-]{1,80}$/i.test(layer.id) ||
          ![layer.x, layer.y, layer.width, layer.height].every(n => Number.isFinite(n) && Math.abs(n) <= 10000) ||
          layer.width <= 0 || layer.height <= 0) ||
        new Set(layers.map(layer => layer.id)).size !== layers.length) throw Error('Supply uniquely named, finite layout rectangles.');
    const references = context.references ?? [];
    const direction = data.direction === undefined && !context.rich ? undefined : parseProjectDirection(data.direction,references);
    const proposal = data.proposal === undefined && context.mode !== 'explore' ? undefined : parseDirectionProposal(data.proposal,references,context.mode==='explore'?2:0);
    if(direction?.approvedAssetIds.some(id=>!context.assets?.includes(id)))throw Error('Name only assets already approved for this project.');
    if(direction&&proposal?.options.length&&direction.selectedDirection!==proposal.options.find(option=>option.id===proposal.selectedId)?.name)throw Error('The handoff must follow the selected option.');
    const behavior = data.behavior === undefined && !context.rich ? undefined : parseVisualHandoff(data.behavior,layers.map(layer=>layer.id),context.assets);
    if(context.rich&&behavior?.interactions.some(item=>!item.proof))throw Error('Give each interaction a replay action, target and concrete expected outcome.');
    if(context.nested&&(data.proposal!==undefined||data.direction!==undefined||data.alternativeIntents!==undefined))throw Error('An alternative handoff can only contain implementation fields.');
    const implementation:DesignIntent={
      design: parseHandoffStyle(data.design,context.projectStyle),
      layers: layers.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
      motion: strings(data.motion, 'motion decisions'),
      accessibility: strings(data.accessibility, 'accessibility decisions'),
      plan: strings(data.plan, 'implementation steps'),
      ...(behavior && { behavior }),
    };
    if((context.rich||context.nested)&&Object.values(implementation.design.typography).some(role=>role.fontAssetId&&!context.assets?.includes(role.fontAssetId)))throw Error('Supply a registered asset for each project font.');
    const alternativeIntents:Record<string,DesignIntent>={};
    if(proposal?.options.length){
      const supplied=data.alternativeIntents;
      if(!supplied||typeof supplied!=='object'||Array.isArray(supplied))throw Error('Supply an implementation handoff for each alternative.');
      if(Object.keys(supplied).some(id=>!proposal.options.some(option=>option.id===id&&id!==proposal.selectedId)))throw Error('An alternative handoff names an unexpected option.');
      for(const option of proposal.options){
        alternativeIntents[option.id]=option.id===proposal.selectedId?implementation:parseDesignSubmission('designer',(supplied as Record<string,unknown>)[option.id],{references,assets:context.assets,rich:false,nested:true,projectStyle:context.projectStyle});
        if(context.rich&&(!alternativeIntents[option.id].behavior||alternativeIntents[option.id].behavior?.interactions.some(item=>!item.proof)))throw Error('Every alternative needs a responsive and interaction handoff.');
      }
    }
    return {...implementation,...(direction&&{direction:{...direction,references,observations:proposal?.observations??direction.observations??[]}}),...(proposal&&{proposal}),...(proposal?.options.length&&{alternativeIntents})};
  }
  if (stage === 'code') {
    const { previewId, revisionId } = data;
    if (typeof previewId !== 'string' || !previewId || previewId.length > 150 ||
        typeof revisionId !== 'string' || !revisionId || revisionId.length > 150) throw Error('Supply the saved preview and revision IDs.');
    return { previewId, revisionId, checklist: strings(data.checklist, 'visual checklist'), files: strings(data.files, 'changed files', 0) };
  }
  if (typeof data.passed !== 'boolean') throw Error('Supply a boolean QA verdict.');
  const checks = data.checks;
  if(checks!==undefined&&(!Array.isArray(checks)||checks.length>55||checks.some(item=>!item||typeof item.rule_id!=='string'||!['pass','not-applicable'].includes(item.result)||typeof item.observation!=='string'||item.observation.trim().length<12||item.target_selectors!==undefined&&(!Array.isArray(item.target_selectors)||item.target_selectors.some((selector:unknown)=>typeof selector!=='string')))))throw Error('Supply criterion IDs and concrete QA observations.');
  const review = data.review === undefined && !context.rich ? undefined : parseCritique(data.review);
  if (data.passed && review?.concerns.some(concern=>concern.severity==='required')) throw Error('A verdict cannot pass with an unresolved required concern.');
  return { passed: data.passed, findings: strings(data.findings, 'QA findings'), ...(checks===undefined?{}:{checks:checks as DesignVerdict['checks']}), ...(review&&{review}) };
}

function parseCritique(value: unknown): DesignCritique {
  const text=(value:unknown,label:string)=>strings([value],label)[0];
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Supply the four outcomes and specific concerns for the rendered design.');
  const report=value as DesignCritique;
  if(!Array.isArray(report.concerns)||report.concerns.length>25)throw Error('Supply up to 25 visual and behavioral concerns.');
  const concerns=report.concerns.map(item=>{
    if(!item||!['functional','accessibility','visual','motion'].includes(item.category)||!['required','advisory'].includes(item.severity))throw Error('Supply a valid concern category and severity.');
    return {region:text(item.region,'visible region'),issue:text(item.issue,'visible issue'),effect:text(item.effect,'effect on the user'),correction:text(item.correction,'focused correction'),category:item.category,severity:item.severity};
  });
  return {functional:text(report.functional,'functional outcome'),accessibility:text(report.accessibility,'accessibility outcome'),visual:text(report.visual,'visual judgment'),motion:text(report.motion,'motion and performance outcome'),concerns};
}

export function publicDesignPlan(markdown: string): string {
  return markdown.replace(/^## DesignIntent[ \t]*\r?\n\s*~~~json[ \t]*\r?\n[\s\S]*?\r?\n~~~[ \t]*(?:\r?\n|$)/gm, '').trim();
}


export const designJobDefinition = {
  type: 'function',
  function: {
    name: 'DesignJob',
    description: 'Run a persisted Designer → Code → QA job with native plan approval and browser evidence. Read workspace tasks, jobs and their linked review items, or resume an unfinished job by ID.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['action'],
      properties: {
        action: { type: 'string', enum: ['start', 'read', 'resume'] },
        brief: { type: 'string' }, job_id: { type: 'string' },
        task_id: { type: 'string', description: 'For a new chat design job, use the existing card ID returned by TaskCreate.' },
        worktree: { type: 'boolean', description: 'Use an approved Git worktree for implementation. Defaults to true for a new job.' },
        mode: { type: 'string', enum: ['explore','focused'], description: 'Explore for a substantial new design, focused to preserve the existing direction on a targeted change.' },
        references: { type:'array', maxItems:12, items:{type:'object',required:['id','kind','source','label','learn'],additionalProperties:false,properties:{id:{type:'string'},kind:{type:'string',enum:['website','region','screenshot','clip','layout']},source:{type:'string',description:'Public URL, retained attachment ID, or current Review preview ID.'},label:{type:'string'},learn:{type:'string'},selector:{type:'string',description:'Observed element selector for a region reference.'},revisionId:{type:'string',description:'Exact saved Review revision for a region or layout.'}}} },
      },
    },
  },
};

export function designSubmissionDefinition(stage: DesignStage,context:SubmissionContext={}) {
  const guidance={designer:'Use assigned reference and asset IDs exactly. In focused mode put observations in direction; in explore mode give two or three distinct options and their implementation handoffs.',code:'Use the preview IDs returned by the browser and every path actually edited.',qa:'Report unchecked motion as unverified. A required failure blocks a passing verdict.'};
  return {
    type: 'function',
    function: {
      name: 'SubmitDesignHandoff',
      description: `Submit the required ${stage} artifact using the listed fields. ${guidance[stage]}`,
      parameters: { type: 'object', properties: { artifact:designHandoffShape(stage,!!context.rich,context.mode==='explore') }, required: ['artifact'], additionalProperties: false },
    },
  };
}
