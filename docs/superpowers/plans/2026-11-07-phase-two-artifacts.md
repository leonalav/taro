# Phase 2 Artifacts Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this small reference-only pass.

**Goal:** Show source-informed Phase 2 artifact examples in Nike/Brand Discovery.

**Architecture:** Reuse existing activity groups/events and compact disclosures. Both plan types and token documents share one card frame. The reference upgrader converts the retired large previews, removes the duplicate skill card, and adds missing IDs. Per-artifact document resolution opens the existing editor and persists plan Markdown in its message.

**Tech Stack:** Existing React, TypeScript, Tailwind, Lucide, and Vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-phase-two-artifacts-design.md`

## Global Constraints

Presentation only; no tool execution or new dependencies. Preserve existing messages and other sessions. Use current Taro tokens and expandable details. Label seeded results as examples.

## Review Focus

Saved sessions with some examples already present must gain only missing examples. Other chats must remain untouched. Long paths must wrap in narrow panels. Task retrieval status must remain distinct from task status. A local preview must not offer an execution action.

## Task: Reference data and cards

- [x] Add regression coverage for partial reference upgrades, repeat upgrades, user-modified messages, and unrelated chats; observe failure before implementation.
- [x] Add `src/data/phase-two.ts` with typed examples; extend `ChatMessage` and the reference upgrader in `src/data/mock.ts`.
- [x] Replace the retired large renderer with `tool-result-row.tsx`, groupable terminal activities, and the original event/skill formats.
- [x] Add `document-artifact.tsx` shared geometry and `plan-artifact.tsx` for Design Plan and Plan; resolve and persist each plan's Markdown through the existing editor.
- [x] Document source paths and important differences in `docs/agent-tools.md`.
- [x] Run targeted tests, the full suite, TypeScript, and the production build. Inspect wide and narrow chat panels and native disclosures.

## Verification record

- Targeted migration checks failed before implementation (missing examples) and passed afterward.
- Full suite after the revision: 22 files, 55 tests passed.
- `pnpm exec tsc --noEmit`: exit 0.
- `pnpm build`: exit 0.
- Browser: document cards measured exactly 382×183px in the split panel and 592×183px at full chat width for Design Tokens, Design Plan, and Plan. Both Open buttons resolve their respective Markdown. Edited Plan content survived reload and did not appear in Design Plan; the temporary edit was restored after the check. Verified groupable PowerShell terminal rows.
- Independent code review: no material runtime findings; updated the stale documentation identified in review.
- The sandbox blocked esbuild child-process startup; the same checks passed using approved process access. No dependency or configuration change was needed.

No commit step: this workspace has no Git repository at its root.
