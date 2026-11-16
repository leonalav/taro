import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { DesignJob } from '@/lib/design-job';
import { correctionSourceKey, restoreAttemptSource } from '@/lib/design-attempt-source';
import { projectDirectionRepository } from '@/lib/artifact-design-persistence';
import { reviewRepository } from '@/lib/review-persistence';
import { selectPreview } from '@/lib/review-store';
import type { SavedProjectDirection } from '@/lib/project-direction';
import { readDesignReferenceMedia, renderedReferenceId } from '@/lib/design-reference-media';
import type { DesignReference } from '@/lib/project-direction';

export function DesignJobDetails({job,jobId,busy}:{job:DesignJob;jobId:string;busy:boolean}) {
  const [saved,setSaved]=React.useState<SavedProjectDirection|null>(null);
  const [captures,setCaptures]=React.useState<Record<string,string>>({});
  const [error,setError]=React.useState('');
  const [revisionReason,setRevisionReason]=React.useState('');
  const [nextAction,setNextAction]=React.useState('');
  const [audience,setAudience]=React.useState('');
  const [primaryAction,setPrimaryAction]=React.useState('');
  const [referenceFrames,setReferenceFrames]=React.useState<Record<string,string[]>>({});
  const [editing,setEditing]=React.useState(false);
  const [saving,setSaving]=React.useState(false);
  const direction=job.intent?.direction;
  const review=job.verdict?.review;
  const options=job.intent?.proposal?.options;
  const workspace=job.scope.workspace;
  React.useEffect(()=>{
    let live=true;
    projectDirectionRepository.read(workspace).then(value=>{if(live)setSaved(value);}).catch(cause=>{if(live)setError(String(cause));});
    reviewRepository.load(job.scope).then(()=>{
      if(!live)return;
      const snapshot=reviewRepository.snapshot(job.scope);
      setCaptures(Object.fromEntries(snapshot.state.previews.flatMap(preview=>preview.revisions.flatMap(revision=>revision.capture?[[revision.id,revision.capture]]:[]))));
    }).catch(cause=>{if(live)setError(String(cause));});
    return()=>{live=false;};
  },[workspace,job.scope,job.version]);

  async function open(previewId:string,revisionId:string){
    try{
      await reviewRepository.change(job.scope,state=>selectPreview(state,previewId,revisionId));
      window.dispatchEvent(new CustomEvent('taro:review-work-item',{detail:job.scope}));
    }catch(cause){setError(String(cause));}
  }

  async function download(attempt:NonNullable<DesignJob['attempts']>[number],original=false){
    try{
      const receipt=original?attempt.code.correctionSource:undefined;
      const revision=receipt?.revisionId??attempt.code.revisionId;
      const source=await restoreAttemptSource(workspace,jobId,receipt?correctionSourceKey(revision):revision,receipt?.files??attempt.sourceFiles);
      const files=receipt?source.flatMap(({path,before})=>before===undefined?[]:[{path,content:before}]):source;
      const url=URL.createObjectURL(new Blob([JSON.stringify({revision,files},null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`design-${revision}${receipt?'-before-correction':''}.json`;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(cause){setError(String(cause));}
  }

  async function referenceMedia(reference:DesignReference){
    const id=reference.kind==='screenshot'||reference.kind==='clip'?reference.source:await renderedReferenceId(reference);
    const media=await readDesignReferenceMedia(workspace,id);
    if(!media)throw Error('Saved reference media is unavailable.');
    return media;
  }

  async function loadReference(reference:DesignReference,original:boolean){
    try{
      const media=await referenceMedia(reference);
      if(!original){setReferenceFrames(current=>({...current,[reference.id]:media.previews}));return;}
      const link=document.createElement('a');link.href=media.original;link.download=reference.label;link.click();
    }catch(cause){setError(String(cause));}
  }

  async function save(event:React.FormEvent){
    event.preventDefault();
    const latest=saved?.history.at(-1)?.direction;
    if(!latest||!saved||saving)return;
    setSaving(true);setError('');
    try{
      setSaved(await projectDirectionRepository.save(workspace,{...latest,audience,primaryAction,reason:revisionReason,nextAction},'user',saved.revision));
      setEditing(false);
    }catch(cause){setError(String(cause));}
    finally{setSaving(false);}
  }

  return <>
    {direction&&<details open>
      <summary className='cursor-pointer font-medium'>Project direction</summary>
      <dl className='mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
        <dt className='text-muted-foreground'>Direction</dt><dd>{direction.selectedDirection} · {direction.reason}</dd>
        <dt className='text-muted-foreground'>Audience</dt><dd>{direction.audience}</dd>
        <dt className='text-muted-foreground'>Main action</dt><dd>{direction.primaryAction}</dd>
        <dt className='text-muted-foreground'>Next step</dt><dd>{direction.nextAction}</dd>
        {direction.constraints.length>0&&<><dt className='text-muted-foreground'>Constraints</dt><dd>{direction.constraints.join(' · ')}</dd></>}
        {direction.approvedAssetIds.length>0&&<><dt className='text-muted-foreground'>Assets</dt><dd className='break-all'>{direction.approvedAssetIds.join(' · ')}</dd></>}
        {direction.questions.length>0&&<><dt className='text-muted-foreground'>Open questions</dt><dd>{direction.questions.join(' · ')}</dd></>}
      </dl>
      {saved&&<details className='mt-2'>
        <summary className='cursor-pointer'>Project decision history ({saved.revision})</summary>
        <ol className='ml-4 mt-2 list-decimal space-y-1'>{saved.history.map((entry,index)=><li key={index}>{entry.direction.selectedDirection} · {entry.author==='user'?'User decision':entry.author==='approved-plan'?'Approved plan':'Suggestion'}<p>{entry.direction.reason}</p><p className='text-muted-foreground'>{entry.direction.nextAction}</p></li>)}</ol>
        {!busy&&!editing&&<Button className='mt-2' size='sm' variant='secondary' onClick={()=>{const latest=saved.history.at(-1)!.direction;setAudience(latest.audience);setPrimaryAction(latest.primaryAction);setRevisionReason(latest.reason);setNextAction(latest.nextAction);setEditing(true);}}>Revise current decision</Button>}
        {editing&&<form onSubmit={save} className='mt-2 grid gap-2'>
          <label className='grid gap-1'>Audience<input className='rounded-md border border-border bg-background p-2' required maxLength={400} value={audience} onChange={event=>setAudience(event.target.value)}/></label>
          <label className='grid gap-1'>Main action<input className='rounded-md border border-border bg-background p-2' required maxLength={400} value={primaryAction} onChange={event=>setPrimaryAction(event.target.value)}/></label>
          <label className='grid gap-1'>Reason<textarea className='min-h-12 rounded-md border border-border bg-background p-2' required maxLength={400} value={revisionReason} onChange={event=>setRevisionReason(event.target.value)}/></label>
          <label className='grid gap-1'>Next step<input className='rounded-md border border-border bg-background p-2' required maxLength={400} value={nextAction} onChange={event=>setNextAction(event.target.value)}/></label>
          <div className='flex gap-2'><Button size='sm' type='submit' disabled={saving}>Save decision</Button><Button size='sm' type='button' variant='ghost' onClick={()=>setEditing(false)}>Cancel</Button></div>
        </form>}
      </details>}
    </details>}
    {!!job.references?.length&&<details>
      <summary className='cursor-pointer font-medium'>References ({job.references.length})</summary>
      <ul className='mt-2 space-y-2'>{job.references.map(reference=>{
        const link=job.referencePreviews?.find(item=>item.id===reference.id);
        return <li key={reference.id}><p>{reference.label} · {reference.kind}</p><p className='text-muted-foreground'>{reference.learn}</p>
          {link?.error&&<p className='text-destructive'>{link.error}</p>}
          {link&&!link.error&&<div className='flex flex-wrap gap-1'>
            {!referenceFrames[reference.id]&&<Button size='sm' variant='ghost' onClick={()=>void loadReference(reference,false)}>Show reference frames</Button>}
            <Button size='sm' variant='ghost' onClick={()=>void loadReference(reference,true)}>Download original reference</Button>
          </div>}
          {referenceFrames[reference.id]&&<div className='grid grid-cols-3 gap-1'>{referenceFrames[reference.id].map((source,index)=><img key={index} src={source} alt={`${reference.label} · frame ${index+1}`} className='rounded' loading='lazy'/>)}</div>}
          {link?.previewId&&link.revisionId&&<Button size='sm' variant='ghost' onClick={()=>void open(link.previewId!,link.revisionId!)}>Open reference</Button>}
          {direction?.observations?.filter(item=>item.referenceId===reference.id).map(item=><details key={item.region} className='ml-2'><summary>{item.region}</summary><p>{[item.composition,item.typography,item.color,item.media,item.spacing,item.interaction,item.motion].join(' · ')}</p></details>)}
        </li>;
      })}</ul>
    </details>}
    {!!options?.length&&<details open>
      <summary className='cursor-pointer font-medium'>Compare directions</summary>
      <div className='mt-2 grid grid-cols-2 gap-2'>{options.map(option=>{
        const link=job.directionPreviews?.find(item=>item.id===option.id);
        const capture=link?.revisionId&&captures[link.revisionId];
        return <figure key={option.id} className='min-w-0 rounded-md border border-border p-2'>
          {capture&&<img className='mb-2 w-full rounded' src={capture} alt={`${option.name} preview`} loading='lazy'/>}
          <figcaption className='font-medium'>{option.name}{job.intent?.proposal?.selectedId===option.id?' · Selected':''}</figcaption>
          <p>{option.rationale}</p>
          {link?.error&&<p className='text-destructive'>{link.error}</p>}
          {link?.previewId&&link.revisionId&&<Button size='sm' variant='ghost' onClick={()=>void open(link.previewId!,link.revisionId!)}>Open preview</Button>}
        </figure>;
      })}</div>
    </details>}
    {review&&<details open><summary className='cursor-pointer font-medium'>Review outcomes</summary>
      <ul className='mt-2 space-y-1'>{[['Working behavior',review.functional],['Accessibility',review.accessibility],['Visual judgment',review.visual],['Motion and performance',review.motion]].map(([title,value])=><li key={title}><strong>{title}</strong> {value}</li>)}</ul>
      {review.concerns.length>0&&<ol className='ml-4 mt-2 list-decimal space-y-1'>{[...review.concerns].sort((a,b)=>Number(b.severity==='required')-Number(a.severity==='required')).map((item,index)=><li key={index}><strong>{item.region}</strong> · {item.severity}<p>{item.issue} {item.effect}</p><p>{item.correction}</p></li>)}</ol>}
    </details>}
    <p className='text-muted-foreground'>Quick refinement · one correction</p>
    {job.stopReason&&<p>{job.stopReason}</p>}
    {job.restoreProgress&&<details open><summary className='cursor-pointer font-medium'>Interrupted restoration</summary><ul className='mt-2 space-y-1'>{job.restoreProgress.attemptedPaths.map(path=><li key={path} className='break-all'>{path} · {job.restoreProgress?.appliedPaths.includes(path)?'Change recorded':'Outcome needs checking'}</li>)}</ul></details>}
    {!!job.attempts?.length&&<details><summary className='cursor-pointer'>Saved source and checks</summary><ul className='mt-2 space-y-1'>{job.attempts.map(attempt=><li key={attempt.code.revisionId} className='flex flex-wrap items-center gap-2'><span>{attempt.verdict.passed?'Passed':'Needs work'} · {attempt.sourceFiles.length} files{attempt.code.revisionId===job.preferredRevisionId?' · Preferred version':''}{attempt.restoredFrom?' · Restored and rechecked':''}</span><Button size='sm' variant='ghost' onClick={()=>void download(attempt)}>Download source copy</Button>{attempt.code.correctionSource?.files.some(file=>file.preimageDigest)&&<Button size='sm' variant='ghost' onClick={()=>void download(attempt,true)}>Download pre-correction source</Button>}</li>)}</ul></details>}
    {!!job.code?.recipes?.length&&<p className='text-muted-foreground'>Gallery examples used · {job.code.recipes.map(item=>`${item.title} ${item.version}`).join(', ')}</p>}
    {job.metrics&&<p className='text-muted-foreground'>{Math.round(job.metrics.elapsedMs/1000)} s · {job.metrics.modelRequests} model requests · {job.metrics.toolCalls} tool calls · {job.metrics.reportedRequests?`${job.metrics.inputTokens} input and ${job.metrics.outputTokens} output tokens reported for ${job.metrics.reportedRequests} requests`:'Token usage unknown'} · Cost unknown</p>}
    {error&&<p role='alert' className='text-destructive'>{error}</p>}
  </>;
}
