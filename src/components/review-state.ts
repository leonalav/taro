import * as React from 'react';
import { reviewRepository } from '@/lib/review-persistence';
import { addPreview, addReviewComment, reviewScopeKey, type ReviewScope, type ReviewAnchor } from '@/lib/review-store';
import { useSettings } from './settings/settings-context';
import { syncReviewWorkItem } from '@/lib/review-work-items';
import { previewById, reviewId } from '@/lib/review-store';
import { createReviewCommentService } from '@/lib/review-comment-service';
export const reviewCommentService=createReviewCommentService(reviewRepository,syncReviewWorkItem);
export const nikePins=[
  {id:'pin-1',x:11,y:33,author:'Aria',role:'Designer agent',time:'09:42',text:'Tracking at −0.045em keeps the serif calm against the bold sans. Ship it?'},
  {id:'pin-2',x:23,y:66,author:'Aria',role:'Designer agent',time:'09:44',text:'Ember CTA now passes AA — contrast fixed 3.1:1 → 4.8:1.'},
  {id:'pin-3',x:79,y:84,author:'Theo',role:'Type & QA',time:'09:51',text:'Gore-tex card reads muddy at small sizes. Try the sand treatment here?'},
];
export function useReviewState(scope:ReviewScope){
  const key=reviewScopeKey(scope),stable=React.useMemo(()=>scope,[key]); // Scope identity is its serialized workspace/session key.
  const value=React.useSyncExternalStore(reviewRepository.subscribe,()=>reviewRepository.snapshot(stable),()=>reviewRepository.snapshot(stable));
  React.useEffect(()=>{void reviewRepository.load(stable).then(()=>{
    void reviewCommentService.retrySync(stable).catch(()=>{});
    if(stable.sessionId==='brand'&&reviewRepository.snapshot(stable).loaded&&!reviewRepository.snapshot(stable).state.previews.some(p=>p.id==='nike-discovery')){
      void reviewRepository.change(stable,state=>{
        if(state.previews.some(p=>p.id==='nike-discovery'))return state;
        let next=addPreview(state,{id:'nike-discovery',title:'Discovery · Variant B',kind:'nike',viewport:{width:920,height:720}});
        for(const pin of nikePins)next=addReviewComment(next,'nike-discovery',{id:pin.id,body:pin.text,author:pin.author,role:pin.role,anchor:{x:pin.x,y:pin.y,percent:true}});
        // Seeding never steals the active preview from a live session.
        return {...next,activeId:state.activeId??next.activeId};
      }).catch(()=>{});
    }
  });},[stable]);
  return value;
}
export function useReviewComments(scope:ReviewScope,previewId:string,revisionId?:string){
  const author=useSettings().account.name||'You';
  const pending=React.useRef(new Map<string,string>());
  const preview=()=>previewById(reviewRepository.snapshot(scope).state,previewId);
  const threadRequest=(threadId:string)=>{
    const thread=preview().threads.find(item=>item.id===threadId);
    if(!thread)throw Error('Comment thread was not found.');
    return {previewId,threadId,expectedGeneration:thread.generation??0};
  };
  const save=async(key:string,request:(clientMutationId:string)=>Promise<unknown>)=>{
    const id=pending.current.get(key)??reviewId();
    pending.current.set(key,id);
    const result=await request(id);
    pending.current.delete(key);
    return result;
  };
  return {
    add:(body:string,anchor:ReviewAnchor)=>save(JSON.stringify(['post',reviewScopeKey(scope),previewId,revisionId,anchor,body]),clientMutationId=>
      reviewCommentService.post(scope,{previewId,revisionId:revisionId??preview().revisionId,clientMutationId,body,anchor,author,role:'Reviewer'})),
    reply:(threadId:string,body:string)=>save(JSON.stringify(['reply',threadId,body]),clientMutationId=>
      reviewCommentService.reply(scope,{...threadRequest(threadId),clientMutationId,body,author,role:'Reviewer'})),
    resolve:(threadId:string,resolved:boolean)=>save(JSON.stringify(['status',threadId,resolved]),clientMutationId=>
      reviewCommentService.setStatus(scope,{...threadRequest(threadId),clientMutationId,resolved})),
  };
}
