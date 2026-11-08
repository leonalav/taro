# Agent Foundation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. If the execution environment supplies relevant skills, follow them without reopening decisions already specified. Steps use checkbox (`- [ ]`) syntax for tracking. The user has selected a future cloud-agent implementation; this document is the handoff, not a request to start product edits in the planning chat.

**Goal:** Ship safe review/restore, durable long-task context/recovery and scoped project guidance, represented by minimalist groupable artifacts.

**Architecture:** Rust owns filesystem/Git operations, execution journals, instruction discovery and a dedicated SQLite ledger. TypeScript owns provider-independent orchestration and summary construction; React renders the same typed activities for live events and Nike previews. Existing chat storage stays compatible and projects ledger events without becoming its authority.

**Tech Stack:** Existing React 19, TypeScript, Tauri 2, Rust, SQLite, Git CLI, Vitest and Rust tests. Add direct native SQLite/content-hash dependencies only where necessary; do not import Bun/Effect/Python runtimes from references.

**Spec:** `docs/superpowers/specs/2026-11-08-agent-foundation-design.md`

## Global constraints

- Clone and inspect all five repositories FIRST using `docs/cloud-agent-foundation-handoff.md`; record pinned SHAs before product edits.
- All new artifacts must be row-groupable and use incumbent activity-row geometry, including the Design Plan entry. Its Open action uses the existing Markdown editor route; do not introduce another standalone document card.
- Preserve existing approvals, scopes, native plan restrictions, read-only children and historical chat compatibility.
- Preserve full transcripts; compact only model-visible projections. Persist side-effect intents before execution; never auto-repeat an unknown outcome.
- Implement the spec's exact proposed defaults, expose settings where specified, and record evidence for necessary deviations.
- No simulated source-control success in real workspace routes, no forced reset/clean, no automatic user commits, no opaque wholesale framework port.
- Do not run Taro's test discovery inside `refs/`. Do not commit cloned sources or generated build directories.
- Use the existing native process cancellation/deadline mechanisms; execution hooks must not bypass approvals. Keep locks out of model/approval waits.

## Review focus

1. A user edits the same file after the agent: restore refuses stale preview and preserves those bytes (Tasks 5 and 6).
2. App dies after a command succeeds but before its outcome saves: restart reports uncertainty and does not replay it (Tasks 3 and 10).
3. A child compacts or crosses into a worktree: root rules/cache stay intact and child guidance matches its actual root (Tasks 8, 9 and 11).
4. A stored Nike conversation contains edited plans and old row states: upgrades preserve content and add previews once (Tasks 1 and 12).
5. A Linux cloud runner cannot validate Windows process/permission behavior: report exact unverified cases without weakening platform code (Task 13).

## File ownership and interfaces

Create focused files instead of adding another large subsystem directly to App.tsx. Names below are prescribed destinations; equivalent renames require a manifest entry explaining why.

| File | Responsibility |
|---|---|
| `src/data/foundation.ts` | Serializable activity/result/state and scope contracts; no IO |
| `src/data/foundation-previews.ts` | Nike sample data and idempotent migration |
| `src/components/foundation-row.tsx` | Expanded operation-specific detail/actions inside the incumbent activity layout |
| `src/lib/foundation-events.ts` | Stable IDs, lifecycle projection, legacy status conversion and group aggregation |
| `src/lib/foundation-native.ts` | Typed Tauri bridge for commands below |
| `src/lib/run-controller.ts` | Root lifecycle, shared accounting, durable boundaries and stop/continue |
| `src/lib/context-manager.ts` | Context epochs, compaction and operational rehydration |
| `src/lib/project-instructions.ts` | Context injection/provenance, not filesystem reads |
| `src/lib/run-recovery.ts` | Reconciliation UI/model flow for interrupted root/child work |
| `src-tauri/src/run_store.rs` | Versioned SQLite ledger and transactional repositories |
| `src-tauri/src/file_checkpoints.rs` | Scoped before-images, content store, quotas/retention |
| `src-tauri/src/git_review.rs` | Real Git status/diff/stage/unstage/commit and snapshot adapter |
| `src-tauri/src/checkpoint_restore.rs` | Preview-bound restore/redo journal and conflict detection |
| `src-tauri/src/project_instructions.rs` | Scoped discovery, includes, rules, source hashes and bounds |
| `src-tauri/src/run_recovery.rs` | Exclusive ownership, orphan/tool reconciliation and attempt accounting |

Modify: `src/data/mock.ts`, `src/data/phase-two.ts` only where shared contracts require it; `src/components/chat-message.tsx`, `git-panel.tsx`, existing permission components, `src/App.tsx`, `src/lib/professional-runtime.ts`, `phase-two-catalog.ts`, `model-context.ts`, `model-stream.ts`, `chat-db.ts`, settings types/UI, `src-tauri/src/main.rs`, `agent_tools.rs`, `session_tools.rs`, `phase_two_tasks.rs`, `Cargo.toml`, and `vite.config.ts` or a dedicated Vitest config.

Shared contracts must include `Scope = {workspaceRoot, sessionId, runId, parentRunId?}`, `Operation = {id, attemptId, scope, kind, state, reason?, coverage?, result?}` and `FoundationEvent = {id, sequence, operationId, runId, timestamp, payload}`. Generate matching Rust serde contracts and TypeScript types or enforce JSON round-trip fixtures. Do not trust a frontend-supplied canonical root, approval boolean or filesystem path without native validation and established scope checks.

Native command names to expose: `foundation_begin_run`, `foundation_reserve_request`, `foundation_record_exchange`, `foundation_record_tool_intent`, `foundation_record_tool_outcome`, `foundation_finish_run`, `foundation_load_run`, `foundation_list_recoverable`, `foundation_prepare_resume`, `foundation_save_context`, `foundation_checkpoint`, `foundation_review`, `foundation_restore_preview`, `foundation_restore_apply`, `foundation_git_status`, `foundation_git_diff`, `foundation_git_stage`, `foundation_git_unstage`, `foundation_git_commit_preview`, `foundation_git_commit_apply`, `foundation_instructions`. Inputs carry established scope and typed options; outputs are typed records, never unvalidated text parsed for success. Destructive commands bind to one-time approval tokens and expected versions. `foundation_reserve_request(rootRunId, attemptId, kind)` atomically/idempotently reserves allowance before provider dispatch; it is not a frontend check followed by a later increment.

## Task 0: reference acquisition and baseline

**Files:** create `docs/agent-foundation-reference-manifest.md`; configure tests in `vite.config.ts` or `vitest.config.ts` only after cloning. References: the entire exact reading map in the brief.

- [ ] Clone all five required repositories; verify remotes, reviewed commits and actual file existence. Read Taro instructions and applicable reference instructions while working in those trees. Keep foreign runtime guidance out of Taro prompts.
- [ ] Fill manifest with source -> symbols -> destination -> test cases -> provenance/notice handling. Explicitly include Claude Code, OpenCode, Aider, SWE-agent and mini-swe-agent.
- [ ] Run baseline `pnpm exec vitest run --exclude 'refs/**'`, `pnpm exec tsc --noEmit`, `pnpm build`, `cargo test --manifest-path src-tauri/Cargo.toml`. Install Taro dependencies and host prerequisites as needed; record environment failures separately from code failures. Earlier Windows checks were 122 frontend tests/71 native tests; counts may have changed.
- [ ] Make ordinary `pnpm test` discover only Taro tests, retaining jsdom annotations already used by component tests. Prove reference tests are excluded without hiding Taro failures.
- [ ] Commit only manifest/test configuration as `test: scope checks to Taro sources` if this checkout permits commits.

## Task 1: shared artifact contract and full Nike state gallery

**Files:** create `src/data/foundation.ts`, `foundation-previews.ts`, `src/lib/foundation-events.ts`, `src/components/foundation-row.tsx` and corresponding `.test.ts`/`.test.tsx`; modify `mock.ts`, `chat-message.tsx`, `chat-db.ts` and browser-load upgrade in `App.tsx`. References: incumbent `ActivityGroup`/`InlineEdit`/`ToolResultRow`, Phase 2 migration, Claude `MessageSelector.tsx` for distinctions only.

**Interfaces:** `upgradeFoundationPreviews(thread: Thread): Thread`; `projectFoundationEvent(previous: Operation | undefined, event: FoundationEvent): Operation`; `aggregateActivityState(activities): GroupState`. New row detail is a discriminated payload on the shared activity, not a new standalone message per feature. Action callbacks consume operation IDs/tokens, not raw filesystem paths.

- [ ] Write `foundation-previews.test.ts`: applying migration twice yields one copy of each sample; unrelated threads and custom plan Markdown are byte-for-byte preserved; every spec matrix state has an explicit sample key.
- [ ] Write `foundation-events.test.ts`: legacy done mapping, mixed running/failure visibility, cancellation neutrality and stale/out-of-order sequence handling.
- [ ] Write renderer tests for shared row shell, keyboard expansion, disabled stale actions, sample-only callback isolation, pending approval, partial restore and unknown outcomes. Define the spec's typed action registry with operation/state admission and approval rules; assert every matrix action has an entry.
- [ ] Run the focused files and confirm the tests fail before implementing missing behavior.
- [ ] Implement one production renderer, inline approval presenter and groupable Design Plan row with the existing Markdown Open route. Extend `src/lib/artifact-documents.ts` for an independent document payload and preserve saved edits. Fixture shows a short labeled sample sequence plus collapsed state gallery; no native mutations.
- [ ] Run focused tests, inspect 320px and desktop screenshots with all meaningful expanded states, and record captures under `docs/previews/agent-foundation-*`. Check 200% zoom, long paths, reduced motion and focus. A mock preview is not native proof.
- [ ] Commit `feat: add compact agent foundation artifact states`.

## Task 2: native durable ledger and safe API boundary

**Files:** create `run_store.rs`, `foundation-native.ts`; register commands/state in `main.rs`, update Cargo dependencies and native unit tests. References: OpenCode `session/store.ts`, `session/execution.ts`, `session/history.ts`; Claude `sessionStorage.ts`.

**Interfaces:** `RunStore::begin(scope, limits) -> RunRecord`; `append_exchange(run_id, exchange) -> sequence`; `record_intent(tool_intent) -> ToolAttempt`; `record_outcome(attempt_id, outcome) -> ()`; `save_context(run_id, expected_epoch, context) -> ContextEpoch`; `finish(run_id, terminal_state)`. Use a dedicated `foundation.sqlite` under Tauri app data, owned by native Rust. Keep UI `taro.db` separate; join by stable IDs. Add direct `rusqlite` and `sha2` if needed, pin through Cargo.lock, use parameterized SQL and schema migrations.

- [ ] Test transaction rollback, reopening the database, unique event/attempt IDs, ordered replay, root/child scope isolation, unsupported migration and simulated disk/write errors.
- [ ] Implement tables: runs (claims/counters/limits/modes), exchanges, tool_attempts (intent/started/outcome/unknown), events, checkpoints (coverage/content refs), restore_journals, context_epochs, instruction_sources and child_jobs. Store persisted tool output references plus bounded previews; don't duplicate large output bodies into every event.
- [ ] Complete durable writes before acknowledging operations; use appropriate SQLite synchronous/transaction settings. Never hold the connection mutex through network requests or approval waits.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml run_store`; verify JSON contracts through frontend fixtures; commit `feat: persist agent run boundaries`.

## Task 3: integrate write-ahead intents with the existing loop

**Files:** create `run-controller.ts` with tests; modify `App.tsx`, `professional-runtime.ts`, `agent_tools.rs`, `phase_two_tasks.rs`, model bridge as needed. References: mini `default.py`; OpenCode execution/store and step boundary; Claude transcript flow.

**Interfaces:** `RunController.begin(input)`, `beforeModelRequest(owner)`, `recordModelExchange(exchange)`, `executeTool(call, owner, execute)`, `pause(reason)`, `finish(outcome)`. Each method waits for the ledger boundary it owns. Child owners inherit root accounting and preserve existing permission decisions.

- [ ] Test no side effect executes when intent persistence fails, outcome persistence failure produces unknown/paused, repeated UI events deduplicate, stop preserves partial output, and a child uses the same root counters. Register shell writers before spawn and keep them registered past background launch until verified process-tree termination; journal uncertain ownership across restart.
- [ ] Route every root and child model/tool cycle through these interfaces. Native dispatcher independently journals side effects before mutation; ensure frontend/native hooks share the same attempt ID and never double-count. Snapshot/approval waiting are separate states.
- [ ] Persist plan/worktree identity and loaded-tool/skill metadata at boundaries. Existing static module maps become caches of durable records, not recovery authority.
- [ ] Run `pnpm exec vitest run src/lib/run-controller.test.ts src/lib/professional-runtime.test.ts src/App.progress.test.tsx` and native dispatcher tests. Commit `feat: journal model and tool execution`.

## Task 4: file checkpoints in all project folders

**Files:** create `file_checkpoints.rs`; modify native Write/Edit/NotebookEdit paths. References: Claude fileHistory and three tool tracking call sites; Aider pre-edit lifecycle.

**Interfaces:** `capture_before(scope, attempt_id, paths) -> Checkpoint`; `capture_after(scope, attempt_id, paths) -> Checkpoint`; `load_bytes(checkpoint_id, relative_path) -> Existing(bytes, mode) | Absent`; `coverage(checkpoint_id) -> Coverage`.

- [ ] Test exact byte restoration candidates, absent vs empty, notebook whole-file preservation, permission metadata, repeated tracking not replacing before-images, backup failure blocking mutation, content dedup, quota/retention, Unicode/case normalization, links/junction escape and concurrent writers.
- [ ] Store immutable content blobs outside the workspace in app data, keyed by hash; use atomic temp-write/rename and durable metadata references. Check symlinks at IO time. Serialize workspace writes with cancellable acquisition; never depend on a React state updater for native correctness.
- [ ] Capture first, durably record coverage, then execute approved mutation and record after-image/outcome. On explicit continue-without-coverage, retain a visible uncovered marker.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml file_checkpoints` and existing `agent_tools` tests. Commit `feat: checkpoint native file edits`.

## Task 5: real Git review and repository snapshots

**Files:** create `git_review.rs`; replace seed-backed `git-panel.tsx`; add `src/lib/git-review.ts`/tests for panel state/bridge. References: OpenCode snapshot/git/VCS/patch/diff; Aider repo.

**Interfaces:** `status(scope) -> GitStatus`; `diff(scope, selection, expected_version) -> Review`; `capture_tree(scope) -> TreeCheckpoint | Unsupported`; `stage/unstage(scope, paths, expected_index) -> GitStatus`; `commit_preview(scope, message) -> CommitPreview`; `commit_apply(preview_token, approval) -> CommitResult`.

- [ ] Test temp repositories: dirty/pre-staged separation, untracked/ignored/oversized/binary files, renamed/deleted files, NUL-delimited unusual paths, unborn/detached state, bounded patches, corrupted private index recovery and user-index/HEAD preservation during snapshot capture.
- [ ] Adapt Git plumbing into Rust argument arrays with process deadlines and cancellation. Use private git directory/index for snapshots and literal pathspecs; do not change normal staging to create checkpoints.
- [ ] Test commit hooks reject/time out, identity/signing failure, concurrent HEAD/index mutation and ambiguous completion. Verify actual HEAD/status before returning a SHA. Stage/unstage/commit approvals bind the exact preview/version.
- [ ] Replace all fake commits, fake SHA generation, sample branch/status and fake Revert notifications in the real panel; render ordinary-folder and Git-missing states. Sample data remains only in the labeled Nike gallery.
- [ ] Capture trees around mutating batches, including approved shell operations. Mark external MCP/non-Git shell coverage explicitly. Serialize captures/mutations per canonical worktree; avoid labeling time-window changes as proven authorship.
- [ ] Run native `git_review` tests and frontend `git-panel`/`git-review` tests; commit `feat: connect real source control and run diffs`.

## Task 6: preview-bound restore, redo and partial failure recovery

**Files:** create `checkpoint_restore.rs`, restore bridge/presenter tests; modify review row/panel action wiring. References: OpenCode `session/revert.ts`/`session/diff.ts`, Claude rewind/diff stats, Aider undo guards.

**Interfaces:** `preview_restore(scope, checkpoint_id, paths) -> RestorePreview {token, expectedHashes, expiresAt, coverage, diff}`; `apply_restore(token, approval) -> RestoreOutcome {perPath, preRestoreCheckpoint, redoToken?}`. Redo uses the same preview/apply pipeline against the saved pre-restore state; no separate unsafe restore path.

- [ ] Test stale hashes, changed scope, expired token (10 minutes), cross-chat token use, denied approval, active-writer contention, new/empty/deleted/renamed files, missing/corrupt/pruned backups and outside-root paths. Specifically start a detached child shell that keeps writing after launch returns: restore remains blocked until verified termination and reconciliation, not merely until the launch call ends.
- [ ] Test injected failure after the first restored file: ledger records partial outcome, remaining files aren't reported restored, verified rollback uses pre-restore state, interrupted restore can be reconciled after reopening.
- [ ] Implement acquire/revalidate/checkpoint/journal/apply/per-file-result order. No locks held while waiting for approval. Do not offer redo over intervening manual changes. Protect HEAD, index and unrelated files.
- [ ] Keep conversation rewind a separate explicit choice from restoring files. Link chat retry/edit warnings to actual restore scope; do not imply chat history truncation restored disk.
- [ ] Run native `checkpoint_restore` tests, `chat-history` tests and renderer tests; commit `feat: add safe checkpoint restore and redo`.

## Task 7: native scoped instruction resolver

**Files:** create `project_instructions.rs`, settings for optional global/include grants; register native command. References: Claude claudemd/frontmatter/attachments, OpenCode config instruction/read discovery.

**Interfaces:** `resolve_instructions(scope, target_paths, previous_versions) -> InstructionResolution {sources, compiled, warnings, blockingIssues, version}`. Source records contain canonical path, display path, hash, scope, kind and include parent. Native mutation path checks that the applicable instruction version was delivered before executing.

- [ ] Test exact precedence from spec, AGENTS/CLAUDE coexistence, nested sibling isolation, sorted rules, conditional globs, private local override, no-file neutral state, missing/inaccessible source and changed/removed guidance.
- [ ] Test Markdown includes outside code only; relative include base; depth five, 32 files, 32,000 combined guidance characters including enabled workspace rules/global/nested/include sources; existing 8,000 workspace-rule sublimit; canonical cycles, Windows drive casing, symlink aliases, malformed frontmatter/globs, external include grants and boundary escapes. Overflow reports source accounting and blocks; it never trims enabled guidance.
- [ ] Implement deterministic file provenance and compile bounds. Fail visibly on required guidance loss; don't truncate enabled guidance silently. Do not claim semantic conflict detection.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml project_instructions`; commit `feat: resolve scoped project instructions`.

## Task 8: deliver and refresh guidance across root/child/worktree runs

**Files:** create `project-instructions.ts`/tests; modify `App.tsx`, `professional-runtime.ts`, native dispatcher and `session_tools.rs`. References: OpenCode session instructions/state/dedup, Claude attachments and nested resolver.

**Interfaces:** `prepareInstructionContext(owner, targets) -> {messages, version, provenance}`; `invalidateInstructionScope(scope, changedPaths)`; requests capture immutable source versions. Persist provenance; visible-context membership, not an eternal loaded-path set, determines reinjection.

- [ ] Test simultaneous reads inject each source once, compaction/revert reload lost instructions, missing source blocks relevant writes, source edit between request and mutation returns `instructions_changed` before writing, children receive rules for their root and worktree changes recalculate scope.
- [ ] Add an instruction-change tool result that returns new guidance and requires the model to reconsider the mutation in a later call; do not apply a stale edit and merely append guidance afterwards.
- [ ] Load workspace guidance for shell/MCP and describe the path-discovery limitation. Keep source changes in compact activity rows without duplicating one row per request.
- [ ] Run focused frontend tests and ancestor-plan/native tests; commit `feat: keep project guidance current during runs`.

## Task 9: durable compaction and operational rehydration

**Files:** create `context-manager.ts`/tests; update `model-context.ts`, model request/usage types, professional runtime and native context storage. References: OpenCode compaction/history/context, Claude autoCompact/grouping/compact/prompt/postCompactCleanup, Aider history, SWE history processors.

**Interfaces:** `prepareModelContext(owner, transcript, state) -> PreparedContext`; `compact(owner, sourceEpoch, signal) -> CompactionOutcome`; `rehydrateContext(owner, contextEpoch) -> ModelMessage[]`. Return measured/estimated counters explicitly and preserve tool-call/result IDs atomically. Provider stream usage events remain separate from text and private reasoning.

- [ ] Test configured/unknown model limits using the spec's exact B formula/settings; huge latest request; pinned instructions plus schemas/media larger than B; summaries retain requirements/decisions/open work; complete multi-tool exchanges; missing tool results; images counted conservatively; unknown tool output persisted and retrievable.
- [ ] Test overflow reductions terminate within three attempts, invalid/empty summary doesn't replace valid context, cancellation retains old epoch, three failed operations open breaker, stale background summary cannot replace a newer prefix, and persistence failure blocks advancement.
- [ ] Implement spec budgets; keep newest complete exchanges and immutable original transcript. Apply selective old-output replacement only with durable retrieval references. Never synthesize successful tool results or omit unknown-outcome warnings.
- [ ] Rehydrate current instructions, plan/mode, active workspace/worktree, loaded schemas, invoked skills, child/shell metadata and selected relevant files under explicit budgets. Test root/child cache isolation and no reopening of plan permissions.
- [ ] Add input/output usage collection and configured output-limit transport in `main.rs`/`model-stream.ts` without changing provider API family; add per-model `contextWindowTokens`, `inputBudgetTokens` and `maxOutputTokens` settings with the spec's exact defaults/formula. Persist usage where supplied, label estimates where absent. Do not infer dollar cost from line counts.
- [ ] Run context-manager/model-context/professional-runtime tests and native stream tests; commit `feat: compact and restore durable task context`.

## Task 10: shared root/child execution limits

**Files:** run controller/context manager, settings model/UI, professional-runtime, native run-store limit checks. References: mini `query`, OpenCode max-steps/step/usage limits; Claude compaction breaker.

**Interfaces:** `reserveModelRequest(rootRunId, attemptId, kind) -> Reservation | LimitOutcome`; `checkRunAllowance(runId, operationKind) -> Allowed | LimitOutcome` for non-request boundaries; `continueRun(runId, userAllowance, expectedVersion) -> RunRecord`. Only user action grants allowance. Reserve transactionally in native storage before provider dispatch and settle usage idempotently. Attempted dispatch consumes allowance even on network failure; duplicate reservation doesn't double-count. Accounting includes title-independent task model calls, child requests and summaries, not unrelated UI title-generation requests.

- [ ] Test root stops at 128 requests including children/summary calls, simultaneous children at 127 requests cannot both reserve request 128, duplicate attempt reservation is idempotent, child still obeys 32 rounds, 30-minute active deadline excludes approval waiting, no polling resets the timer, restart preserves counters, optional cost cap handles unknown pricing explicitly, and model tool calls cannot reset caps.
- [ ] Pause with remaining-work text and compact action row, disable actual tool execution at exhausted boundary, and allow explicit Continue/Cancel without silently granting new permissions.
- [ ] Run run-controller/limits/native ledger tests; commit `feat: enforce shared task execution budgets`.

## Task 11: restart and child/background recovery

**Files:** create `run_recovery.rs`, `run-recovery.ts`/tests; modify startup, session persistence integration and task registries. References: OpenCode store/restart/subagent completion, Claude resumeAgent/sessionStorage/toolResultStorage.

**Interfaces:** `list_recoverable(ownerLock) -> RecoverableRun[]`; `prepare_resume(runId, expectedVersion) -> RecoveryPlan`; `resume(plan, userDecision) -> RunRecord`. Persist attempt before doing recovery work. Root has at most three resume attempts and one durable completion delivery per child result.

- [ ] Use exclusive desktop ownership before declaring claims orphaned. Test two owners cannot both recover, process lock release after crash, and no background auto-mutation on startup.
- [ ] Test crash after intent/before execution, after mutation/before outcome, after outcome/before UI projection, during restore and during compaction. Read-only retries are safe; hash-reconcile edits; shell/MCP/commit unknown outcomes require inspection and cannot be blindly replayed.
- [ ] Test child/parent mismatch, missing transcript, missing workspace/model/plan/worktree, source rules changed and process PID reuse. Do not fall back to a writable parent directory silently when the old child worktree is missing.
- [ ] Recover output files and mode metadata; reattach only processes with verified ownership. Before exposing Resume/tool dispatch, hydrate native `session_tools.rs` plan restrictions, read-only ancestry, actual worktree roots and active-writer guards. Test restart in plan mode then attempt outside-plan Write from root and descendant: both remain blocked. Missing guard state blocks Resume. Repair transcript pairing with explicit interrupted outcomes. Display partial context/coverage honestly.
- [ ] Run native recovery tests and frontend recovery/App orchestration tests; commit `feat: resume interrupted runs with reconciliation`.

## Task 12: connect all live events to the Nike-approved row system

**Files:** foundation event projection, runtime action callbacks, Git panel, renderer, permission components, chat-load migration and their tests. References: Taro incumbent components and the design matrix.

- [ ] Use one stable operation row across lifecycle updates. Map every runtime reason in the spec matrix to a visible state and a safe action; enforce action availability both in UI and native boundary.
- [ ] Test runtime groups preserve prose order, show mixed failure while work runs, don't steal disclosure/focus, don't label system activities as tool calls, and don't duplicate permission rows.
- [ ] Test fresh browser seed and persisted desktop seed migration preserve edited Design Plan contents, original `m2a`, old rows and unrelated sessions; unknown future fields don't erase history.
- [ ] Keep fixture actions entirely isolated from real IO. Compare real events and fixture payloads with the same renderer assertions.
- [ ] Run focused tests and capture wide/narrow state gallery. Fix observed layout defects in one batch and confirm once; no unrelated redesign.
- [ ] Commit `feat: surface live foundation outcomes in compact rows`.

## Task 13: integrated verification and final cloud handoff

**Files:** add `docs/agent-foundation-verification.md`; update `docs/agent-tools.md`, `workspace-runtime.md`, `phase-two-tools.md` for shipped behavior; extend appropriate native/frontend integration tests.

- [ ] Run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`, and `cargo test --manifest-path src-tauri/Cargo.toml`. Record actual commands, exit codes and test totals. Fix failures in scope; separate prerequisite failures without deleting tests.
- [ ] Perform real temp-project acceptance: dirty existing file -> guidance -> checkpoint -> edit -> real diff -> approve restore -> restore/redo; normal folder flow; shell change in Git; rename/empty/binary file; commit hook failure; instruction change before edit; limits -> Continue; process restart with uncertain tool outcome.
- [ ] Exercise SQLite close/reopen and injected-crash states rather than just mocked reload. Verify no unknown mutation replays and no UI projection claims success when ledger persistence failed.
- [ ] Run visual review at desktop, 320px chat width and 200% zoom, including success, permission, conflict, partial restore, limit and interruption. Verify keyboard, focus, reduced motion and sample-action isolation. Save screenshots with route/viewport/state metadata.
- [ ] On Linux, run applicable native tests and document that Windows ConPTY/Job Object/junction/permission checks require Windows. Preserve platform-specific tests and give `cargo test --manifest-path src-tauri/Cargo.toml` as the Windows follow-up; do not call Linux process tests proof of Windows behavior.
- [ ] Verify no refs/build/temp artifacts are staged; review native approvals, scope checks, SQL migrations, backup retention and attribution. Summarize adopted reference symbols and intentional differences. Review the final diff against each spec section.
- [ ] Commit `docs: document agent foundation behavior and validation` and provide a concrete final report. No PR publication or deployment is required by this assignment.

## Done means all of these

- [ ] All five clones/SHAs/inspection maps recorded, including Claude Code.
- [ ] Every design-matrix state appears in Nike and uses the production groupable row renderer.
- [ ] Real status/diff/stage/unstage/commit replaces fake real-workspace Git UI.
- [ ] Native edits have durable before-images; shell/MCP coverage is explicit.
- [ ] Preview-bound restore/redo detects later edits and can recover partial restores.
- [ ] Root and child execution, context epochs, tool outcomes and modes survive reopening.
- [ ] Context compacts without losing active work/instructions or splitting tool exchanges.
- [ ] Limits are enforced, accounted across children, and only user action grants continuation.
- [ ] AGENTS/CLAUDE/includes/scoped rules load deterministically and refresh across compaction/worktrees.
- [ ] Restart reconciliation never silently replays uncertain side effects.
- [ ] Tests/build/typecheck pass for the available platform; other platform and live-provider gaps are explicit.
