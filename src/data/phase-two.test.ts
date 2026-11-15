import { describe, expect, it } from "vitest";
import { ensureNikeSubagentArtifact, seedThreads, type Thread } from "./mock";

describe("Phase 2 reference upgrade", () => {
  it("adds missing examples to a saved Nike chat without replacing history", () => {
    const original = seedThreads[0];
    const old: Thread = { ...original, messages: [{ id: "user-note", role: "agent", agentId: "planner", text: "Keep my review notes." }] };
    const upgraded = ensureNikeSubagentArtifact(old);
    expect(upgraded.messages[0]).toEqual(old.messages[0]);
    expect(upgraded.messages.some(message => message.role === "professional-tool")).toBe(false);
    expect(upgraded.messages.filter(message => message.role === "plan").map(message => message.kind)).toEqual(["Plan", "Design Plan"]);
    expect(upgraded.messages.some(message => message.role === "event" && message.text === "Enter plan mode")).toBe(true);
    expect(ensureNikeSubagentArtifact(upgraded)).toBe(upgraded);
  });

  it("preserves edited examples and fills a partially upgraded session once", () => {
    const full = ensureNikeSubagentArtifact({ ...seedThreads[0], messages: [] });
    const example = full.messages.find(message => message.role === "tool-result");
    expect(example).toBeDefined();
    const edited = { ...example!, subject: "My reviewed example" };
    const partial = { ...full, messages: [edited] } as Thread;
    const upgraded = ensureNikeSubagentArtifact(partial);
    expect(upgraded.messages[0]).toEqual(edited);
    expect(new Set(upgraded.messages.map(message => message.id)).size).toBe(upgraded.messages.length);
    expect(upgraded.messages).toHaveLength(full.messages.length);
  });

  it("leaves unrelated chats untouched", () => {
    const other: Thread = { ...seedThreads[0], id: "my-chat", messages: [] };
    expect(ensureNikeSubagentArtifact(other)).toBe(other);
  });

  it("migrates the old card designs and removes the duplicate skill card", () => {
    const old = { ...seedThreads[0], messages: [
      { id: "nike-phase-two-skill", role: "professional-tool", tool: "Skill", title:"Skill", description:"", skill: "visual-qa", args:"", context:"inline", allowedTools:[], result:"" },
      { id: "nike-phase-two-powershell", role: "professional-tool", tool: "PowerShell", title:"Shell", description:"", command: "pnpm build", taskId: "task-1", outputPath: "tasks/1.output", stdout: "built", stderr: "", interrupted: false },
      { id: "nike-phase-two-plan", role: "professional-tool", tool: "PlanMode", title: "My rollout", description:"", file: "plans/my-rollout.md", steps: ["Keep my custom step"], permissions: [] },
    ] } satisfies Thread;
    const result = ensureNikeSubagentArtifact(old);
    expect(result.messages.some(message => message.role === "professional-tool")).toBe(false);
    expect(result.messages.some(message => message.id === "nike-phase-two-skill")).toBe(false);
    expect(result.messages.find(message => message.id === "nike-phase-two-powershell")).toMatchObject({ role: "activity-group", activities: [{kind:"terminal",label:"Ran pnpm build"}] });
    expect(result.messages.find(message => message.id === "nike-phase-two-plan")).toMatchObject({role:"plan",name:"My rollout",path:"plans/my-rollout.md",markdown:expect.stringContaining("Keep my custom step")});
  });
});
