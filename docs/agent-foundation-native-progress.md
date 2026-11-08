# Agent foundation: native storage milestone

This continues the user's three supplied foundation documents after the frontend gallery. It is **Task 2 infrastructure plus initial Task 3 controller building blocks**. The full foundation assignment remains incomplete.

## Implemented

`src-tauri/src/run_store.rs` and `run_store/schema.sql` provide a separate native SQLite ledger with versioned migrations, foreign keys, parameterized SQL, immediate write transactions, full synchronous durability, and rollback on failed boundary writes. It records runs, root-owned allowances, full exchanges, tool intents/start markers/outcomes, ordered events, context epochs, metadata, and durable full tool results. Checkpoint/restore/instruction/child-job tables establish storage for subsequent phases; their tool algorithms are not implemented yet.

Run IDs bind canonical workspace, session and parent identities. Reused IDs must match existing content/scope. Duplicate matching exchanges/intents/reservations are idempotent. Root/child request reservation is atomic across connections: two children cannot both claim the last available request. Every active ancestor must permit dispatch. A child's completion checks its descendants, rather than unrelated siblings. Root completion cannot claim success while descendants or tool outcomes remain unresolved.

Native intent and started markers survive closing/reopening SQLite. Started/unknown attempts cannot be dispatched again through `mark_started`; unknown outcomes cannot be overwritten with fabricated success. Successful outcomes require a started attempt plus a durable full-output reference bound to that run/attempt. Full outputs are retained in SQLite separately from the bounded event/preview records and remain retrievable by opaque reference. Another run cannot retrieve their contents. Cancelled/failed roots remain recovery candidates while unresolved work or active descendants exist. This is candidate discovery, not proof that a previous process owner is dead, and it never authorizes replay.

Context writes use compare-and-swap epochs, require a structured nonempty objective, and validate actual exchange boundaries. Original transcript rows are retained. This validates storage structure; full summary schema, complete tool-exchange grouping, model token budgets and compaction policy are Task 9.

`foundation_commands.rs` supplies thirteen Tauri IPC handlers; `main.rs` registers the service under the Tauri app-data directory as `foundation.sqlite`. SQLite work runs off the UI thread and a connection mutex is never held across model calls, tool execution, or approvals. Storage initialization errors are retained as command errors so the application can still open for inspection. The transport source is registered, but desktop compilation remains unverified in this environment.

`src/lib/foundation-native.ts` supplies the typed TypeScript bridge and refuses to invent persistence in browser mode. `src/data/foundation-wire.json` is shared by Rust serde and TypeScript contract tests.

`src/lib/run-controller.ts` supplies tested write-ahead orchestration: await intent/start acknowledgments, retain full results before acknowledging success, classify uncertain side effects, pause after storage failure, and coalesce matching concurrent UI events while rejecting conflicting inputs. It rechecks pause state immediately before the callback after asynchronous start acknowledgment. These are building blocks only: the existing App/model/tool loop does **not** use this controller yet.

## Reference adaptation and provenance

Adapted the durable claim/release and write-ahead execution semantics of OpenCode `packages/core/src/session/store.ts` (`claim`, `release`, `listSuspended`) and `session/execution.ts` at `fdce6365bcdf2af0fdac65d46dc1806a75d10b02`. Inspected `session/history.ts` context boundaries and `session/execution/restart.ts` durable recovery accounting/ownership assumptions. Relevant reference test cases come from `session-execution.test.ts` (claim lifetime, teardown, terminal classification) and `usage-limits.test.ts` (allowance boundaries).

The implementation uses Rust/rusqlite rather than importing Effect, Bun, Drizzle or the foreign service graph. [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) preserves OpenCode's MIT notice. The comparison checkout of Claude Code has no root license and describes leaked provenance; no implementation, prompt or source text from it was copied. The other three pinned checkouts remain available for their prescribed later phases; see the full reference manifest for exact SHAs and terms.

## Validation

Run from repository root, with the installed toolchain activated:

```sh
export CARGO_HOME=/workspace/.taro-setup/cargo
export RUSTUP_HOME=/workspace/.taro-setup/rustup
export PATH=/workspace/.taro-setup/cargo/bin:/workspace/.taro-setup/tools/node_modules/.bin:$PATH
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib --locked
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

The headless native suite exercises actual SQLite/files on disk: reopening, v1-to-v2 migration, corruption/future schema rejection, transaction rollback after an injected SQL failure, query-only write failure, ID/scope conflicts, concurrent allowance reservation, full-result retrieval, terminal uncertainty, intermediate ancestor dispatch restrictions and invalid context coverage. Close/reopen is tested; killing/restarting the actual desktop process is not.

A fresh reviewer independently ran the then-current native 20 and focused TS 10 tests and reproduced four defects. All four were added as RED regressions and fixed: terminal cancellation hiding unresolved claims; the asynchronous dispatch/pause race; missing intermediate ancestor checks; invalid/empty authoritative context epochs. The corrected native suite has 24 tests and focused bridge/controller suites have 11 tests. Final validation: native library 24/24; frontend 148/148 in 45 files; TypeScript and Vite build passed. All underlying commands exited 0. The default desktop check failed on missing GLib, as described below. This is test-backed resolution, not an independent second whole-branch approval.

## Build choice and platform limits

The `desktop` Cargo feature remains enabled by default. Existing desktop dependencies and binary tests remain in that default build. A new library target permits native domain tests with `--no-default-features --lib`, without requiring a webview; it does not pretend to run the existing desktop binary tests. rusqlite 0.32.1 uses the same libsqlite3-sys 0.30.1 generation already present through SQLx, and SQLite is built with its bundled source. Cargo.lock records the additions.

Attempted `cargo check --manifest-path src-tauri/Cargo.toml --locked` failed in `glib-sys`: `pkg-config` cannot find `glib-2.0`. GLib/GTK/WebKit host packages still need provisioning to compile the desktop feature path. Tauri IPC/desktop startup and the existing native binary test suite remain unverified; static macro-source inspection found no definite handler-path/signature defect. Windows process/junction/permission behavior and live AI requests remain unverified.

## Remaining work

- Task 3: connect root/child model/tool cycles to the controller and independently journal native dispatch using shared attempt IDs; persist authoritative modes, process ownership and background metadata. Do not claim current live tools are journaled yet.
- Tasks 4–6: immutable file before-images, quotas/retention, real Git review/staging/commit, preview-bound restore/redo and partial-failure recovery.
- Tasks 7–8: native scoped instruction discovery/includes/rules and fresh root/child/worktree delivery.
- Tasks 9–11: model-aware compaction, full shared time/token/cost budgets, exclusive-owner restart recovery and child/background reconciliation. The request reservation primitive alone does not enforce a live provider limit or active-time deadline.
- Tasks 12–13: live event/action wiring to the gallery renderer, full acceptance and platform verification.

Deferred review minors: reservation errors currently share the controller reason `limit` even for underlying storage failures (the error message still identifies the failure and execution pauses); some Rust transaction closures are densely formatted. Existing frontend minors (narrow collapsed labels and focused retained-focus unit coverage) remain as previously documented.
