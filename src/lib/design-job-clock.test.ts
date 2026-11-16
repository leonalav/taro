import { afterEach, describe, expect, it, vi } from 'vitest';
import { recoverDesignJobMetrics, startDesignJobClock } from './design-job-clock';

afterEach(()=>vi.useRealTimers());

function approvalWait(){
  let resolve!:()=>void,reject!:(error:Error)=>void;
  const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

describe('the shared design job clock',()=>{
  it('keeps requests reserved before a crash, without counting a completed interval or time awaiting approval twice',()=>{
    const saved={elapsedMs:12_000,activeMs:7_000,modelRequests:30,toolCalls:26,reportedRequests:25,inputTokens:200,outputTokens:100,cost:'unknown' as const};
    const metadata={metrics:{...saved,elapsedMs:15_000,activeMs:10_000,reportedRequests:27,inputTokens:260},checkpointAt:50_000,awaitingApproval:false};
    const run={state:'active' as const,metadata,requestsReserved:12};
    expect(recoverDesignJobMetrics(saved,20,run,70_000)).toMatchObject({activeMs:20_000,elapsedMs:25_000,modelRequests:32,reportedRequests:27,inputTokens:260});
    expect(recoverDesignJobMetrics(saved,20,{...run,state:'completed'},70_000).activeMs).toBe(10_000);
    expect(recoverDesignJobMetrics(saved,20,{...run,metadata:{...metadata,awaitingApproval:true}},70_000).activeMs).toBe(10_000);
    expect(recoverDesignJobMetrics(saved,20,{...run,metadata:{}},70_000)).toMatchObject({modelRequests:32,activeMs:7_000});
  });
  it('charges only active time and resumes once all approval waits finish',async()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
    const expire=vi.fn();
    const clock=startDesignJobClock(400,1000,expire);
    vi.advanceTimersByTime(200);
    const a=approvalWait(),b=approvalWait();
    const approve=clock.duringApproval(()=>a.promise);
    const reject=clock.duringApproval(()=>b.promise);
    const rejected=expect(reject).rejects.toThrow('declined');
    vi.advanceTimersByTime(9000);
    a.resolve();
    await approve;
    vi.advanceTimersByTime(3000);
    expect(clock.elapsedMs).toBe(600);
    expect(expire).not.toHaveBeenCalled();
    b.reject(Error('declined'));
    await rejected;
    vi.advanceTimersByTime(399);
    expect(clock.elapsedMs).toBe(999);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(clock.elapsedMs).toBe(1000);
    vi.advanceTimersByTime(5000);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('keeps the confirmed active time when an interrupted job is closed during approval',async()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
    const expire=vi.fn();
    const clock=startDesignJobClock(200,1000,expire);
    vi.advanceTimersByTime(200);
    const pending=approvalWait();
    const approval=clock.duringApproval(()=>pending.promise);
    clock.close();
    pending.resolve();
    await approval;
    vi.advanceTimersByTime(60_000);
    expect(clock.elapsedMs).toBe(400);
    expect(expire).not.toHaveBeenCalled();
  });
});
