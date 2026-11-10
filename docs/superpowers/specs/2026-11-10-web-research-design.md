# Web research tools and source artifact

Status: proposed; awaiting user approval. Date: 2026-11-10.

Builder check: an independent reviewer found no important unanswered questions. Interactive static mockup: `.verification-2026-11-10/web-research/content/search-artifact.html`.

## Intent and scope

Equip Taro's main agents and subagents with real web search and page reading. The user chose direct DuckDuckGo search plus native page fetching, and requested a groupable search artifact with a search icon, source count, and child rows containing website logos, titles, and truncated addresses.

Success means an agent can search, read a selected public page, use its returned text, and leave inspectable sources in the saved conversation. Search results must not imply that their pages have been read.

## Approaches

1. Direct DuckDuckGo HTML search and native HTTP page fetching: selected by the user. No provider credentials; parsing can break and upstream blocking must be reported honestly.
2. Configurable search service with native page fetching: considered; adds provider setup and possible costs. Deferred.

DuckDuckGo's non-JavaScript search is the source of ranked results. Its Instant Answer endpoint is not a substitute for general web search. No automatic switch to a different search engine.

## Tools and integration

- `WebSearch(query, max_results?, page_token?)` returns ranked, unique results with title, canonical destination URL, display address, snippet, and an opaque next-page token when available. Default 10, maximum 50 per call; an upstream page may contain fewer. Tokens encode only validated DuckDuckGo pagination fields, never an arbitrary fetch URL. A search can fetch bounded upstream pages to meet the requested limit; no guessed result totals.
- `WebFetch(url, offset?, limit?)` returns readable text, page title, requested and final URL, content type, text length, truncation and next-offset metadata. Default text window 12,000 characters, maximum 30,000; offsets refer to Unicode characters in the extracted document. Subsequent windows may refetch; report retrieval time because content may change.
- Register both tools in the shared catalog and read-only allowlists, including native planning guards. Inherit existing explicit tool restrictions; disabled agents remain disabled. No per-call mutation approval for public web reads.
- Web tools work without a selected workspace. Route them before filesystem-root validation in both frontend dispatch and native execution, while preserving agent enablement, allowed-tool checks, cancellation and planning restrictions on every other tool.
- Reuse native request cancellation and the existing activity persistence for main and child agents. Tool descriptions and agent instructions explain that snippets are discovery material, successful fetches support reading claims, and returned page text is untrusted content rather than instructions.

## Native networking and extraction

Implement a dedicated Rust web module using the existing reqwest client dependency, with an HTML parser added as needed. Search DuckDuckGo's HTML interface; decode result redirect wrappers, discard ads and non-HTTP destinations, normalize fragment-free URLs, preserve meaningful query parameters, and retain result order while deduplicating exact normalized URLs.

Fetch public HTTP(S) pages without cookies, account credentials or authentication headers. Reject credentials in URLs, localhost, private/link-local/reserved destinations and unsupported schemes; validate each redirect and pin validated DNS resolution for requests to avoid address changes bypassing checks. Upstream search endpoints are fixed. Use bounded redirects (5), a total request timeout (30 seconds), and a streamed response limit (5 MiB); handle compressed responses within the decoded limit if compression is enabled.

Extract title and useful article/main/body text, preserve headings and links where practical, and omit scripts, styles and navigation boilerplate. Support HTML and plain text initially. JavaScript-only pages, PDFs, downloads, paywalls and authentication pages return an explanatory unsupported or unavailable result; no browser execution or login bypass. Report HTTP errors, CAPTCHA/block pages, empty results and parser failures distinctly. A parse failure must not masquerade as zero matches.

Favicons are best-effort site icons, obtained through the same validated native public-URL path with a small image size limit and safe raster MIME types, represented as data URLs. Prefer declared same-origin icons then `/favicon.ico`; use a globe fallback. Icon failure never fails search, and persisted activities must remain usable without refetching icons on reload. Do not render arbitrary remote SVG/HTML.

## Artifact behavior

Add a typed `web-search` activity payload rather than embedding sources in a generic text result. Preserve compatibility with old activities. Reuse the compact spacing, colors and disclosure language of existing activity groups.

- Each search invocation is one groupable disclosure row: search icon, `Search N sources`, and a chevron. N is the number of unique results actually returned by that invocation. One result uses `Search 1 source`.
- While running show `Searching the web…`; empty success shows `Search 0 sources` with an expanded empty-state explanation. Failed and stopped searches have distinct settled labels. Respect user disclosure choices.
- Expanded rows show a favicon or globe, page title, muted truncated address, and an optional `Read` status. Long titles and addresses ellipsize without horizontal overflow; the full address is available on hover/focus. Links are keyboard accessible and open the validated destination through the app's existing external-link mechanism.
- Keep query and DuckDuckGo attribution inside the disclosure. Use a bounded scroll area for long lists. Distinct search calls remain distinct in transcript order, even when queries or results overlap. They can coexist with other tool rows in an activity group.
- `WebFetch` produces a compact groupable `Read` row containing page title/address, success or failure, and an expandable extracted-text preview. Opening a source link does not mark it read.
- A successful fetch marks matching source URLs `Read` within the same agent's conversation history, including requested/final URL aliases. A failed fetch does not. No cross-chat or cross-agent status propagation. Persist the indicator and source data through the existing chat storage route.
- Expose actual URLs to the model so it can cite sources with Markdown links; do not invent citations or source counts.

## Constraints and exclusions

Keep existing uncommitted review and layout-designer changes intact. No paid service, new search settings screen, provider credentials, scheduled crawling, browser automation, visual page rendering, full research reports, or new artifact-library entries. The browser companion is a throwaway static mockup with labeled sample sources, not working search.

## Validation

Use captured HTML fixtures for search parsing, pagination, blocked versus empty pages, redirect decoding and readable-text extraction. Verify URL/DNS/redirect restrictions, limits and cancellation without external dependencies. Test catalog access for root/read-only/child agents, workspace-free dispatch, typed artifact conversion, source counts, read-status matching and persistence. Test disclosure keyboard behavior, safe links, icon fallback and narrow layouts. Run existing relevant tests and production build; smoke-test actual DuckDuckGo and one public HTML page when network access permits, reporting upstream restrictions separately from fixture checks.

## Calls left to the builder

Choose parser crate, module boundaries, cache lifetime and bounded favicon concurrency. Preserve current icon system and tokens. No automatic retries beyond a conservative bounded transient retry if needed. The defaults and limits above are proposed by Codex, not separately specified by the user.
