# Review mode across sessions

Status: approved by the user on 2026-11-09 ("Proceed with this approach").

## Intent

Turn the Nike/Brand Discovery Review example into a working browser review surface for every session. Users and agents can open previews, inspect rendered components and dimensions, and leave rich comments and recommendations. Preserve existing artifacts, chat history, the Nike reference, and the layout-designer work already in progress.

## Current implementation

`App.tsx` mounts `ReviewCanvas` only for `brand`; every other session receives `EmptyReviewCanvas`. The canvas contains the Nike page directly. Pins and viewport state live in React memory. Resolve deletes a pin, Reply has no handler, navigation is disabled, the address is fixed, and dimensions do not consistently determine the rendered viewport. The model tool catalog has no preview or review operations. Browser development uses local storage; desktop sessions and tasks use SQLite.

## Approaches

1. Extend the existing Review interface with persistent session data and a browser inspection bridge. Recommended: preserves the reference, existing component language, and agent runtime while supporting actual interaction and measurements.
2. Store screenshots with positional comments. Rejected as the primary approach: cannot provide interactive prototypes or inspect real components. Screenshots can supplement saved previews.
3. Replace Review with a separate external browser application. Rejected: breaks the requested in-app session workflow and adds coordination and preservation risks.

The user selected approach 1.

## Proposed behavior

- Every session exposes Review. Empty sessions offer a URL or preview-opening action instead of a Nike-only gate.
- A session may retain multiple named previews. Switching previews, panels, and sessions retains comments and viewport settings. Agents open previews in their owning session; work in an inactive session cannot silently replace another session's preview.
- Keep the dark toolbar, Inspect/Prototype controls, browser address, device dimensions, fit/zoom controls, guides, selection frames, and numbered comment pins shown in the reference. Keep the Nike artifact and its existing sample comments intact.
- Render live HTTP(S) previews and saved HTML artifacts. Store original artifact content separately from inspection overlays and instrumentation. Never rewrite source files to add comments or inspection support. Retain prior saved artifact revisions when a preview is updated. A live URL alone is not described as an archived artifact.
- Inspect returns observed component identity, text, bounding rectangle, viewport dimensions, and relevant computed typography/layout styles. Display component dimensions in unscaled CSS pixels; zoom affects presentation only. Stale measurements are refreshed after navigation or resizing.
- Prototype allows interaction; Inspect selects components or adds anchored comments. Pins follow component anchors where available and otherwise use document coordinates plus the measured viewport. Scrolling and zooming must not detach pins from their targets.
- Comments support Markdown bold, italic, inline code, fenced code blocks, links, and lists, using the existing Markdown dependencies. Include author/agent identity, timestamp, replies, resolve/reopen, and open/resolved filtering. Resolve retains the full thread.
- Provide callable tools for opening/listing previews, reading current inspection state, measuring/selecting a component, setting viewport dimensions, and creating/replying to/resolving comment threads. Route them through the existing model orchestration and activity rows, including Designer and Type & QA roles. Derive ownership and authorship from execution context rather than model-supplied session or author fields.
- Browser-only restrictions must be explicit. A page blocked from embedding or unavailable for DOM inspection must return a clear unsupported/error result and never invented component data. The native desktop path needs a real browser inspection bridge for cross-origin live previews; an iframe alone does not satisfy that requirement.

## Storage and failure behavior

Use workspace/session identities and stable preview/revision/comment IDs. Persist desktop data in SQLite and browser data through the application's browser storage path. Serialize writes, retain unsaved data after errors, expose retry, and do not overwrite unreadable stored records. Existing artifacts and history are not migrated destructively. Closing a preview does not delete its saved artifact or threads.

## Verification

Test the model-facing tools through the real runtime with controlled external IO. Verify session isolation, inactive-session calls, preservation of original artifact bytes and old revisions, thread persistence/replies/resolve/reopen, Markdown rendering, storage failures, viewport validation, and stale/unsupported inspection errors. Browser checks cover the Nike reference, a new session with a live preview, component selection, actual bounding rectangles at desktop and mobile sizes, scrolling/zoom pin placement, comment formatting, session switching, and reload recovery. Run TypeScript, production build, relevant native checks, and the existing regression suite. Report any native runtime verification boundary explicitly.

## Decisions delegated to implementation

Choose the smallest maintainable browser bridge supported by the existing React/Tauri stack after a bounded technical probe. Reuse existing design tokens, Markdown renderer dependencies, SQL connection, tool dispatch, and activity components. Do not install a new rich-text editor or rebuild unrelated app surfaces.
