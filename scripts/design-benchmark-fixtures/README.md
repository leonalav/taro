# Design benchmark fixtures

Use these files unchanged for both application versions and every repeat. The two pilots' asset hashes are also in [assets.json](assets.json). Viewports are 393 × 852, 768 × 1024 and 1440 × 900.

`node scripts/design-benchmark.mjs preflight` verifies the ten public inputs in [bundles.json](bundles.json). `node scripts/design-benchmark.mjs prepare <brief-id> <new-workspace>` stages those inputs and returns the exact brief, optional attachment path and digest. Preserve the returned digest in the trial record. The output directory must be new.

## Editorial portfolio

Attach `editorial/layout-reference.png` to the brief. Lead with Field Studio’s case study “A quiet place to make things.” Preserve `editorial/field-studio.png` and `editorial/instrument-serif.woff2` in the work. Make the “View work” link reach the case study. Keep the long headline readable at the narrow width and verify keyboard focus.

Instrument Serif is distributed under the accompanying SIL Open Font License. The layout and illustration are synthetic benchmark inputs.

## 3D product viewer

Attach `product-viewer/cairn-vessel-still.png` as the product reference and static failure fallback. Render `product-viewer/cairn-vessel.glb` in the normal state. Verify that pointer and keyboard rotation both change the orientation, a visible “Details” action reveals product information, and the fallback keeps that action available. The model and illustration depict the same synthetic product.

## Existing projects and deliberate failures

- Start `case-study` with the staged portfolio. Capture the original header and image crop before the change.
- In `navigation`, open the staged `index.html` in Review. Post “Projects opens with a pointer but does not open with Enter or Space. Support keyboard opening and closing while preserving its appearance and neighboring links.” on the Projects control in the initial saved revision. Keep that revision and its comment for the stale-evidence check.
- In `gallery`, leave `inputs/winter-archive.png` absent and check that its original caption remains visible.

## Held-out inputs

The benchmark operator supplies a private JSON manifest for `checkout` and `adaptive`. Match the public manifest structure with a `brief` string, an optional `attachment` destination and `files` with `path`, `destination` and `sha256`. Source paths resolve from the manifest folder. Verify it by appending the manifest path to `preflight` and `prepare`. Hand the private inputs to the fixed application revisions only once the builds are frozen.
