import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageItem } from "./chat-message";
import type { ChatMessage } from "@/data/mock";

describe("Taro thought progress", () => {
  it("replaces the generic thinking placeholder with ThoughtLine", () => {
    const html=renderToStaticMarkup(<MessageItem message={{id:"a",role:"agent",agentId:"planner",text:"",trace:["Generating response"]}} agentLabel={()=>"Planner agent"} onRevert={()=>{}} busy/>);
    expect(html).not.toContain("Planner agent is thinking");
    expect(html).toContain("data-thought-line");
    expect(html).toContain('data-glyph="dot"');
    expect(html).not.toContain('data-working=""');
    expect(html).toContain("Interrupted");
  });
  it("renders settled run progress with its recorded duration and safe tool summaries", () => {
    const message={id:"progress",role:"thought",agentId:"planner",status:"completed",label:"Thinking…",startedAt:1000,updatedAt:4200,durationMs:3200,steps:["Read src/index.css","Received model response"]} as ChatMessage;
    const html=renderToStaticMarkup(<MessageItem message={message} agentLabel={()=>"Planner agent"} onRevert={()=>{}}/>);
    expect(html).toContain("Thought for");expect(html).toContain("3.2s");
    expect(html).toContain("Read src/index.css");
    expect(html).not.toContain("Sparkles");
  });
});
