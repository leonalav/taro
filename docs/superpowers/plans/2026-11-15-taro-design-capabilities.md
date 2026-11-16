# Taro design capabilities — implementation plan

Prepared 15 November 2026. Written for product planning and review, with implementation references linked separately.

**Goal:** enable Taro to produce both carefully composed websites and interactive 3D experiences at the level suggested by your reference gallery, then inspect and improve its own work.

**Recommended approach:** extend the existing DesignJob, Review, ADI, project design memory, Media, and Skills features. Keep Taro's current agent runtime. Add specialist tools and reusable examples around it. This gives the work one history, one set of permissions, and one place to review the result.

This is a proposed plan, not a claim that these capabilities have been built. “Example code” means source files or official runnable examples reviewed during research; they were not installed or executed. Website quality and 3D quality have equal priority. The attached gallery is inspiration; it does not reveal the original sites' animation behavior, source code, or business functionality.

**What you should experience when this is finished**

You provide a brief and references. Taro explains the useful ideas in them, presents a few distinct directions when appropriate, and keeps the selected direction throughout the job. It obtains suitable assets, builds an early working section, expands the design, tries the interactions, reviews the result, and makes focused improvements. You can compare versions, understand remaining problems, and resume work without repeating decisions.

For a 3D product page, this includes the object, camera, lighting, controls, loading experience, and mobile alternative. Working virtual try-on would additionally require garment/body assets or a dedicated image-generation service, product data, and separate functional validation. It is a later product capability, beyond reproducing the visual presentation in the reference.

**Build order and release boundaries**

| Release | What becomes usable | Work packages below |
| --- | --- | --- |
| 1. Prove the complete journey | One editorial website and one interactive 3D product page, each created from references, reviewed, corrected, saved, and resumed | Small working slices of 1–7; two starter recipes from 8 |
| 2. Expand creative range | Alternative directions, generated/edited assets, richer typography, carousels, particles, and scroll-controlled scenes | Complete 2–8 |
| 3. Make results dependable | Broader benchmarks, targeted edits, performance tuning, recovery, and consistent quality across repeated runs | Complete 9 and strengthen all earlier packages |

The first release needs only one good example of each path. Finish those complete journeys before expanding the catalogue. A dependency table follows the work packages; some research and content preparation can happen together.

**1. Establish a baseline and check the chosen models**

Today Taro can send images and run a design relay, but the acceptance notes still identify a complete real-provider desktop journey as unverified. First establish what actually succeeds on the user's configured setup.

- [ ] Run two fixed briefs: an editorial portfolio and a 3D product page with rotation and a visible purchase/details action. Use the same supplied assets and constraints on later runs.
- [ ] Give each configured model small checks for reading a test image, calling a tool, and returning the required handoff. Save the endpoint/model tested, date, outcome, and limitations. Retest when configuration changes.
- [ ] Keep connection compatibility separate from creative ability. A model accepting an image is only the first check; compare whether its descriptions and corrections are useful on the two briefs.
- [ ] Assign Designer and QA only to models with the needed verified capabilities. Show a clear explanation and available alternative when a capability is missing.

**Visible result:** Models and job setup explain which roles can inspect images and which checks remain unknown.

**Done when:** a model that cannot interpret the image is caught before a visual job depends on it, and the two baseline runs have saved outputs, actual failures, elapsed time, and recorded usage. A failed baseline is useful evidence, not a reason to hide the result.

**Starting point:** [Models](A:/taro/src/data/settings.ts), [model transport](A:/taro/src/lib/model-stream.ts), [current acceptance notes](A:/taro/docs/adi/acceptance.md). See the [agent research and example code](A:/taro/docs/research/2026-11-15-taro-agent-quality.md).

**2. Give each project a durable design brief and memory**

Extend project design memory so it preserves decisions as well as colors and spacing.

- [ ] Store the audience, main action, selected direction, reference images/clips, approved assets, important constraints, and unresolved questions together.
- [ ] Record why an option was selected or rejected. Distinguish a user's decision from a suggestion the agent has not confirmed.
- [ ] Pass the relevant part of this record to Designer, Code, and QA. Keep large originals available on demand; carry concise descriptions and small previews in the active conversation.
- [ ] Preserve the record through long conversations, restarts, and handoffs. Let the user revise a decision without erasing its history.

**Visible result:** a readable “Project direction” record showing what Taro is following and what is still open.

**Done when:** after restarting midway through either baseline job, Taro retains the selected font, composition, assets, motion intent, and next action. A second workspace cannot inherit these preferences accidentally.

**Starting point:** [project design storage](A:/taro/src/lib/artifact-design-persistence.ts), [context selection](A:/taro/src/lib/model-context.ts), [design jobs](A:/taro/src/lib/design-job.ts). Example: [Make Real's image and previous-preview message assembly](https://github.com/tldraw/make-real/blob/928c4c4176fbe84fef4e4c3573e325d12cddbe4d/app/lib/getMessages.ts). Adopt the continuity pattern; reuse rights for that source were not established.

**3. Turn references into a clear visual direction**

- [ ] Accept screenshots, selected regions, website links, short clips, and Layout Designer annotations. Record the source and what the user wants to learn from it.
- [ ] Describe composition, type hierarchy, colors, imagery, spacing, and visible interactions. Mark animation or hidden behavior as unknown when only a still image is available. Keep text inside references as source material, not agent instructions.
- [ ] For substantial new designs, produce two or three small alternatives with a distinct composition and visual idea. For a focused change, use the existing direction. If the user delegates the choice, select one and explain the decision without adding another mandatory approval step.
- [ ] Build the chosen hero or interaction as a working preview before extending the whole page. Preserve the other options and their individual errors.

**Visible result:** a compact reference board and comparable alternatives with a one-sentence explanation each.

**Done when:** the options differ meaningfully in layout, typography, or scene composition; one failed option does not erase the others; the chosen option survives restart and is the one Code implements.

**References and code:** [NN/g mood-board guidance](https://www.nngroup.com/articles/mood-boards/), [screenshot-to-code image input](https://github.com/abi/screenshot-to-code/blob/f2e5bbdd1dd5d93c259548d9bccf54e2a5f06a30/backend/prompts/create/image.py), and its [alternative-preview UI](https://github.com/abi/screenshot-to-code/blob/f2e5bbdd1dd5d93c259548d9bccf54e2a5f06a30/frontend/src/components/variants/Variants.tsx). These demonstrate useful mechanisms; they do not guarantee aesthetic quality. [Detailed research](A:/taro/docs/research/2026-11-15-taro-art-direction.md).

**4. Make assets a first-class part of the job**

Strong imagery and suitable 3D objects are essential inputs. Extend Media into a project asset collection that both agents and people can use.

- [ ] Import and preview images, fonts, video, textures, lighting environments, and 3D models. Keep original files and smaller delivery versions separately.
- [ ] Add search and generation/editing connections for missing assets. Let Taro request a crop, cutout, background edit, or new illustration while retaining the original and the request that produced the result.
- [ ] Record source, creator/license information, file size, dimensions, versions, and where an asset is used. Generated images remain labeled as generated; an invented product image is not silently substituted for an exact product asset.
- [ ] Prepare appropriate sizes, image focal points, video posters, fonts, and compressed 3D assets. Show missing files, expired links, unavailable services, and incomplete rights information before delivery.

**Visible result:** each project has usable assets with previews and provenance, and Taro can explain which parts are ready and which are placeholders.

**Done when:** a supplied product model and brand font remain available after restart, an image can be replaced without changing layout, and a failed generation or download cannot be reported as a completed asset. The generated page has a useful loading/failure state.

**Starting point:** [Media storage](A:/taro/src/lib/media-store.ts), [Gallery](A:/taro/src/components/gallery-page.tsx), and existing plugin connections. Provider examples, asset tools, source rights, and optimization references are in [assets and 3D research](A:/taro/docs/research/2026-11-15-taro-assets-motion-3d.md).

**5. Give Designer a richer handoff and Code a practical motion/3D toolkit**

Replace vague motion notes with decisions the next stage can implement and inspect. Expand the existing contract without breaking old saved projects.

- [ ] Describe layout relationships: what aligns, what grows, what wraps, and what changes on mobile. Extend existing fluid display text with role-specific size ranges, supplied fonts, and deliberate image crops.
- [ ] Describe every important interaction using plain fields: what triggers it, what changes, how it progresses, and what happens when motion is reduced or input is unavailable.
- [ ] For a 3D scene, record the objects, camera positions, lights, materials, controls, and loading behavior. Keep these linked to actual assets.
- [ ] Supply an initial toolkit for a product viewer, a draggable carousel, a particle composition, and a scroll-controlled scene. Give each a mobile treatment and an accessible alternative for its primary action.
- [ ] Add quality settings that reduce expensive effects on weaker devices, reuse resources, and stop unnecessary rendering when the scene rests.

**Visible result:** the Design Plan explains both appearance and behavior. The 3D preview can be operated, and the main content remains usable if the full effect is unavailable.

**Done when:** Code and QA receive the same version of the plan; the product viewer rotates and changes state as specified; the scroll scene can be checked at agreed positions; loading, keyboard access, reduced motion, and the fallback all work.

**References:** [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction), [GSAP ScrollTrigger examples](https://gsap.com/docs/v3/Plugins/ScrollTrigger/), and [R3F performance patterns](https://r3f.docs.pmnd.rs/advanced/scaling-performance). Taro already uses GSAP and Motion. Keep generation libraries in the projects that need them; a library listed in Taro's own dependencies is not automatically installed in those projects. [Design-token exchange examples](https://www.designtokens.org/tr/2025.10/format/) can inform portable styles, while scenes and choreography need their own records. See [reviewed scene/source examples](A:/taro/docs/research/2026-11-15-taro-assets-motion-3d.md).

**6. Upgrade Review so Taro can inspect movement and real interactions**

- [ ] Expose repeatable hover, click, scroll, drag, text input, and keyboard actions to the agent. Prefer observed elements and recheck them when the page changes.
- [ ] Save full-page views, selected-region images, and important animation positions. Start motion evidence with a short sequence of frames; add downloadable recordings after checking browser support, storage, and playback in the packaged app. Let a reviewer replay the actions that produced a finding.
- [ ] Record missing assets, console errors, failed requests, and useful timing/performance observations alongside the preview.
- [ ] Keep visual evidence tied to the exact project revision, browser size, scene state, and test run. Make outdated evidence visibly outdated.
- [ ] Provide smooth live viewing for people where practical. For automated checks, use repeatable states and recordings instead of relying on the current approximately one-capture-per-second preview.

**Visible result:** Review can show “drag the object, open details, scroll to the next scene” and attach a comment to the specific state that failed.

**Done when:** the same interaction sequence can be repeated on desktop and mobile layouts, a deliberately broken drag or missing model is detected, and an old capture cannot certify new code. A screenshot-only run must not claim it checked animation smoothness.

**Important limit:** browser animation controls do not automatically control every custom 3D animation. For Taro-owned scene recipes, add a way to render a named moment. For unfamiliar sites, record observed behavior and clearly state what cannot be repeated exactly.

**Starting point:** [Review bridge](A:/taro/scripts/review-browser.mjs) and [agent review tools](A:/taro/src/lib/review-tool-definitions.ts). References include [Playwright screenshots](https://playwright.dev/docs/screenshots) and [videos](https://playwright.dev/docs/videos). Reviewed agent-action, replay, and browser-control source is in [browser research](A:/taro/docs/research/2026-11-15-taro-browser-review.md).

**7. Add understandable critique and controlled refinement**

ADI already distinguishes required and advisory guidance. Strengthen its review of the chosen direction while preserving that distinction.

- [ ] Report four separate outcomes: functional behavior, accessibility checks, visual judgment, and motion/performance. Show what was measured and what needs human judgment.
- [ ] Require each visual concern to name the affected region, describe the visible issue, explain its effect, and propose a focused correction. Compare with the approved direction and references.
- [ ] Keep the current one-correction allowance for the first proof. Then trial visible effort budgets: Quick: one correction, Standard: up to three, and Thorough: up to five. Enable the extra passes only when comparison runs show they help. These are proposed product defaults, not researched guarantees. All stages and tools must share the existing job limits on time and requests.
- [ ] Preserve a recoverable copy of the code alongside each candidate's preview and checks. Keep the best eligible candidate; verify again after restoring its code. Stop when the brief is satisfied, the budget ends, or two successive attempts make no useful progress. Return remaining issues honestly. Keep user edits and approvals attached to their actual revision.
- [ ] Apply feedback locally. A headline correction should preserve approved assets, layout, and interactions. Recheck affected states and compare unaffected regions for regressions.

**Visible result:** a short ranked improvement list, a before/after comparison, and a clear reason for stopping.

**Done when:** Taro catches a deliberately weak hierarchy and an interaction failure, corrects them within the budget, preserves unrelated work, and can retain an earlier better version. A high visual score cannot conceal a broken required action.

**References and model instructions:** [NN/g visual-design principles](https://www.nngroup.com/articles/principles-visual-design/), [Impeccable layout assessment](https://github.com/pbakaus/impeccable/blob/2b86d9c07b97d4bed7de23583e1bd1e58dd2baae/skill/reference/layout.md), [Taro's existing completion checks](A:/taro/src/lib/adi/completion.ts). The [agent research](A:/taro/docs/research/2026-11-15-taro-agent-quality.md) covers bounded runs, targeted edits, and revision evidence.

**8. Build a small reusable example library and focused skills**

- [ ] Start with six web examples: editorial hero, portfolio case study, product carousel, image gallery, form/checkout states, and responsive navigation.
- [ ] Match them with six 3D examples: product viewer, lit material showcase, particle composition, scroll-controlled camera, selectable object scene, and a scene with adaptive quality and a static fallback.
- [ ] Package every example with a working preview, adjustable settings, source code, dependencies, license/source details, mobile behavior, checks, and known limitations. Track the version used by each project.
- [ ] Add focused skills for reference analysis, art direction, typography, asset selection, motion, and 3D construction. Each skill must produce useful records or evidence that the runtime can inspect.
- [ ] Let Taro search by capability and project fit. Preserve the existing project's visual identity when adapting an example.

**Visible result:** Gallery becomes a useful collection of techniques that can be previewed and adapted. A user can understand what an example contributes before using it.

**Done when:** Taro selects and adapts an appropriate example for a new brief, handles a dependency mismatch honestly, and can update or replace it without overwriting unrelated work.

**References and code examples:** [Storybook's adjustable component examples](https://storybook.js.org/docs/writing-stories/args) and [shadcn's package records](https://ui.shadcn.com/docs/registry/registry-item-json). Borrow the patterns without imposing either tool's appearance. Use Taro's existing skill importer and Superpowers planning/verification discipline. Skills guide decisions; tools, saved state, and actual checks establish results.

**9. Measure quality and release only demonstrated improvements**

- [ ] Expand the initial pair into twelve fixed briefs, split equally between ordinary websites and 3D experiences. Include different visual styles, long text, missing assets, and existing projects that must keep their identity. Keep some briefs unseen during tuning.
- [ ] Run each brief three times under recorded settings. Compare old and new Taro with the same assets, requested behavior, viewport sizes, and effort budget. These counts are a practical starting sample, not statistical proof.
- [ ] Use blind side-by-side human review for visual preference and adherence to the brief. Keep separate results for working interactions, accessibility findings, motion quality, performance, and recovery.
- [ ] Record time, model usage, tool calls, and available cost information. Mark unavailable costs unknown. Set performance targets for named test devices after measuring the baseline; do not promise a universal frame rate.
- [ ] Exercise cancellation, restart, disconnected providers, changed source files, failed assets, stale evidence, and budget exhaustion. Show partial results with a resume path.

**Visible result:** a short release scorecard showing where Taro improved, regressed, or still needs work, with links to the evidence.

**Done when:** every shipped example completes its promised interaction checks, known critical failures are resolved, and both website and 3D results improve in review without hidden regressions or uncontrolled cost. If one category trails, retain its earlier working behavior and continue improving it.

**References and example code:** evaluation, usage, comparison, and recovery references are collected in [agent quality research](A:/taro/docs/research/2026-11-15-taro-agent-quality.md). The existing [ADI acceptance record](A:/taro/docs/adi/acceptance.md) is the starting record, not evidence that the proposed improvements already pass.

**Dependencies and ownership**

| Work | Needs first | Existing part to extend |
| --- | --- | --- |
| Model checks and baseline | Configured endpoints and two fixed briefs | Models, usage records, Tasks |
| Durable project direction | Existing project identity/storage | ArtifactDesign, context, DesignJob |
| Reference analysis and alternatives | Image-capable model, durable direction, previews | Attachments, Layout Designer, DesignJob |
| Asset collection | Durable storage and provider connections | Media, Gallery, plugins |
| Rich handoff and scenes | Direction, asset records, suitable examples | DesignIntent, ArtifactDesign, Code role |
| Interaction review | Existing browser bridge and saved revisions | Review, browser tools, evidence storage |
| Critique and focused refinement | Rendered evidence, approved direction, revision history | ADI, DesignJob, QA, source review |
| Recipe library and skills | Asset records, handoff format, review checks | Gallery, reuse, skill importer |
| Wider evaluation | Initial two complete journeys | Acceptance scripts, Tasks, usage records |

**Coverage of the earlier recommendations**

| Earlier idea | Covered here |
| --- | --- |
| Reference-driven DesignJob and multiple directions | 2, 3 |
| Richer layout, motion, and scene handoffs | 5 |
| Asset search, import, generation, editing, optimization, and provenance | 4 |
| Motion/3D implementation toolkit and adaptive performance | 5, 8 |
| Review interactions, playback, screenshots, video, errors, and performance | 6 |
| ADI visual judgment alongside existing rules | 7 |
| Configurable refinement and keeping the best version | 7 |
| Expanded typography, imagery, and project style contract | 2, 4, 5 |
| Executable examples and focused design skills | 8 |
| Verified model capabilities | 1 |
| Durable visual context and project memory | 2 |
| Focused editing and regression checks | 7 |
| Human comparisons, benchmarks, time, and cost | 1, 9 |
| Real-provider desktop journey and restart/resumption | 1, 2, 9 |

**Research and example-code reading guide**

- [References, art direction, project styles, and example packaging](A:/taro/docs/research/2026-11-15-taro-art-direction.md)
- [Browser interaction, motion evidence, visual checks, and replay](A:/taro/docs/research/2026-11-15-taro-browser-review.md)
- [Assets, generation/editing, motion, 3D, and performance](A:/taro/docs/research/2026-11-15-taro-assets-motion-3d.md)
- [Model capability, memory, focused changes, refinement, and evaluation](A:/taro/docs/research/2026-11-15-taro-agent-quality.md)

Each research note distinguishes observed Taro behavior, external references, reviewed example code, and proposed changes. References establish useful building blocks; Taro's own end-to-end checks must establish integration quality. Recheck dependency compatibility and source/asset terms at implementation time. Public source code and public demonstration media can have different reuse conditions.
