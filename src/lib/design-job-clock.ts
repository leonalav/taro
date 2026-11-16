import type { DesignJob } from './design-job';
import type { RunRecord } from './foundation-native';

export const designProgressIntervalMs=10_000;

export function recoverDesignJobMetrics(saved:NonNullable<DesignJob['metrics']>,startingRequests:number,run:Pick<RunRecord,'metadata'|'state'|'requestsReserved'>,now=Date.now()){
  const measured=run.metadata.metrics as DesignJob['metrics'];
  const checkpointAt=run.metadata.checkpointAt;
  const interrupted=run.state==='active'||run.state==='interrupted';
  const missedMs=interrupted&&run.metadata.awaitingApproval===false&&typeof checkpointAt==='number'?Math.min(designProgressIntervalMs,Math.max(0,now-checkpointAt)):0;
  return {
    ...saved,...measured,
    elapsedMs:Math.max(saved.elapsedMs,measured?.elapsedMs??0)+missedMs,
    activeMs:Math.max(saved.activeMs??0,measured?.activeMs??0)+missedMs,
    modelRequests:Math.max(saved.modelRequests,startingRequests+run.requestsReserved),
  };
}

export function startDesignJobClock(priorMs:number, limitMs:number, expire:()=>void) {
  let spent=priorMs;
  let started:number|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let pendingApprovals=0;
  let closed=false;

  function suspend(){
    if(timer!==undefined)clearTimeout(timer);
    timer=undefined;
    if(started!==undefined)spent=Math.min(limitMs,spent+performance.now()-started);
    started=undefined;
  }

  function resume(){
    if(closed||pendingApprovals||started!==undefined)return;
    started=performance.now();
    timer=setTimeout(()=>{
      suspend();
      spent=limitMs;
      closed=true;
      expire();
    },Math.ceil(limitMs-spent));
  }

  resume();
  return {
    get elapsedMs(){return Math.min(limitMs,Math.floor(spent+(started===undefined?0:performance.now()-started)));},
    get paused(){return pendingApprovals>0;},
    close(){closed=true;suspend();},
    async duringApproval<T>(request:()=>Promise<T>){
      pendingApprovals++;
      suspend();
      try{return await request();}
      finally{pendingApprovals--;resume();}
    },
  };
}
