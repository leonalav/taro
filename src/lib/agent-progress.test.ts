import { describe, expect, it } from "vitest";
import { advanceThought, recoverThoughts, settleThought, startThought } from "./agent-progress";
import { beginToolRound } from "./tool-transcript";
import type { ChatMessage } from "@/data/mock";

describe("observable generation progress",()=>{
  it('settles persisted running web rows after restart',()=>{
    const result=recoverThoughts([{id:'g',role:'activity-group',summary:'Using tools',activities:[{id:'s',kind:'web-search',label:'Searching the web…',status:'running',web:{kind:'web-search',query:'css',provider:'DuckDuckGo',sources:[]}}]}]);
    expect((result[0] as Extract<ChatMessage,{role:'activity-group'}>).activities[0].status).toBe('interrupted');
  });
  it("keeps one run clock across tool rounds and freezes it on stop",()=>{
    const started=startThought("run","planner",1000);
    const waiting=advanceThought(started,"Waiting for approval…","Waiting for Edit permission",2200);
    const running=advanceThought(waiting,"Using tools…","Edit src/a.ts",3000);
    const stopped=settleThought(running,"stopped",4200);
    expect(stopped).toMatchObject({status:"stopped",durationMs:3200,steps:["Preparing response","Waiting for Edit permission","Edit src/a.ts"]});
    expect(advanceThought(stopped,"Thinking…","Late event",9000)).toBe(stopped);
    expect(settleThought(stopped,"completed",9000)).toBe(stopped);
    const history:ChatMessage[]=[running,{id:"a",role:"agent",agentId:"planner",text:""}];
    expect(beginToolRound(history,"a",{id:"g",role:"activity-group",summary:"Using tools",activities:[]}).map(message=>message.id)).toEqual(["run","g"]);
  });
  it("recovers stale working progress using its last recorded time",()=>{
    const working=advanceThought(startThought("run","planner",1000),"Using tools…","Read a.ts",3500);
    const done=settleThought(startThought("done","planner",500),"completed",1000);
    const recovered=recoverThoughts([working,done]);
    expect(recovered[0]).toMatchObject({status:"interrupted",durationMs:2500});
    expect(recovered[1]).toBe(done);
    expect(recoverThoughts([{id:"legacy",role:"agent",agentId:"planner",text:"",trace:["Generating response"]}])[0]).toMatchObject({role:"thought",status:"interrupted",durationMs:0});
  });
});
