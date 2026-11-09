# Working integrations

User authorized full implementation using engineering judgment on 2026-11-09, opting out of further design discussion.

Extend the incumbent React/Tauri application. Replace simulated source-control actions with native Git and authenticated GitHub operations. Share live repository state between Settings and the composer. Credentials remain in the operating-system credential store. Repository selection must not silently change the active filesystem workspace. Preserve require-design-approval, auto-commit, and commit-signing as explicitly excluded behavior.

Persist workspace-scoped tasks with their plans, run transcripts, permissions, child agents, and artifacts. Failed replaces Backlog. To Do, In Progress, and Done remain. Each task has a Low/Medium/High priority, one-word tags, numbered explanation and plan, and completion descriptions. Execution belongs to Tasks rather than the chat transcript. Failures retain all outputs and are retryable. Restart interrupts active tasks without deleting their artifacts.

Accept custom model base URLs and complete chat-completions/responses URLs. Save model settings independently from secrets, restore them on relaunch, and use the correct protocol including tool calls.

Replace generated contribution counts with persisted, deduplicated real events. Expose installed/imported Claude Code, Codex, and OpenCode skills and configured integrations to the actual tool runtime. Imported content cannot grant additional permissions. Enforce Designer, Type & QA, Code, and Orchestrator agent configurations, model selection, enablement, delegation, limits, and cancellation.

Approaches considered: replace the runtime (high migration and artifact risk); extend existing native commands, run ledger, tool runtime, and SQL storage (selected for compatibility and data preservation). Use local reference checkouts for behavior and tests, retaining license provenance.

Verification covers Git index semantics and conflicts, endpoint routing and tool-stream decoding, task persistence and recovery, real heatmap aggregation, skill discovery, disabled/read-only agents, cancellation, and full frontend/native regression suites. Real remote login and provider calls require the user's own credentials; report that boundary accurately.
