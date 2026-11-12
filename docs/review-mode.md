# Review mode

Review mode opens an HTTP(S) page or an HTML artifact inside the current chat. Reviewers and agents can inspect rendered components, try a prototype, and leave persistent comments attached to a saved revision.

## Setup and transports

Live previews require Node.js 22 or newer on `PATH` and an installed Microsoft Edge or Google Chrome. The helper checks common installation paths. To select another installed Chromium executable, set `TARO_REVIEW_BROWSER` before starting Taro or the development server, for example in PowerShell:

```powershell
$env:TARO_REVIEW_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
pnpm dev --host 127.0.0.1 --port 1427
```

In the desktop app, `review_browser` in `src-tauri/src/review_browser.rs` launches the embedded Node helper and communicates over private standard input/output. Node and the browser are runtime prerequisites; the helper is embedded, but these executables are not bundled by this feature.

In Vite development, `scripts/review-vite.ts` provides `/__taro_review` on the local server. It accepts application POST requests with the expected header, loopback host, and matching origin. Use `localhost` or `127.0.0.1`. A static build or `vite preview` does not supply this development transport: live browsing requires the desktop bridge or the Vite development server.

The helper launches headless Chromium with a new isolated temporary profile, disables extensions, and does not inherit the user's browser credentials, cookies, or profile. Preview pages can still make network requests and run their own JavaScript. Authentication from an existing personal browser session is unavailable. Browser downloads are denied; the workbench's preserved-HTML download is a separate action. Shutdown attempts to close the browser and remove its owned temporary profile.

## Open and inspect a preview

1. Open a chat and select **Review mode**.
2. Enter a complete HTTP(S) URL and choose **Open preview**, or use **Open HTML artifact** to select an `.html`/`.htm` file. HTML is limited to 6 MiB. URLs with embedded credentials are rejected.
3. Use the **New browser preview** plus button to add another preview. Saved previews appear as tabs in this chat.
4. In **Inspect**, click a component, or open **Components** and select an item. The selection overlay and inspector show measured CSS pixel dimensions, document position, a selector, and sampled computed styles.

The initial viewport is 920 × 720 CSS pixels. Presets include Mobile 393 × 852, Tablet 768 × 1024, and Desktop 1440 × 900. Custom width and height must be whole numbers from 100 through 4096; apply with Enter or by leaving the field. Changing the viewport reflows the page in Chromium. Zoom and **Fit to window** scale the displayed image without changing the browser's CSS viewport. Column guides and selection overlays can be toggled separately.

Measurements come from the rendered DOM. The component list samples common semantic and explicitly marked elements, with at most 200 entries; a `+` indicates truncation. A known selector can still be inspected directly. Narrow presets resize the layout; they do not emulate every mobile device characteristic.

## Prototype interaction

Switch to **Prototype** to send clicks, scrolling, typed characters, pasted text, and supported navigation keys to the live page. Click the viewport to focus it before typing. Back, Forward, and Reload act on the live browser target. Submitting a new URL in the address field saves a new revision of that preview.

The canvas displays Chromium captures rather than an embedded general-purpose browser. It refreshes at a bounded rate: approximately once per second in Prototype and once per 2.5 seconds in Inspect when visible and idle, with fresh captures after actions. Rendering and request time can make updates slower. Arbitrary keyboard shortcuts, drag interactions, and native file dialogs are not supported by this input bridge. Supported special keys are Enter, Tab, Backspace, Delete, Escape, arrows, Home, and End; modifier shortcuts are not forwarded. This is a prototype review surface, not a promise of full browser compatibility.

## Comments and revision history

Choose **Annotate component** and click the page, or use **Comment on component** in the inspector. A thread records the author, role, timestamp, Markdown body, revision, and measured anchor. Selector anchors are remeasured against the current page; coordinate anchors use document CSS pixels. A changed page may move or remove a selector, so pins are contextual feedback rather than a guarantee that a future DOM has the same structure.

The composer supports bold, italic, links, lists, inline code, and fenced code, with a Markdown preview. Open a pin to reply or resolve it. The comments panel has **Open** and **Resolved** filters. Resolving preserves the messages and replies; **Reopen** returns the thread to the open list. Threads on another revision offer **View saved revision**. Pins on the canvas show open threads for the selected revision.

The original supplied HTML is preserved exactly as a string, including its whitespace and line endings; the browser's normalized DOM source is stored separately. For uploaded files this means the text produced by `File.text()`, not a byte-for-byte archive of the original file encoding. A successful initial capture stores a screenshot, DOM source, and observed metadata alongside the revision. Source is saved before browser startup, so a missing browser prerequisite does not discard an HTML artifact already saved successfully.

**Save revision** captures the current screenshot, DOM source, and observation into a new revision. For HTML previews, this new revision uses the current serialized DOM as its HTML; the earlier original string stays in its earlier revision. Agent submissions with the same `preview_id` and new content also append a revision. Selecting an older revision opens its preserved capture. **View saved capture** switches to the selected revision's stored observation; **Resume live preview** reconnects to a live page.

The HTML download uses the selected revision's preserved HTML when present, otherwise its captured DOM source. A URL capture retains the screenshot, DOM, and observed metadata, but does not create offline copies of all remote assets. Reopening or resuming a URL can fetch different content. Live browser state, including unsaved interactions, navigation, and page memory, is not itself an immutable saved artifact. Use a saved capture to review what was observed, and save a revision when a new state should be retained.

## Agent tools

The runtime exposes these tools in the same Review mode used by the reviewer. Calls return JSON observations and, for browser operations, screenshot artifacts. Use returned preview/thread IDs and observed selectors in subsequent calls; the IDs below are placeholders.

```javascript
// Open a URL, or pass { html: "<!doctype html>...", title: "Draft" }.
BrowserPreview({ url: "http://localhost:3000", width: 1440, height: 900 })

// List saved previews in this scope; reopen one by ID.
BrowserPreview({})
BrowserPreview({ preview_id: "<preview-id>" })

// Read observed geometry before making recommendations.
BrowserInspect({ preview_id: "<preview-id>" })
BrowserInspect({ preview_id: "<preview-id>", selector: "#hero" })
BrowserViewport({ preview_id: "<preview-id>", width: 393, height: 852 })

BrowserComment({
  preview_id: "<preview-id>",
  selector: "#hero",
  body: "Try **more space** above this heading.\n\nKeep the existing `line-height`."
})
// Alternatively anchor with document x/y, using measured CSS pixel coordinates.
BrowserComment({ preview_id: "<preview-id>", x: 160, y: 240, body: "Check this gap." })
BrowserComments({ preview_id: "<preview-id>" })
BrowserComment({ preview_id: "<preview-id>", thread_id: "<thread-id>", body: "Updated the spacing." })
BrowserComment({ preview_id: "<preview-id>", thread_id: "<thread-id>", resolved: true })
BrowserComments({ preview_id: "<preview-id>", include_resolved: true })
BrowserComment({ preview_id: "<preview-id>", thread_id: "<thread-id>", resolved: false })

// Append new content while preserving earlier revisions and their comments.
BrowserPreview({ preview_id: "<preview-id>", html: "<!doctype html><h1 id='hero'>Updated draft</h1>" })
```

Omitting `preview_id` on inspection/comment tools uses the active preview. Supply either `url` or `html`, never both. `BrowserComments` returns open threads by default. Comment authors and roles come from the agent context, not caller-supplied identity fields. `BrowserInspect` reports selectors and geometry; recommendations should use these observations rather than invented dimensions.

## Scope, persistence, and recovery

Review data belongs to a workspace root and root chat session. Agents executing within that root runtime share its Review scope, while their comment identities remain distinct. Another chat or workspace does not share the active preview or comments. Browser targets also include preview and revision IDs in their keys. The built-in Nike discovery reference remains in its original discovery chat, with its original visual treatment; new chats begin with the preview empty state.

The desktop repository stores serialized Review data in the chat database's `review_sessions` table. Browser development uses `localStorage` with the `taro-review-v1:` prefix, scoped to the browser origin as well as the workspace/session key. Saved previews, revisions, viewport settings, messages, authors, replies, and resolution state survive a successful save and reload. Live capture caches and browser interaction state are separate from that persisted record.

Storage errors appear in a visible banner. A failed write retains the pending state in memory and marks it unsaved: keep the session open and use **Retry saving**. A read failure preserves the existing stored data and blocks changes rather than overwriting it with an empty record; the same retry button attempts to load again. Browser connection errors have a separate **Retry** or **Connect browser** action. Install or correct prerequisites, then reconnect; a successful source save does not imply that browser rendering also succeeded.

## Verification and implementation boundaries

The browser-only application flow has been exercised through the Vite development transport, and the native Rust standard-input/output bridge has been tested directly. A full packaged-installer smoke test has not yet been performed. These checks do not establish universal site, browser, or operating-system support.

Relevant verification commands are:

```powershell
pnpm test
pnpm build
node --test scripts/review-browser.test.mjs
node scripts/review-ui-check.mjs
node scripts/review-nike-check.mjs
cargo test --manifest-path src-tauri/Cargo.toml native_stdio_bridge_returns_actual_browser_geometry -- --ignored
```

The Node browser tests require the same Node/Chromium prerequisites. The UI scripts currently expect the Vite app at `http://127.0.0.1:1427` and import Playwright from the local `.verification-2026-11-08/browser-tools` installation; provision that harness before running them. The ignored native test explicitly starts the real helper/browser and checks measured geometry plus profile cleanup. Run results should be reported from the actual execution, not inferred from these commands.

Review mode extends the existing dark Taro interface. Its workbench inherits Geist and Geist Mono, shared foreground/card/border/accent variables, compact controls, and the existing purple action treatment. Local measurement overlays, pins, and comment cards serve the review task. This addition does not establish a new global design system; the incumbent system files and Nike reference styling remain the authority for their existing surfaces.
