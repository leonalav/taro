# Review Mode Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Working session-scoped browser previews with durable artifacts, measured components, and rich user/agent comment threads.

**Architecture:** A shared review repository owns immutable preview revisions, viewport state, and comment threads. The existing Nike canvas remains the reference renderer. Live pages use an isolated Chromium CDP process, controlled through a dependency-free Node 22 helper exposed by Vite during development and Tauri in desktop builds; the React surface presents captures and forwards prototype input. Agents use the same repository and browser service through the existing runtime.

**Tech Stack:** React, TypeScript, SQLite/localStorage, React Markdown/GFM, Tauri/Rust, Node 22 WebSocket, installed Edge/Chrome.

**Spec:** `docs/superpowers/specs/2026-11-09-review-mode-design.md`

## Global Constraints

- Preserve the Nike reference, existing artifacts and chat history, and existing uncommitted layout-designer changes.
- Keep artifact source and old revisions; resolve retains threads.
- Bind workspace/session identity and author to tool execution context.
- Use observed geometry, never generated inspection results.
- Existing visual language and Markdown dependencies remain.

## Review Focus

- Concurrent agent/UI writes must not lose comment threads or artifact revisions.
- Storage read/write failures retain prior durable data and pending edits.
- Navigating/resizing/scrolling invalidates geometry and keeps anchors accurate.
- An inactive session's tool call must not replace the current session's preview.
- Missing browser/runtime or unreachable URLs produce actionable errors.

### Task 1: Persistent review model

Files: `src/lib/review-store.ts`, `src/lib/review-persistence.ts`, `src/lib/review-store.test.ts`.
Interfaces: `createReviewRepository(storage)`, scoped `load/snapshot/subscribe/change/retrySave`, typed previews/revisions/components/threads, viewport validation.

- [x] Write and run failing tests for independent sessions, immutable revisions, replies/resolve/reopen, concurrent writes, failed saves/retry, unreadable records, and invalid dimensions.
- [x] Implement model and browser/SQLite adapter; rerun tests.

### Task 2: Real browser bridge

Files: `scripts/review-browser.mjs`, `scripts/review-browser.test.mjs`, `src/lib/review-browser.ts`, `src-tauri/src/review_browser.rs`, `src-tauri/src/main.rs`, `vite.config.ts`.
Interfaces: scoped browser requests for open/capture/inspect/viewport/input/history/close; responses include screenshot, viewport, document geometry, source, selected component and component list.

- [x] Test real browser navigation, exact viewport/rectangles, cross-origin pages, selector errors, scroll, interaction, failed navigation, and cleanup.
- [x] Implement isolated CDP sessions, finite timeouts, native stdio and Vite adapters; run bridge tests and native checks.

### Task 3: Agent integration

Files: `src/lib/review-tools.ts`, `src/lib/review-tools.test.ts`, `src/lib/professional-runtime.ts`, `src/lib/agent-tools.ts`, `src/lib/phase-two-catalog.ts`, `src/App.tsx`.
Interfaces: BrowserPreview, BrowserInspect, BrowserViewport, BrowserComment, BrowserComments; runtime supplies root review session and configured agent identity; no model-supplied author/session accepted.

- [x] Write and run failing tests for callable definitions, runtime dispatch, scope and authorship, inspection, preservation, comment lifecycle, and read-only reviewer access.
- [x] Implement the tools using the shared store/browser and verify runtime regression tests.

### Task 4: Review interface

Files: `src/components/review-canvas.tsx`, `src/components/nike-review-canvas.tsx`, `src/components/review-browser-canvas.tsx`, `src/components/review-comments.tsx`, `src/components/review.css`, `src/App.tsx`.

- [x] Exercise the missing cross-session preview/comment behavior with a browser check.
- [x] Preserve Nike markup and connect its pins/replies/resolve to the repository. Add preview tabs, URL opening, real browser captures/input, measured component inspector, presets/zoom/guides, rich comment composer, thread panel and saved revisions.
- [x] Verify desktop/narrow layouts, Markdown, measured dimensions, zoom/scroll anchors, session switching/reload and the Nike reference with browser captures.

### Task 5: Final verification and documentation

- [x] Run full frontend tests, TypeScript, production build, bridge integration tests, and applicable Rust checks.
- [x] Fresh review of the final implementation; fix material findings and verify.
- [x] Document setup, agent schemas, preservation semantics, and measured verification boundaries in `docs/review-mode.md`.

## Execution ledger

- Plan: execute inline in the existing workspace; preserve the user's uncommitted changes and leave integration/commits to the user. No additional approval gate is needed for the approved implementation.
- Browser decision: isolate preview browsing in Chromium with a temporary profile and loopback-only debugging. Node 22 and an installed Chromium browser are explicit desktop runtime prerequisites; failures are visible and retryable. This avoids modifying artifact source or bypassing cross-origin browser boundaries.

- Task 1 complete: persistence tests cover source preservation, independent sessions, serialized comments/replies, resolve/reopen and storage failure recovery.
- Task 2 complete: real Chromium tests cover exact CSS geometry, mobile viewport, input, document/nested scroll, missing selectors, root selection, disappearing selection without repeated actions, and isolated targets. Native stdio bridge measured real rendered dimensions and cleaned its profile.
- Task 3 complete: BrowserPreview/Inspect/Viewport/Comment/Comments are callable in the model runtime, including read-only reviewers. Tests cover runtime ownership, authorship, failed-start source retention, source-kind changes, and delayed comments bound to the measured revision.
- Task 4 complete: app browser checks pass for HTML/URL opening, Markdown, replies, resolve/reopen, saved revisions, exact original source, cross-session state, reload and narrow layout. Nike reference check passes for agent inspection and component-anchored pins after mobile resize.
- Final review: independent reviewer found six material edge cases; all addressed with browser, persistence, or native regression coverage. Visual-only review of five final captures: ship, no material usability issues.
- Verification: 62 frontend test files / 247 tests pass; TypeScript and production build pass. Native suite: 30 library + 78 application + 6 endpoint + 12 source-control tests pass; browser-native integration is separately run with --ignored. Existing test-target dead-code warnings are unrelated to Review.
- Integration: changes remain in the user's existing workspace, without committing unrelated work or publishing anything. No material findings deferred. Desktop prerequisites and capture-based prototype limitations are documented in docs/review-mode.md.