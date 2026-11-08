# Agent foundation: frontend verification

## Scope delivered

The user authorized frontend-first implementation after relaxing the GTK/WebKit prerequisite. This is the presentation phase of the supplied foundation plan, not native/runtime completion.

- 237 explicit sample cases across 16 operation families, including separate restore/redo and combined stage/unstage; all shared lifecycle states are typed.
- Nike/Brand Discovery receives four stable `nike-foundation-v1-*` messages: sample introduction, grouped Design Plan, compact representative sequence, collapsed state gallery. The original `m2a`, skill invocation, earlier plans and unrelated chats are preserved.
- Foundation rows use the incumbent activity-group shell, tokens, icons, typography and row spacing. The same renderer consumes typed operations whether sample or future runtime data; no separate mock renderer exists.
- State aggregation retains failures while other work runs, preserves cancellation neutrality and disclosure choice, and distinguishes system activities from tool calls.
- Typed action admission covers document/file/diff opening, review, reload/refresh, retries, resume/continue/cancel, restore/redo and staging/commit. Sample actions stay local. Unconnected live actions are disabled with an explanation. This is UI admission, not a replacement for native validation or approvals.
- The grouped Design Plan opens the existing Markdown editor with the attached design specification. Edits are stored in its own activity payload, survive reload, and are not replaced by seed upgrades.
- `vitest.config.ts` includes only Taro's `src/**/*.test.{ts,tsx}` files. No reference dependencies or foreign tests run inside Taro's suite.

## Checks performed on Linux

| Check | Result |
| --- | --- |
| `pnpm test` | 137 passed, 43 files; exit 0 |
| `pnpm exec tsc --noEmit` | Passed; exit 0 |
| `pnpm build` | Passed; exit 0; single-file output generated |
| Real app Chromium smoke | Nike opens; grouped plan opens the existing editor; editing Markdown then reloading preserves the edited text; no page runtime errors |
| Keyboard | Enter operates the group disclosure; expanded state changes correctly; no nested buttons |
| Sample safety | Confirm restore displays a local sample confirmation; unit tests prove sample actions do not call the runtime callback |
| Mixed status | Running group retains an explicit “Includes failures” indicator; cancelled work has a neutral icon |
| Responsive | No horizontal document overflow at 780px, 320px, and 640px with CSS zoom 2 (effective 320px layout); long paths wrap in expanded content; action buttons wrap |
| Reduced motion | Computed spinner animation is `none` in reduced-motion contexts; queued work has no spinner |
| Migration | Reapplying an upgrade returns the same thread, missing IDs are appended once, edited document payload and existing history are preserved, unrelated chats are unchanged |
| References | Five exact reviewed SHAs and clean trees verified; see reference manifest |
| Rust | rustc/cargo 1.99.1 installed; a standalone program compiled and ran |

Tests were written before the new modules. Initial focused run failed because the new modules were absent; a separate regression test then reproduced the missing collapsed-row document Open action before its fix. Type checking identified ES2020 incompatibility with `replaceAll`; code now uses supported regular-expression replacement without changing the project's language target.

The temporary browser harness required Vite's React-refresh preamble and the optimized ReactDOM default export. Those harness setup errors were corrected; the final browser run exited 0. Harness source is outside the checkout at `/workspace/.taro-setup/foundation-browser.mjs` and creates isolated browser contexts, so it does not modify user browser storage. No harness route or automation feature was added to the app.

## Captures

- `previews/agent-foundation-editor.png`: real Nike conversation and existing Markdown editor at 1672×941, after saving an edited sample heading and reloading.
- `previews/agent-foundation-wide.png`: real MessageItem components at 780px; sample confirmation, approvals, limits, restart, partial restore and uncertain commit.
- `previews/agent-foundation-narrow.png`: same components at 320px.
- `previews/agent-foundation-zoom.png`: same components at 640px and CSS zoom 2.
- `previews/agent-foundation-captures.json`: viewport/zoom and overflow measurements.

The component harness uses the production MessageItem/FoundationRow modules and actual CSS; it is not a parallel visual implementation. Component captures establish row layout, not responsive behavior of every unrelated desktop app panel. Browser contexts used reduced motion. The Impeccable launcher/detector was unavailable; incumbent context and screenshot inspection were used directly.

## Explicitly pending

Tasks 2–11 and the native portions of Task 0/Tasks 12–13 remain unimplemented: SQLite ledger, native checkpoints, real Git status/stage/commit, safe restore/redo, scoped instruction IO, request reservation/limits, context compaction, restart/child/process recovery, and live runtime event wiring. These sample rows do not provide those capabilities.

GTK/WebKit development packages are unavailable. System installation failed with permission denied on `/var/lib/dpkg/lock-frontend`; neither sudo nor the supported system-package helper is installed. Native Tauri build/tests have not been validated. Native algorithm research and full reference test translation remain requirements for subsequent phases, as recorded in the reference manifest.

No live AI provider request, real file restore, Git mutation, or SQLite restart-recovery acceptance was performed. Mocked tests must not be described as real provider verification. Windows ConPTY/Job Object/junction/permission checks remain unverified; after native implementation and dependencies are available, run `cargo test --manifest-path src-tauri/Cargo.toml` on Windows. Linux process tests cannot establish Windows correctness.

## Review and fixes

A fresh reviewer examined the changed source, all four screenshots, reference provenance, and frontend scope; independently reran focused tests. The original disposition was **fix** with three material findings. All three were reproduced with regression tests and corrected:

1. Action admission now offers direction-specific Stage/Unstage on pending approval, Cancel at a blocked task limit, and Refresh/inspection after failed commits. Uncertain commits still cannot Retry blindly.
2. Empty instruction/review/restore/context cases have empty payloads and honest labels. Failed checkpoint coverage is not reported as captured. A separate partial-gallery regression now fills missing operation IDs without overwriting edited rows.
3. Ordinary activities now use the same normalized status icon/label mapping as foundation rows; cancelled, queued, unchanged and skipped rows no longer get green success checks.

The regression run first reported seven failing tests, then all focused tests passed after the fixes. The final full suite passed 137/137 tests; typecheck/build and browser checks passed after the fix batch. Captures were refreshed once after corrections. This is test-backed resolution of the review findings, not an independent second whole-slice approval.

Deferred minor observations: collapsed subjects truncate heavily at narrow widths (full text remains available via accessible text/title; expanded paths wrap); direct DOM tests use clicks while keyboard behavior is verified in Chromium, and no focused unit test asserts retained focus during lifecycle updates. No unrelated visual redesign was made.

Implementation rulings: use the already-isolated cloud checkout; deliver frontend presentation while native work remains pending under the user's revised scope; count 16 distinct families including separate redo; substitute direct incumbent-code and screenshot inspection for the unavailable Impeccable launcher/detector. These choices leave desktop behavior and automated design-detector validation unverified.

## Native continuation

The subsequent native storage/controller milestone supersedes Task 2's earlier “unimplemented” status above; it does not supersede the rest of the pending list. See [native progress, source attribution and validation](agent-foundation-native-progress.md). Live-loop integration and actual checkpoint/Git/restore/instruction/recovery tools remain pending.
