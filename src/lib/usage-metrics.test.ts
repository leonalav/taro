import { describe, expect, it } from "vitest";
import { countAddedLines, createUsageMetricsStore, summarizeUsage, USAGE_METRICS_STORAGE_KEY } from "./usage-metrics";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[USAGE_METRICS_STORAGE_KEY, initial]]);
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
const today = new Date(2026, 10, 7, 12).getTime();
const edit = (before: string, after: string) => ({ artifact: { kind: "edit", before, after } });

describe("AI usage ledger", () => {
  it("persists actual submissions once per scoped event and publishes fresh snapshots", () => {
    const storage = memoryStorage();
    const store = createUsageMetricsStore(storage, () => today);
    let notifications = 0;
    store.subscribe(() => notifications++);
    expect(store.recordAiMessage({ eventId: "run-1", workspaceId: "folder-a" })).toBe(true);
    expect(store.recordAiMessage({ eventId: "run-1", workspaceId: "folder-a" })).toBe(false);
    expect(store.recordAiMessage({ eventId: "run-1", workspaceId: "folder-b" })).toBe(true);
    expect(notifications).toBe(2);
    expect(createUsageMetricsStore(storage).getSnapshot().totalMessages).toBe(2);
  });

  it("counts only added diff lines from successful AI mutation artifacts without retaining source", () => {
    const storage = memoryStorage();
    const store = createUsageMetricsStore(storage, () => today);
    const event = { eventId: "tool-1", workspaceId: "folder-a", toolName: "Edit", result: edit("unchanged\nsecret old\nlast\n", "unchanged\nsecret new\nextra\nlast\n") };
    expect(store.recordAiCodeChange(event)).toBe(true);
    expect(store.recordAiCodeChange(event)).toBe(false);
    expect(store.getSnapshot().totalLinesAdded).toBe(2);
    expect(store.recordAiCodeChange({ ...event, eventId: "shell", toolName: "Bash" })).toBe(false);
    expect(store.recordAiCodeChange({ ...event, eventId: "failed", result: { ...event.result, artifact: { ...event.result.artifact, status: "failed" } } })).toBe(false);
    expect(store.recordAiCodeChange({ ...event, eventId: "missing", result: {} })).toBe(false);
    expect(storage.getItem(USAGE_METRICS_STORAGE_KEY)).not.toContain("secret");
  });

  it("uses local calendar days for month totals and the last 28 days including zero days", () => {
    const store = createUsageMetricsStore(memoryStorage(), () => today);
    for (const [eventId, timestamp] of [["previous", new Date(2026, 9, 31, 23, 59).getTime()], ["month", new Date(2026, 10, 1, 0, 1).getTime()], ["today", today]] as const) {
      store.recordAiMessage({ eventId, workspaceId: "folder-a", timestamp });
    }
    store.recordAiCodeChange({ eventId: "tool", workspaceId: "folder-a", toolName: "Write", result: edit("", "a\nb\n"), timestamp: today });
    const summary = summarizeUsage(store.getSnapshot(), new Date(today));
    expect(summary.messagesThisMonth).toBe(2);
    expect(summary.linesAddedThisMonth).toBe(2);
    expect(summary.messagesTrend).toHaveLength(28);
    expect(summary.messagesTrend[27]).toBe(1);
    expect(summary.messagesTrend.reduce((a, b) => a + b, 0)).toBe(3);
    expect(summary.messagesTrend[26]).toBe(0);
  });

  it("recovers from corrupt or invalid storage and unavailable storage", () => {
    for (const malformed of ["not json", "null", '{"version":1,"totalMessages":-4}', '{"version":99}']) {
      const store = createUsageMetricsStore(memoryStorage(malformed), () => today);
      expect(store.getSnapshot().totalMessages).toBe(0);
      expect(store.recordAiMessage({ eventId: "valid", workspaceId: "folder" })).toBe(true);
      expect(store.getSnapshot().totalMessages).toBe(1);
    }
    const store = createUsageMetricsStore({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } }, () => today);
    store.recordAiMessage({ eventId: "one", workspaceId: "folder" });
    store.recordAiMessage({ eventId: "two", workspaceId: "folder" });
    expect(store.getSnapshot().totalMessages).toBe(2);
  });

  it("bounds the event ledger and daily retention while preserving lifetime totals", () => {
    const storage = memoryStorage();
    const store = createUsageMetricsStore(storage, () => today);
    for (let i = 0; i < 2200; i++) store.recordAiMessage({ eventId: `run-${i}`, workspaceId: "folder" });
    store.recordAiMessage({ eventId: "old", workspaceId: "folder", timestamp: new Date(2020, 0, 1).getTime() });
    const persisted = JSON.parse(storage.getItem(USAGE_METRICS_STORAGE_KEY)!);
    expect(persisted.events.length).toBeLessThanOrEqual(2000);
    expect(persisted.days).toHaveLength(1);
    expect(createUsageMetricsStore(storage).getSnapshot().totalMessages).toBe(2201);
  });

  it("counts notebook code sources, excluding markdown and JSON serialization", () => {
    const store = createUsageMetricsStore(memoryStorage(), () => today);
    const before = JSON.stringify({ cells: [{ cell_type: "code", source: ["old\n"], outputs: [] }, { cell_type: "markdown", source: ["# old\n"] }] });
    const after = JSON.stringify({ cells: [{ cell_type: "code", source: ["new\n", "extra\n"], outputs: [] }, { cell_type: "markdown", source: ["# new\n", "text\n"] }] }, null, 2);
    store.recordAiCodeChange({ eventId: "notebook", workspaceId: "folder", toolName: "NotebookEdit", result: { artifact: { kind: "notebook", before, after } } });
    expect(store.getSnapshot().totalLinesAdded).toBe(2);
  });
});

describe("added diff lines", () => {
  it.each([
    ["", "", 0], ["", "one\ntwo\n", 2], ["one\n", "one\r\n", 0],
    ["same\nold\nlast\n", "same\nnew\nlast\n", 1], ["a\nb\nc", "a\nc", 0],
    ["a\nb\nc", "b\nc\na", 1], ["a\na\nb", "a\nb\na", 1], ["x", "x\n", 0],
  ])("counts additions for %j → %j", (before, after, expected) => {
    expect(countAddedLines(before, after)).toBe(expected);
  });
});
