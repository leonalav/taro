# Adaptive Design Intelligence and Review Feedback — Design Specification

Date: 2026-11-13  
Status: proposed architecture for the requested build plan; no product implementation in this change.  
Inspected checkout: A:/taro, main, HEAD 89e5971143cecb26f89f5973f68857b67ed578e5. Line references in the companion plan refer to the inspected working files, not a claimed clean Git diff.

## Intent

Make Taro use a source-backed design library whenever it creates or changes a frontend, and make Review comments usable from annotation through verified correction. The user's supplied blueprint is the functional specification: request → context classification → convention registry → selection/conflict resolution → design plan → implementation → render/inspect/correct/validate.

The runtime must require observable design artifacts and tool evidence. A stronger prompt alone cannot enforce this. The system cannot prove what a language model internally considered; it can require authenticated library retrieval, explicit decisions, scoped mutations, and evidence-bound completion.

## Chosen architecture and alternatives

Recommended: a versioned, locally bundled registry plus a persisted ADI contract, enforced at TypeScript orchestration and native mutation boundaries. Reuse ArtifactDesign, DesignJob, Tasks and Review; do not introduce a second agent framework.

Prompt-only instructions are cheaper but cannot prevent skipped planning or unsupported completion. A remote retrieval service could expand search, but adds availability and provenance risks and is unnecessary for an indexed standards library. Start with structured local search; official-source updates are a separate maintenance workflow.

This recommendation is a planning assumption, not a claim that the user previously approved a particular implementation.

## Required behavior

1. Every run is classified using the request, references, incumbent code/design contract and intended changes. Classification records platform, audience, function, aesthetic, constraints, input methods, domain and scope. Uncertainty remains visible.
2. Every frontend mutation requires a current ADI contract. Discussion and backend-only work are classified but do not require a frontend audit. Unknown mutation scope is handled conservatively. Solo execution obeys the same contract as delegated execution.
3. The convention registry contains the six blueprint categories: accessibility; interaction/UX; visual composition; typography/color; platform; domain patterns.
4. Each source preserves publisher, edition, canonical URL, section anchor, retrieval date, content hash, source status and content-use rights. Original text and Taro's derived implementation guidance are separate fields.
5. Public availability is not permission to redistribute an entire source. Licensed ISO clauses must be imported only with appropriate rights; unavailable full text remains explicitly unavailable. An abstract is never represented as the full standard.
6. The baseline is applicable WCAG 2.2 A and AA requirements, with APG patterns selected by actual components. APG is informative guidance. Platform libraries and aesthetics are conditional selections, not all simultaneously mandatory.
7. Selected conventions produce concrete decisions: layout, tokens, components/states, keyboard/focus behavior, responsive behavior, content, error handling, motion, and verification criteria. Preserve existing identity unless the user requests change.
8. A design plan links decisions and affected files/components to rule IDs. Claims that a rule is inapplicable require evidence and rationale; exceptions in the original source remain attached.
9. Render actual output, inspect, run machine checks, assess remaining visual/manual requirements, correct failures, then verify again. Machine checks alone do not establish full WCAG conformance.
10. Completion uses evidence tied to contract digest, workspace identity, source revision, preview revision and audit execution. Subsequent mutations invalidate it. Stop/budget exhaustion/unavailable browser yields an explicit blocked/interrupted result, never a verified pass.
11. Review annotation works on live previews and saved captures, including zoom, scroll, narrow panels and keyboard access. Saved capture comments never require reopening a live page.
12. Comment persistence is idempotent. Task synchronization failure cannot duplicate or erase the saved comment. Feedback is discoverable by agents and can be explicitly queued to an agent.
13. Commenting does not automatically authorize a code change. Preserve today's task creation behavior, but queue execution only on a user's Run/Fix action or as part of an already authorized active build.
14. Original comment anchors and revision history are immutable. A correction records a separately verified target on a new revision; missing/ambiguous targets remain unresolved.
15. All stages, selected sources, blocked operations, audits and feedback dispositions are visible through existing Tasks/activity and Review surfaces.

## Selection and conflict policy

Hard constraints: actual source requirements under the selected conformance target, platform necessities and project constraints. The default accessibility target is a Taro policy choice, recorded as such. User preferences can choose visual direction; they cannot silently turn an accessibility failure into a pass.

Resolve by applicability first, then mandatory versus advisory status, then target platform, then explicit product/brand choice, then incumbent project patterns, then optional stylistic preference. Compatible guidance may combine; conflicting requirements produce an explicit unresolved conflict. Desktop conventions follow the target platform, not the operating system running the agent.

Grid, spacing, typography, optical alignment, balance, contrast hierarchy, harmony, whitespace, density, component consistency and motion all need decisions or explicit inapplicability. They are not universal fixed pixel prescriptions.

## Library scope and completeness

Include the named families from all six supplied images: WCAG; APG; ISO 9241-110/-210/-112; Nielsen; Shneiderman; Apple HIG; Fluent 2; Material 3; Carbon; Atlassian; Gestalt; Fitts; Hick; Jakob; visual hierarchy; progressive disclosure; recognition; error prevention; consistency; density; grid/typography/spacing/color/optical alignment/balance/whitespace/motion; Swiss typography; Modernism; Bauhaus; Rams; and CRAP.

Completeness has two independent measures:
- Source coverage: all sections in an approved source manifest accounted for as imported, licensed-local, excluded with reason, or unavailable.
- Runtime coverage: every applicable required rule has a decision and verification disposition.

A limited public-source release must display its coverage honestly. Full licensed coverage is a content-delivery dependency, not something to replace with invented summaries.

## Non-goals

No forced enterprise dashboard appearance; no automatic installation of five design-system component libraries; no guarantee that passing a screenshot audit means the entire product is accessible; no automatic source updates mid-run; no claim of adversarial OS sandboxing by a workflow gate; no implementation in this planning turn.

## Acceptance scenarios

- “Make this button clearer,” a reference-only request, a Vietnamese UI request, a direct CSS edit and a solo run all activate the appropriate ADI path.
- Backend-only changes avoid UI audit overhead; an unexpected frontend mutation upgrades the run before that write.
- A model skips retrieval, tries raw shell/MCP mutation, invents evidence, or answers “done” early: the runtime rejects the transition with the missing step.
- A live and saved preview both support annotate → post → reload → reply → queue fix → new revision → audit → verified resolution.
- A comment save succeeds but task sync fails: the UI reports saved/pending sync, and retry creates exactly one thread and one task.
- An old selector matches a different element: do not silently resolve the original issue.
- A browser failure, missing licensed source, open mandatory check or stale audit is visible as blocked/incomplete.
