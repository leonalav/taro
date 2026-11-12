# Artifact design and visual verification

Taro has two separate design surfaces. Chat, tasks, Git and operational rows retain their quiet application chrome. Generated products use an independent project design contract. Their typography, light/dark schemes, palette, imagery, gradients, elevation and motion follow the project and the user's direction.

## Project contract

`ArtifactDesign` is available to the model without tool discovery. Start with `{"action":"read"}`. It returns the current project contract, its `revision`, component/media rules and available starter structures. A new workspace returns an unsaved suggestion. Existing project styles take precedence: adapt the contract to the project rather than applying a new theme over an established library.

Three starting directions—editorial, product and expressive—provide different palette/type choices. Every contract includes a twelve-step neutral ramp; light/dark semantic surface, text, accent, focus and status colors; display, headline, title, body, caption and code roles; spacing, radius, elevation, blur, duration/easing and grid/breakpoint tokens. Font stacks are editable fallbacks: actual brand fonts still need to be supplied or sourced and self-hosted by the project.

Save the complete adapted contract with `{"action":"save","expected_revision":0,"design":{...}}` for a new project. Subsequent saves use the revision returned by read. Stale writers receive a version conflict; they must read again. Desktop writes use an atomic SQLite conditional update; browser writes use Web Locks. Missing, corrupt or unavailable storage is surfaced rather than silently replaced. Read-only agents, local plan mode and ancestor plan mode cannot save.

Memory is shared across chats using a normalized workspace path. Worktree operations in the same runtime retain the original project's identity. An unrelated workspace has independent memory. No selected workspace means temporary exports only. Path aliases/symlinks are not automatically reconciled; choose the same workspace identity when continuity matters.

`{"action":"export"}` returns scoped CSS. `{"action":"template","template":"hero","title":"Project title"}` returns standalone HTML. Supported structures: hero, dashboard, gallery, form, pricing and mobile. Exports use `data-taro-artifact` and `--art-*` variables, never Taro's app tokens. Use the exported stack, cluster, grid, split, shell, section, type, button, card, input and media classes directly or map the contract to incumbent components.

Component rules cover action/navigation semantics, primary/secondary/quiet/danger variants, hover/active/focus/disabled/loading states, labeled fields and connected errors, minimum targets, focus visibility, responsive card padding and media/empty-state treatment. Templates are starting structures with explicitly illustrative content. They do not invent factual pricing, provide finished photography or implement application backends. Replace the sample copy, connect actual actions and source suitable media before release.

## Inline artifact surfaces

Chat artifacts use a second, deliberately quiet language: the monospaced editorial sheet in `artifact-sheet.css`. Sheets sit on the same #0b0b0b surface, #1f1f25 rules and 14–16 px radii as the Explorer panel, so a generated document never looks like it belongs to a different product. A sheet has a tracked uppercase kind line, three quiet rule pills, an optional serif document title, an outlined preview, and a footer action row carrying the agent name plus Copy/Open/View diff controls. Faint hexagon nodes echo the supplied reference without painting over content.

The premium finish keeps that language and adds depth: a violet radial sheen in the sheet's top-right corner, a 1 px light hairline along the top edge, the same fine grain tile used on the welcome page at 16% soft-light, a lifted border and shadow on hover, and hexagon nodes that drift by 9 px over 32 seconds. Document titles are Instrument Serif at 20 px (matching the welcome lockup), the quoted callout gains a violet spine and an oversized opening quote, and every action lifts 1 px on hover. New messages and their sheets rise 9 px into place over 420 ms; grain, drift, lifts and rises are all removed under forced-colors and reduced-motion preferences. The chat composer uses the same two-layer gradient border as the welcome composer, with a visible 3 px focus glow.

Agent prose uses `.agent-reply`: Geist Mono at 13.5 px, numbered ordered lists, arrow-prefixed unordered lists, a quoted-callout blockquote and restrained inline code. User messages are raised #1c1c22 paper bubbles rather than colored chat bubbles. Tool rows, activity groups, permission requests, questions, subagent cards, token sheets and skeletal proposals reuse the same surface and metadata scale. Every legacy affordance (copy, retry, revert, open document, retry/diff, permission decisions, question answers, skeleton accept/edit) keeps its role, accessible name and callback; only the visual shell changed. Actions stay visible instead of appearing on hover, and remain at least 24 px tall with a visible focus ring. `docs/previews/inline-artifacts.png` captures the plan sheets and compact tool rows; an axe-core audit (WCAG 2.0/2.1/2.2 A and AA plus best-practice rules) reports zero violations on the welcome, chat and artifact surfaces.

## Generation and review loop

Root and child model contexts carry the same workflow:

1. Read project memory and inspect existing code/design.
2. Preserve or deliberately establish the visual direction, then build using the project contract and component system.
3. Open the actual HTML or served URL with `BrowserPreview`. Save changed source as a **new revision** using its `preview_id`.
4. Run `BrowserAudit` on that preview. The tool snapshots the selected saved revision and creates isolated browser contexts so audit scripts do not share cookies, localStorage or service workers with the active preview.
5. Inspect every screenshot with `{"run":false,"case_index":0}` through index 7. Review the measured findings, unmeasured contrast and manual checklist. Fix the source, save a new revision and rerun.
6. Report the measured outcome and any remaining manual or environmental limits. A report called `measured-clear` means no failures in the measured subset; it is not a design approval or accessibility certification.

The eight cases are light and dark at 1440px desktop, 320px mobile, 200% zoom-equivalent layout and reduced motion. Zoom equivalence uses a 720×450 CSS viewport with double device scale, not the Review workbench's image-fit control or native browser UI zoom. Reduced-motion checks inspect active browser animations after applying the media preference.

Checks measure horizontal overflow, accessible names, missing image alternatives, undersized targets, supported text contrast and active reduced-motion animations. Spacing outside the stored project scale is an informational observation. Contrast is conservative: translucent text, images, gradients, overlapping paint, effects and pseudo-element paint require manual review. DOM traversal and findings are bounded; truncation produces `incomplete`, never a clear report. Viewport captures do not cover the entire scrollable page or every interaction state.

## Review mode

Open a browser/HTML preview, choose **Show visual checks**, then **Run visual checks**. Each case includes findings, a source fingerprint and a screenshot. **Inspect full screenshot** opens an accessible dialog with fit/actual-pixel viewing. Reports stay attached to the measured revision; changing or reopening another revision does not transfer its evidence. Earlier runs remain selectable.

Desktop evidence persists in SQLite. Browser reports and oversized source/capture payloads persist in IndexedDB, with existing small localStorage sessions migrated on write. Storage failures retain unsaved state and show recovery rather than claim success. Disk/browser storage is still finite; clearing browser site data removes browser-only memory and evidence.

URLs are live observations: their server content can change between cases, and loading them can trigger normal page/network behavior. Each case retains its own observed source fingerprint. Supplied HTML is reopened from the exact saved revision. Audit failure does not manufacture an empty passing report.

## Canvas identity

Preserve `data-taro-layer="layer-id"` in generated DOM for canvas layers with known identities. Browser inspection prefers unique layer anchors and returns real DOM selectors, computed styles and geometry. This provides an explicit correspondence; it does not infer semantic production markup from arbitrary SVG shapes. Layout documents still require deliberate design-to-code translation.

## Verification commands

- `pnpm test` and `pnpm exec tsc --noEmit`
- `pnpm build`
- `node --test scripts/review-browser.test.mjs scripts/artifact-audit.test.mjs`
- `node scripts/artifact-design-check.mjs` renders all six starters, runs 48 environment checks and writes screenshots/reports under `.verification-2026-11-10/artifact-design/`.
- `node scripts/artifact-review-ui-check.mjs` exercises project memory, the real Review UI, screenshot viewing, durable evidence and reload. It uses the existing local Playwright verification installation.

Browser checks require the existing Node 22+/Chromium prerequisites. Unit and browser tools can be exercised without provider credentials. A successful live-model generation session and native packaged-app persistence must be reported separately when actually tested.
