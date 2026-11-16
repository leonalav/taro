import type { DesignStage } from './design-job';

const text={type:'string',minLength:1};
const number={type:'number'};
const boolean={type:'boolean'};
const choice=(...values:string[])=>({type:'string',enum:values});
const array=(items:object,maxItems:number,minItems=0)=>({type:'array',items,minItems,maxItems});
const object=(properties:Record<string,object>,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const texts=(...names:string[])=>Object.fromEntries(names.map(name=>[name,text]));
const observations=array(object(texts('referenceId','region','composition','typography','color','media','spacing','interaction','motion')),24);

function implementation(rich:boolean){
  const proof=object({type:choice('hover','click','scroll','drag','text','key'),target:text,expect:object({selector:text,present:boolean,inViewport:boolean,focused:boolean,text},['selector'])});
  const behavior=object({
    layouts:array(object(texts('layerId','alignment','growth','wrapping','mobile')),80,1),
    interactions:array(object({...texts('id','trigger','change','progress','reducedMotion','alternative'),proof},[...Object.keys(texts('id','trigger','change','progress','reducedMotion','alternative')),...(rich?['proof']:[])]),25),
    preserveRegions:array(text,6),
    scene:object({...texts('camera','lighting','controls','loading','fallback','quality'),objects:array(object(texts('name','assetId','material')),30,1)}),
  },['layouts','interactions']);
  return object({
    design:{type:'object',description:'Use {base:"project"} for the assigned style or {base:"project",changes:{...}} for just the changed fields. Bases editorial, product and expressive are available for new directions. A complete ArtifactDesign object is also accepted.'},
    layers:array(object({id:text,x:number,y:number,width:number,height:number}),80,1),
    motion:array(text,30,1),accessibility:array(text,30,1),plan:array(text,30,1),behavior,
  },['design','layers','motion','accessibility','plan',...(rich?['behavior']:[])]);
}

export function designHandoffShape(stage:DesignStage,rich:boolean,explore:boolean){
  if(stage==='code')return object({previewId:text,revisionId:text,checklist:array(text,30,1),files:array(text,30)});
  if(stage==='qa')return object({
    passed:boolean,findings:array(text,30,1),
    checks:array(object({rule_id:text,result:choice('pass','not-applicable'),observation:text,target_selectors:array(text,30)},['rule_id','result','observation']),55),
    review:object({...texts('functional','accessibility','visual','motion'),concerns:array(object({...texts('region','issue','effect','correction'),category:choice('functional','accessibility','visual','motion'),severity:choice('required','advisory')}),25)}),
  },['passed','findings',...(rich?['review']:[])]);

  const base=implementation(rich);
  return object({
    ...base.properties,
    direction:object({...texts('audience','primaryAction','selectedDirection','reason','nextAction'),constraints:array(text,20),questions:array(text,20),approvedAssetIds:array(text,30),decisionNotes:array(text,20),observations},['audience','primaryAction','selectedDirection','reason','nextAction','constraints','questions','approvedAssetIds']),
    proposal:object({
      options:array(object({...texts('id','name','rationale','headline','action'),composition:choice('image-led','type-led','split','scene-led'),typography:choice('serif','sans-serif','monospace'),referenceId:text},['id','name','rationale','headline','action','composition','typography']),3,2),
      selectedId:text,reason:text,observations,
    }),
    alternativeIntents:{type:'object',description:'One complete implementation handoff, keyed by ID, for each non-selected option.',additionalProperties:base},
  },[...base.required,...(rich?['direction']:[]),...(explore?['proposal','alternativeIntents']:[])]);
}
