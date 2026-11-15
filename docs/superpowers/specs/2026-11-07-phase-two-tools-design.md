# Callable Phase 2 tools

Implement the screenshot's LSP, PowerShell, Agent, TaskOutput, TaskStop, Plan Mode, Worktrees, Skills, and ToolSearch as real tools callable by the configured model. Use `refs/claude-code/src/tools` heavily for schemas and behavior, while retaining Taro's Rust/Tauri execution, model credentials, permissions, ThoughtLine, and established artifact formats.

## Architecture

Rust owns OS/process operations and workspace/session enforcement. A focused TypeScript runtime owns deferred schemas, tool discovery, model-powered child agents, cancellation, and artifact events. The current App tool loop calls that runtime instead of adding a second unrelated implementation. All results return text plus structured artifacts to the model and UI.

## Tool behavior

- PowerShell runs the real installed shell, supports bounded foreground waits and background tasks, captures stdout/stderr and output paths, and cancels process trees. TaskOutput distinguishes retrieval state from task state; TaskStop validates scope and running status. Task output is readable within the workspace. Each chat's tasks remain scoped to that chat/workspace.
- LSP launches an installed/configured language server over stdio JSON-RPC, initializes it, opens the source file, converts 1-based positions to LSP positions, and implements all nine operations from the reference. Return an actionable missing-server error instead of synthesizing results. Starting an LSP server uses existing explicit tool approval because server configuration names an executable.
- EnterPlanMode establishes session planning state and a workspace-contained plan path. Only reads and edits of that plan are allowed in plan mode; shell, workspace mutations, and general-purpose children cannot bypass it. ExitPlanMode loads the actual Markdown and emits the matching Plan/Design Plan card before asking for approval; rejection leaves plan mode active.
- Worktrees use Git worktree commands, track path/branch/original HEAD per chat, switch subsequent tool roots, restore the original root on exit, and protect dirty/unmerged work. Removal needs user approval and explicit discard when needed. Tests use temporary repositories; do not initialize or modify the reference repository.
- Skill loads actual workspace SKILL.md files, includes the base directory/arguments, supports inline/forked context, and preserves execution permissions. Discover workspace skills instead of advertising unavailable built-ins as executable.
- ToolSearch supports keyword and `select:A,B` discovery, reports available matches, and exposes their schemas to subsequent model requests. Discovery does not execute tools.
- Agent runs a separate bounded model/tool loop with its own prompt/context, optional configured model override, read-only Explore/Plan restrictions, foreground/background operation, cancellation, and optional isolated worktree. Results and child activities populate the existing subagent card. TaskOutput/TaskStop also route to child tasks. Unknown child IDs fail clearly. Child permissions always use the existing approval flow.

## Constraints

Preserve the current artifact design and ThoughtLine status summaries. Do not expose private model reasoning or copy Claude's provider/auth/terminal-UI framework. Native checks enforce workspace boundaries and planning restrictions independently of model prompts. No package installation in user workspaces, silent permission bypass, destructive Git operation, or automatic deployment. Root has no Git checkout; implementation proceeds in place. Use clear errors for missing PowerShell, Git, or language-server executables.

## Verification

Native tests cover actual command output/background lifecycle/cancellation, isolation, plan guards, worktree lifecycle with dirty protection, skill file loading, LSP protocol framing and fake-server calls. Frontend tests cover exposed schemas, deferred discovery, child model/tool loops, permissions, cancellation, and actual App integration/artifact mapping. Run full Vitest, TypeScript, Cargo checks/tests, and production build; obtain focused reviews of the native modules and orchestration.
