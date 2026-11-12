# Layout designer overhaul

**Goal:** Replace the current skeletal editor with a complete frontend workspace grounded in the three supplied screenshots, including visual feedback for the agent.

**Architecture:** Keep the existing SkeletalEditor entry point and chat artifact flow. Separate serializable canvas/annotation operations from the workspace UI. Use existing React, Geist, and Lucide dependencies; no backend changes.

**Design:** Charcoal application frame, separate left Layers / Insert browser, central dotted workspace with an editable artboard, right Design / Notes inspector. Violet indicates layout selection; amber distinguishes feedback. A floating canvas toolbar exposes selection, hand, shapes, text, freehand, arrows, highlights, and pinned notes. Bottom controls provide zoom, grid, snapping, and a feedback composer. Preserve media backgrounds and SVG export.

**Decisions:** This implements the user's requested frontend first. Annotations are serializable artifact metadata and included in the existing send payload and readable instruction text. Sending uses the current application flow; real agent application of feedback remains outside this frontend change. No new dependencies or external services.

## Work

- [x] Add canvas geometry, annotation, and SVG serialization tests; observe failures.
- [x] Implement shared document operations and extend artifact metadata compatibly.
- [x] Rebuild editor shell, layer/insert browsers, inspector, canvas interactions, history, annotations, and feedback composer.
- [x] Preserve annotations through App save/reopen and show annotation context on artifacts.
- [x] Run focused interaction tests, TypeScript, production build, and regression suite.
- [x] Inspect desktop and narrow layouts and exercise drawing, notes, undo, zoom, and sending in a browser.

## Review focus

- Keyboard shortcuts must leave text inputs and contenteditable text alone.
- Pointer coordinates must stay correct after zoom/pan; locked/hidden layers must not capture editing.
- Each pointer gesture must be one undo step; redo must be cleared after branching.
- Notes and markup must survive send/reopen, including resolved notes.
- Geometry inputs must allow zero and small dimensions, and exported SVG must omit hidden layers and escape text.
