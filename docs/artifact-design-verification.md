# Artifact design verification — 2026-11-10

## Delivered

- Independent artifact contract, three starting directions, light/dark semantic themes, neutral/type/spacing/radius/elevation/blur/motion/grid tokens, component/media contracts and six responsive starter structures.
- Project-scoped design memory with optimistic version conflicts, atomic SQLite/Web Locks updates, corrupt-data preservation and read-only/local/ancestor plan restrictions.
- Root/child generation guidance and callable ArtifactDesign/BrowserAudit tools, screenshot inspection and a revision-based revise/recheck loop.
- Eight measured environments per audit, conservative complex-paint coverage, persistent per-revision screenshots, findings and source fingerprints.
- Review UI with prior runs, case details, actual-pixel/fit screenshot dialog and retry. Large browser reports migrate to IndexedDB; desktop uses existing SQLite storage.
- Canvas layer IDs preserved in SVG and reported as unique DOM inspection anchors.

## Evidence

- Full frontend suite: 68 files, 277 tests pass. Baseline before these changes: 64 files, 262 tests pass.
- TypeScript: `pnpm exec tsc --noEmit` passes.
- Production build: `pnpm build` passes on the final source state.
- Chromium: 9 tests pass across `scripts/review-browser.test.mjs` and `scripts/artifact-audit.test.mjs`. Covers actual geometry/input, source/target isolation, eight-case audits, contrast compositing, overlapping-image uncertainty, reduced motion, canvas identity and preservation of live storage.
- Six starter outputs × eight environments = 48 rendered cases without measured failures. Form controls/placeholder contrast remains explicitly unmeasured where appropriate. Reports and desktop/mobile captures: `.verification-2026-11-10/artifact-design/`.
- Actual Review UI: project memory read/save and workspace isolation, eight saved cases, screenshot dialog, actual pixels, IndexedDB persistence/reload, narrow layout and no page errors.
- Native compilation: `cargo check --manifest-path src-tauri/Cargo.toml --offline` passes.

## Review and corrections

A fresh reviewer identified ancestor plan-mode bypass, overlapping-image false contrast evidence, blocked top-level data-image links, shared audit/preview browser storage and localStorage quota risk. Added failing regressions before correcting the behavioral issues; verified green afterward. Replaced screenshot links with a native dialog and moved large evidence to transactional browser storage. Corrected cramped mobile table wrapping based on rendered captures.

The initial browser test process disconnected under the execution sandbox. Approved isolated-Chromium runs succeeded. An initial UI reload test assumed Taro reopened directly into the chat; corrected the test to reopen the persisted chat from Reception. Earlier dependency-scanning noise in the standalone rendering harness was resolved by disabling discovery/watch in its temporary Vite instance.

## Limits

No live-provider generation was exercised. Native compilation was checked, but packaged-desktop persistence was not interactively tested. Zoom checks emulate the reflow/pixel scale of 200% browser zoom; they do not manipulate native browser UI zoom. Checks cover initial viewports and bounded DOM samples, not complete accessibility certification, keyboard journeys, every interaction state or below-fold composition. Unsupported paint stays unmeasured. Live URL resources and server state can change between observations.

Starter media is deliberately labeled as reserved space; actual project assets and application behavior still belong to each generated project. Layer identity is an explicit mapping boundary, not automatic semantic reconstruction of arbitrary SVG. Existing unrelated checkout changes remain intact; this work is left uncommitted for review.
