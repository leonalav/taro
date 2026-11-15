import { beforeEach, describe, expect, it, vi } from "vitest";
const io=vi.hoisted(()=>({invoke:vi.fn(),desktop:true}));
vi.mock("@tauri-apps/api/core",()=>({invoke:io.invoke,isTauri:()=>io.desktop}));
import wire from "@/data/foundation-wire.json";
import type { Scope } from "@/data/foundation";
import type { RunLimits, ToolIntent } from "./foundation-native";
import { NativeRunLedger } from "./foundation-native";
const scope={workspaceRoot:"/project",sessionId:"chat",runId:"run"};
beforeEach(()=>{io.desktop=true;vi.clearAllMocks();});
describe("native foundation boundary",()=>{
 it("shares the Rust serde fixture using camelCase scope and boundary identities",()=>{
  const scope:Scope=wire.scope;const limits:RunLimits=wire.limits;const intent:ToolIntent=wire.intent;
  expect(scope.runId).toBe("run-1");expect(limits.requestLimit).toBe(128);expect(intent.attemptId).toBe("attempt-1");
  expect(wire.outcome.state).toBe("succeeded");expect(wire.context.sourceSequence).toBe(2);
 });
 it("uses the canonical scope returned by native begin and awaits durable acknowledgments",async()=>{
  io.invoke.mockResolvedValueOnce({scope:{...scope,workspaceRoot:"/canonical/project"},rootRunId:"run",state:"active",limits:{requestLimit:128,activeTimeLimitMs:1800000},requestsReserved:0,contextEpoch:0,recoveryAttempts:0,metadata:{}});
  const ledger=await NativeRunLedger.begin(scope);
  io.invoke.mockResolvedValueOnce({attemptId:"request",runId:"run",rootRunId:"run",kind:"model",ordinal:1});
  const reservation=await ledger.reserveRequest("request","model");
  expect(reservation.ordinal).toBe(1);
  expect(io.invoke).toHaveBeenLastCalledWith("foundation_reserve_request",{scope:{...scope,workspaceRoot:"/canonical/project"},attemptId:"request",kind:"model"});
 });
 it("does not invent browser persistence or swallow storage failures",async()=>{
  io.desktop=false;await expect(NativeRunLedger.begin(scope)).rejects.toThrow(/desktop/i);expect(io.invoke).not.toHaveBeenCalled();
  io.desktop=true;io.invoke.mockRejectedValueOnce(Error("disk full"));await expect(NativeRunLedger.begin(scope)).rejects.toThrow("disk full");
 });
});
