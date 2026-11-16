import { describe, expect, it } from 'vitest';
import { createArtifactDesign } from './artifact-design';
import { designSubmissionDefinition, parseDesignSubmission } from './design-job';

const intent = {
  design: { base: 'project', changes: { typography: { display: { family: 'Instrument Serif, Georgia, serif' } } } },
  layers: [{ id: 'hero', x: 0, y: 0, width: 960, height: 560 }],
  motion: ['Keep the headline still.'], accessibility: ['Keep a visible stop for the link.'], plan: ['Write a standalone hero.'],
  direction: { audience: 'Studio clients', primaryAction: 'Explore the work', selectedDirection: 'Editorial', reason: 'Keep the gallery readable.', constraints: [], questions: [], approvedAssetIds: [], nextAction: 'Open the narrow preview.' },
  behavior: { layouts: [{ layerId: 'hero', alignment: 'Left', growth: 'Fluid', wrapping: 'Wrap the heading', mobile: 'Stack photography below title' }], interactions: [] },
};
const context = { rich: true, mode: 'focused' as const, projectStyle: createArtifactDesign('expressive'), references: [{ id: 'reference-a', kind: 'screenshot' as const, source: 'attachment-a', label: 'Reference A', learn: 'Study its hierarchy' }] };

describe('structured design handoffs', () => {
  it('advertises specific fields and requires the fields consumed by each stage', () => {
    const designer = designSubmissionDefinition('designer',context).function.parameters.properties.artifact;
    const code = designSubmissionDefinition('code',context).function.parameters.properties.artifact;
    const qa = designSubmissionDefinition('qa',context).function.parameters.properties.artifact;
    expect(designer).toMatchObject({ required: expect.arrayContaining(['design','layers','behavior','direction']), additionalProperties:false });
    expect(designer.required).not.toContain('proposal');
    expect(designSubmissionDefinition('designer',{...context,mode:'explore'}).function.parameters.properties.artifact.required).toContain('proposal');
    expect(code.required).toEqual(['previewId','revisionId','checklist','files']);
    expect(qa.required).toContain('review');
  });

  it('merges chosen design changes into project style and validates without altering the source', () => {
    const result=parseDesignSubmission('designer',intent,context);
    expect(result.design.themes).toEqual(context.projectStyle.themes);
    expect(result.design.typography.display.family).toBe('Instrument Serif, Georgia, serif');
    expect(context.projectStyle.typography.display.family).not.toBe(result.design.typography.display.family);
    expect(()=>parseDesignSubmission('designer',{...intent,design:{base:'project',changes:{unknownField:'x'}}},context)).toThrow(/Unknown/);
    expect(()=>parseDesignSubmission('designer',{...intent,design:{base:'project',changes:{themes:{light:{text:'#bad'}}}}},context)).toThrow(/hexadecimal/);
    expect(()=>parseDesignSubmission('designer',{...intent,design:{base:'project'}},{rich:true})).toThrow(/saved project style/);
  });

  it('retains focused observations using the assigned reference, never model-supplied reference locations', () => {
    const observation={referenceId:'reference-a',region:'Hero',composition:'Image to the right',typography:'Large serif heading',color:'Earth tones',media:'Studio photo',spacing:'Wide margins',interaction:'Navigation label',motion:'Claimed animated'};
    const result = parseDesignSubmission('designer',{...intent,direction:{...intent.direction,references:[{...context.references[0],source:'different'}],observations:[observation]}},context);
    expect(result.direction?.references).toEqual(context.references);
    expect(result.direction?.observations).toEqual([{...observation,motion:'Unknown from a still image.'}]);
    expect(()=>parseDesignSubmission('designer',{...intent,direction:{...intent.direction,observations:[{...observation,referenceId:'other'}]}},context)).toThrow(/unknown source/);
  });
});
