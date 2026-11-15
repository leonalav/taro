import { validateArtifactDesign, type ArtifactDesign } from './artifact-design';
import type { ReviewScope } from './review-store';

export interface DesignIntent {
  design: ArtifactDesign;
  layers: { id: string; x: number; y: number; width: number; height: number }[];
  motion: string[];
  accessibility: string[];
  plan: string[];
}
export interface CodeHandoff {
  previewId: string;
  revisionId: string;
  checklist: string[];
  files: string[];
}
export interface DesignVerdict {
  passed: boolean; findings: string[];
  checks?: {rule_id:string;result:'pass'|'not-applicable';observation:string;target_selectors?:string[]}[];
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
  layout?: { previewId: string; revisionId: string };
  previousPreviews?: CodeHandoff[];
}

export type DesignStage = 'designer' | 'code' | 'qa';
export type DesignSubmission = DesignIntent | CodeHandoff | DesignVerdict;
const strings = (value: unknown, label: string, minimum = 1): string[] => {
  if (!Array.isArray(value) || value.length < minimum || value.length > 30 ||
      value.some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) {
    throw Error(`Supply ${label} as a bounded array of non-empty strings.`);
  }
  return value;
};

export function parseDesignSubmission(stage: 'designer', value: unknown): DesignIntent;
export function parseDesignSubmission(stage: 'code', value: unknown): CodeHandoff;
export function parseDesignSubmission(stage: 'qa', value: unknown): DesignVerdict;
export function parseDesignSubmission(stage: DesignStage, value: unknown): DesignSubmission;
export function parseDesignSubmission(stage: DesignStage, value: unknown): DesignSubmission {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Submit a structured handoff.');
  const data = value as Record<string, unknown>;
  if (stage === 'designer') {
    const layers = data.layers as DesignIntent['layers'];
    if (!Array.isArray(layers) || !layers.length || layers.length > 80 ||
        layers.some(layer => !layer || !/^[a-z0-9_-]{1,80}$/i.test(layer.id) ||
          ![layer.x, layer.y, layer.width, layer.height].every(n => Number.isFinite(n) && Math.abs(n) <= 10000) ||
          layer.width <= 0 || layer.height <= 0) ||
        new Set(layers.map(layer => layer.id)).size !== layers.length) throw Error('Supply uniquely named, finite layout rectangles.');
    return {
      design: validateArtifactDesign(data.design),
      layers: layers.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
      motion: strings(data.motion, 'motion decisions'),
      accessibility: strings(data.accessibility, 'accessibility decisions'),
      plan: strings(data.plan, 'implementation steps'),
    };
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
  return { passed: data.passed, findings: strings(data.findings, 'QA findings'), ...(checks===undefined?{}:{checks:checks as DesignVerdict['checks']}) };
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
      },
    },
  },
};

export function designSubmissionDefinition(stage: DesignStage) {
  const fields = {
    designer: 'design (the complete ArtifactDesign contract), layers [{id,x,y,width,height}], motion [string], accessibility [string], plan [string]',
    code: 'previewId, revisionId, checklist [string], files [string]',
    qa: 'passed (boolean), findings [string describing the evidence or issue], checks [{rule_id,result,observation,target_selectors?}]',
  };
  return {
    type: 'function',
    function: {
      name: 'SubmitDesignHandoff',
      description: `Submit the required ${stage} artifact with these fields: ${fields[stage]}.`,
      parameters: { type: 'object', properties: { artifact: { type: 'object' } }, required: ['artifact'], additionalProperties: false },
    },
  };
}
