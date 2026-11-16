# Taro research: references, art direction, and reusable design examples

Checked 15 November 2026. This is research for a proposed implementation plan. External documentation and source files were read; their programs were not installed or executed. “Model code” means example implementations to learn from. Recommendations below are Taro-specific proposals, not claims made by the sources.

**What exists in Taro**

- [DesignJob](A:/taro/src/lib/design-job.ts) already stores a brief, design intent, implementation, audit, verdict, and earlier previews. Its intent has rectangular layers and written motion decisions.
- [ArtifactDesign](A:/taro/src/lib/artifact-design.ts) already stores typography, colors, spacing, grid, media guidance, and basic motion tokens. Its CSS already uses fluid sizing for display/headline text; the improvement is richer, editable responsive rules, not adding fluid typography from zero.
- [ADI context](A:/taro/src/lib/adi/context.ts) records reference IDs, but initial audience, primary action, aesthetic, and domain fields are empty. A reference-analysis step can fill them with attributed observations and explicit uncertainty.
- [ADI selection](A:/taro/src/lib/adi/selector.ts) already separates required and advisory rules. Preserve this distinction; extend the evidence for aesthetic advice.
- [Web research](A:/taro/docs/web-research.md) fetches readable text and does not render JavaScript pages. Visual references need the Review/browser path as well as text research.
- [Reuse](A:/taro/src/lib/reuse.ts) can attach artifacts and media to conversations. Expand these records into selected references and recipe identities instead of inventing a second attachment system.

**R1 — Choosing a direction from references**

Read: [NN/g, Mood Boards in UX](https://www.nngroup.com/articles/mood-boards/). It describes collecting images, frames, patterns, and text to establish and compare visual directions.

Apply: a small reference board with annotated examples and two or three distinct directions. Record what the user likes about each example. The number of directions is our starting product choice. A screenshot supplies visible composition; movement needs a clip or live observation.

Code companions: R2 and R3 below provide image input, retained previews, and comparison patterns. The mood-board article itself is guidance, not code or evidence of autonomous design quality.

**R2 — Image-based generation and alternative previews**

Read actual source from `abi/screenshot-to-code`, commit `f2e5bbdd1dd5d93c259548d9bccf54e2a5f06a30`:

- [Image prompt assembly](https://github.com/abi/screenshot-to-code/blob/f2e5bbdd1dd5d93c259548d9bccf54e2a5f06a30/backend/prompts/create/image.py): combines multiple image inputs, a chosen implementation stack, user text, and design-system context.
- [Generation/update routing](https://github.com/abi/screenshot-to-code/blob/f2e5bbdd1dd5d93c259548d9bccf54e2a5f06a30/backend/prompts/pipeline.py): separates creating from references, updating from conversation, and updating from current files.
- [Variant comparison UI](https://github.com/abi/screenshot-to-code/blob/f2e5bbdd1dd5d93c259548d9bccf54e2a5f06a30/frontend/src/components/variants/Variants.tsx): stores a selected alternative and displays independently progressing previews.
- [License](https://github.com/abi/screenshot-to-code/blob/f2e5bbdd1dd5d93c259548d9bccf54e2a5f06a30/LICENSE): MIT at the inspected revision.

Apply the input assembly, variant identities, and failure isolation. Keep Taro's existing isolated browser and permission boundaries; do not transplant an example iframe or its prompt hierarchy. The upstream goal is screenshot replication; Taro should also support extracting a direction and making an original design. Its older variant design notes contain historical model choices, so this plan does not adopt those choices.

**R3 — Turning selected canvas content into a revisable preview**

Read actual source from `tldraw/make-real`, commit `928c4c4176fbe84fef4e4c3573e325d12cddbe4d`:

- [useMakeReal](https://github.com/tldraw/make-real/blob/928c4c4176fbe84fef4e4c3573e325d12cddbe4d/app/hooks/useMakeReal.ts): exports selected shapes as an image and creates new previews.
- [getMessages](https://github.com/tldraw/make-real/blob/928c4c4176fbe84fef4e4c3573e325d12cddbe4d/app/lib/getMessages.ts): combines the current image with prior preview HTML and optional text/grid context.

Apply the pattern to Taro's existing Layout Designer: selected geometry, notes, and a rendered reference travel together into a DesignJob. This is an architectural example; redistribution permission for these files was not established in this research. Do not add the tldraw SDK merely to reproduce a capability Taro already partly has. Source inspection does not establish that the example handles production applications or accurate design-to-code translation.

**R4 — Explainable visual critique**

Read: [NN/g, Five Principles of Visual Design](https://www.nngroup.com/articles/principles-visual-design/). It discusses scale, hierarchy, balance, contrast, and grouping.

Apply: critique the actual preview against the chosen project direction, describing a visible problem, its consequence, and a proposed correction. Keep judgments distinct from machine measurements. Avoid presenting one generated score as an objective measure of beauty.

Model instructions inspected: Impeccable's [layout playbook](https://github.com/pbakaus/impeccable/blob/2b86d9c07b97d4bed7de23583e1bd1e58dd2baae/skill/reference/layout.md) and [critique rubric](https://github.com/pbakaus/impeccable/blob/2b86d9c07b97d4bed7de23583e1bd1e58dd2baae/skill/reference/critique-rubric.md), first 120 lines of each. These show evidence-based questions and separate visual/mechanical assessment. They are instruction examples, not a visual-scoring engine. Numeric heuristics are advisory and should not override the brief. The repository's LICENSE begins with Apache 2.0; check file notices and dependencies before reuse. Its current README describes a live-edit fallback that bypasses permission checks: that execution behavior must not be carried into Taro.

**R5 — A portable project style record**

Read: [Design Tokens Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/), including typed values, groups, aliases, and examples. It is a Design Tokens Community Group report, not a W3C Recommendation.

Apply: a versioned mapping between Taro's project contract and an exchangeable token representation, preserving custom names and project-specific extensions. Scene structure and animation choreography require their own records; token interchange does not provide those.

Code companion: [MDN clamp examples](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/clamp) demonstrate text scaling between bounds. Extend Taro's existing fluid display sizing with explicit role-specific ranges and test zoom, long text, and intermediate widths.

**R6 — Recipes with adjustable controls and visible states**

Read documentation and executable example snippets: [Storybook Args](https://storybook.js.org/docs/writing-stories/args), especially the `Button.stories.tsx` examples. They show named component states with adjustable input values.

Apply: each Taro recipe has a preview, controllable parameters, documented states, and a small demonstration. Taro can implement the pattern in its existing Gallery/Review; installing Storybook is optional. These examples show presentation and configuration, not autonomous code adaptation.

**R7 — Packaging code, dependencies, and design settings together**

Read documentation and JSON example: [shadcn registry-item specification](https://ui.shadcn.com/docs/registry/registry-item-json). It packages named entries with code files, dependencies, and style settings.

Apply: recipe records should add version, source, license, preview, compatible project stack, supported inputs, tests, and known limitations. Use the packaging pattern without forcing shadcn components or visual styling on generated work. Recheck every recipe's own code and asset rights before bundling.

**Proposed work packages and observable checks**

1. Reference intake: add annotated screenshot/URL/clip records. Check a gallery screenshot is understood as several references, and that text inside an image is never treated as an instruction.
2. Direction comparison: make small alternatives with separate IDs and previews. Check a failed option does not discard the successful ones and selection survives restart.
3. Rich handoff: carry references, chosen direction, layout relationships, assets, states, and scene/motion decisions to Code and QA. Check the hero survives a later mobile adaptation without drifting to a different identity.
4. Visual critique: attach each concern to a rendered region and the agreed brief. Check a polished editorial design can remain asymmetrical while still receiving usable accessibility and interaction review.
5. Recipe library: package a balanced initial selection of ordinary web and 3D examples. Check a recipe can be previewed, adapted, and replaced without overwriting unrelated user code.
6. Focused design skills: use Taro's existing skill import and role assignment for reference analysis, art direction, typography, assets, motion, and 3D. Check each skill produces an inspectable artifact; a skill claiming success cannot bypass runtime evidence.

Dependencies: model image capability and durable context before reference handoffs; browser evidence before visual critique; an asset manifest before recipes can promise reproducible previews.
