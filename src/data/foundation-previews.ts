import type { ChatMessage, Thread, ToolActivity } from "./mock";
import type { FoundationKind, FoundationResults, FoundationState, Operation } from "./foundation";
import { FOUNDATION_DESIGN_MARKDOWN } from "./foundation-design";

const scope={workspaceRoot:"/sample/nike",sessionId:"brand",runId:"nike-foundation-v1-run"};
const prefix="nike-foundation-v1-";
// Each named case maps one design-matrix outcome to an explicit sample key.
// The reason is persisted independently of its readable outcome label.
const matrix:Record<FoundationKind,{label:string;subject:string;cases:Partial<Record<FoundationState,string[]>>}>= {
  "design-plan": {label:"Design plan",subject:"Agent foundation artifacts",cases:{succeeded:["available","opened","edited","saved"],running:["opening"],blocked:["missing_document","editor_unavailable"],failed:["save_failed","save_conflict"]}},
  instructions:{label:"Project instructions",subject:"3 files",cases:{running:["discovering"],succeeded:["loaded","updated","removed"],unchanged:["unchanged","no_files"],skipped:["rules_not_applicable"],warning:["missing_include","invalid_frontmatter","invalid_glob","include_cycle","depth_limit","file_limit","external_include_blocked","conflicting_source_names"],blocked:["inaccessible_file","character_limit","source_changed_mid_request"]}},
  checkpoint:{label:"Checkpoint",subject:"Before token edits",cases:{queued:["queued"],running:["saving"],succeeded:["saved","retention_pruned"],unchanged:["reused_unchanged"],failed:["backup_unavailable"],blocked:["quota_exceeded","file_vanished","symlink_boundary","unsupported_file"],warning:["partial_coverage"]}},
  review:{label:"Change review",subject:"3 files +18 −4",cases:{running:["loading"],succeeded:["ready","added","modified","deleted","renamed","staged","unstaged","untracked","unborn_head","detached_head"],unchanged:["no_changes"],blocked:["git_unavailable","ordinary_folder","repository_removed","concurrent_edit","worktree_switch"],warning:["binary_patch","oversized_patch","partial_output","truncated_output"]}},
  "undo-preview":{label:"Review restore",subject:"3 files",cases:{running:["preparing"],succeeded:["preview_ready"],"awaiting-approval":["approval_required"],unchanged:["nothing_to_restore"],blocked:["checkpoint_missing","checkpoint_pruned","checkpoint_corrupt","outside_scope","changed_hashes","active_writers"],warning:["unsupported_shell_coverage","unsupported_mcp_coverage"]}},
  restore:{label:"Restore checkpoint",subject:"3 files",cases:{queued:["queued"],running:["restoring"],succeeded:["restored","redo_available"],unchanged:["unchanged"],blocked:["denied","stale_preview","conflict","backup_unavailable"],failed:["permission_failure","disk_full"],"partially-succeeded":["partial_restore"],interrupted:["interrupted_rollback"]}},
  redo:{label:"Reapply changes",subject:"3 files",cases:{running:["preparing","applying"],"awaiting-approval":["approval_required"],succeeded:["completed"],blocked:["stale_preview","conflict","intervening_edits","backup_unavailable"],failed:["permission_failure","disk_full"],"partially-succeeded":["partial_restore"],interrupted:["interrupted_rollback"]}},
  staging:{label:"Stage changes",subject:"2 selected files",cases:{"awaiting-approval":["approval_required","unstage_approval_required"],running:["running"],succeeded:["staged","unstaged"],unchanged:["no_changes"],blocked:["git_unavailable","index_locked","conflict","path_disappeared","changed_selection"]}},
  commit:{label:"Commit changes",subject:"Selected staged paths",cases:{succeeded:["committed"],running:["committing"],"awaiting-approval":["preview_ready"],unchanged:["nothing_staged"],blocked:["missing_identity","detached_head","unborn_head","index_locked","concurrent_head","concurrent_index"],failed:["hook_rejected","hook_timeout","signing_failure"],interrupted:["uncertain_outcome"]}},
  context:{label:"Task context",subject:"Recent work retained",cases:{warning:["approaching_limit"],running:["summarizing","user_requested"],succeeded:["completed"],unchanged:["not_needed"],failed:["provider_overflow","invalid_summary","empty_summary","auth_error","network_error","persistence_failure"],blocked:["request_too_large","breaker_open"]}},
  "context-restore":{label:"Restore task context",subject:"Plan and 2 tasks",cases:{running:["rebuilding"],succeeded:["ready"],unchanged:["no_extras"],warning:["missing_plan","missing_worktree","missing_output","changed_instructions","partial_attachments"],blocked:["unavailable_model","unavailable_schema"]}},
  limits:{label:"Task limit",subject:"128 requests",cases:{warning:["approaching_cap","unknown_pricing"],blocked:["request_cap","time_cap","token_cap","cost_cap","child_exhausted_budget"],succeeded:["user_granted_allowance"]}},
  persistence:{label:"Task progress",subject:"Durable boundary",cases:{succeeded:["boundary_recorded","recovered_consistent"],blocked:["write_failure","fsync_failure","transaction_failure","disk_unavailable","corrupt_database","migration_failure"]}},
  restart:{label:"Task interrupted",subject:"Resume available",cases:{running:["orphan_detected","reconciling","resuming"],"awaiting-approval":["resumable"],succeeded:["resumed"],blocked:["uncertain_tool_outcome","live_owner_lock","missing_workspace","missing_model","denied_permission","stale_worktree","invalid_transcript","attempts_exhausted"],failed:["reconciliation_failed"]}},
  "child-recovery":{label:"Resume exploration",subject:"Token audit",cases:{running:["loading_transcript","resuming"],"awaiting-approval":["resumable"],succeeded:["completed"],unchanged:["already_completed"],blocked:["missing_transcript","parent_mismatch","restricted_tools_changed","missing_worktree"],failed:["child_failed"],interrupted:["child_interrupted"]}},
  background:{label:"Recover task output",subject:"Build",cases:{succeeded:["completed_output","verified_process_reattached"],warning:["process_gone","truncated_output"],blocked:["pid_reused","inaccessible_output","unknown_result"],failed:["cancellation_failure"]}},
};
const human=(value:string)=>value.replace(/_/g," ").replace(/^./,s=>s.toUpperCase());
export const foundationFamilies=Object.keys(matrix) as FoundationKind[];
function result<K extends FoundationKind>(kind:K,state:FoundationState,reason:string):FoundationResults[K] {
  const path="src/styles/tokens.css";
  const paths=[{path,outcome:state==="partially-succeeded"?"applied":"applied" as const},{path:"src/components/button.tsx",outcome:state==="partially-succeeded"?"failed":"applied" as const,detail:state==="partially-succeeded"?"Permission denied; original bytes retained":undefined},{path:"src/index.css",outcome:state==="partially-succeeded"?"skipped":"applied" as const}];
  const results:FoundationResults={
    "design-plan":{title:"Agent foundation artifacts",path:"agent-foundation.md",markdown:FOUNDATION_DESIGN_MARKDOWN},
    instructions:{sources:[{path:"AGENTS.md",scope:"Workspace",hash:"sample:8bc1"},{path:"src/CLAUDE.md",scope:"src/**",hash:"sample:0e52"},{path:".claude/rules/styles.md",scope:"src/**/*.css",hash:"sample:5af9"}],warnings:state==="warning"?[human(reason)]:[]},
    checkpoint:{checkpointId:"sample-before-tokens",files:3,bytes:4820},
    review:{files:[{path,change:"modified",added:12,removed:3,patch:"- --accent: #7854d8;\n+ --accent: #8b5cf6;"},{path:"src/components/button.tsx",change:"modified",added:4,removed:1},{path:"src/index.css",change:"modified",added:2,removed:0}],truncated:reason.includes("truncated")||reason.includes("oversized")},
    "undo-preview":{paths:[path,"src/components/button.tsx","src/index.css"],limitations:["Sample: direct-tool coverage only. External MCP changes are not covered."]},
    restore:{paths:paths as FoundationResults["restore"]["paths"],journalId:"sample-restore-journal",redoAvailable:state==="succeeded"},
    redo:{paths:paths as FoundationResults["redo"]["paths"],journalId:"sample-redo-journal",redoAvailable:false},
    staging:{paths:reason==="no_changes"?[]:[path,"src/index.css"],direction:reason.includes("unstage")?"unstage":"stage"},
    commit:{paths:[path,"src/index.css"],message:"Refine token contrast",sha:state==="succeeded"?"sample:a1b2c3d":undefined,uncertain:reason==="uncertain_outcome"},
    context:{inputTokens:12800,budgetTokens:16000,estimated:true,preservedRange:"Complete exchanges 18–24; current request and guidance retained",attempt:reason==="breaker_open"?3:1},
    "context-restore":{restored:["Plan mode restrictions","Current workspace","2 task records"],missing:state==="warning"?[human(reason)]:[]},
    limits:{requests:128,requestLimit:128,activeMinutes:18,remainingWork:"Verify token contrast, run checks, and review the final diff. Only your Continue action can grant more allowance."},
    persistence:{boundary:"Model exchange 24",durable:state==="succeeded"},
    restart:{attempt:reason==="attempts_exhausted"?3:1,maxAttempts:3,uncertainActions:reason==="uncertain_tool_outcome"?["Shell output missing after process exit. Inspect before resuming; do not replay."]:[]},
    "child-recovery":{childId:"sample-token-audit",parentRunId:scope.runId,partialOutput:"Checked 8 components; focus contrast still needs review.",delivered:state==="succeeded"},
    background:{retrieval:state==="succeeded"?"Output recovered":human(reason),process:reason==="verified_process_reattached"?"Verified running process":reason==="pid_reused"?"Owner mismatch":"Exited or unavailable",outcome:reason==="completed_output"?"Build completed": "Uncertain; retrieval is separate from process success",outputPath:"sample/tasks/build.output"},
  };
  if(kind==="instructions"&&["no_files","rules_not_applicable"].includes(reason))results.instructions.sources=[];
  if(kind==="review"&&(reason==="no_changes"||state==="blocked"))results.review.files=[];
  if(kind==="review"&&["added","deleted","renamed"].includes(reason))results.review.files[0].change=reason;
  if(kind==="undo-preview"&&reason==="nothing_to_restore")results["undo-preview"].paths=[];
  if(kind==="commit"&&reason==="nothing_staged")results.commit.paths=[];
  if(kind==="context-restore"&&reason==="no_extras")results["context-restore"].restored=[];
  return results[kind];
}
function sampleLabel(kind:FoundationKind,reason:string,state:FoundationState) {
  const {label,subject}=matrix[kind];
  if(reason==="no_files")return `${label} · No files`;
  if(reason==="rules_not_applicable")return `${label} · No applicable rules`;
  if(reason==="no_changes")return `${label} · No changes`;
  if(reason==="nothing_to_restore")return `${label} · Nothing to restore`;
  if(reason==="nothing_staged")return `${label} · Nothing staged`;
  if(reason==="no_extras")return `${label} · No operational context`;
  if(kind==="review"&&state==="blocked")return `${label} · Unavailable`;
  if(kind==="staging"&&reason.includes("unstage"))return `Unstage changes · ${subject}`;
  return `${label} · ${subject}`;
}
export const foundationCases:Operation[]=foundationFamilies.flatMap(kind=>{
  const family=matrix[kind];
  const cases:Partial<Record<FoundationState,string[]>>={...family.cases,cancelled:["cancelled"],interrupted:[...(family.cases.interrupted??[]),"interrupted"]};
  if(["restore","redo","staging","commit","checkpoint","undo-preview"].includes(kind))cases.blocked=[...(cases.blocked??[]),"read_only","stale_selection"];
  return (Object.entries(cases) as [FoundationState,string[]][]).flatMap(([state,reasons])=>reasons.map(reason=>({
    id:`${prefix}${kind}-${reason}`,attemptId:`${prefix}${kind}-${reason}-attempt`,scope,kind,state,reason,
    label:sampleLabel(kind,reason,state),detail:human(reason),sequence:1,sample:true,
    coverage:["checkpoint","review","undo-preview","restore","redo"].includes(kind)?{included:["nothing_to_restore","no_changes"].includes(reason)||(kind==="review"&&state==="blocked")||(kind==="checkpoint"&&state!=="succeeded"&&state!=="warning")?[]:kind==="checkpoint"&&state==="warning"?["src/styles/tokens.css"]:["src/styles/tokens.css","src/components/button.tsx","src/index.css"],excluded:["External MCP changes"],limitation:"Sample interval coverage; these changes are not proven agent authorship."}:undefined,
    result:result(kind,state,reason),
  } as Operation)));
});
const select=(kind:FoundationKind,reason:string)=>foundationCases.find(c=>c.kind===kind&&c.reason===reason)!;
const activity=(op:Operation):ToolActivity=>({id:op.id,kind:"foundation",label:op.label,status:op.state,foundation:op});
export const foundationPreviewMessages:ChatMessage[]=[
  {id:`${prefix}intro`,role:"agent",agentId:"planner",text:"Agent foundation previews · sample data\n\nExplore change review, safe restore, task context, and recovery below. These examples do not change your workspace."},
  {id:`${prefix}design-plan`,role:"activity-group",summary:"Design plan · Agent foundation artifacts",activities:[activity(select("design-plan","available"))]},
  {id:`${prefix}sequence`,role:"activity-group",summary:"Agent foundation · sample workflow",activities:[activity(select("instructions","loaded")),activity(select("checkpoint","saved")),activity(select("review","ready")),activity(select("undo-preview","approval_required")),activity(select("context","completed")),activity(select("limits","request_cap")),activity(select("restart","resumable"))]},
  {id:`${prefix}gallery`,role:"activity-group",summary:"View states · Agent foundation sample gallery",activities:[],foundationGallery:foundationCases.map(activity)},
];
/** Pure, idempotent upgrade shared by browser local storage and desktop SQLite. */
export function upgradeFoundationPreviews(thread:Thread):Thread {
  if(thread.id!=="brand")return thread;
  let changed=false;
  const messages=thread.messages.map(message=>{
    const template=foundationPreviewMessages.find(m=>m.id===message.id);
    if(message.role!=="activity-group"||template?.role!=="activity-group")return message;
    const rowIds=new Set(message.activities.map(a=>a.id));
    const missingRows=template.activities.filter(a=>!rowIds.has(a.id));
    const galleryIds=new Set(message.foundationGallery?.map(a=>a.id));
    const missingGallery=template.foundationGallery?.filter(a=>!galleryIds.has(a.id))??[];
    if(!missingRows.length&&!missingGallery.length)return message;
    changed=true;
    return {...message,activities:[...message.activities,...structuredClone(missingRows)],...(missingGallery.length?{foundationGallery:[...(message.foundationGallery??[]),...structuredClone(missingGallery)]}:{})};
  });
  const ids=new Set(messages.map(m=>m.id));
  const missing=foundationPreviewMessages.filter(m=>!ids.has(m.id));
  return missing.length||changed?{...thread,messages:[...messages,...structuredClone(missing)]}:thread;
}
