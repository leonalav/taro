import { describe, expect, it } from "vitest";
import { aggregateActivityState, normalizeActivityState, projectFoundationEvent } from "./foundation-events";
import { foundationCases } from "@/data/foundation-previews";

describe("foundation lifecycle projection", () => {
  it("maps historical outcomes without showing cancelled work as success", () => {
    expect(normalizeActivityState("done")).toBe("succeeded");
    expect(normalizeActivityState("stopped")).toBe("cancelled");
    expect(aggregateActivityState(["cancelled", "unchanged", "skipped"]).state).toBe("unchanged");
    expect(aggregateActivityState(["running", "failed"])).toEqual({state:"running", hasFailure:true, actionable:false});
    expect(aggregateActivityState(["queued", "failed"]).state).toBe("queued");
    expect(aggregateActivityState(["warning", "blocked"]).state).toBe("blocked");
  });
  it("ignores duplicate/out-of-order events and rejects mismatched identities", () => {
    const payload = { ...foundationCases[0], sequence: 2 };
    const event = {id:"event", sequence:2, operationId:payload.id, runId:payload.scope.runId, timestamp:1, payload};
    const current = projectFoundationEvent(undefined, event)!;
    expect(projectFoundationEvent(current, {...event, sequence:1})).toBe(current);
    expect(projectFoundationEvent(current, {...event, operationId:"other", sequence:3})).toBe(current);
    expect(projectFoundationEvent(undefined, {...event, runId:"other"})).toBeUndefined();
    expect(projectFoundationEvent(current, {...event, sequence:3,payload:{...payload,scope:{...payload.scope,sessionId:"other"}}})).toBe(current);
  });
});
