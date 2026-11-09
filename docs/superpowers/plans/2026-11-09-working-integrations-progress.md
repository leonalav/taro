# SDD ledger — plan: docs/superpowers/plans/2026-11-09-working-integrations.md

User opted into full implementation using judgment. Branch creation failed due sandbox .git write restriction; work continues in authorized workspace. Existing untracked .verification-2026-11-08 is preserved.

| Check | Interface or shared file | Ruling |
| --- | --- | --- |
| 1 internal | Git bridge → standalone UI | Git implementation owns both; main registers commands and settings exports. |
| 2 internal | endpoint resolver → stream adapters → model settings | Preserve model stream call signature. |
| 3 internal | imported skills → tool runtime roles | Config is additive and permissions remain enforced. |
| 4 internal | task persistence → Tasks runtime | Persist messages and artifacts together, recover active as interrupted. |
| 1 / 2 | src-tauri/src/lib.rs | Models owns streaming edits; Git supplies registration instructions to main. |
| 1 / 3 | src-tauri/src/lib.rs | Both supply command registration to main. |
| 2 / 3 | CustomModel, runtime streaming | Preserve existing model shape; additive fields only. |
| 3 / 4 | RuntimeOptions | Optional config props, main passes complete settings. |
| 1 / 2 / 3 / 4 | App/settings/defaults | Main owns all shared edits, workers provide isolated components. |

## Implementation

- Source control: implemented native commands, verified-account credential bridge, live paginated picker, settings, real diff/history/branches/PR UI, and review-to-Task feedback. Source-control command registration is in `src-tauri/src/main.rs`; pure/testable helpers are exported from `lib.rs` where applicable.
- Models: implemented endpoint routing, Responses/chat streaming/tool translation, editable stable IDs and keyring-backed credentials, and persistent metadata/legacy-key migration.
- Skills/roles: implemented actual imports/discovery, scoped skill and agent registries in context, configured-model enforcement, inherited permissions, child settlement/cancellation, and durable cumulative partial child output.
- Tasks/activity: implemented workspace SQL boards, complete transcripts/raw executions/artifacts, guarded start/stop/completion, recovery and retry, actual activity events and heatmap. Comments become Tasks rather than fake chat tool calls.
- Shared integration: complete. Removed simulated chat fallback, generated contribution data, fictional provider connections/skills/repositories, and retired settings implementations. Vite dependency scanning excludes research checkouts.

## Review and verification

Independent reviews identified and resolved stale GitHub requests, pagination refresh loss, unborn unstage behavior, Git process/junction escape, concurrent task starts, completion ordering/cancellation, delayed dispatch after Stop, cleanup blocked by logging, lost partial child output, empty-child success, unsaved output loss, startup-load overwrites, stale task goals, and unavailable configured-model fallback.

Observed complete native verification: `cargo test` passed 126 tests (30 library, 78 desktop binary, 6 endpoint, 12 source-control). The source-control integration target emits test-only unused-wrapper warnings.

Final complete frontend verification: `pnpm test --maxWorkers=2` passed 56 files / 216 tests. `pnpm exec tsc --noEmit` passed. `pnpm build` passed and produced the production bundle. `git diff --check` passed.

Final production-browser verification passed task and endpoint reload preservation, Unicode content, wide/narrow layouts, removed controls, role/skills screens, and a recorded completed-task heatmap contribution, with no browser errors. Credential-dependent live services are explicitly unverified; local HTTP tests cover their transport contracts. No remote writes or repository commits were made during development.

All five implementation tasks are complete. Changes remain in the user's workspace; the sandbox denied branch creation. Existing `.verification-2026-11-08` artifacts were left intact. Setup, behavior, recovery and verification are documented in `docs/working-integrations.md`.
