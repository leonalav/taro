# Agent foundation reference manifest

This pass implements frontend contracts, the Nike sample gallery, document editing, and lifecycle presentation. It does not implement native checkpoints, Git operations, a run ledger, instruction discovery, limits, or provider compaction. The user explicitly authorized frontend-first work while GTK/WebKit remain unavailable.

All five checkouts were acquired before product edits. Each reviewed HEAD and clean working tree was verified; local acquisition evidence is `/workspace/.taro-setup/reference-acquisition.json`. Reference installation scripts were not run. Their runtime guidance is not inserted into Taro model context. Foreign suites are excluded from Taro test discovery by `vitest.config.ts`.

| Reference | Exact reviewed SHA | Inspected implementation / case sources | Destination / status |
| --- | --- | --- | --- |
| https://github.com/anomalyco/opencode | `fdce6365bcdf2af0fdac65d46dc1806a75d10b02` | `packages/core/src/session/diff.ts`: `SessionDiff.turn`, turn boundaries, range/location mismatch handling. Relevant native follow-up tests exist at `packages/core/test/session-revert.test.ts`, `session-compaction.test.ts`, `usage-limits.test.ts`, `instruction-discovery.test.ts`. | `src/data/foundation.ts`: explicit scope and coverage; `src/lib/foundation-events.ts`: rejects identity/scope mismatches. Native tree/diff adaptation is pending; full native reading map remains required for those phases. |
| https://github.com/swe-agent/swe-agent | `3ea751c087f32b16e039a2233dd6eefecef325d5` | `sweagent/agent/history_processors.py`: `LastNObservations._get_omit_indices`, `__call__` preserve structure and tag-selected output. `tests/test_history_processors.py::test_last_n_observations`. | Context/background samples distinguish retained output from retrieval and process outcomes. No output elision is implemented in this frontend pass. |
| https://github.com/SWE-agent/mini-swe-agent/ | `04d809ceab9df28f9adaed044884180159172930` | `src/minisweagent/agents/default.py`: `DefaultAgent.query` checks step/cost/wall-time boundaries. `tests/agents/test_default.py`: step-limit and cost-limit cases; time-limit cases discovered there. | Limit and recovery rows in `foundation-previews.ts` / `foundation-row.tsx`; actual shared root budget enforcement remains pending. |
| https://github.com/aider-ai/aider | `5dc9490bb35f9729ef2c95d00a19ccd30c26339c` | `aider/commands.py::raw_cmd_undo`: missing repository, first commit, chat ownership, merge, dirty-file and published-commit guards. `tests/basic/test_repo.py` and `test_history.py` are present as native follow-up sources. | Restore/conflict/unknown-outcome sample semantics only. Taro does not adopt the reference's HEAD reset implementation. |
| https://github.com/tanbiralam/claude-code | `6f6f12b37f529488b10e53928dd5508bb93535c7` | `src/components/MessageSelector.tsx`: `RestoreOption`, separate conversation/files choices, `canRestoreCode`, independent action callbacks. `src/commands/rewind/rewind.ts::call` opens selection without appending a fabricated result. No matching unit suite was found in this checkout. | Behavioral comparison only for action distinctions. Taro's existing activity rows and Markdown editor remain authoritative; no terminal UI or source implementation was copied. |

## Provenance and reuse

- OpenCode: root `LICENSE`, MIT, copyright 2025 opencode.
- SWE-agent: root `LICENSE`, MIT, copyright 2024 John Yang, Carlos E. Jimenez, Alexander Wettig, Shunyu Yao, Karthik Narasimhan, Ofir Press.
- mini-swe-agent: root `LICENSE`, MIT, copyright 2025 Kilian A. Lieret and Carlos E. Jimenez.
- Aider: root `LICENSE.txt`, Apache-2.0.
- Claude comparison checkout: no root LICENSE was present. Its README describes leaked source-map provenance, and visibility does not establish reuse rights. No source text, prompts, implementation, or terminal presentation from this checkout is copied into Taro.

The frontend code is original implementation of the user-supplied design matrix using Taro's incumbent React components. No foreign code or runtime dependencies were copied/adapted; no additional source notices are required for this pass. The independent Markdown document reproduces the user's attached design specification, not a reference repository prompt.

## Current tests and remaining research

`foundation-previews.test.ts` checks idempotent upgrades, unrelated-chat isolation, history and edited-document preservation, unique explicit sample IDs. `foundation-events.test.ts` checks neutral cancellation, mixed failure/running precedence and stale/out-of-scope event rejection. `foundation-row.test.tsx` checks document callbacks, local-only sample actions, action admission, user disclosure choice, unavailable native handlers and queued-state motion.

The entire native reference reading map in `cloud-agent-foundation-handoff.md` remains binding for implementation of Tasks 2–11. Do not interpret this frontend manifest as evidence that native algorithms or their tests have been ported, run, or verified.
