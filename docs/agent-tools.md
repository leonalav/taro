# Agent tool and artifact mapping

## Callable Phase 2 tools

The desktop model loop now executes LSP, PowerShell, Agent, TaskOutput, TaskStop, Enter/ExitPlanMode, Enter/ExitWorktree, Skill, and ToolSearch. They feed the existing artifacts and approval system. ToolSearch exposes deferred schemas to later model requests; native modules perform actual process, language-server, plan, Git, and skill-file operations. See [Phase 2 tools](phase-two-tools.md) for configuration, inputs, lifecycle, and verification limits.

## ThoughtLine progress

The supplied React Bits ThoughtLine replaces the generic thinking placeholder and legacy completed-trace disclosure. It uses `glyph="dot"`, the supplied Motion breathing/shimmer/settle behavior, and Hugeicons chevron/check marks. No sparkle icon is imported. `thought-line.tsx` retains the supplied props, adds a Taro reduced-motion override, and wraps trace steps in narrow panels.

Each live generation has one typed `thought` message. Observable model-response, tool, and permission events append safe status summaries; no model reasoning is displayed. The progress line remains through tool rounds, records elapsed wall time across chat remounts, and collapses on completion. Stopped/failed/interrupted runs have distinct settled labels. Model output and tool groups retain their existing transcript order.

`agent-progress.ts` owns immutable transitions and restart recovery. Browser and desktop loads mark unfinished runs and old empty generating placeholders as interrupted. Stop during stalled MCP discovery releases the UI immediately and ignores late discovery results. Plan/preview generations also use typed progress and cancel their pending preview timer on Stop.

Tests cover timer freezing/restart, controlled elapsed, auto-settle, one settle callback per transition, disclosure behavior, recovery, actual App model/tool orchestration with mocked external IO, approvals, completion, failure, stop, and stalled discovery. A temporary component harness verified working/completed/stopped states and narrow wrapping; its source was removed after inspection. The capture is `docs/previews/thought-line.png`.

## Phase 2 reference previews

Nike/Brand Discovery uses the existing compact artifact language for the Phase 2 previews. PowerShell uses the same groupable `terminal` activity rows as Bash. LSP, TaskOutput, TaskStop, worktrees, and ToolSearch use compact disclosures matching the original Edited rows. “Enter plan mode” uses the existing context-summary event divider. Skills reuse the original `/visual-qa` invocation in `m2a`; the duplicate card has been removed. Agent retains its existing subagent card. These examples do not register or execute new live tools.

Design Plan and Plan are document artifacts containing a plan name, Markdown path, and Open button. `document-artifact.tsx` supplies exactly the same frame geometry for these cards and Design Tokens (183px card height, equal width at each chat size). Open uses the existing Markdown taskbar/editor route, with a distinct title and document per artifact. Plan edits persist in the chat message payload and remain isolated from other plans and token documents.

Typed data and legacy conversion live in `src/data/phase-two.ts`; rendering uses the existing activity/event components, `tool-result-row.tsx`, and `plan-artifact.tsx`. `artifact-documents.ts` resolves the correct Markdown. The shared reference upgrade runs for browser local storage and desktop SQLite, converting the retired large cards and removing the duplicate skill card while preserving other history and edited plan content. Repeated upgrades add no duplicates.

| Reference source under `refs/claude-code/src/tools/` | Behavior represented |
| --- | --- |
| `LSPTool/schemas.ts`, `LSPTool/UI.tsx` | Operation, file path, 1-based line/column, and symbol locations; missing language-server recovery |
| `PowerShellTool/PowerShellTool.tsx` | Command, background task ID, output file, stdout/stderr, interruption |
| `AgentTool/AgentTool.tsx`, `AgentTool/UI.tsx` | Existing card: description, prompt, type, inherited model, background execution, isolation, activity, result |
| `TaskOutputTool/TaskOutputTool.tsx` | Separate retrieval and task statuses; non-blocking reads; legacy tool deprecated in favor of Read on the output file |
| `TaskStopTool/TaskStopTool.ts` | Task identity/type and stopped command; task must be running |
| `EnterPlanModeTool/EnterPlanModeTool.ts`, `ExitPlanModeTool/ExitPlanModeV2Tool.ts` | Exploration mode, plan read from disk, requested permissions, approval before implementation |
| `EnterWorktreeTool/EnterWorktreeTool.ts`, `ExitWorktreeTool/ExitWorktreeTool.ts` | Path/branch, working-directory switch, keep/remove, explicit discard for dirty or unmerged work |
| `SkillTool/SkillTool.ts` | Skill/arguments, inline or forked context, allowed tools; loading is distinct from completing a review |
| `ToolSearchTool/ToolSearchTool.ts` | Deferred tools, keyword or `select:` query, default result limit 5, discovered names distinct from invocation |

## Existing live tools

The `taro / Nike/Brand Discovery` seed remains the reference conversation. Its `activity-group` message demonstrates rows for skills, MCP, plugins, file reads, searches, file edits, and terminal commands. Its standalone `tool` diff demonstrates an edit result. Token, question, and skeletal cards are design outputs; they remain available as typed messages, separate from a tool result.

| Agent tool | Nike reference | Live grouped row |
| --- | --- | --- |
| Read | `file-read` activity | File name, line-numbered result or image preview |
| ListFiles | No dedicated list artifact | `file-list` row with directory entries and expandable output |
| Write | `file-edit` activity and standalone `tool` diff | Changed file, result, before/after diff |
| Edit | `file-edit` activity and standalone `tool` diff | Changed file, replacement result, before/after diff |
| Glob | `search` activity | Matching file paths, expandable result |
| Grep | `search` activity | Matching files and numbered lines, expandable result |
| NotebookEdit | No notebook-specific seed | `file-edit` row with notebook cell change and diff |
| Bash | `terminal` activity | Command, exit code, expandable output |
| MCP | `mcp` activity and permission card | Server/tool call, permission card, expandable result |

The tool loop creates a separate `activity-group` for each model tool batch, leaving the model's narration between groups. Rows update from running to done or failed and persist with the chat. Read, ListFiles, Glob, and Grep are read-only and confined to the selected workspace; the model is instructed to use them instead of Bash for inspection. Write, Edit, NotebookEdit, and Bash need one-time approval. MCP permission cards offer one-time, chat-session, and saved allow or deny rules for a tool or server. The existing Nike reference session cannot be renamed, moved, archived, or deleted by Explorer actions.

The @ menu loads real file paths from the active folder and configured MCP servers. File chips retain their workspace-relative paths in the message sent to the model. Chat titles can be edited from the header, Explorer menu, or by double-clicking a chat in the Explorer sidebar.

If a model still requests Bash for `ls`, `find`, `rg`, or similar file-inspection commands, the loop returns a tool result instructing it to use the read-only tools without showing a Bash approval card.

## Agent foundation frontend previews

Nike/Brand Discovery now includes a labeled sample workflow and a collapsed state gallery for checkpoint/review/restore, durable context, limits, instructions and recovery. All entries, including the foundation Design Plan, are groupable activity rows. The plan opens the existing Markdown editor; its edits persist independently in the chat payload. Saved Nike sessions gain missing samples once without replacing history or edited documents.

Sample actions never invoke native filesystem, Git, process or model operations. Live actions without a connected handler remain disabled. This presentation phase does not implement the new native foundation runtime. See [verification and pending work](agent-foundation-verification.md) and [reference provenance](agent-foundation-reference-manifest.md).
