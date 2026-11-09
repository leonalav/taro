# Working Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Make source control, task execution, saved endpoints, activity, skills, and configured agent roles operate on real durable state.

**Architecture:** Extend React components and the existing ProfessionalToolRuntime, native Rust services, OS credential store, and SQL settings. Keep subsystem modules small and expose typed frontend bridges. Main agent integrates shared App/settings changes after independent module work.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, SQLite, native Git, reqwest.

**Spec:** docs/superpowers/specs/2026-11-09-working-integrations-design.md

## Global Constraints

- Preserve existing user artifacts and unrelated untracked files.
- Exclude Require design approval, auto-commit, sign commits from activation.
- Tasks execute with tool calls and permissions in Tasks, not chat.
- Never fabricate remote results, credentials, commits, or contributions.
- User authorized execution with engineering judgment; no further design gate.

## Review Focus

- Partial staging, unborn/detached branches, conflicts, filenames with unusual characters, dirty checkout protection.
- Revoked credentials, pagination, network/rate-limit errors, stale workspace/repository responses.
- App restart during task execution and failed writes retain artifacts and expose recovery.
- Full endpoint paths, trailing slash, streamed tool calls, Responses protocol and credential restoration.
- Disabled roles/skills and read-only agents cannot gain write access through nesting or integrations.

### Task 1: Source control
Files: new src-tauri/src/source_control.rs, src/lib/source-control.ts, src/components/source-control-settings.tsx, src/components/repository-picker.tsx; replace src/components/git-panel.tsx.
Interface: typed invoke wrappers and standalone settings/composer components accepting workspaceRoot and sourceControl preferences. Command registration is coordinated with main.
- [x] Read Aider/OpenCode Git behavior and write native temporary-repository tests for status, stage, unstage, commit, branches, conflicts and rejection cases; verify failures before implementation.
- [x] Implement bounded native Git commands and GitHub credential/auth/repository/branch/PR operations; expose truthful pending/error states and refresh on focus/poll.
- [x] Verify focused Rust/frontend tests; send integration details to main.

### Task 2: Models
Files: new endpoint/protocol helpers and model settings component; src-tauri/src/lib.rs streaming helpers; src/lib/model-stream.ts; persistence through main integration.
Interface: CustomModel-compatible data and streamModel/stream_chat contracts remain compatible; optional protocol metadata may be added.
- [x] Add failing endpoint resolution and stream translation tests covering /v1, /responses, /chat/completions, tool calls and invalid URLs.
- [x] Implement correct protocol handling and editable persistent endpoint/model/key configuration, with OS key storage.
- [x] Verify tests and supply settings/persistence integration instructions.

### Task 3: Skills and agent roles
Files: src/lib/professional-runtime.ts, src/lib/phase-two-catalog.ts, src-tauri/src/session_tools.rs; new skills settings/bridges; configure default roles through main.
Interface: RuntimeOptions gains optional agents and skills; preserve existing callers. Supply standalone skill settings component and native import commands.
- [x] Consult all reference agent loops and skills; add failing role/permission, discovery/import and cancellation tests.
- [x] Implement real discovery/import for Claude Code/Codex/OpenCode and role-aware delegation/model restrictions/context.
- [x] Verify focused tests and report integration contracts.

### Task 4: Durable Tasks and activity (main)
Files: new src/lib/task-store.ts and task-runtime.ts; src/components/tasks-board.tsx, src/data/mock.ts, src/App.tsx; activity ledger and statistics.
Interface: workspace-scoped task snapshots persist complete task messages/artifacts and use existing ProfessionalToolRuntime with task-owned approvals/output callbacks.
- [x] Write failing tests for restart recovery, workspace isolation, artifact round-trip, statuses/completion requirements, and activity deduplication/date aggregation.
- [x] Implement persisted board creation/edit/run/retry/stop, task-only tools/permissions/artifacts, descriptive Done results; remove footer status cycling.
- [x] Replace generated heatmap with recorded events from chat/tool/task/Git success and verify tests.

### Task 5: Integrate and verify
Files: App, settings exports and defaults, native command registration, docs and focused integration tests.
- [x] Wire independent modules; migrate saved settings, tasks, source control and skills without resetting user data.
- [x] Run pnpm test, tsc --noEmit, pnpm build, cargo test and native compile as available.
- [x] Review security, persistence and cross-workspace races; fix actual failures and document unverified credential-dependent behavior.
