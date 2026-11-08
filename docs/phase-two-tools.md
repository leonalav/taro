# Callable professional tools

The desktop model/tool loop now executes the Phase 2 tools using the implementations in `src/lib/professional-runtime.ts`, `src/lib/phase-two-catalog.ts`, and the native Rust modules. The local Claude Code reference informed schemas, task retrieval semantics, planning approval, skill loading, worktree lifecycle, and LSP operations. Taro retains its own provider credentials, approval rules, ThoughtLine, and artifact components.

Live execution requires the Tauri desktop app and a configured model. The browser preview remains a UI preview. Rebuild/restart the desktop process after changing native code (`pnpm desktop:dev` for development).

## Discovery and calling conventions

The existing file, shell, and MCP tools remain available. ToolSearch is also available immediately; other professional tool schemas are loaded on discovery. Models can discover names directly:

```json
{"query":"select:PowerShell,Agent,TaskOutput,TaskStop","max_results":5}
```

Keyword queries rank name/description matches. A `+word` requires that word. Discovery returns names, query, and the catalog's deferred-tool count; it does not execute a matching tool. Loaded schemas are passed on the next model request. Read-only agents discover only permitted tools.

| Tool | Main inputs | Actual behavior |
| --- | --- | --- |
| LSP | `operation`, `filePath`, `line`, `character` | Installed stdio server, real JSON-RPC results; source positions are 1-based UTF-16 |
| PowerShell | `command`, optional `description`, `timeout`, `run_in_background` | Native PowerShell, foreground/background execution, output capture and process-tree cancellation |
| Agent | `description`, `prompt`, optional `subagent_type`, `model`, `run_in_background`, `isolation` | Separate configured-model/tool loop; optional isolated Git worktree |
| TaskOutput | `task_id`, optional `block`, `timeout` | Current/completed shell or child-agent output, with separate retrieval/task status |
| TaskStop | `task_id` | Stops a running task and retains partial output; child-agent stop cascades to descendants |
| EnterPlanMode | Optional `name`, `kind` (`Plan` or `Design Plan`) | Creates a real plan file and enables native planning restrictions |
| ExitPlanMode | No required inputs | Reads the actual file, emits a document card, requests one-time approval, then exits planning |
| EnterWorktree | Optional `name` | Creates a real Git worktree/branch and switches subsequent native tool roots |
| ExitWorktree | `action` (`keep` or `remove`), optional `discard_changes` | Restores the original root; removal protects dirty files and unmerged commits |
| Skill | `skill`, optional `args` | Reads actual workspace SKILL.md instructions; `skill="list"` discovers them |
| ToolSearch | `query`, optional `max_results` | Deferred schema discovery, default five results, maximum twenty |

## Shell and agent tasks

PowerShell uses `pwsh.exe` with Windows PowerShell fallback on Windows, or installed `pwsh` on Unix. Bash uses installed Git Bash on Windows and Bash on Unix. Both support background execution. The foreground timeout defaults to 120 seconds, with a maximum of 600 seconds. A foreground timeout or cancelled invocation terminates its process tree. Explicit background tasks continue until exit, TaskStop, or application shutdown.

TaskOutput defaults to `block=true` and `timeout=30000` milliseconds (maximum 600000). Retrieval is `success`, `not_ready`, or `timeout`, separately from the task's running/completed/failed/stopped state. Timing out while reading output does not stop the task. Native shell output files live under `.taro/tasks/`; inline output is limited to 100 kB and files to 4 MB. Prefer Read on an output file where available. Task lookup/control is scoped to the original workspace and chat, including that chat's descendants, even when the active working directory changes to a worktree. The root chat can retrieve and stop shell jobs created by its child agents; stopping a child also stops its detached shell jobs.

Agent types are `Explore`, `Plan`, and `general-purpose`. Explore/Plan agents are read-only, including native enforcement. The model override must match a configured model's ID or label; omission inherits the current model. Children retain normal approval requirements and receive safe tool results, including image reads. Agent runs allow up to 32 model/tool rounds, two levels of children, and eight concurrent children per root chat. Background agent output is retrieved through TaskOutput; the root chat can manage nested descendants too. Known task IDs are supplied to later model turns in the same chat so users do not need to copy IDs from earlier tool output. Isolated child worktrees are kept for review.

Task registries and active session modes are held for the current application lifetime. Shell output/plan files and Git worktrees persist on disk. On reopening, unfinished UI progress and child cards are marked interrupted; old in-memory task IDs are not resumed. Existing Git worktrees can be opened as folders or managed with Git after a restart.

## LSP setup

All nine reference operations are implemented: `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, and `outgoingCalls`.

Known server executables are selected from PATH for supported languages. A workspace configuration overrides defaults; nothing is installed automatically. Example `.taro/lsp.json`:

```json
{
  "servers": {
    "typescript": {
      "command": "typescript-language-server",
      "args": ["--stdio"],
      "extensionToLanguage": {
        ".ts": "typescript",
        ".tsx": "typescriptreact"
      }
    }
  }
}
```

Reference-style `.lsp.json` direct server maps are also supported. Optional server `settings` and `initializationOptions` are forwarded. Each invocation initializes an approved server, opens the current source text, executes the request, and shuts down the process tree. Missing servers, invalid positions, and protocol errors return explicit errors. LSP requires tool approval because configuration selects an executable.

## Plans and worktrees

EnterPlanMode returns a workspace-contained `.taro/plans/*.md` path. Read-only inspection, task cancellation, and Write/Edit to exactly that plan are allowed; other mutations are blocked natively. Planning restrictions also apply to later tool calls from previously spawned writable descendants. General-purpose delegation and worktree creation cannot bypass planning.

ExitPlanMode reads the Markdown from disk and emits the established Plan/Design Plan card before approval. Open uses the existing Markdown taskbar editor. Edits to live plan documents are serialized back to the real file. Exit requires an unchanged preview: if the file changes during review, the model must preview it again. Denial leaves planning mode active. Plan exit and destructive worktree exit use one-time decisions rather than standing allow rules.

Worktrees require an existing Git repository. Names/paths are validated, and removal is limited to the tracked worktree and branch. Dirty files or commits beyond the recorded base require `discard_changes=true` and explicit approval. Git commands have a 30-second deadline and bounded output. The Taro project is not automatically initialized as a Git repository.

## Skills

Skill searches `.taro/skills/<name>/SKILL.md`, `.claude/skills/<name>/SKILL.md`, and `.agents/skills/<name>/SKILL.md` inside the active workspace. File paths and symlinks are checked. The result includes the skill body, base directory, optional model/tool metadata, and arguments substituted for `$ARGUMENTS`.

Inline context returns instructions to the current model. `context: fork` starts a child model/tool loop; any `allowed-tools` metadata narrows that child's tools and does not bypass approvals. Forked skills invoked during planning run read-only. UI sample skill names do not imply that a matching workspace skill file exists.

## Artifacts and verification

Actual shell commands and skill invocations use the existing groupable rows. Other tool outputs remain expandable in activity groups; child agents update the existing subagent card. Plan entry uses the “Enter plan mode” divider and plan review uses the shared document-card frame. ThoughtLine receives observable activity summaries rather than private model reasoning.

Native tests exercise actual PowerShell/Git Bash processes, output limits, cancellation and descendants, temporary Git repositories, disk plans, workspace skills, and a spawned test language server for all nine LSP operations. Frontend tests exercise the actual App loop with mocked provider/native IO and the independent tool runtime, including deferred discovery, approvals, plan Open, child tasks, cancellation, and cross-chat/workspace isolation. A real remote model endpoint was not invoked during these tests. Unix process-group cleanup has platform-specific tests that cannot run on the Windows host.
