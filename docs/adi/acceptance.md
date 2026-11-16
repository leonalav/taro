# ADI and Review acceptance

## Run the checks

- `pnpm adi:verify` verifies the bundled source inventory. Add `--complete` when checking whether every declared section is available.
- `pnpm exec tsc --noEmit`, `pnpm test`, and `pnpm build` verify the frontend.
- `node --test scripts/review-browser.test.mjs scripts/adi/import-sources.test.mjs` verifies the Chromium worker and offline source intake.
- `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features` verifies the native core and migration.
- `cargo test --manifest-path src-tauri/Cargo.toml --bin taro -- --test-threads=2` verifies the Windows desktop binary. Run the ignored `review_browser::tests` explicitly with Node 22 and a configured Chromium binary.
- Start `pnpm dev --host 127.0.0.1 --port 1427` and run `pnpm test:review-ui`. Set `TARO_BROWSER_CHANNEL=msedge` for system Edge and `TARO_REVIEW_BROWSER` to the Chromium executable if detection is unavailable. Override `TARO_BASE_URL` to use another port.

## Verified workflows

The browser acceptance fixture exercises rendered geometry, live prototype input, Markdown comments and replies, manual resolve and reopen, revision preservation, offline historical annotation by keyboard, structured composer handoff, scope isolation, reload, and a narrow capture. It does not run a desktop model.

The runtime acceptance test covers missing source receipts, file scope, evidence forgery, explicit reviewer confirmation, completion receipts, and invalidation after a new write. Resolution tests require current evidence for the anchored component and preserve its original revision. Rust tests cover SQLite migration, session and path checks, one-use dispatch, and independent native Chromium bridge behavior.

A single interactive Windows desktop run spanning a real provider, file edit, historical Review handoff, corrective audit and verified resolution remains unverified. The browser audit records bounded DOM findings and reports incomplete cases. Manual criterion evidence requires an explicit reviewer decision. Platform and licensed source packs remain partial, as recorded in the corpus report.

## Reviewer workflow

Open a live preview or select a preserved revision. Choose Annotate, click the preview or press Enter on its focused surface, and post. Open the thread to reply, send it to the composer, or open its linked task. Send the chat message or use Run task to start execution. The runtime requires source reads and a persisted design plan before frontend writes. After rendering the current workspace, run the browser audit and review the requested manual checks. Verified resolution uses explicit evidence for the assigned component and revision.

## 14 November 2026 verification

| Check | Result |
| --- | --- |
| Corpus integrity | Passed. Strict completeness returned exit 1 with declared unavailable sections. |
| Frontend suite | 322 passed, 1 skipped in the full run. The later focused run for ADI, resolution and the shared dispatcher passed all 47 tests. |
| Production build | Passed. |
| Chromium worker and source importer | 8 passed. |
| Native core | Passed. The final ADI policy run passed both scope and source-fingerprint tests. |
| Windows desktop unit tests | 79 passed on the two-thread retry. A more concurrent run timed out in the Git hook cleanup test. |
| Windows Chromium bridge | Both native browser tests passed when run explicitly. |
| Browser UI | All fixture steps passed in Edge. |

## Automated verification on 16 November 2026

The production build and TypeScript checks passed. The application suite passed 392 tests. Both additional Edge design-job relays passed, including the responsive 3D interaction and a correction checked against the preserved scene. The native core and integration suites passed 61 tests. The Windows desktop suite passed 88 tests plus two separately run native browser bridge tests.

Edge passed 19 Gallery checks, including all 12 standalone recipes, the phone preview, browser 3D fallback, exact source download, and the handoff to chat. Edge passed 17 Review worker and motion-export checks. The full Review UI check displayed six distinct live Prototype frames in 1.6 seconds in its test fixture and confirmed that the stream stops on hide and chat switch. The packaged Windows app played a downloaded Review filmstrip. These runs check delivery and reproducible browser states. Device-wide animation smoothness remains unmeasured.

The project asset smoke check loaded a real WOFF2 font subset in Edge and compared pixels of the original and compacted GLB. Native tests proved that approved asset versions follow a design job into its owned Git worktree and that staging cannot overwrite a conflicting file or write through a Windows junction. Gemini failure cases used simulated provider responses. A live call still needs a configured Gemini connection.

## Design pilot on 16 November 2026

The current Taro desktop app ran the Models capability check against the configured HTTPS model from a separate Taro profile. Windows Credential Manager reported a saved key. On the first attempt Taro returned a generic connection-check failure after 7.825 seconds. That attempt left all capabilities unknown. A retry passed image reading, tool calling and structured handoff in 16.455 seconds. The capability probe sends a small synthetic image and a local tool receipt.

The fixed pilot inputs are recorded in the [fixture manifest](../../scripts/design-benchmark-fixtures/assets.json). The editorial brief uses an original synthetic Field Studio composition, the supplied artwork and Instrument Serif under its included license. The product brief uses an original procedural Cairn vessel GLB and matching static illustration. These fixtures are the inputs for subsequent attempts.

The first editorial run created its task and reached Designer. It was stopped after 5 minutes 30.867 seconds following one failed ADI plan write and six rejected Designer handoffs. The task recorded 14 child requests and 15 tool calls, with 237,753 input and 16,647 output tokens across the 13 requests that reported usage. Cost was unknown. The retained activity history has failure labels but no validation messages. The run produced no implemented preview. The isolated product chat was empty at that point.

In the frozen frontend rerun, the editorial request inspected the workspace and classified the design context before the provider timed out at 17.777 seconds. It had not yet started a new DesignJob. The 3D request reached Designer, found the imported GLB and still image, and attempted a handoff. The saved validation message was “Submit the required handoff fields as a structured object.” The first Designer attempt then ended on a provider error. Its 23 requests and 32 tool calls took 325.685 seconds, with 468,605 input and 16,420 output tokens across 22 usage reports. Cost was unknown. The Orchestrator resumed the same job.

The resumed 3D Designer submitted structured objects. The first two were rejected for missing concrete browser checks. The third was accepted and the implementation plan was written and approved through Taro. By approval, the job had recorded 42 model requests and 61 tool calls, with 812,342 input and 47,102 output tokens across 40 usage reports. Code then cycled through ADI classification and convention reads. At the last observation it had made 40 tool calls, with seven read receipts covering 56 unique sections, and had submitted no design contract. The desktop connection ended during Code. The saved plan remained available and no `index.html` or QA preview had been produced.

Both saved jobs were reopened from Tasks with the progress-aware ADI frontend. The editorial Designer read the actual layout reference and supplied artwork, then reached the 32-round limit without submitting a handoff. That attempt recorded 65 tool calls, 309.434 active seconds, and 595,228 input and 3,127 output tokens. The product job restored a byte-identical copy of its approved plan. Code reached zero of 55 required convention reads remaining, had one rejected ADI plan submission, then continued reading and reached the 32-round limit. The transcript retained the failed submission label without its validation message. That attempt recorded 56 Code tool calls, 282.223 active seconds, and 795,481 input and 14,727 output tokens. The Tasks Orchestrator subsequently saved a design contract, then its provider returned HTTP 502. Both attempts had unknown cost. Neither produced an implemented page or a QA preview.

One final product attempt used the frontend that narrows the ADI tools to plan submission after the required reads. The Tasks Orchestrator saved a contract, made four unsuccessful calls to resume the same DesignJob, and ended on a model endpoint timeout. The tool history retained the failure labels without arguments or reasons. No new DesignJob request was reserved and no Code child started. The saved product plan is available, with implementation and QA still unverified.

## Comparison workflow

1. Use `node scripts/design-benchmark.mjs briefs` for the public brief set and fixed viewports. Run `node scripts/design-benchmark.mjs preflight` to verify the ten public bundles. The benchmark operator can supply a private manifest to preflight for the two held-out inputs. Keep that manifest, the inputs and resulting work away from anyone tuning the candidate.
2. Run the same brief three times on each of two fixed application revisions. Use `node scripts/design-benchmark.mjs prepare <brief-id> <new-workspace>` to copy the verified inputs into a fresh workspace and obtain the fixed prompt, attachment and input digest. For a held-out brief, append the path to the private operator manifest. Freeze both desktop builds, provider/model settings, effort limits and test device. Record the settings and input digests and any recovery scenarios exercised. Main app build `b8322dd61cd222a0cd5158f04a8f5a48a606bba8` is the available pre-change baseline. The candidate needs a fixed source revision or artifact hash before scoring.
3. In `runs.json`, store each trial under `trials`. Include `id`, `trial` (1–3), `side` (`baseline` or `candidate`), unique `runId`, `origin` (`desktop` or `fixture`), `revision`, `settingsDigest`, `assetDigest`, `effort`, `device`, `viewports`, `elapsedMs`, `requests`, `toolCalls`, `usage` (input and output tokens or null), `cost` (a measured amount in the same comparison currency or null), `outcomes`, and the brief's required `checks`. For outcomes, use `functional`, `accessibility`, `motion`, `performance`, and `recovery`. Each grade is `pass`, `fail`, or `unknown`.
4. Add an `evidence` receipt containing `path` and lowercase SHA-256 `sha256`. The referenced JSON must include the same `runId`, `revision`, `origin`, `outcomes`, and `checks`, plus an `observations` array describing what happened. Keep full captures, replay, performance measurements, recovery details and limitations alongside it. Add a `preview` receipt of the same shape for the PNG used in blind review. Frame both screenshots identically and exclude build labels or workspace chrome. Receipt paths are relative to the input file and must resolve inside its directory.
5. Run `node scripts/design-benchmark.mjs blind runs.json review-packet` and send only `review-packet/review` to human reviewers. Open its `index.html` to view anonymized pairs. Complete one consensus `votes.json` per packet with the pair ID, independent left/right/tie ratings for visual preference and adherence, and the reason. Keep the sibling `mapping.json` private to the benchmark operator.
6. Put the returned votes array in `runs.json` under `votes` and the operator's mapping array under `mapping`. Run `node scripts/design-benchmark.mjs score runs.json`. The scorecard starts on **hold**. It requires all 36 matched pairs, human ratings and eligible desktop evidence in both tracks. Review known regressions, test cancellation, restart, disconnect, changed source files, failed assets, stale evidence and exhausted budget, and set device-specific performance targets from the measured baseline before deciding whether to release.

`node --test scripts/design-benchmark.test.mjs` covers fixture preflight, fresh workspace preparation, mismatched inputs across repeated trials, stale votes and evidence, fixture-run eligibility, blind packet packaging and the release hold. The scorecard currently has zero matched provider trials and zero human ratings. Device performance targets still need baseline measurements.

The isolated pre-change baseline built and launched with its own app ID. It loaded the allowlisted model and role settings and found the saved model credential through Taro. The smoke check made no provider request. The public and private preflight verified all twelve input bundles.
