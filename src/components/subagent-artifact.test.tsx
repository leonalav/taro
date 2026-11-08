import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {MessageItem} from "./chat-message";
import {agentName,ensureNikeSubagentArtifact,seedThreads,type ChatMessage} from "@/data/mock";

describe("Nike subagent reference artifact",()=>{
  it("records Claude-style deployment inputs, progress, and result",()=>{
    const artifact=seedThreads[0].messages.find(message=>message.role==="subagent");
    expect(artifact).toMatchObject({subagentType:"Explore",runInBackground:true,isolation:"worktree",status:"completed"});
    const html=renderToStaticMarkup(<MessageItem message={artifact as ChatMessage} agentLabel={agentName} onRevert={()=>{}}/>);
    expect(html).toContain("Deploy subagent");
    expect(html).toContain("Explore");
    expect(html).toContain("Background");
    expect(html).toContain("Worktree");
    expect(html).toContain("Read src/index.css");
    expect(html).toContain("Contrast");
  });
  it("adds the artifact to an existing Nike chat without replacing its history",()=>{
    const artifact=seedThreads[0].messages.find(message=>message.role==="subagent")!;
    const older={...seedThreads[0],messages:seedThreads[0].messages.filter(message=>message.id!==artifact.id)};
    const upgraded=ensureNikeSubagentArtifact(older);
    expect(upgraded.messages.slice(0,older.messages.length)).toEqual(older.messages);
    expect(upgraded.messages.filter(message=>message.id===artifact.id)).toHaveLength(1);
    expect(ensureNikeSubagentArtifact(upgraded).messages).toHaveLength(upgraded.messages.length);
  });
});
