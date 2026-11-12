# Artifact Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Establish expressive, project-consistent artifact generation and revision-bound visual verification together.

**Architecture:** Independent artifact contract and CSS/template exporter, project-scoped persistent memory, and agent tools integrated into the current runtime. Extend isolated Chromium to measure eight environment cases and persist reports on saved revisions; expose results in Review mode.

**Tech Stack:** TypeScript, React, Vitest, existing SQLite/localStorage persistence, Node Chromium CDP bridge.

**Spec:** docs/superpowers/specs/2026-11-10-artifact-design-system-design.md

## Global Constraints

Preserve Taro chrome, existing project design and unrelated uncommitted work. No installed skill changes. Project memory is workspace-scoped and versioned. Audit evidence is revision-bound. Never equate preview image scaling to browser zoom. Report unsupported measurements and incomplete coverage explicitly.

## Review Focus

- Corrupt storage and failed writes must preserve prior memory.
- Concurrent updates must fail with a version conflict.
- Read-only/plan-mode agents must not modify project memory.
- Delayed audit results must attach to the captured revision.
- Transparent/gradient/image contrast must not produce false passes.

### Task 1: Contract, project memory and export

Files: `src/lib/artifact-design.ts`, `artifact-design.test.ts`, `artifact-design-persistence.ts`, `artifact-templates.ts`.

Interfaces: `createArtifactDesign(direction)`, `validateArtifactDesign(value)`, `artifactCss(contract)`, `artifactTemplate(contract, kind)`, `createArtifactDesignRepository(storage)` with `read(workspace)` and `save(workspace, contract, expectedVersion)`.

- [x] Write and run failing tests for independent directions, semantic contrast, export scoping/escaping, project persistence, failed writes and optimistic conflicts.
- [x] Implement bounded typed contract, independent themes/scales/rules, safe CSS and six responsive HTML structures.
- [x] Verify focused tests and document storage/export semantics.

### Task 2: Browser audit and persisted revision evidence

Files: `scripts/review-browser.mjs`, `scripts/review-browser.test.mjs`, `src/lib/artifact-audit.ts`, `src/lib/review-browser.ts`, `src/lib/review-store.ts`, focused tests.

Interfaces: browser `action: audit` returns `audit: ArtifactAuditReport`; `attachArtifactAudit(state, previewId, revisionId, report)` appends immutable evidence. Eight cases: two schemes times desktop/mobile/zoom-equivalent/reduced-motion.

- [x] Write and run failing real-browser tests for contrast/overflow/labels/reduced motion and unsupported contrast.
- [x] Implement isolated audit matrix, source fingerprints, bounded DOM checks, per-case screenshots and honest coverage.
- [x] Test delayed revision attachment, report persistence and failure propagation.

### Task 3: Agent generation loop and Review UI

Files: `src/lib/artifact-tools.ts`, tool definitions/catalog/runtime, `src/components/artifact-audit-panel.tsx`, Review mode integration, tests and docs.

Interfaces: `ArtifactDesign` read/update/export/template; `BrowserAudit` inspects the selected revision. Runtime restrictions precede metadata writes; design guidance participates in root and child contexts.

- [x] Write and run failing tool/runtime tests for persisted project continuity, restrictions and audit routing.
- [x] Implement tools, generation/review guidance and accessible report UI with saved-case screenshots and retry.
- [x] Run full frontend suite, browser tests, production build; render and inspect distinct representative outputs.
- [x] Complete fresh-context code review, fix material findings, record verification and limits.

## Execution ledger

- User requested both systems completed in this turn; no additional approval gate.
- Work in place: existing uncommitted browser and runtime work supplies required integration paths. Do not commit unrelated files or move the checkout.
- Task 1 complete: contract/export/template/persistence tests RED → GREEN; atomic storage conflicts verified across repository instances.
- Task 2 complete: actual Chromium regressions RED → GREEN; 9 browser tests pass; layer anchors preserved; six starters pass 48 environment cases with explicit unmeasured coverage.
- Task 3 complete: project/runtime/revision tests RED → GREEN; actual Review UI, screenshot viewer, browser persistence/reload and narrow rendering pass.
- Final review: fresh reviewer completed; all material findings addressed. No deferred findings. Final full suite 277/277, TypeScript, production build and offline native compilation pass. See docs/artifact-design-verification.md for evidence and limits.
