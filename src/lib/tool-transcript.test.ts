import {describe,expect,it} from "vitest";
import {beginToolRound} from "./tool-transcript";
import type {ChatMessage} from "@/data/mock";

const group=(id:string):ChatMessage=>({id,role:"activity-group",summary:"Using tools",activities:[]});
const agent=(id:string,text:string):ChatMessage=>({id,role:"agent",agentId:"planner",text});

describe("sparse tool transcript",()=>{
  it("places each group after its own agent text",()=>{
    const messages:ChatMessage[]=[{id:"u",role:"user",segments:[{type:"text",text:"Task"}]},agent("a1","Let me inspect." )];
    const first=beginToolRound(messages,"a1",group("g1"));
    const second=beginToolRound([...first,agent("a2","The file is longer; reading the rest.")],"a2",group("g2"));
    expect(second.map(message=>message.id)).toEqual(["u","a1","g1","a2","g2"]);
  });
  it("removes an empty agent placeholder before a tool group",()=>{
    expect(beginToolRound([agent("a1","")],"a1",group("g1")).map(message=>message.id)).toEqual(["g1"]);
  });
});
