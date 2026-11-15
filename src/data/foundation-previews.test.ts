import { describe, expect, it } from "vitest";
import { seedThreads } from "./mock";
import { foundationCases, foundationPreviewMessages, upgradeFoundationPreviews } from "./foundation-previews";
import { artifactDocument } from "@/lib/artifact-documents";

describe("foundation preview migration", () => {
  it("adds the gallery once while preserving history and edited documents", () => {
    const original = { ...seedThreads[0], messages: [{ id: "note", role: "agent" as const, agentId: "planner", text: "Keep this" }] };
    const upgraded = upgradeFoundationPreviews(original);
    expect(upgraded.messages[0]).toEqual(original.messages[0]);
    expect(upgradeFoundationPreviews(upgraded)).toBe(upgraded);
    const plan = upgraded.messages.find(m => artifactDocument(m)?.title === "Agent foundation artifacts")!;
    expect(plan.role).toBe("activity-group");
    if (plan.role !== "activity-group") throw Error("expected grouped document");
    const edited = { ...plan, activities: plan.activities.map(a => a.foundation?.kind === "design-plan" ? { ...a, foundation: { ...a.foundation, result: { title: "Agent foundation artifacts", path: "agent-foundation.md", markdown: "My edited plan" } } } : a) };
    const partial = { ...upgraded, messages: [edited] };
    const restored = upgradeFoundationPreviews(partial);
    expect(artifactDocument(restored.messages[0])?.text).toBe("My edited plan");
    expect(new Set(restored.messages.map(m => m.id)).size).toBe(restored.messages.length);
    expect(upgradeFoundationPreviews({ ...original, id: "other" })).toBeTruthy();
    const other = { ...original, id: "other" };
    expect(upgradeFoundationPreviews(other)).toBe(other);
  });
  it("covers every family with unique sample keys and explicit sample labels", () => {
    expect(new Set(foundationCases.map(c => c.kind)).size).toBe(16);
    expect(new Set(foundationCases.map(c => c.id)).size).toBe(foundationCases.length);
    expect(foundationCases.length).toBeGreaterThan(100);
    expect(foundationCases.every(c => c.sample && c.id.startsWith("nike-foundation-v1-") && c.reason)).toBe(true);
    expect(JSON.stringify(foundationPreviewMessages)).toContain("Agent foundation previews · sample data");
  });
  it("renders honest empty results instead of reusing successful sample payloads", () => {
    const instructions=foundationCases.find(c=>c.kind==="instructions"&&c.reason==="no_files")!;
    expect(instructions.kind==="instructions"&&instructions.result?.sources).toEqual([]);
    expect(instructions.label).toContain("No files");
    const review=foundationCases.find(c=>c.kind==="review"&&c.reason==="no_changes")!;
    expect(review.kind==="review"&&review.result?.files).toEqual([]);
    expect(review.label).not.toContain("+18");
    const preview=foundationCases.find(c=>c.kind==="undo-preview"&&c.reason==="nothing_to_restore")!;
    expect(preview.kind==="undo-preview"&&preview.result?.paths).toEqual([]);
    expect(preview.coverage?.included??[]).toEqual([]);
    const extras=foundationCases.find(c=>c.kind==="context-restore"&&c.reason==="no_extras")!;
    expect(extras.kind==="context-restore"&&extras.result?.restored).toEqual([]);
  });
  it("fills a partial saved gallery without replacing edited sample rows", () => {
    const original=upgradeFoundationPreviews({...seedThreads[0],messages:[]});
    const gallery=original.messages.find(m=>m.role==="activity-group"&&m.foundationGallery)!;
    if(gallery.role!=="activity-group")throw Error("expected gallery");
    const first={...gallery.foundationGallery![0],label:"My saved sample label"};
    const partial={...original,messages:original.messages.map(m=>m.id===gallery.id?{...gallery,foundationGallery:[first]}:m)};
    const upgraded=upgradeFoundationPreviews(partial);
    const restored=upgraded.messages.find(m=>m.id===gallery.id)!;
    if(restored.role!=="activity-group")throw Error("expected gallery");
    expect(restored.foundationGallery).toHaveLength(foundationCases.length);
    expect(restored.foundationGallery![0]).toEqual(first);
    expect(upgradeFoundationPreviews(upgraded)).toBe(upgraded);
  });
});
