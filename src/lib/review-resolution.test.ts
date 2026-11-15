import { expect, it } from 'vitest';
import { createReviewAnchor } from './review-anchors';
import { proposeReviewResolution, validateReviewResolution } from './review-resolution';
import { addPreview, addReviewComment, applyReviewResolution, createReviewRepository, previewById, revisePreview } from './review-store';
import type { BrowserCapture } from './review-browser';
import type { EvidenceRecord } from './adi/types';

it('binds the receipt to the same component, rule, and revision and preserves the original anchor', async () => {
  const scope={workspace:'/fixture',sessionId:'review'};
  let persisted:string|null=null;
  const reviews=createReviewRepository({read:async()=>persisted,write:async(_key,value)=>{persisted=value;}});
  const component={selector:'#save',layerId:'save',tag:'button',text:'Save',rect:{x:5,y:5,width:40,height:35},styles:{}};
  const viewport={width:320,height:240};
  const capture:BrowserCapture={url:'about:blank',title:'Preview',viewport,document:{...viewport,scrollX:0,scrollY:0},
    components:[component],anchors:{},screenshot:'data:image/png;base64,AA'};
  const anchor=createReviewAnchor({point:{x:10,y:10},capture,component,revisionId:'original',kind:'saved'});
  const revisedAnchor=createReviewAnchor({point:{x:20,y:15},capture,component,revisionId:'current',kind:'saved'});
  await reviews.change(scope,state=>addPreview(state,{id:'p',revisionId:'original',title:'Preview',kind:'html'}));
  await reviews.change(scope,state=>addReviewComment(state,'p',{id:'t',body:'Improve contrast',author:'User',role:'Reviewer',anchor}));
  await reviews.change(scope,state=>revisePreview(state,'p',{html:'<button>Save</button>',capture:capture.screenshot,observation:capture},'current'));
  const thread=previewById(reviews.snapshot(scope).state,'p').threads[0];
  const target={previewId:'p',revisionId:'current',anchor:revisedAnchor,sourceFingerprint:'source'};
  const proposal=proposeReviewResolution(thread,target,['actual'],'Reviewer confirmed the updated foreground contrast.');
  const record:EvidenceRecord={id:'actual',runId:'run',contractDigest:'contract',workspaceIdentity:'workspace',
    sourceFingerprint:'source',previewId:'p',revisionId:'current',captureId:'capture',checkId:'contrast',ruleIds:['contrast'],
    result:'pass',provenance:'human',artifactRefs:['audit'],createdAt:10,targetSelectors:['#save']};
  const services={scope,reviews,requiredRuleIds:['contrast'],contractDigest:'contract',evidence:(id:string)=>id===record.id?record:undefined};
  await expect(validateReviewResolution({...proposal,evidenceIds:['invented']},services)).rejects.toThrow('missing');
  await expect(validateReviewResolution(proposal,{...services,evidence:()=>({...record,targetSelectors:['#unrelated']})})).rejects.toThrow('target component');
  const resolution=await validateReviewResolution(proposal,services);
  await reviews.change(scope,state=>applyReviewResolution(state,resolution));
  const saved=previewById(reviews.snapshot(scope).state,'p').threads[0];
  expect(saved).toMatchObject({revisionId:'original',anchor,resolved:true,resolution:{verifiedRevisionId:'current'}});
  await expect(validateReviewResolution(proposal,services)).rejects.toThrow('changed');
});
