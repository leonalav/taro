import { describe, expect, it } from 'vitest';
import { designReplaySignature, replayTextDigest } from './design-interaction-verification';
import { renderedReferenceId } from './design-reference-media';
import { directionPreviewHtml } from './design-direction-preview';
import type { DesignReference, InteractionProof } from './project-direction';

describe('design evidence',()=>{
  it('binds retained frames to their exact source, selector and revision',async()=>{
    const reference:DesignReference={id:'reused',kind:'region',source:'preview',revisionId:'revision-1',selector:'#gallery',label:'Gallery',learn:'Layout'};
    const keys=await Promise.all([reference,{...reference,selector:'#header'},{...reference,revisionId:'revision-2'},{...reference,source:'different-preview'}].map(ref=>renderedReferenceId(ref)));
    expect(new Set(keys).size).toBe(4);
    expect(await renderedReferenceId({...reference,label:'Renamed'})).toBe(keys[0]);
  });
  it('pairs equivalent text steps in memory without exposing typed data in the signature',async()=>{
    const proof:InteractionProof={type:'text',target:'#input',expect:{selector:'#summary',present:true}};
    const steps=[{input:{type:'text' as const,selector:'#input'},expect:proof.expect}];
    const value='private replay marker';
    const direct=await replayTextDigest(steps,{steps:[{...steps[0],input:{...steps[0].input,text:value}}]});
    const saved=await replayTextDigest(steps,{text_values:{0:value}});
    const different=await replayTextDigest(steps,{text_values:{0:'different value'}});
    expect(direct).toBeTruthy();
    expect(direct).toBe(saved);
    expect(different).not.toBe(direct);
    expect(designReplaySignature(proof,steps,[true],direct)).not.toContain(value);
    expect(designReplaySignature(proof,steps,[true])).toBeUndefined();
  });
  it('requires the declared action, result and equivalent steps across widths',()=>{
    const proof:InteractionProof={type:'drag',target:'#model',expect:{selector:'#angle',text:'Turned left'}};
    const ready={input:{type:'click' as const,selector:'#load'}};
    const valid={input:{type:'drag' as const,selector:'#model',toSelector:'#edge'},expect:{text:'Turned left',selector:'#angle'}};
    const transition=[false,true];
    expect(designReplaySignature(proof,[ready,valid],[false,false])).toBeUndefined();
    expect(designReplaySignature(proof,[ready,valid],[])).toBeUndefined();
    const key=designReplaySignature(proof,[ready,valid],transition);
    expect(key).toBeTruthy();
    expect(designReplaySignature(proof,[ready,{...valid,expect:{selector:'#angle',text:'Turned left'}}],transition)).toBe(key);
    expect(designReplaySignature(proof,[ready,{...valid,input:{...valid.input,type:'hover'}}],transition)).toBeUndefined();
    expect(designReplaySignature(proof,[ready,{...valid,expect:{selector:'body',present:true}}],transition)).toBeUndefined();
    expect(designReplaySignature(proof,[valid],[true])).not.toBe(key);
    expect(designReplaySignature(proof,[ready,{...valid,input:{...valid.input,toRelative:{x:0.2,y:0.5}}}],transition)).not.toBe(key);
    expect(designReplaySignature(proof,[ready,{...valid,input:{...valid.input,shift:true}}],transition)).not.toBe(key);
    const scroll={input:{type:'scroll' as const,selector:'#scene',deltaY:200}};
    expect(designReplaySignature(proof,[scroll,valid],transition)).not.toBe(designReplaySignature(proof,[{input:{...scroll.input,deltaY:-200}},valid],transition));
  });
  it('renders a direction preview without running markup from an untrusted source',()=>{
    const html=directionPreviewHtml({id:'safe',name:'<script>test</script>',headline:'<img onerror="test">',action:'Open',rationale:'<iframe>',composition:'image-led',typography:'serif'},'javascript:alert(1)');
    expect(html).toContain('&lt;img onerror=&quot;test&quot;&gt;');
    expect(html).toContain('&lt;iframe&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<script>');
  });
});
