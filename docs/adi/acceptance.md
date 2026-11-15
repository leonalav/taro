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
