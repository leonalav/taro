# Web Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Taro agents real DuckDuckGo search and public-page reading with persistent, groupable source artifacts.

**Architecture:** Two shared tools call a dedicated native Rust web module through the existing cancellable tool IPC. Typed activity payloads feed compact React disclosures; immutable transcript updates mark successfully fetched URLs read within their owning agent's history.

**Tech Stack:** React, TypeScript, Vitest, Rust, Tauri, reqwest, scraper HTML parser.

**Spec:** `docs/superpowers/specs/2026-11-10-web-research-design.md` (approved).

**Execution:** Implemented in the existing checkout at the user's request. Tasks 1–5 delivered. Evidence: 262 frontend tests, 41 native library tests and 79 native binary tests passed (2 pre-existing binary tests ignored); TypeScript check and production build passed; live native DuckDuckGo search and public-page fetch succeeded; actual components inspected at 900px and 320px. The independent review's Important false-empty-result finding was reproduced RED and fixed GREEN. Two Minor findings are documented in `docs/web-research.md`. Detailed task evidence and rulings: `.verification-2026-11-10/web-research-execution/progress.md`. Original step checklists below are retained as the planning record; the execution evidence is authoritative.

## Global Constraints

- Default 10, maximum 50 results per call; count only unique results actually returned.
- Default text window 12,000 characters, maximum 30,000; offsets refer to Unicode characters.
- Bounded redirects (5), a total request timeout (30 seconds), and a streamed response limit (5 MiB).
- Public HTTP(S) only; no cookies, credentials, JavaScript execution, provider fallback, paid service or settings screen.
- Preserve current agent enablement, explicit tool restrictions, filesystem guards, cancellation and existing uncommitted work.
- Search snippets do not imply a page was read; unsupported and blocked responses are explicit failures.
- Existing activities remain compatible; source data and read indicators persist through existing chat storage.

## Review Focus

- DNS changes and IPv4-mapped IPv6 must not permit requests to private networks; Task 1 exercises these classifications and pinned resolution.
- Duplicate/redirected URLs must neither inflate counts nor mark another agent's sources read; Tasks 2 and 3 pin these cases.
- CAPTCHA or changed search markup must not report successful zero results; Task 2 uses distinct fixtures.
- Stop during icons, body streaming or a child call must settle rows and ignore late results; Tasks 1 and 3 cover aborts.
- Long/non-ASCII titles, unsafe saved URLs and broken icons must remain readable and keyboard accessible; Task 4 covers these inputs.

### Task 1: Bounded public-web transport

**Files:** Create `src-tauri/src/web_tools.rs`, `src-tauri/src/web_transport.rs`; modify `src-tauri/Cargo.toml`, `src-tauri/src/main.rs` and `src-tauri/src/lib.rs` for module/test exposure.

**Interfaces:** `web_transport::get(url: &url::Url, max_bytes: usize) -> Result<WebResponse, String>`; `WebResponse { final_url: Url, content_type: String, body: Vec<u8> }`. Internal resolver/transport seam permits deterministic tests without public network requests.

- [ ] Write failing Rust tests: reject URL credentials, non-HTTP schemes, localhost, private/reserved IPv4, mapped IPv6 and mixed public/private DNS answers; reject a redirect into private space and the sixth redirect; enforce decoded body bytes and an overall deadline across redirect hops.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml --lib --features desktop web_transport` and confirm the new tests fail for missing implementation, not unrelated compilation errors.
- [ ] Implement URL/address validation, DNS pinning via reqwest's resolver override, manual validated redirects, bounded streamed reads and one shared deadline. Disable ambient proxy routing so resolution validation applies to actual connections. Use no automatic retries initially.
- [ ] Test cancellation by dropping an in-flight transport future against a controlled stalled response; confirm no additional redirect/icon work runs after cancellation. Run the targeted command to green.

### Task 2: DuckDuckGo results and readable page text

**Files:** Extend `src-tauri/src/web_tools.rs`; create `src-tauri/tests/fixtures/web/` HTML fixtures; modify `src-tauri/Cargo.toml`/`Cargo.lock` for optional desktop parser dependency.

**Interfaces:** `web_tools::execute(name: &str, input: &serde_json::Value) -> Result<serde_json::Value, String>` produces a serialized `{text, artifact}` tool result. Search artifact: `{kind:'web-search', query, provider:'DuckDuckGo', sources:[{url,title,displayUrl,snippet,iconDataUrl?}], nextPageToken?}`. Fetch artifact: `{kind:'web-fetch', requestedUrl, finalUrl, title, contentType, content, offset, totalCharacters, nextOffset?, truncated, retrievedAt}`. JSON output uses camelCase.

- [ ] Add failing tests for ranked organic results, ad removal, DuckDuckGo redirect decoding, fragment normalization, meaningful query preservation, stable deduplication, empty-query/limit validation and distinct empty/CAPTCHA/unrecognized-markup fixtures.
- [ ] Add failing tests for opaque pagination fields: bind token to its query, reject unknown fields/endpoints, cap token size and upstream pages at 5, prevent pagination loops. Verify a smaller-than-requested result set returns its actual count.
- [ ] Add failing extraction tests for article/main/body fallback, excluded scripts/styles/navigation, plain text, Unicode windows, next offsets, bad limits, unsupported MIME, empty client-rendered shells and recognized login/paywall responses.
- [ ] Implement with scraper selectors and Task 1 transport. Keep requests on the fixed DuckDuckGo HTML endpoint. Return explicit untrusted-source delimiters and metadata to the model; preserve headings and links where practical. Reject unsupported documents rather than claiming to read them.
- [ ] Add icon tests for same-origin declared icons, `/favicon.ico` fallback, safe raster MIME types, 64 KiB maximum, malformed images and failure tolerance. Bound concurrency to four and persist successful icons as data URLs; do not fetch icons for off-screen reloads.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml --lib --features desktop web_` to green. Confirm fixture tests never call DuckDuckGo.

### Task 3: Agent access, dispatch and persistent source state

**Files:** Create `src/lib/web-research.ts`, `src/lib/web-research.test.ts`; modify `src/lib/agent-tools.ts`, `src/lib/agent-tools.test.ts`, `src/lib/phase-two-catalog.ts`, `src/lib/phase-two-catalog.test.ts`, `src/lib/professional-runtime.ts`, `src/data/mock.ts`, `src/App.tsx`, `src-tauri/src/agent_tools.rs`, `src-tauri/src/session_tools.rs`. Extend existing runtime/App integration tests where appropriate.

**Interfaces:** Export `webToolNames: ReadonlySet<string>`, `WebSource`, `WebSearchActivity`, `WebFetchActivity`; optional discriminated `ToolActivity.web` payload; `reconcileWebReads(messages: ChatMessage[]): ChatMessage[]` returns updated messages with read flags and preserves references for unchanged messages. Source identity is normalized fragment-free URL with meaningful query preserved; root owner is message agentId and child owner is childId.

- [ ] Add failing catalog/conversion tests: both tools available to ordinary and read-only agents, excluded by explicit restrictive allowlists, absent from approvalRequired; success/failure/stopped payloads preserved. Validate schema limits and malformed native payload handling.
- [ ] Add failing integration tests for both tools without workspace: model schema filter includes them; native execution occurs before canonicalizing an empty workspace. Other filesystem tools continue requiring workspace. Guard updates must not enable any mutation in planning mode.
- [ ] Add reconciliation tests: fetch in a later group marks matching earlier sources in the same agent only; requested/final aliases match; failed fetch and clicked link never mark read; another chat/child/root agent remains unchanged; serialized/restored messages retain status. A successful read before a later search also matches.
- [ ] Register `WebSearch`/`WebFetch` definitions and wire native dispatch before filesystem validation while preserving cancellation and tool allowlists. Extend native planning read allowlists. Update root/child instructions with public-web availability, citations and untrusted-content treatment.
- [ ] Integrate reconciliation into root activity updates and child activity publishing; retain existing JSON persistence. Initialize typed running rows and settle stopped root/child rows even when abort happens before activity conversion, ignoring late completions. Ensure full allowed text windows reach the model rather than being cut by the existing 20,000-character generic-result cap.
- [ ] Run `pnpm exec vitest run src/lib/web-research.test.ts src/lib/agent-tools.test.ts src/lib/phase-two-catalog.test.ts` and relevant runtime/App tests to green; rerun native web/guard tests.

### Task 4: Groupable source and page-read rows

**Files:** Create `src/components/web-research-row.tsx`, `src/components/web-research-row.test.tsx`; modify `src/components/chat-message.tsx` for activity dispatch/icon mapping; add styles locally only if existing utility classes cannot express layout.

**Interfaces:** `WebResearchRow({activity}: {activity: ToolActivity})` renders both discriminated web activity kinds and consumes persisted `source.read` flags. It is used inside existing ActivityGroup for root and child cards.

- [ ] Add failing DOM tests for `Search 1 source`, `Search 31 sources`, query/provider attribution, per-source title/address/logo, Read flags and separate page-read preview. Assert disclosure aria state and keyboard-accessible native controls, safe external-link attributes, no invalid saved URL anchors, and fallback after image error.
- [ ] Add running/empty/failed/stopped rendering tests and rerender tests proving user disclosure choices survive status updates. Verify source count equals unique actual payload results, and separate search invocations remain distinct.
- [ ] Implement Search/globe/file icons with the existing Lucide set, compact disclosure geometry, truncated title/address, full-address tooltip and accessible link name, bounded source-list scrolling, and readable extracted-text preview. Use the app's existing external-link route; inspect its desktop behavior before reusing it and provide validated opening if needed.
- [ ] Run `pnpm exec vitest run src/components/web-research-row.test.tsx` and existing chat/subagent tests. Inspect actual rendered artifacts at wide and narrow widths (320px) with long Unicode source names and broken icons; capture local verification screenshots.

### Task 5: Integrated verification and documentation

**Files:** Modify `docs/agent-tools.md`; create `docs/web-research.md`; update this plan's completed checkboxes and record validation results.

- [ ] Run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`, native targeted web/guard tests, and `cargo check --manifest-path src-tauri/Cargo.toml`. Record environmental or pre-existing failures separately; fix introduced failures.
- [ ] Smoke-test actual DuckDuckGo search and one public HTML fetch through the implemented native path, including no-workspace access, source display and Stop. Obtain network escalation only if the sandbox blocks necessary access. Upstream blocking is a reported limitation, never a fabricated successful result.
- [ ] Request an independent code review of the completed change under the executing-plans workflow, resolve actionable findings and rerun affected checks.
- [ ] Document tool arguments, count/read semantics, page-format limits, upstream blocking and evidence from validation. Report outcome and any remaining environmental limits; preserve unrelated work and commit only task-owned changes if committing.

## Self-review

All approved spec sections map to Tasks 1–5. Transport, extraction, tool/payload integration and rendering have explicit interfaces and test owners. Review Focus cases have tests in their owning tasks. The earlier mockup remains a static proposal; production behavior is verified against the implemented components.
