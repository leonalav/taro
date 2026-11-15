# Callable Phase 2 Tools Implementation Plan

**Goal:** Make all Phase 2 tools genuinely callable by the configured model, using the existing Taro artifacts and approval system.

**Spec:** `docs/superpowers/specs/2026-11-07-phase-two-tools-design.md`

## Interfaces and ownership

Native `ToolRequest` gains optional `sessionId`. Existing request/output shape remains compatible. The dispatcher resolves effective workspace and plan guards, then delegates. Native modules consume `root: &Path`, `scope: &str`, `input: &Value`, and explicit approval where applicable, returning `ToolOutput { text, artifact }`.

- [x] Native tasks: `src-tauri/src/phase_two_tasks.rs`: PowerShell/Bash background process registry, task output/stop, scoped output files and tests.
- [x] LSP: `src-tauri/src/lsp_tools.rs`: stdio JSON-RPC server calls, nine operations, configuration/executable handling, tests.
- [x] Session tools: `src-tauri/src/session_tools.rs`: plan state/enforcement, worktree lifecycle/effective roots, skills, tests.
- [x] TypeScript runtime/catalog: deferred schemas/search, scoped child-agent tasks, model loop, plan approval flow, cancellation, and tests.
- [x] Integrate native dispatch and App model loop; connect task, plan, skill, subagent and compact-row artifacts; preserve ThoughtLine and permissions.
- [x] Run full checks and review native modules and frontend orchestration. Document supported configuration, behavior, and verification limits.

## Verification commands

`pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo check --manifest-path src-tauri/Cargo.toml`.

## Coordination

Native modules are independent files owned by separate implementers. The parent owns Rust dispatcher/main integration, shared request schema, frontend catalog/runtime/App, and documentation. No shared-file edits by native implementers. Do not run workspace-wide formatters or modify refs. Commit operations are unavailable because the workspace root is not a Git repository.

## Implementation decisions and review

- Reused the local reference's schemas and protocols instead of copying provider/auth/terminal-UI infrastructure. No dependencies were added for this phase.
- Native scope/read-only and ancestor-plan metadata are supplied by the runtime, not model arguments. Existing writable descendants cannot bypass a newly entered parent planning mode. Task cancellation remains permitted during planning.
- Root task control includes nested agents and their detached shell jobs. Internal native scope cancellation covers launch-result/cancellation races; cross-chat/workspace access remains rejected.
- Explicit background tasks survive a completed parent call. Registries and active modes last for the application lifetime; files and Git worktrees persist. No silent task resumption or worktree deletion on startup.
- LSP starts an installed server per invocation. Native output budgets and deadlines bound server/process/Git IO. Shell summaries place task metadata before output so model truncation cannot hide control IDs.
- Independent focused reviews identified and led to fixes for foreground cancellation, Unix LSP descendants, unbounded Git operations, inherited planning restrictions, and nested task ownership. A final additional review dispatch hit the provider usage limit; the parent completed source inspection and regression verification for the integrated code.

## Verification record

- Frontend: 28 test files / 80 tests passed, including actual App discovery → approved PowerShell and real-plan preview → Markdown Open → one-time exit approval flows with mocked external IO.
- Native: 61 tests passed on Windows, exercising real subprocesses, process trees, output limits, temporary Git repositories, workspace skill/plan files, and a spawned stdio test language server for all nine operations.
- `pnpm exec tsc --noEmit`, `pnpm build`, `cargo check`, and `cargo build` passed. The final native suite/build also passed after the output-summary regression and active-worktree MCP root adjustment; the final frontend suite/build passed after cross-turn task-context coverage.
- New failure regressions were observed before fixes for inherited planning, child-shell scope ownership, and preserving metadata in verbose shell output.
- No real remote model endpoint was invoked and no actual reference repository was changed. Unix-only cleanup tests remain unexecuted on this Windows host. Configuration and usage are documented in `docs/phase-two-tools.md`.
