import { describe, expect, it, vi } from "vitest";
import { ProfessionalToolRuntime, type RuntimeOptions } from "./professional-runtime";
import { compileWorkspaceRules } from "./workspace-rules";

let serial = 0;
function setup(rules: string) {
  const stream = vi.fn<RuntimeOptions["stream"]>().mockImplementation(async (_request, delta) => { delta("Inspected."); return []; });
  const options: RuntimeOptions = {
    sessionId: `runtime-rules-${serial++}`,
    workspaceRoot: "A:/rules-project",
    agentId: "test-agent",
    model: { id: "test-model", label: "Test model", endpoint: "https://example.invalid" },
    models: [{ id: "test-model", label: "Test model", endpoint: "https://example.invalid" }],
    plugins: [],
    rules,
    native: vi.fn<RuntimeOptions["native"]>().mockImplementation(async (call, _input, owner) => call.name === "Agent"
      ? { text: "Authorized", artifact: { kind: "agent-authorization", workspaceRoot: owner.workspaceRoot } }
      : { text: "File contents", artifact: { kind: "read" } }),
    approve: vi.fn<RuntimeOptions["approve"]>().mockResolvedValue(true),
    stream,
    stopRequest: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
    updateChild: vi.fn(),
  };
  return { runtime: new ProfessionalToolRuntime(options), stream };
}

describe("workspace rules in root and child runtime prompts", () => {
  it("uses the exact compiled snapshot once in root and each child request", async () => {
    const compiled = compileWorkspaceRules([
      { id: "a", text: 'Use local components; keep "<demo>" literal.', scope: "Design", enabled: true },
      { id: "b", text: "Check the changed behavior.", scope: "Code", enabled: true },
      { id: "off", text: "Do not include this disabled rule.", scope: "Always", enabled: false },
    ]);
    expect(compiled.valid).toBe(true);
    const { runtime, stream } = setup(compiled.text);
    expect(runtime.instructions().split(compiled.text)).toHaveLength(2);
    stream.mockResolvedValueOnce([{ id: "read-source", name: "Read", arguments: '{"file_path":"component.tsx"}' }]);
    await runtime.execute({ id: "spawn", name: "Agent", arguments: "{}" }, { description: "Inspect component", prompt: "Inspect component.tsx", subagent_type: "Explore" });
    expect(stream).toHaveBeenCalledTimes(2);
    for (const [request] of stream.mock.calls) {
      const messages = request.messages as { role: string; content?: string }[];
      const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
      expect(system.split(compiled.text)).toHaveLength(2);
      expect(system.match(/<workspace_rules>/g)).toHaveLength(1);
      expect(system).not.toContain("Do not include this disabled rule.");
    }
    expect(runtime.instructions().split(compiled.text)).toHaveLength(2);
  });

  it("supports a workspace with every rule disabled without emitting an empty block", async () => {
    const compiled = compileWorkspaceRules([{ id: "off", text: "Optional guidance", scope: "Always", enabled: false }]);
    const { runtime, stream } = setup(compiled.text);
    expect(runtime.instructions()).not.toContain("workspace_rules");
    await runtime.execute({ id: "spawn-empty", name: "Agent", arguments: "{}" }, { description: "Inspect workspace", prompt: "Inspect", subagent_type: "Explore" });
    const system = (stream.mock.calls[0][0].messages as { role: string; content?: string }[]).find((message) => message.role === "system")!.content;
    expect(system).not.toContain("workspace_rules");
    expect(system).not.toContain("undefined");
  });
});
