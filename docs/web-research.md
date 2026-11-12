# Web research

Taro agents have two built-in read-only tools, available without selecting a workspace or configuring a provider key. Planning agents and subagents inherit them unless an explicit tool allowlist excludes them. Disabled agents remain disabled.

| Tool | Arguments | Result |
| --- | --- | --- |
| `WebSearch` | `query`, optional `max_results` (1–50, default 10), optional `page_token` | Ranked unique DuckDuckGo sources with titles, destination URLs, snippets and an optional continuation token |
| `WebFetch` | `url`, optional `offset` (Unicode characters), optional `limit` (1–30,000, default 12,000) | Readable HTML/plain text, title, final URL, retrieval time, total text length, truncation and optional next offset |

Search uses DuckDuckGo's Lite HTML interface. Live testing found its main HTML endpoint returning a bot challenge while Lite supplied organic results. There is no automatic change of search engine. Upstream challenges and markup changes are explicit failures; no results are invented. Pagination is bounded to five upstream pages per call. If a requested limit consumes only part of a page, no continuation token is issued that would silently skip remaining entries; ask for a higher limit to retrieve more results.

Search activities appear as collapsible `Search N sources` rows within existing activity groups. N counts actual unique results, rather than an estimated total. Each child has a best-effort favicon or globe, title and shortened display URL. Full URLs are accessible on focus and hover. Opening a source uses the default browser in the desktop app and never marks it read.

Successful page reads produce a separate `Read` disclosure containing extracted text and mark matching search sources `Read` only in the same agent's history in that chat. Requested/final URL aliases match; other agents and chats stay separate. Sources, icons and status persist with chat messages. Running, failed, stopped and interrupted requests have distinct states; unfinished web activities settle when the app restarts.

The fetcher accepts public HTTP(S) URLs without credentials. It checks resolved addresses and pins them for each connection, validates every redirect, permits at most five redirects, limits each request chain to 30 seconds and responses to 5 MiB. It requests uncompressed content and explicitly rejects unsupported compression. It does not send account cookies or authentication headers, use ambient HTTP proxies, execute scripts or bypass login/paywall challenges. JavaScript-only pages, PDFs and other downloads are unsupported. Declared same-origin page icons and `/favicon.ico` fallbacks are bounded to 64 KiB; only recognized raster MIME types with matching signatures are stored. Search icons use the site's `/favicon.ico`; page reads can discover declared icons.

Web results are returned to the model as untrusted evidence with actual citation URLs. Snippets must not be represented as pages the agent read. Returned text windows may refetch the page, so content and offsets can change between calls; consult retrieval time.

## Verification

Regression tests cover HTML/Lite parsing, a captured public DuckDuckGo response, advertising redirect filtering, pagination-token validation, readable text and Unicode windows, URL/DNS restrictions and response bounds, agent/read-only/workspace-free access, source status persistence, restart recovery, desktop link dispatch and disclosure states. Browser inspection verified the production source/read components at 900px and 320px without horizontal overflow or runtime errors.

Manual native checks: `cargo run --manifest-path src-tauri/Cargo.toml --example web_smoke -- search "Rust programming language"` returned organic sources; `... -- fetch https://example.com` returned readable page text. These checks require outbound network access. Upstream restrictions can vary by query and connection.

Independent review found and fixed a false-empty-result parser case: query text containing “No results found” can no longer conceal unknown result markup. Two minor improvements remain deferred: resuming within a partially consumed result page, and displaying public IPv6 literal source links in the frontend (the native fetcher can read public IPv6 addresses).
