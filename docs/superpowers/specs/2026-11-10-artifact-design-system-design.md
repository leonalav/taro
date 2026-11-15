# Artifact design system and visual verification

Establish both systems in one delivery, as requested: quiet Taro operational chrome and an independent expressive artifact system. Existing project styles and explicit user direction take precedence over starter defaults. Row restrictions apply only to operational rows; artifact typography, imagery, gradients, elevation and motion are permitted when appropriate.

## Architecture

Use the existing React/TypeScript tool runtime, SQLite/browser persistence and isolated Chromium review bridge. Add a versioned project design contract shared across chats in a workspace, agent-callable read/update/export/template operations, and a revision-bound browser audit. Do not modify installed skills or globally restyle Taro.

Project contracts contain a neutral ramp, theme-specific semantic colors, accent choices, role-based typography and pairing, spacing, radius, elevation, blur, motion, grid/breakpoints, component state/accessibility rules and media direction. Supply editorial, product and expressive starting directions; these are starting points, not a forced project identity. Supply responsive hero, dashboard, gallery, form, pricing and mobile structures. Export standalone scoped CSS and HTML using these tokens. Existing libraries should be reused by agents rather than overwritten.

Project memory uses normalized workspace identity, not chat identity. Updates validate a bounded schema and require the expected version, so concurrent writers cannot silently replace each other. Read-only agents and plan mode can inspect/export but cannot update project memory. Missing workspace permits temporary defaults, never durable cross-project memory. Corrupt/unavailable storage fails visibly without replacing prior data.

## Generation and review

Runtime guidance requires reading project design memory, inspecting incumbent design, choosing or preserving a direction, producing token-driven code, opening BrowserPreview, running BrowserAudit, inspecting screenshots, revising and repeating before claiming verified completion. BrowserAudit is measured evidence, not a substitute for visual critique. It does not autonomously rewrite code or fabricate a model's approval.

Audit immutable HTML in an isolated target for the selected saved revision; URLs are live observations with captured-source identity and explicit limitations. Cover light and dark at desktop, 320px, 200% browser-zoom-equivalent layout and reduced motion. Zoom equivalence uses half the CSS viewport and double device scale; it is not the workbench's image scaling. Restore/close audit-only targets without disturbing the active preview. Each case stores screenshot, viewport, environment, findings and source fingerprint, bound to revision ID. Preserve earlier reports after revision changes. A failed/incomplete audit never reports a pass.

DOM checks: horizontal overflow, measured text contrast on supported solid backgrounds, accessible names/alt text, target size, off-scale spacing observations and motion active under reduced-motion preference. Unsupported contrast (images, gradients, alpha text, opacity/effects) is explicitly unmeasured. Bound traversal and findings; truncation makes the result incomplete. Report manual checks for focus order/visibility, interaction states, aesthetic quality and image composition. Do not claim full WCAG certification. Preserve layer identity through data-taro-layer selectors when generated markup provides them; arbitrary SVG geometry cannot be automatically recovered into semantic DOM.

## User-visible acceptance

Review mode exposes a Run visual checks action and saved report details, cases, screenshots and findings. Users can revisit evidence after restart and revision switches. Browser errors show a retry path. New artifacts can visibly differ without importing Taro chrome. A second artifact in one workspace reuses the stored direction; another workspace remains independent.

## Validation

Test schema validation, normalized project scope, persistence/restart, optimistic conflicts and failed writes, read-only/plan restrictions, token export/template escaping, stale revision binding, complete/incomplete reports and real Chromium checks. Render representative landing, dashboard and mobile templates, inspect desktop/mobile captures and verify second-artifact continuity. Run the full frontend suite and production build, browser integration tests and relevant native compilation when feasible.

## Decisions

The user requested both deliverables now; proceed without another design approval round. Work in place to preserve existing uncommitted review/web-research integration. Alternatives considered: documentation alone would leave agents without executable tools; a new rendering service would duplicate the existing browser bridge. Extend that bridge. Automatic canvas-to-production-code reconstruction is outside this contract; explicit layer IDs establish the mapping boundary.
