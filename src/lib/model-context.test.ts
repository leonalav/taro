import {describe,expect,it} from "vitest";
import {boundedModelContext} from "./model-context";
describe("bounded model context",()=>{
  it("keeps rules, the current request, and tool results with their calls",()=>{
    const messages=[{role:"system",content:"rules"},{role:"user",content:"old".repeat(1000)},{role:"assistant",content:"old response".repeat(1000)},{role:"user",content:"current task"},{role:"assistant",tool_calls:[{id:"one"}],content:""},{role:"tool",tool_call_id:"one",content:"latest result"}];
    const bounded=boundedModelContext(messages,500) as typeof messages;
    expect(bounded[0].content).toBe("rules");
    expect(bounded).toContainEqual(messages[3]);
    expect(bounded.slice(-2)).toEqual(messages.slice(-2));
    expect(bounded).not.toContainEqual(messages[1]);
  });
  it("drops complete old tool exchanges without leaving orphan results",()=>{
    const old=[{role:"assistant",tool_calls:[{id:"old"}],content:"x".repeat(1000)},{role:"tool",tool_call_id:"old",content:"result"}];
    const result=boundedModelContext([{role:"user",content:"task"},...old,{role:"assistant",content:"latest"}],100);
    expect(result).not.toContainEqual(old[0]);expect(result).not.toContainEqual(old[1]);
  });
});
