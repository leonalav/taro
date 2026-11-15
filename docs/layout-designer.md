# Layout designer

The existing skeletal artifact opens a redesigned workspace with a searchable Layers / Insert browser, central editable artboard, floating canvas tools, and a Design / Notes inspector. The three user-provided editor references guide its charcoal palette, neutral selection states, dense controls, and separated panels. Feedback uses neutral strokes and numbered pins, with no chromatic accents.

## Frontend behavior

- Draw rectangles, ellipses, triangles, lines, and text; move and resize layers, edit geometry, rotate, align, reorder, duplicate, hide, and lock.
- Edit appearance and typography per layer or apply typography throughout the layout. Insert media from the existing library as a background.
- Use zoom, fit, hand panning, grid visibility, adjustable grid spacing, and snapping.
- Draw freehand marks, arrows, and highlights or pin numbered notes to artboard coordinates. Notes capture the target layer when placed over one. Add descriptions to every annotation, resolve or reopen feedback, and hide markup for an unobstructed view.
- Undo / redo document changes; a whole pointer gesture is one history entry. New edits discard redo history. Reset returns to the opened artifact snapshot and can itself be undone.
- Submit layout geometry plus annotation metadata and readable coordinate-based feedback through the existing chat artifact callback. Saved previews display open markup; reopening restores annotations, including resolved feedback. The existing simulated agent response remains the frontend integration boundary.
- Export visible geometry, text, rotations, and optionally open markup as SVG. Media exports use the poster when one exists.
- Narrow layouts use panel drawers and initially fit the artboard to available width.

## Shortcuts

V select; Space hand; R rectangle; O ellipse; L line; T text; P pen; A arrow; H highlight; N note; 0 fit. Ctrl/Cmd+Z undo; Shift+Ctrl/Cmd+Z or Ctrl/Cmd+Y redo; Ctrl/Cmd+D duplicate; Delete remove; arrows nudge; Shift+arrows nudge 10px; Ctrl/Cmd+Enter send. Editing shortcuts leave form inputs and canvas text editing intact.

## Implementation

- `skeletal-editor.tsx`: workspace orchestration and existing public entry point.
- `designer-canvas.tsx`: artboard rendering and pointer interactions.
- `designer-inspector.tsx`: layout, appearance, typography, and artboard fields.
- `designer-panels.tsx`: layer/insert browser, annotation list, and context menu.
- `designer-state.ts`: bounded immutable history and gesture lifecycle.
- `designer-tools.tsx`: shared tool inventory and buttons.
- `layout-designer.ts`: geometry, feedback summaries, and SVG serialization.

Annotation coordinates are artboard pixels, independent of viewport zoom and pan. `LayoutAnnotation[]` is optional on older artifacts. `locked` and `lineReverse` are optional layer properties, preserving old saved documents.

## Visual tokens

Geist neutral palette: panels #1a1a1a; workspace #111111; borders #2e2e2e; text and primary actions #ededed; secondary text #a1a1a1. Selection, focus, toggles, and feedback use grayscale. Geist Variable provides UI type; Geist Mono Variable is reserved for measurements. Desktop sidebars are 224px and 272px with 46px tab rows and 30px controls.

## Verification

Focused tests cover geometry boundaries, rotated resize anchors, escaped SVG, feedback summaries, history branching, locked layers, input shortcuts, zoom-correct drawing, inline text submission, diagonal lines, saved notes, resolved notes, and empty documents. Browser verification covers desktop and narrow layouts plus draw → describe → send → reopen. Captures live under `.verification-2026-11-09/layout-designer/`.
