# ThoughtLine Implementation Plan

**Goal:** Integrate the supplied ThoughtLine with Taro's existing response and tool lifecycle using a dot glyph.

**Spec:** `docs/superpowers/specs/2026-11-07-thought-line-design.md`

- [x] Add the supplied dependencies; adapt the component in `src/components/thought-line.tsx`, defaulting to dot and preserving supplied props.
- [x] Add typed run progress and pure start/advance/settle/recovery helpers; test lifecycle and interrupted persistence.
- [x] Render run progress and legacy summaries using ThoughtLine; remove the generic placeholder and old trace component.
- [x] Wire actual model streaming, tool activity, approval waits, completion/error/stop paths, and preview runs to progress updates.
- [x] Test component timers and disclosures, model/tool integration, and persistence. Run all tests, TypeScript and build, inspect live rendering, and request a focused code review.

## Verification record

The initial placeholder tests failed before integration and passed afterward. Timer tests cover frozen/restarted and controlled clocks, auto-settle callbacks, and trace toggling. Actual App orchestration tests cover tool/permission rounds, completion, connection failure, stop, and stalled MCP discovery. The stalled-discovery regression failed before its fix. Review identified and confirmed fixes for discovery cancellation and stale legacy placeholders; the follow-up review had no material findings.

Browser inspection showed working, completed, and stopped states, reopening a completed trace, and wrapping a long path in a narrow panel without overflow. Saved `docs/previews/thought-line.png`; removed the temporary harness sources.

Final checks: 26 test files / 66 tests passed; `pnpm exec tsc --noEmit` and `pnpm build` both exited 0. Added Motion 14.9.1, Hugeicons React 1.1.10, and core free icons 4.4.0 through pnpm, with the lockfile updated.

Use the existing workspace and dependencies; the project root is not a Git checkout. Inline execution follows the user's explicit integration request.
