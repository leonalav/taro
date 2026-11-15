# Adaptive Design Intelligence and Review Comments Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. If the user chooses delegation, use superpowers:subagent-driven-development instead. Track the checkbox steps and preserve each task's verification evidence.

**Goal:** Require source-backed design decisions and verified frontend output across every agent entry point, and make Review comments work through persistence, agent handoff, correction and resolution.

**Architecture:** Add a local versioned convention registry and a persisted ADI contract around the existing ProfessionalToolRuntime. Enforce contract transitions at the shared dispatcher and native mutation boundary; bind audits and comment resolutions to actual revisions. Extend existing ArtifactDesign, DesignJob, Tasks and Review instead of creating competing workflows.

**Tech Stack:** Existing React 19, TypeScript, Vite, Tauri 2, Rust, SQLite, Vitest and CDP review-browser worker. No vector database or hosted retrieval service. Add a normal Playwright development dependency for reproducible UI checks; do not depend on a developer's temporary browser-tools directory.

**Spec:** ../specs/2026-11-13-adi-review-design.md

## Global constraints

- Plan only in this change. Do not claim the feature is implemented or tests have passed.
- Baseline: main HEAD 89e5971143cecb26f89f5973f68857b67ed578e5, inspected working files on 2026-11-13.
- Preserve current code style and permissions. New workflow authorization never replaces OS/file-write permission.
- Source edition, exact section locator, retrieval date, checksum and rights are mandatory.
- Default web target: WCAG 2.2 A + AA; APG is informative; aesthetic rules remain conditional.
- Preserve project identity and user constraints; use the target platform, not the agent host platform.
- Solo, parent, child, Tasks, DesignJob and review-fix runs obey the same ADI requirements.
- Required checks cannot be waived by the model. Missing evidence means incomplete, not pass.
- Never automatically execute a new fix merely because someone posted a comment.
- Existing comments, plans, jobs and evidence must migrate without loss.
- The registry is pinned per run. Updates never silently change an active contract.
- Full licensed source coverage must not be claimed until the corresponding content is available and validated.

## Review focus

1. An ordinary chat, solo agent or skill-fork changes UI without entering DesignJob: tested in Tasks 5–7.
2. Source, stylesheet, browser state, thread or worktree changes after verification: tested in Tasks 6, 8 and 12.
3. A save succeeds but projection into Tasks fails; retry/reload must not duplicate feedback: tested in Tasks 9–10.
4. Saved captures, zoom, nested scrolling, missing selectors and keyboard users must still support comments: tested in Task 9.
5. Missing source rights, incomplete machine measurements and unsupported manual checks cannot become a conformance claim: tested in Tasks 1–3, 8 and 13.

## What exists and what is missing

These are source-inspection findings, not a reproduction of the user's exact failing UI session.

| Existing file / function | Observed behavior | Required change |
|---|---|---|
| src/lib/agent-workflow.ts:5 workflowIntent | Regex-led visual/build detection; references and wording affect routing | Context classification plus mutation-time escalation |
| src/lib/professional-runtime.ts:111 kickoff | Can load ArtifactDesign or launch DesignJob; reference-bearing requests return early | ADI initialization independent of delegation or reference handling |
| professional-runtime.ts:190 instructions | Design/browser instructions exist | Inject a compact current contract and next required step |
| professional-runtime.ts:266 executeFor | Common tool dispatcher; some artifact/browser paths return early | ADI checks before all dispatch branches |
| professional-runtime.ts:385 designJob | Existing persisted Designer → Code → QA relay, approval, two implementation attempts | Source-bound contract and common evidence validator |
| src/App.tsx:563 handleSend loop | A model response with no tool calls exits the loop | Completion guard before accepting successful completion |
| src/lib/task-runtime.ts:166 assertReviewVerified | Requires newer preview, measured-clear audit, reply containing audit ID and resolved thread | Structured resolution evidence and rule-level coverage |
| src/components/review-browser-canvas.tsx:68 click | Saved capture clicks immediately return, although Annotate remains available | Separate saved-capture annotation from live input |
| review-browser-canvas.tsx:60 wheel effect | Canvas wheel handler also surrounds floating comment UI | Keep composer input/scroll out of remote page forwarding |
| src/components/review-state.ts:30 update | Save comment first, then synchronize task | Durable idempotent save plus retryable task projection |
| src/lib/review-work-items.ts:6 syncReviewWorkItem | Creates a linked task, updates only reviewItem for an existing task | Reconcile status/context and expose execution handoff |
| src/lib/artifact-audit.ts:13 validateArtifactAudit | Fixed eight cases; measured-clear can coexist with unmeasured entries | Versioned coverage; unknown checks remain unknown |
| src/lib/artifact-tools.ts:8 artifactComponentContract | Useful hand-written behavior guidance without source provenance | Associate derived guidance with registry rules; no false attribution |

## Architecture and obligations

The normal frontend route is:

classification → source selection/read receipts → design contract → saved plan → implementation → render → audit → correction if needed → verified completion.

Use one state machine for every entry point. Delegation is an execution choice, not the enforcement mechanism.

The runtime automatically prepares classification, registry selection and plan requirements. Models must submit concrete decisions and consume the relevant source pages; they cannot mark their own retrieval or machine audit as completed. No arbitrary tool-call quota: require the tools that provide each missing piece of evidence.

A backend-only run may be exempt from frontend decisions after evidence-based classification. A write into a UI surface upgrades scope before execution. Unrestricted shell or unknown MCP mutations in a frontend/unknown workspace require a prepared contract; command text alone is not proof that a shell cannot write UI files. Completion also checks actual changes.

“Obligated” means the runtime can block writes and successful completion without valid artifacts. It does not mean it can prove a model's private reasoning or provide an adversarial OS sandbox.

## Source manifest and release scope

Create src/lib/adi/data/sources.json and one manifest plus rule pack for each row below. Paths are under src/lib/adi/data/packs/. Each pack manifest enumerates its included source pages/sections and explicitly records missing/excluded material; there is no unbounded claim of “all design knowledge.”

| Pack files | Authoritative starting source | Import/coverage contract |
|---|---|---|
| wcag-2.2.json | https://www.w3.org/TR/2024/REC-WCAG22-20241212/ | All active success criteria with levels, exceptions, definitions and conformance references; distinguish supporting techniques from normative text |
| aria-apg.json | https://www.w3.org/WAI/ARIA/apg/ and /about/introduction/ | All patterns and practices in the pinned manifest; native HTML preference; selected component keyboard behavior |
| iso-9241-110-2020.json | https://www.iso.org/standard/75258.html | Metadata and licensed clauses when available; public abstract is not full text |
| iso-9241-210-2019.json | https://www.iso.org/standard/77520.html | Human-centred process clauses; process evidence, not screenshot checks |
| iso-9241-112-2025.json | https://www.iso.org/standard/87518.html | Current 2025 edition; retain 2017 as superseded metadata only |
| nielsen.json | https://www.nngroup.com/articles/ten-usability-heuristics/ | Ten heuristics, original locators; distinguish paraphrase from authorized exact text |
| shneiderman.json | https://www.cs.umd.edu/users/ben/goldenrules.html | Eight rules, source edition and domain qualification |
| apple-hig.json | https://developer.apple.com/design/human-interface-guidelines/ | Platform, foundations, components, patterns, inputs; use publisher Markdown where available |
| fluent-2.json | https://fluent2.microsoft.design/ | Foundations, tokens, components and interaction guidance; platform-tagged |
| material-3.json | https://m3.material.io/ | Material 3 foundations/components; Expressive additions separately tagged/versioned |
| carbon.json | https://carbondesignsystem.com/ | Foundations, components, patterns and data visualization; no silent switch to a preview release |
| atlassian.json | https://atlassian.design/ | Foundations, tokens, components and relevant work-management patterns |
| cognitive.json | Fitts: https://doi.org/10.1037/h0055392 ; Hick: https://doi.org/10.1080/17470215208416600 ; Jakob: https://www.nngroup.com/articles/end-of-web-design/ | Original empirical/author sources; assumptions preserved; no invented universal target sizes or choice-count limits |
| composition.json | Specific pinned HIG/Carbon/Atlassian foundation pages, plus original Gestalt references | Grid, hierarchy, rhythm, grouping, balance, contrast hierarchy, harmony, optical alignment, whitespace, density, consistency and meaningful motion |
| design-schools.json | Bauhaus archive https://www.bauhaus.de/en/discover/article/the-bauhaus-idea-and-programme/ ; Rams https://rams-foundation.org/foundation/design-comprehension/theses/ ; CRAP publisher https://www.pearson.com/en-us/subject-catalog/p/non-designer-s-design-book-the/P200000000691/9780133966152 | Swiss/International Typographic Style, Modernism, Bauhaus, Rams and CRAP as optional directions; primary book/exhibition locators must be verified before activating each entry |

Source intake must verify section-level content and rights, not merely link the home page. Swiss typography and Gestalt original editions are content-research work in Task 2; leave their entries unavailable until primary bibliography and relevant passages are verified. This plan does not pretend those full original texts were read today.

For ISO and restricted books, store a locator and unavailable/licensed-local status until appropriately licensed material is supplied. A public-source release is usable with explicit gaps. The requested full corpus remains incomplete until these gaps are closed.

## Shared contracts and file layout

All files in this section are NEW unless identified as existing later.

Use src/lib/adi/types.ts as the single TypeScript domain contract:

- DesignContext: intent (discussion/design/build/review-fix/non-ui), platforms[], audience[], primaryActions[], aesthetic[], constraints[], inputMethods[], domain[], surfaces[], referenceIds[], evidence[], uncertainty[], fingerprint.
- SourceRecord: id, publisher, title, edition, canonicalUrl, snapshotUrl, sectionManifest, retrievedAt, contentHash, status, rights (redistributable/licensed-local/metadata-only), coverage.
- ConventionRule: id, sourceId, locator, category, authority (normative/informative/heuristic/aesthetic/project-policy), level?, exactText?, interpretation, applicability, exceptions[], relatedRuleIds[], verificationMethods[].
- ConventionSelection: requiredRuleIds[], advisoryRuleIds[], excluded[{ruleId,reason,evidenceIds}], conflicts[], sourceVersions.
- DesignDecision: id, ruleIds[], componentIds[], targetFiles[], decision, rationale, acceptanceChecks[].
- AdiContract: version:1, id, scope, generation, context, selection, decisions[], planRef, artifactDesignRevision, digest.
- AdiRunState: version:1, runId, scope, phase, contract?, sourceReceipts[], evidenceIds[], mutationGeneration, blockedReasons[], completionReceipt?.
- AdiPhase: classified, selected, planned, implementing, auditing, revising, verified, blocked, interrupted. Explicit non-ui/discussion disposition lives in context and is validated.
- EvidenceRecord: id, runId, contractDigest, workspaceIdentity, sourceFingerprint, previewId, revisionId, captureId, checkId, ruleIds[], provenance, result, artifactRefs[], createdAt.
- CheckResult: pass, fail, not-applicable, needs-human, unmeasured. No unknown → pass conversion.
- CompletionDecision: {status:'ready'|'needs-work'|'blocked', missing:string[], receiptId?:string}.
- AdiServices: {registry, repository, evidence, nativeGate}; concrete interfaces defined with their owning tasks.

IDs and hashes are runtime-issued. Model tools submit decisions or observations referencing existing IDs; they do not supply trusted receipt objects. Preserve source prose as data, not instructions.

Use pure helpers for classification, selection, contract validation and completion. Keep orchestration in adi/runtime.ts rather than making professional-runtime.ts substantially larger.

---

## Task 1 — Registry schema, validation and completeness

**Create:** src/lib/adi/types.ts, schema.ts, registry.ts, registry.test.ts; data/sources.json; data/coverage.json. Paths relative to src/lib/adi unless otherwise stated.

**Interfaces**
- validateSource(value:unknown): SourceRecord
- validateRule(value:unknown, sources:ReadonlyMap<string,SourceRecord>): ConventionRule
- validateContract(value:unknown, registry:ConventionRegistry): AdiContract
- createConventionRegistry(sources:SourceRecord[], rules:ConventionRule[]): ConventionRegistry
- ConventionRegistry.getRule(id:string), getSource(id:string), search(query:ConventionQuery), coverage(): CoverageReport
- ConventionQuery: {text?:string,categories?:string[],platforms?:string[],componentKinds?:string[],cursor?:string,limit?:number}; cap limit at 50.
- CoverageReport reports enumerated, imported, licensed-local, unavailable and explicitly excluded section IDs per edition.

- [ ] Add tests rejecting duplicate rule IDs, nonexistent source/section IDs, missing exceptions, mismatched hashes, fabricated editions and exactText on metadata-only records.
- [ ] Run pnpm exec vitest run src/lib/adi/registry.test.ts; expect failure because the module is absent.
- [ ] Implement validators, deterministic ID lookup and filtered/paginated lexical search. Load small manifests eagerly and rule packs lazily with explicit import mappings.
- [ ] Rerun the command; expect all assertions to pass.
- [ ] Commit: feat(adi): add provenance-aware convention registry.

## Task 2 — Build the actual source library

**Create:** all pack files in the source table; scripts/adi/import-sources.mjs, verify-corpus.mjs, import-sources.test.mjs; docs/adi/source-policy.md.
**Modify:** THIRD_PARTY_NOTICES.md, package.json.

**Interfaces**
- importSource(source:SourceManifest, options:{offline:boolean,licensedPath?:string}): Promise<ImportReport>
- extractSections(sourceId:string, content:string): ImportedSection[]
- verifyCorpus(root:string): Promise<CoverageReport>
- package scripts adi:verify → node scripts/adi/verify-corpus.mjs; adi:import → node scripts/adi/import-sources.mjs.
- SourceManifest includes an explicit section inventory, edition and approved retrieval hosts. ImportReport lists new, changed, missing and rejected sections.

- [ ] Add offline fixtures/tests for missing pages, redirects off approved hosts, changed anchors, edition mismatch, exact-text whitespace normalization, unavailable licensed text and accidental inclusion of a navigation/footer block as a rule.
- [ ] Run node --test scripts/adi/import-sources.test.mjs; expect failed/missing implementation.
- [ ] Import pinned authoritative content; preserve complete source conditions, exceptions and local definitions. Store exact text only when permitted. Keep normalized guidance in interpretation with explicit derivation and source mapping.
- [ ] Populate cognitive and school references from original authors, publishers or primary archival material. Do not activate unverifiable entries.
- [ ] Run node --test scripts/adi/import-sources.test.mjs and pnpm adi:verify. Missing declared sections must fail complete-corpus mode; documented restricted sections produce an explicit partial release report, never a fabricated pass.
- [ ] Commit: feat(adi): add versioned source packs and coverage checks.

The import tool is maintenance-only. The agent cannot silently rewrite the bundled standard during an ordinary build. Updates produce a reviewable source diff.

## Task 3 — Context classification and convention selection

**Create:** src/lib/adi/context.ts, selector.ts, conflicts.ts and corresponding .test.ts files.
**Modify:** src/lib/agent-workflow.ts workflowIntent, specialistPlaybook.

**Interfaces**
- collectDesignSignals(request:RunRequest, workspace:WorkspaceDesignSnapshot): DesignSignals
- classifyDesignContext(signals:DesignSignals, proposal?:unknown): DesignContext
- detectFrontendImpact(change:MutationDescriptor, snapshot:WorkspaceDesignSnapshot): 'frontend'|'non-ui'|'unknown'
- selectConventions(context:DesignContext, registry:ConventionRegistry): ConventionSelection
- resolveConventionConflicts(context:DesignContext, candidates:ConventionSelection): ConventionSelection
- RunRequest: {text, referenceIds, reviewItem?, explicitScope?}; WorkspaceDesignSnapshot: {files, componentKinds, artifactDesign?, platformEvidence, fingerprint}; MutationDescriptor: {tool,input,canonicalPaths?,effect}.

- [ ] Test: CSS-only request; “make this clearer”; Vietnamese frontend request; supplied reference without a build verb; desktop Windows versus macOS target; backend task; unknown shell; solo request; read-only audit; existing brand.
- [ ] Run pnpm exec vitest run src/lib/adi/context.test.ts src/lib/adi/selector.test.ts src/lib/adi/conflicts.test.ts.
- [ ] Use model-assisted structured proposals for ambiguous intent, but validate them against actual project evidence and deterministic scope checks. Missing language/keyword matches must not exempt a UI mutation.
- [ ] Select the full applicable A/AA baseline; use per-criterion applicability instead of discarding entire accessibility groups. Select APG by component type; choose one primary platform family and relevant domain guidance.
- [ ] Record conflicts and exclusions. Accessibility conditions win over visual preferences; conflicting mandatory constraints block with reasons. Existing tokens win over optional stylistic changes unless the request changes identity.
- [ ] Rerun tests; commit feat(adi): classify frontend work and select applicable conventions.

## Task 4 — Persisted contract, source receipts and design decisions

**Create:** src/lib/adi/store.ts, persistence.ts, contract.ts, store.test.ts, contract.test.ts.
**Modify:** src/lib/artifact-design.ts SavedArtifactDesign/createArtifactDesignRepository; src/lib/artifact-tools.ts executeArtifactTool/artifactComponentContract; src/lib/design-job.ts DesignIntent/DesignJob/parseDesignSubmission/approvedDesignIntent/designSubmissionDefinition; src/lib/task-store.ts WorkspaceTask/restoreTasks.

**Interfaces**
- createAdiRepository(storage:AdiStorage): AdiRepository
- AdiRepository.load(scope), read(scope,runId), transact(scope,runId,expectedGeneration,update), subscribe(listener)
- compileDesignContract(context:DesignContext, selection:ConventionSelection, decisions:DesignDecision[], planRef:PlanRef, artifactRevision:number): AdiContract
- validateDecisionCoverage(contract:AdiContract, receipts:SourceReadReceipt[]): CoverageIssue[]
- SourceReadReceipt: runtime-generated {id,runId,ownerId,sourceId,sectionIds,contentHash,createdAt}.
- PlanRef: {id,path?,contentHash}; scope consistently includes canonical workspace and root session.
- Add adiContractId/adiContractDigest references to DesignIntent and DesignJob; store full contracts once.
- Existing ArtifactDesign remains the token/component contract. Add optional ADI linkage; no duplicate independent token system.

- [ ] Test optimistic concurrency, restart round-trip, interrupted state, wrong-workspace receipt, outdated source receipt, decision with nonexistent rule, and legacy jobs lacking ADI fields.
- [ ] Run pnpm exec vitest run src/lib/adi/store.test.ts src/lib/adi/contract.test.ts src/lib/design-job.test.ts src/lib/task-store.test.ts.
- [ ] Implement SQLite storage in desktop and browser storage using existing persistence conventions. Write state before publishing success; preserve failed writes for explicit retry.
- [ ] Reject a planned contract without decisions covering every selected required rule and all applicable visual design categories. General accessibility prose is insufficient.
- [ ] Legacy jobs load as legacy/unverified; resumption prepares ADI before new mutation. Never assign historic work a retroactive pass.
- [ ] Rerun; commit feat(adi): persist source-backed design contracts.

## Task 5 — Model tools and shared orchestration

**Create:** src/lib/adi/tool-definitions.ts, tools.ts, runtime.ts, runtime.test.ts.
**Modify:** src/lib/agent-tools.ts agentToolDefinitions/toolKind/toolLabel/activityFromTool; src/lib/phase-two-catalog.ts readOnlyTools/DeferredToolCatalog; src/lib/professional-runtime.ts RuntimeOptions/ToolOwner/SessionState/definitions/kickoff/instructions/executeFor/native/runAgent/childLoop; src/lib/model-context.ts boundedModelContext.

**Interfaces**
- createAdiRuntime(services:AdiServices, run:AdiRunIdentity): AdiRuntime
- AdiRuntime.prepare(request:RunRequest, snapshot:WorkspaceDesignSnapshot): Promise<AdiRunState>
- beforeTool(call:ToolCall,input:Record<string,unknown>,owner:ToolOwner): Promise<GateDecision>
- afterTool(call:ToolCall,output:ToolOutput,owner:ToolOwner): Promise<void>
- evaluateCompletion(): Promise<CompletionDecision>
- contextFor(owner:ToolOwner): string
- executeAdiTool(name:string,input:Record<string,unknown>,context:AdiToolContext,services:AdiServices): Promise<ToolOutput>.
- Tools: DesignContext(read/refine), ConventionSearch, ConventionRead, DesignPlan(read/submit), DesignChecks(read), DesignDecision(submit).
- Refinement can add context; weakening a mandatory baseline requires a validated applicability decision or explicit user policy change, never model self-authorization.

- [ ] Test no-write-before-plan, missing ConventionRead receipts, false “I read WCAG,” incorrect owner, root/child inheritance, skill fork, no workspace, budget exhaustion and compaction.
- [ ] Run pnpm exec vitest run src/lib/adi/runtime.test.ts src/lib/professional-runtime.test.ts src/lib/phase-two-catalog.test.ts src/lib/model-context.test.ts.
- [ ] Initialize ADI independently of kickoff's delegation choice. Keep kickoff synchronous if useful; add awaited prepareRun before it. Reference inspection delays selection until evidence is read, but never disables the obligation.
- [ ] Place beforeTool before early DesignJob, artifact and Review returns. afterTool records actual source reads, decisions, mutations and evidence, including tools run internally by the workflow.
- [ ] Replace broad tool-name “read-only” assumptions for ADI actions with action-aware effects: reading policy, changing run metadata, mutating project memory and mutating code differ.
- [ ] Expose the next needed tool directly; do not hide essential ADI tools behind optional ToolSearch. Carry a short regenerated contract summary and IDs through compaction; fetch full sections on demand.
- [ ] Propagate contract/digest and inherited restrictions to every child and skill-fork. Solo workflows use the same checks.
- [ ] Rerun; commit feat(runtime): enforce ADI across tool execution.

## Task 6 — Native mutation boundary and revision invalidation

**Create:** src-tauri/src/adi_policy.rs, src-tauri/src/adi_commands.rs, src-tauri/tests/adi_policy.rs; src/lib/adi/native.ts.
**Modify:** src-tauri/src/lib.rs module exports; src-tauri/src/main.rs execute_agent_tool and command registration; src-tauri/src/agent_tools.rs ToolRequest/execute; src-tauri/src/session_tools.rs guard_tool/effective_root; src-tauri/src/run_store.rs RunStore::open (migration) and scoped ADI record methods; src-tauri/src/run_store/schema.sql; src/lib/agent-tools.ts executeAgentTool; professional-runtime.ts native.

**Interfaces**
- Rust AdiPolicyStore::prepare_run(identity, disposition), record_receipt(identity, receipt), commit_contract(identity, contract), authorize_tool(identity, operation), record_mutation(identity, operation_id), verify_completion(identity, evidence_ids).
- guard_tool returns a runtime-generated authorization tied to run/session/worktree/contract generation; the model never supplies authorization fields as tool arguments.
- bind_worktree(identity, canonical_root) preserves the same contract lineage.
- snapshot_workspace(identity) → SourceFingerprint; fingerprint includes tracked and relevant untracked source, styles, assets and build configuration, not only HEAD or HTML.
- Desktop IPC wrappers: adi_prepare_run, adi_read_state, adi_record_receipt, adi_commit_contract, adi_verify_completion. Internal receipt creation validates content against the pinned bundle and trusted browser results.

- [ ] Native tests deny missing/stale/wrong-run contract, path aliases, worktree escape, shell/MCP before preparation, inherited restrictions, contract changes after grant and restart recovery.
- [ ] Run cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test adi_policy; expect failures before implementation.
- [ ] Store contract state in authoritative SQLite records with versioned migration and compare-and-swap generation. Do not trust a model-editable JSON file as authorization.
- [ ] Enforce at execute_agent_tool/agent_tools::execute before any mutating dispatch. Preserve session plan guards and approval checks. Register root runs before the first model call; reject agent mutation calls lacking a run identity. Explicitly distinguish interactive user-owned terminal actions.
- [ ] Treat shell and unknown MCP calls as potentially mutating. In frontend/unknown workspaces require a contract before starting; track background processes and invalidate evidence at mutation start and completion. Only a typed read-only tool or narrowly implemented trusted launcher can bypass this requirement.
- [ ] Restrict pre-plan writes to the exact runtime-owned plan path; this exception cannot run arbitrary shell or write product code. Scope-check artifact/template persistence too.
- [ ] At verification, stop or account for background writers, acquire the run verification lock, compare before/after fingerprints and ensure contract generation remains current. External user edits invalidate the result; do not undo them.
- [ ] Run the native test plus cargo test --manifest-path src-tauri/Cargo.toml --bin taro and relevant TS runtime tests; commit feat(native): guard design mutations with persisted ADI state.

This is a workflow boundary within trusted Taro execution. It does not make arbitrary shell code harmless or prove that an external integration has truthfully described all effects. Unknown external effects remain unverified.


## Task 7 — Enforce completion in chat, Tasks and DesignJob

**Create:** src/lib/adi/completion.ts, completion.test.ts; src/App.adi.test.tsx.
**Modify:** src/App.tsx handleSend/model loop; src/lib/task-runtime.ts createTaskExecutor/start/TaskComplete; src/lib/professional-runtime.ts designJob/runStage/childLoop/settleChildren; src/lib/design-job.ts; src/lib/task-runtime.test.ts.

**Interfaces**
- evaluateDesignCompletion(state:AdiRunState, evidence:EvidenceRecord[], current:VerificationIdentity): CompletionDecision
- ProfessionalToolRuntime.prepareRun(request:RunRequest): Promise<void>
- ProfessionalToolRuntime.finalizeRun(): Promise<CompletionDecision>
- VerificationIdentity: {workspaceIdentity,sourceFingerprint,contractDigest,mutationGeneration,previewId?,revisionId?,threadGeneration?}.
- finalizeRun stops/settles relevant children before taking the verification snapshot and issuing the receipt.

- [ ] Test ordinary chat returning no tools, solo code path, direct task, reference-bearing request, DesignJob read/resume, no configured specialist, child completing early, and a write after an audit.
- [ ] Run pnpm exec vitest run src/lib/adi/completion.test.ts src/App.adi.test.tsx src/lib/task-runtime.test.ts src/lib/professional-runtime.test.ts.
- [ ] In handleSend replace unconditional no-call success with finalizeRun. A needs-work result injects the exact missing steps into the next turn; cap automatic completion-repair prompts at two, within the existing request budget. Then present blocked status and preserved work.
- [ ] Do not suppress normal progress, discussion or explicit blocked explanations. Gate the run's verified-success state, rather than trying to infer every success claim from prose. Show unverified model text as unverified when the gate fails.
- [ ] In TaskComplete use the same validator before provisional completion and again after children settle. Replace the inline review validator with Task 12's structured evidence validator.
- [ ] Designer handoff must reference the contract and decision IDs. Code must reference changed source and actual preview. QA must return criterion-level findings with evidence IDs; a boolean and arbitrary findings strings no longer suffice.
- [ ] Preserve current DesignJob approval behavior. ADI records a plan for ordinary work without introducing a second unconditional user-approval ceremony; inherited plan-mode restrictions still apply.
- [ ] Retain the current bounded two-attempt DesignJob correction loop, but report remaining rules/checks and preserve resume state on exhaustion.
- [ ] Rerun; commit feat(runtime): require verified design completion in every entry point.

## Task 8 — Rule-linked audits and trustworthy evidence

**Create:** src/lib/adi/checks.ts, evidence.ts, checks.test.ts, evidence.test.ts.
**Modify:** src/lib/artifact-audit.ts ArtifactFinding/ArtifactAuditCase/ArtifactAuditReport/validateArtifactAudit; scripts/review-browser.mjs browserPageSnapshot/browserQualitySnapshot/createReviewBrowser.capture/execute; scripts/review-browser.d.mts; src/lib/review-browser.ts BrowserRequest/BrowserCapture; src/lib/review-tools.ts executeReviewTool BrowserAudit; src/lib/review-evidence-storage.ts createReviewEvidenceStorage/evidenceDatabase; src-tauri/src/review_browser.rs Bridge::request and review_browser; related tests.

**Interfaces**
- buildCheckPlan(contract:AdiContract): DesignCheckPlan
- evaluateCheckCoverage(plan:DesignCheckPlan,evidence:EvidenceRecord[]): CheckCoverage
- registerBrowserEvidence(identity:VerificationIdentity, capture:BrowserCapture): EvidenceRecord[]
- validateEvidenceBinding(record:EvidenceRecord, current:VerificationIdentity): void
- DesignCheckPlan: {id,contractDigest,cases:CheckCase[],checks:RequiredCheck[]}.
- CheckCase: {id,route,setupState,viewport,scheme,reducedMotion,zoomMethod,scrollRegion}.
- RequiredCheck: {id,ruleIds,method:'machine'|'visual'|'interaction'|'human',caseIds,blocking,acceptance}.
- BrowserCapture adds runtime-issued captureId, capturedAt, navigationId and source/resource fingerprints. Audit V2 references actual check/case IDs, not an assumed fixed eight-case matrix.

- [ ] Test unsupported contrast paint, missing font, truncated DOM, offscreen content, stale CSS/assets with unchanged HTML, navigation during audit, authenticated state missing in isolated capture, mismatched report IDs, failed keyboard action and manual-only criteria.
- [ ] Run pnpm exec vitest run src/lib/adi/checks.test.ts src/lib/adi/evidence.test.ts src/lib/artifact-audit.test.ts src/lib/review-tools.test.ts; node --test scripts/review-browser.test.mjs.
- [ ] Implement V2 schema and preserve V1 reading. Legacy measured-clear results remain limited machine evidence, never automatically satisfy an ADI contract.
- [ ] Keep measured contrast/layout/spacing checks, but map them to supported rule IDs and explicit limitations. Include source exceptions: for example target-size exceptions and contrast conditions; do not universally require a 44-pixel target or ban every animation.
- [ ] Add DOM/ARIA, keyboard/focus, interaction-state and responsive checks only where actual execution can substantiate them. Tab traversal, modal escape/return focus and empty/loading/error states require fixtures/actions, not screenshots alone.
- [ ] Capture supported route/state/viewport combinations plus below-fold content and chosen visual direction. Retain deterministic fixtures in tests. State that device-scale emulation is not native browser zoom; add real/manual zoom coverage where required.
- [ ] Verify the same build/resource fingerprint across cases. If live content cannot be frozen, report incomplete consistency. Do not re-open a logged-in flow as a logged-out page and call it the same state.
- [ ] Require a visual assessment with evidence for hierarchy, typography, spacing/grouping, alignment, balance, density, color, component consistency and motion. Agent visual judgments are labeled as judgments; assistive-tech or user research checks requiring people remain needs-human.
- [ ] Persist trustworthy browser receipts before returning tool success. A model-authored report with plausible IDs is rejected.
- [ ] Rerun; commit feat(review): bind design audits to rules and rendered revisions.

## Task 9 — Make annotation work on live and saved previews

**Create:** src/lib/review-anchors.ts, review-anchors.test.ts; src/components/review-browser-canvas.test.tsx.
**Modify:** src/components/review-browser-canvas.tsx click/pointFor/position/run, wheel effect and keyboard/paste handlers; src/components/review-comments.tsx CommentComposer/ReviewThreadCard; src/components/review-canvas.tsx ReviewThreadsPanel; src/components/review.css; src/lib/review-store.ts ReviewAnchor/ReviewThread/restore; src/components/nike-review-canvas.tsx adapter for existing demo anchors.

**Interfaces**
- viewportPointToDocument(point:Point, transform:PreviewTransform): Point
- documentPointToCanvas(point:Point, transform:PreviewTransform): Point
- createReviewAnchor(input:AnchorInput): ReviewAnchorV2
- resolveReviewAnchor(anchor:ReviewAnchorV2, capture:BrowserCapture): AnchorResolution
- AnchorResolution: {status:'exact'|'missing'|'ambiguous'|'historical',rect?:ReviewRect,candidates?:ReviewComponent[]}.
- ReviewAnchorV2: original document point, viewport/scroll, selector?, semantic fingerprint?, captureId?, revisionId, normalized point within element?, frame path?, evidence kind live/saved/coordinate-only.
- Point: {x:number,y:number}; PreviewTransform: {scale:number,scrollX:number,scrollY:number,canvasOffset:Point}.

- [ ] Reproduce/test the code-confirmed saved-mode dead button. Add zoom 0.25/1/2 and fit; scroll offsets; missing selector; browser offline; old revision; delayed capture; narrow canvas; nested scroller; inaccessible frame; keyboard-only annotation.
- [ ] Run pnpm exec vitest run src/lib/review-anchors.test.ts src/components/review-browser-canvas.test.tsx src/components/review-comments.test.tsx.
- [ ] Replace click's unconditional saved return with local capture annotation. Saved mode may select a known captured component; otherwise create a clearly labeled coordinate-only pin. Never navigate the live site for historical annotation.
- [ ] Keep selection and prototype input mutually exclusive. Track capture generation during click/inspect; discard stale replies after revision/navigation changes.
- [ ] Move floating thread/composer UI outside the remote-input viewport, or filter all forwarding handlers by an explicit preview-surface target. Wheel, paste, IME input and keyboard shortcuts inside a composer must not reach the remote browser.
- [ ] Add focused component → comment keyboard action, Escape to cancel/close, initial textarea focus and focus restoration. Preserve body when requests fail; clamp or dock composer on narrow panels without hiding controls.
- [ ] Store stable IDs/semantic fingerprints where available; selector-only nth-child matches are not identity. Cross-origin iframe/shadow targets lacking supported inspection get coordinate-only anchors and visible limitations.
- [ ] Migrate old percent/document anchors lazily without changing their original positions.
- [ ] Rerun; commit fix(review): support reliable annotation across preview modes.

## Task 10 — Idempotent comment saves and task synchronization

**Create:** src/lib/review-comment-service.ts, review-comment-service.test.ts; src/lib/review-work-items.test.ts.
**Modify:** src/components/review-state.ts useReviewComments; src/lib/review-tools.ts BrowserComment path; src/lib/review-store.ts addReviewComment/replyToComment/resolveComment/restore/createReviewRepository; src/lib/review-persistence.ts; src/lib/review-work-items.ts syncReviewWorkItem; src/lib/task-store.ts reviewItem.

**Interfaces**
- createReviewCommentService(repository:ReviewRepository,tasks:TaskRepository): ReviewCommentService
- service.post(scope:ReviewScope, request:PostReviewComment): Promise<CommentSaveResult>
- service.reply(scope:ReviewScope, request:ReplyReviewComment): Promise<CommentSaveResult>
- service.setStatus(scope:ReviewScope, request:ReviewStatusChange): Promise<CommentSaveResult>
- service.retrySync(scope:ReviewScope): Promise<void>
- Post/Reply/Status requests carry a stable clientMutationId and expected thread generation; post additionally carries fixed preview/revision IDs, body, author and anchor.
- CommentSaveResult: {threadId,saved:true,sync:'complete'|'pending',warning?:string}.
- ReviewState V2 adds a small durable projection outbox: {mutationId,threadId,operation,attempts,lastError?}[].

- [ ] Test rapid double submission, retries, reload after save-before-sync crash, task-store write failure, comment-store failure, concurrent user/agent reply, resolve/reopen and wrong-scope request.
- [ ] Run pnpm exec vitest run src/lib/review-comment-service.test.ts src/lib/review-work-items.test.ts src/lib/review-store.test.ts src/lib/review-tools.test.ts.
- [ ] Save the comment mutation and pending projection together in one Review repository transaction. Drain projection after commit; acknowledge saved/pending-sync separately from save failure.
- [ ] Reuse deterministic task ID review:session:preview:thread. Retry the same mutation ID; never generate a new thread on retry. Deduplicate message mutations too.
- [ ] Refresh task description/context after replies; synchronize thread state without turning manual resolution into a verified code fix. Reopening a completed review task makes it actionable again and invalidates previous completion evidence.
- [ ] Route both UI and agent BrowserComment through this service. Reconcile pending projections on scope load/startup; retain visible retry affordance.
- [ ] Migrate V1 state safely, including previously unsaved snapshots; do not delete existing stored content on parse failure.
- [ ] Rerun; commit fix(review): persist comments and synchronize tasks idempotently.

## Task 11 — Explicit Review-to-agent handoff and feedback consumption

**Create:** src/lib/review-feedback.ts, review-feedback.test.ts.
**Modify:** src/components/review-comments.tsx ReviewThreadCard; src/components/review-canvas.tsx ReviewCanvas/ReviewThreadsPanel; src/components/review-browser-canvas.tsx callbacks; src/App.tsx modelContent/handleSend/ReviewCanvas props; src/data/mentions.ts ChipKind/ChipRef/chipIcon; src/components/mention-chip.tsx MentionChip/chipStyles; src/components/composer.tsx Composer/toSegments/insertChip/serialize; src/lib/professional-runtime.ts prepareRun/instructions; src/lib/task-runtime.ts start; src/components/tasks-board.tsx TasksBoard/TaskDetail/openTaskReview and existing executor.start action.

**Interfaces**
- ReviewReference: {scope:ReviewScope,previewId:string,revisionId:string,threadIds:string[]}
- loadReviewFeedback(reference:ReviewReference, repository:ReviewRepository): Promise<ReviewFeedback>
- buildReviewFixRequest(feedback:ReviewFeedback): RunRequest
- queueReviewFix(reference:ReviewReference,target:'composer'|'task'): Promise<QueuedReviewFix>
- ReviewFeedback includes current generation, full requested threads, anchor resolution, linked rules, original capture and current revision metadata.
- QueuedReviewFix: {reference,taskId?,chip?}; no model execution side effect.

- [ ] Test selected thread/group handoff, no file workspace, stale revision, cross-chat scope, resolved/reopened thread, unread feedback and composer-chip serialization.
- [ ] Run pnpm exec vitest run src/lib/review-feedback.test.ts src/components/composer.mentions.test.tsx src/lib/task-runtime.test.ts src/App.adi.test.tsx.
- [ ] Add Send to agent and Open task actions, reusing the existing composer/task controls. A review chip carries IDs rather than pretending a visual anchor is a document line range.
- [ ] Resolve the chip to current structured feedback before model execution. modelContent must not reduce it to a label; use bounded structured context with on-demand retrieval for large threads.
- [ ] Read relevant unresolved feedback automatically when continuing an authorized design run on the same preview. Record whether each linked issue is accepted, needs clarification, out of scope or resolved with evidence.
- [ ] Do not force every unrelated unresolved thread into a build. Bind feedback scope to assigned thread IDs and audited rule findings.
- [ ] No workspace: allow discussion and annotation; report code fixing unavailable. Manual task execution uses the existing task executor, not a second asynchronous agent loop.
- [ ] Rerun; commit feat(review): route pinned feedback into agent work.

## Task 12 — Verified fixes and revision-aware resolution

**Create:** src/lib/review-resolution.ts, review-resolution.test.ts.
**Modify:** src/lib/review-store.ts ReviewThread; src/lib/review-tool-definitions.ts BrowserComment schema; src/lib/review-tools.ts executeReviewTool; src/lib/task-runtime.ts assertReviewVerified/TaskComplete; src/lib/review-work-items.ts syncReviewWorkItem; src/components/review-comments.tsx ReviewThreadCard.

**Interfaces**
- proposeReviewResolution(thread:ReviewThread,target:ResolutionTarget,evidenceIds:string[]): ResolutionProposal
- validateReviewResolution(proposal:ResolutionProposal,services:ResolutionServices): Promise<VerifiedResolution>
- applyReviewResolution(state:ReviewState,resolution:VerifiedResolution): ReviewState
- ResolutionTarget: {previewId,revisionId,anchor:ReviewAnchorV2,sourceFingerprint}.
- VerifiedResolution includes sourceThreadId, sourceThreadGeneration, originalRevisionId, verifiedRevisionId, contractDigest, evidenceIds, disposition:'fixed'|'no-change', explanation, verifiedAt, receiptId.
- Manual status changes remain possible and are labeled manual; they do not carry a machine-verification receipt.

- [ ] Test fabricated audit ID in reply, unrelated passing audit, newer revision with unchanged broken state, selector now matching a different element, outdated thread generation, manual resolve, reopened issue and independent simultaneous fixes.
- [ ] Run pnpm exec vitest run src/lib/review-resolution.test.ts src/lib/review-tools.test.ts src/lib/task-runtime.test.ts.
- [ ] Replace string search for an audit ID with stored evidence lookup and target/rule assertion checks.
- [ ] Preserve the original thread/revision. Attach verified target mapping on the corrected revision. If mapping is missing/ambiguous, require re-anchoring and confirmation; never silently retarget.
- [ ] Allow a justified no-change disposition for already-fixed/incorrect feedback with current evidence. Do not force a meaningless new revision just to satisfy today's task check.
- [ ] A fresh generation of messages after verification invalidates completion until reviewed. Resolving an assigned thread requires current corrective evidence; manual closure alone does not complete a code-fix task.
- [ ] Rerun; commit feat(review): verify fixes before resolving agent work.

## Task 13 — Make ADI decisions and progress visible

**Create:** src/components/adi-contract-panel.tsx, adi-contract-panel.test.tsx; src/lib/adi/activity.ts, activity.test.ts.
**Modify:** src/components/plan-artifact.tsx PlanArtifact; src/components/artifact-audit-panel.tsx ArtifactAuditPanel/AuditImageViewer; src/components/tasks-board.tsx TasksBoard/TaskDetail/DesignComparison; src/components/tool-result-row.tsx ToolResultRow; src/lib/agent-progress.ts advanceThought/settleThought/recoverThoughts; src/lib/activity-store.ts createActivityStore/recordDesignActivity; src/data/mock.ts only where its discriminated UI types need new metadata; docs/agent-tools.md, docs/review-mode.md, docs/workspace-runtime.md.

**Interfaces**
- AdiContractPanel({state,onOpenSource,onRetry}:AdiContractPanelProps)
- projectAdiActivity(event:AdiEvent): ToolActivity
- adiProgress(state:AdiRunState): {label:string,detail:string}
- AdiEvent: runtime-issued {id,runId,stage,status,contractId?,ruleIds?,evidenceIds?,reason?,timestamp}.

- [ ] Test stage/progress order, failed source load, source edition display, limited corpus coverage, visible conflicts, blocked tool result, unknown audit checks, manual versus verified comment closure and restart restoration.
- [ ] Run pnpm exec vitest run src/components/adi-contract-panel.test.tsx src/lib/adi/activity.test.ts src/lib/agent-progress.test.ts src/components/plan-artifact.test.tsx.
- [ ] Show context, selected conventions with original-source links, decisions, conflict resolutions, verification and pending feedback in the existing Plan/Review/Tasks surfaces.
- [ ] Record real tool work, not decorative checklist completion. Use stable event IDs to deduplicate replay/resume. Surface “Checking contrast,” “Inspecting keyboard focus” and concrete blockers.
- [ ] Label machine findings, agent judgments and human verification separately. Display partial-source availability and incomplete checks in ordinary product language.
- [ ] Documentation explains the full comment path and ADI obligation, including unavailable browser or licensed corpus cases.
- [ ] Rerun; commit feat(ui): expose design decisions and verification progress.

## Task 14 — Reproducible acceptance suite and rollout

**Create:** scripts/adi-review-ui-check.mjs; src/lib/adi/acceptance.test.ts; docs/adi/acceptance.md.
**Modify:** package.json, pnpm-lock.yaml; scripts/review-ui-check.mjs, scripts/comments-editable-check.mjs and scripts/composer-comment-check.mjs to use the installed Playwright package and configurable base URL.

**Interfaces**
- Browser scripts accept TARO_BASE_URL (default http://127.0.0.1:1427) and TARO_BROWSER_CHANNEL (optional); output evidence to a task-specific verification directory.
- Add test:adi → vitest run src/lib/adi; test:review-ui → node scripts/adi-review-ui-check.mjs.
- No production dependency on Playwright. The native helper remains dependency-free and self-contained under include_str!/--eval; do not introduce relative ESM imports that break packaged execution.

- [ ] Write acceptance tests with a scripted provider that attempts to skip each obligation. Cover all entry points, unavailable specialists, solo, source updates, restart, source/asset mutations, review retry and evidence forgery.
- [ ] Verify failure first with pnpm test:adi and pnpm test:review-ui.
- [ ] Build the end-to-end fixture: create preview → choose Annotate → click → type/paste/format → post → reload → reply → Send to agent → run task → enforce ADI → edit real file → save same preview's new revision → audit → verify resolution.
- [ ] Exercise that sequence in browser dev mode and Windows Tauri mode. Repeat saved-capture annotation with the browser service disconnected. Check keyboard-only and narrow layouts.
- [ ] Run the release commands below and record exact results/limitations in docs/adi/acceptance.md.
- [ ] Commit test(adi): cover enforced design and review feedback workflows.

### Release verification commands

Run once the relevant implementation exists; these commands were not run for this planning task.

1. pnpm adi:verify
2. pnpm exec tsc --noEmit
3. pnpm test
4. pnpm build
5. node --test scripts/review-browser.test.mjs scripts/adi/import-sources.test.mjs
6. cargo test --manifest-path src-tauri/Cargo.toml --no-default-features
7. cargo test --manifest-path src-tauri/Cargo.toml --bin taro
8. Start pnpm dev --host 127.0.0.1 --port 1427, then run pnpm test:review-ui.
9. Launch pnpm desktop:dev and run the native acceptance scenarios, including persistence after restart, native gate refusal and packaged-browser availability.

A missing Node/browser prerequisite is a failed readiness check with setup guidance. It must not be recorded as a passing visual audit.

## Delivery sequence

| Milestone | Tasks | Reviewable outcome |
|---|---|---|
| Review reliability | 9–10 | Annotation works, saves are idempotent, Tasks synchronization recovers |
| Registry and contract | 1–4 | Inspectable actual corpus, coverage report, contextual selection and persisted decisions |
| Runtime obligation | 5–7 | Every supported agent path obeys write and completion gates |
| Verification | 8 | Rule-linked, revision-bound machine and manual evidence |
| Feedback completion | 11–12 | User can send comments to an agent and see verified fixes |
| Product visibility and release | 13–14 | Visible progress, documented limitations, repeatable acceptance suite |

Dependencies: 1 → 2/3; 1+3 → 4; 4 → 5; 4+5 → 6/7; 4+6 → 8; 9 → 10; 5+10 → 11; 8+10+11 → 12; 7+8+12 → 13; all → 14.
Task numbers identify work packages, not a requirement to postpone Review reliability until after the registry.

## Definition of done

- Every family in the supplied blueprint has an explicitly covered/versioned manifest or a clearly reported unavailable-source dependency. Full-corpus status requires closing those dependencies.
- Original-source text, Taro interpretations and project policy are distinguishable. Every active rule resolves to its exact source section.
- Required design steps are enforced even when no specialist is used and no DesignJob was launched.
- A model cannot obtain verified success by only promising it followed guidelines, reading one arbitrary source, posting a fabricated audit ID, or closing a thread manually.
- All actual frontend mutations invalidate prior verification, including relevant CSS/assets, shell and child changes.
- Live and saved Review comments survive reload, task-sync failure, retries, replies, resolution and reopening without duplication.
- Assigned feedback reaches the model with its real scope and anchor; fixes have current evidence and immutable history.
- Offline/public-source operation works with honest limitations. Missing licensed text and human-only verification remain visible.
- Repeated build/audit corrections stop at the defined budget and leave resumable evidence.
- No success claim relies on the audit label measured-clear alone.

## Expected change size and planning limits

This is a runtime feature plus a source-corpus project, not a prompt patch. Keep the tasks as separate reviewable commits; do not squash source provenance, native enforcement and annotation behavior into one opaque change.

The main uncertainty is content intake/rights and complete manual-verification coverage, not where the code hooks belong. The exact UI failure reported by the user still needs reproduction in Task 9; the dead saved-capture annotation and non-atomic save/sync path are already visible in source.

The shell runner in this planning session failed during sandbox initialization. Source files were inspected through filesystem access instead. No test suite or interactive reproduction was executed, and no product code was changed.

## Interface completion notes

The type declarations above are contracts to implement, not existing exports. Avoid anonymous cross-module records with drifting field names.

- AdiRunIdentity: {runId:string,rootRunId:string,scope:ReviewScope,ownerId:string,workspaceIdentity:string}.
- AdiStorage: read(key:string):Promise<string|null>; compareAndSwap(key:string,expectedGeneration:number,payload:string):Promise<boolean>. Missing key has generation 0.
- AdiToolContext: {identity:AdiRunIdentity,owner:ToolOwner,signal:AbortSignal}; services use the AdiRepository and ConventionRegistry defined above.
- GateDecision: {allowed:boolean,reason?:string,nextTool?:string,contractDigest?:string}.
- Plan submission accepts structured DesignDecision[] and a PlanRef; serialized plan Markdown is a projection, not independent policy state.
- Runtime-generated receipts are immutable after creation. Their IDs are looked up in the authoritative store; caller-supplied fields never substitute for a lookup.
- Mutation effects are enum read, run-metadata, project-design, workspace-write, external-unknown. Default for an unknown tool/action is external-unknown.
- Native API types mirror the serialized TS contracts using serde camelCase. AdiPolicyStore methods return Result<T,String>; identity is &AdiRunIdentity, operation is &MutationOperation, receipts/contracts are validated persisted records. prepare_run/record_receipt/commit_contract/record_mutation return AdiRunState; authorize_tool returns MutationAuthorization; verify_completion returns CompletionDecision; bind_worktree returns AdiRunState.
- MutationOperation: {operationId,tool,inputHash,effect,canonicalPaths}; MutationAuthorization: {id,runId,contractDigest,generation,operationId}. Native authorization is scoped and consumed for the named dispatch, not a reusable boolean.
- AdiServices.nativeGate owns these native operations; browser-only tests use a deterministic implementation with identical transition rules, not fake passing evidence.
- ResolutionServices: {reviews:ReviewRepository,adi:AdiRepository,evidence:EvidenceRepository,anchors:{resolve:typeof resolveReviewAnchor}}.
- EvidenceRepository: read(id:string):Promise<EvidenceRecord|null>; list(runId:string):Promise<EvidenceRecord[]>; appendTrusted(record:EvidenceRecord):Promise<void>. Only browser/runtime adapters call appendTrusted, never a model-facing tool.

## Self-review completed for this plan

- All six blueprint categories and every named source family are assigned to corpus tasks; unverified original bibliography is explicitly held unavailable.
- Runtime integration includes root chat, tasks, DesignJob, ordinary Agent, skill forks, solo execution, worktrees, native shell/MCP and completion.
- Comment integration includes input, anchoring, persistence, task projection, explicit handoff, evidence, resolution and migration.
- Current functions are separated from new proposed interfaces; tests include failure paths rather than only prompt text assertions.
- No implementation, live reproduction or passing-test result is claimed by this document.
