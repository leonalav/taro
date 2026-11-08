# Taro cloud implementation instructions

Prepared 2026-11-08. This is the entry point for the next cloud-agent query. Read this file, the linked design spec, and implementation plan before editing product code.

## Assignment

Implement a dependable coding-agent foundation covering (1) real change review, checkpoints and safe undo, (2) durable long-task context, execution limits and restart recovery, and (4) automatic scoped project instructions. Retain Taro's existing tools, approvals, workspace isolation, model configuration, rules, terminals, planning and worktrees. First build reviewable examples of every new operational artifact in `taro / Nike/Brand Discovery`, using the existing compact groupable rows; then connect exactly that presentation to actual runtime events.

Read these companion documents in order:

1. `docs/superpowers/specs/2026-11-08-agent-foundation-design.md`
2. `docs/superpowers/plans/2026-11-08-agent-foundation.md`

These documents supply explicit implementation instructions and proposed defaults. Implement when the user submits this handoff as the cloud assignment; this planning session itself does not authorize pretending the implementation is complete. Do not restart a design interview over decisions already specified. Settle routine implementation details and record deviations with evidence. Do not add provider retry/backoff work or browser automation: those earlier review items are outside this assignment, except provider usage reporting needed for context and cost accounting.

## Mandatory first step: acquire all references before product code edits

The cloud checkout may not contain `refs/`: it is ignored by this project. From the Taro repository root (called `taro/` below), clone ALL FIVE repositories into exactly these directories. Do this before modifying `src/`, `src-tauri/`, dependencies, or the Nike fixture. Reading Taro and writing investigation notes are permitted beforehand. Do not run reference installation scripts or import their runtime instruction files into Taro's model prompt.

| Directory | Required remote | Reviewed commit |
|---|---|---|
| `refs/opencode` | https://github.com/anomalyco/opencode | `fdce6365bcdf2af0fdac65d46dc1806a75d10b02` |
| `refs/swe-agent` | https://github.com/swe-agent/swe-agent | `3ea751c087f32b16e039a2233dd6eefecef325d5` |
| `refs/mini-swe-agent` | https://github.com/SWE-agent/mini-swe-agent/ | `04d809ceab9df28f9adaed044884180159172930` |
| `refs/aider` | https://github.com/aider-ai/aider | `5dc9490bb35f9729ef2c95d00a19ccd30c26339c` |
| `refs/claude-code` | https://github.com/tanbiralam/claude-code | `6f6f12b37f529488b10e53928dd5508bb93535c7` |

For a fresh Linux cloud checkout, run:

```bash
set -euo pipefail
test -f package.json && test -d src-tauri
mkdir -p refs
git clone --no-checkout https://github.com/anomalyco/opencode refs/opencode
git clone --no-checkout https://github.com/swe-agent/swe-agent refs/swe-agent
git clone --no-checkout https://github.com/SWE-agent/mini-swe-agent/ refs/mini-swe-agent
git clone --no-checkout https://github.com/aider-ai/aider refs/aider
git clone --no-checkout https://github.com/tanbiralam/claude-code refs/claude-code
git -C refs/opencode checkout --detach fdce6365bcdf2af0fdac65d46dc1806a75d10b02
git -C refs/swe-agent checkout --detach 3ea751c087f32b16e039a2233dd6eefecef325d5
git -C refs/mini-swe-agent checkout --detach 04d809ceab9df28f9adaed044884180159172930
git -C refs/aider checkout --detach 5dc9490bb35f9729ef2c95d00a19ccd30c26339c
git -C refs/claude-code checkout --detach 6f6f12b37f529488b10e53928dd5508bb93535c7
```

If a directory already exists, do not run the fresh-clone block against it and do not overwrite/delete it. Inspect `git status --porcelain`, `git remote get-url origin`, and `git rev-parse HEAD`. Reuse a clean matching checkout; only switch a clean checkout after verifying the remote. Never reset local reference edits. If a reviewed SHA is not initially available, fetch that SHA from its expected remote and retry. If still unavailable, record the actual SHA and map the symbols/files to their replacements before coding; do not silently assume a current branch has the same APIs. A failed clone of a required reference is a setup blocker to report, not permission to claim its code was inspected.

Record URL, SHA, inspected source symbols, corresponding tests, license/notice files, and destination modules in `docs/agent-foundation-reference-manifest.md`. Include all five repositories. Keep cloned source and build output uncommitted. Preserve applicable attribution for copied/adapted material. Inspect each source's actual provenance and terms; do not infer reuse rights merely from GitHub visibility. The Claude checkout is explicitly required for technical comparison and behavioral adaptation, regardless of whether literal copying is appropriate. Do not drop it from the implementation research.

## Exact reference reading map

Paths below are relative to Taro's root at the reviewed SHAs. Read implementations, not just documentation or comments. Inspect listed tests for cases to translate into Taro's tests; do not execute the entire foreign test suite through Taro's Vitest.

### Claude Code: required, not optional

- `refs/claude-code/src/utils/fileHistory.ts`: `fileHistoryTrackEdit`, `fileHistoryMakeSnapshot`, `fileHistoryRewind`, `fileHistoryGetDiffStats`, `fileHistoryHasAnyChanges`, `fileHistoryRestoreStateFromLog`, `copyFileHistoryForResume`. Adapt pre-edit backup, absent-file markers, versioning, permissions, retention and resume metadata into native checkpoints. Strengthen backup failure/restore error reporting: silent best-effort errors must never produce a successful Taro undo.
- `refs/claude-code/src/tools/FileWriteTool/FileWriteTool.ts`, `src/tools/FileEditTool/FileEditTool.ts`, `src/tools/NotebookEditTool/NotebookEditTool.ts` under that checkout: inspect exactly where tracking runs before mutation. Apply the same boundary in Taro's Rust dispatcher. `src/tools/BashTool/BashTool.tsx` only shows a tracked simulated-sed path; do not mistake it for arbitrary shell coverage.
- `refs/claude-code/src/components/MessageSelector.tsx` and `src/commands/rewind/rewind.ts`: compare conversation/files rewind distinctions. Taro's new operational UI must still use Taro rows, not Claude's terminal UI.
- `refs/claude-code/src/services/compact/autoCompact.ts`: effective model context budget, reserved output, warnings, and consecutive-failure circuit breaker. Do not copy telemetry-derived constants without sizing them for Taro.
- `refs/claude-code/src/services/compact/grouping.ts`: `groupMessagesByApiRound`, preserving complete model/tool rounds during splitting.
- `refs/claude-code/src/services/compact/compact.ts`: `buildPostCompactMessages`, bounded overflow retries, compact boundary/preserved-segment metadata, and reconstruction of file, plan, planning-mode, skill, task and discovered-tool context.
- `refs/claude-code/src/services/compact/prompt.ts` and `src/services/compact/postCompactCleanup.ts`: summary requirements and root/child cache isolation.
- `refs/claude-code/src/services/compact/microCompact.ts`: inspect portable old-tool-output replacement; do not integrate private cache-editing APIs or feature-gated provider assumptions.
- `refs/claude-code/src/utils/sessionStorage.ts`, `src/utils/toolResultStorage.ts`, and `src/tools/AgentTool/resumeAgent.ts`: transcript/checkpoint reconstruction, replacement persistence, incomplete tool exchanges, agent metadata and worktree validation. Use Taro SQLite instead of importing their storage framework.
- `refs/claude-code/src/utils/claudemd.ts`: `processMemoryFile`, `processMdRules`, `getMemoryFiles`, `getMemoryFilesForNestedDirectory`, `processConditionedMdRules`; scoped discovery, include parsing, cycle/depth protection, conditional rules, path normalization and cache reset. `src/utils/attachments.ts` shows how nested instructions reach model context.

### OpenCode: snapshots, durable context and instruction tracking

- `refs/opencode/packages/core/src/snapshot.ts`: content-addressed trees, selective restore, per-worktree scope and ignoring oversized untracked files.
- `refs/opencode/packages/core/src/git.ts`: `withTemporaryIndex`, tree capture/restore, serialization, index recovery, literal path handling and source-index isolation.
- `refs/opencode/packages/core/src/plugin/vcs/git.ts`, `src/vcs/patch.ts`, `src/session/diff.ts`, `src/session/revert.ts` within `packages/core`: real status/diffs, bounded patches, turn boundaries, reversible staged undo. Use native Git commands in Taro; do not import Effect, Bun or the plugin service graph.
- `refs/opencode/packages/core/src/session/compaction.ts`, `src/session/history.ts`, `src/session/context.ts`: structured checkpoint plus recent complete exchanges, model-aware size estimation, overflow recovery and persisted context boundaries. Reuse/adapt the objective/requirements/decisions/work-state/next-move/relevant-files summary structure.
- `refs/opencode/packages/core/src/session/store.ts`, `src/session/execution.ts`, `src/session/execution/restart.ts`, `src/session/subagent-completion.ts`: durable claims, bounded restart attempts, completed background results and parent/child delivery. Preserve the distinction between at-least-once recovery and exactly-once side effects.
- `refs/opencode/packages/core/src/session/runner/max-steps.ts`, `src/session/runner/step.ts`, `src/session/usage.ts`: hard execution-boundary limits and usage accounting.
- `refs/opencode/packages/core/src/config/plugin/instruction.ts`, `src/instruction-discovery.ts`, `src/session/instructions.ts`, `src/session/instruction-state.ts`, `src/tool/plugin/read.ts`: initial/nested instruction loading, file changes, concurrent claims and rediscovery after compaction/revert. This checkout's discovery uses AGENTS.md; CLAUDE.md support comes from the combined Taro implementation.
- Tests: `refs/opencode/packages/core/test/{snapshot,git,vcs,session-revert,session-compaction,session-compaction-transport,session-instructions,instruction-state,instruction-discovery,session-execution,usage-limits}.test.ts`.

### Aider: dirty-state separation and undo guards

- `refs/aider/aider/repo.py`: `commit`, `get_dirty_files`, `is_dirty`, `diff_commits`; preserve preexisting user work and perform real repository operations.
- `refs/aider/aider/commands.py`: `raw_cmd_undo`; changed-file checks, chat ownership, first/merge/published commit constraints. Translate relevant guards; Taro checkpoint undo must not reset HEAD.
- `refs/aider/aider/coders/base_coder.py`: `check_for_dirty_commit`, `dirty_commit`, edit lifecycle. Use pre-edit preservation, not automatic user-history commits.
- `refs/aider/aider/history.py`: `ChatSummary`; compare recent-tail retention and bounded summary recursion. Do not use its user/assistant-only serialization for Taro tool transcripts.
- Tests: `refs/aider/tests/basic/test_repo.py`, `test_history.py`, and undo tests found by `rg -n 'undo|dirty_commit' refs/aider/tests`.

### mini-swe-agent and SWE-agent: limits and output discipline

- `refs/mini-swe-agent/src/minisweagent/agents/default.py`: `query`, `step`, trajectory save; hard pre-request step/cost/wall-time checks and explicit limit outcomes. Translate semantics, not Python dependencies.
- `refs/swe-agent/sweagent/agent/history_processors.py`: `LastNObservations` and output/image processors; selective output elision while preserving transcript structure and considering cache stability. Keep full results on disk; replacement text must identify the original result and retrieval path.
- Discover their relevant limit/history tests with `rg -n 'LimitsExceeded|TimeExceeded|LastNObservations|cost_limit' refs/mini-swe-agent/tests refs/swe-agent/tests`; record exact chosen tests in the manifest. Their benchmark harnesses, Docker orchestration, and submission workflows are outside scope.

## Completion contract

Implement every task and state in the linked documents. A rendered fixture is not runtime completion. Report evidence separately for browser fixture rendering, native filesystem/process behavior, SQLite recovery, and real provider behavior. Never describe mocked-provider tests as live AI verification. On Linux, report Windows-only checks as unverified and provide the exact follow-up commands. Do not delete or modify existing user data to make tests pass.

Final handoff must name changed files, reference SHAs, copied/adapted portions and notices, validation results, platform gaps, and any remaining incomplete requirement. Do not claim completion while a documented core phase is deferred.
