# Working integrations

The source-control, Tasks, Models, Skills, and Agents screens now use real services rather than simulated success messages. The desktop app is required for native Git, credential storage, skill import, model requests, and tool execution. Browser preview supports configuration and task editing/persistence and explicitly identifies unavailable native actions.

## Setup

1. Start the desktop app with `pnpm desktop:dev` and select a workspace folder.
2. In **Settings → Models**, add a display name, the provider's exact model ID, an HTTP(S) endpoint, and an optional API key. `/v1` bases and full `/chat/completions` and `/responses` endpoints are supported. Edit the saved model to replace an endpoint or key. Keys live in the operating-system credential store; model metadata lives in SQLite. Legacy keys are migrated before their old metadata is replaced.
3. In **Settings → Agents**, choose configured models for the Designer, Type & QA, Code, and Orchestrator roles. The first configured model is assigned to roles that have no configured endpoint. Disabled roles cannot run, and an unavailable assigned model produces a configuration error. Suggest mode is read-only, including delegation; other modes retain normal tool permissions.
4. In **Settings → Source Control**, connect a verified GitHub access token or import an existing `gh auth login --hostname github.com` login. HTTPS GitHub operations use the saved token; SSH uses the configured SSH identity. GitHub repository/PR-base selection is in the composer icon between slash commands and Permission. That icon appears only after account verification. Selecting remote metadata does not silently clone a repository or change the local workspace.
5. In **Settings → Plugins**, configure real MCP HTTP or stdio transports and test tool discovery. Stdio executable and JSON arguments are separate fields so paths with spaces remain literal. HTTP bearer secrets use the credential store. Import actual Claude Code, Codex, or OpenCode skills from installed locations or a selected directory. Imports retain supporting files in `.taro/skills` without overwriting existing skills or granting additional permissions.

## Source control

Status, index/worktree diffs, stage/unstage, explicit commits, history, branches, discard, revert commits, push, fast-forward pull, and pull-request creation use native Git/GitHub results. Partially staged files appear in both views. Errors, conflicts, detached/unborn HEAD, dirty checkouts, remote mismatch, revoked credentials, pagination, rate limits, unsafe paths, junctions, and process timeouts have explicit behavior.

Source review opens the real diff. Approval stages the file, while comments become durable workspace Tasks. The excluded Require design approval, Auto-commit, and Sign commits controls remain disabled. No simulated review, commit, repository, or authentication success is produced.

## Tasks and artifacts

Boards belong to the normalized workspace key, not to one chat. The four columns are Failed, To Do, In Progress, and Done. Create, search, priority/status filter, edit, run, retry, stop, and manual completion are available in Tasks.

An executing task has its own model/tool loop, approvals, child-agent results, raw tool requests/results, plans, and transcript. Tool execution and approvals appear in Tasks rather than being appended to the AI chat. The agent supplies priority, one-word tags, explanation, and numbered solution steps. Completion requires descriptions for What was done and The final product. Original plans and previous attempts remain retained.

SQLite persists task records and artifacts. Restart marks interrupted work Failed and preserves evidence; it never automatically replays uncertain side effects. Concurrent starts are rejected per workspace. Stop cancels root/child requests and shell scopes. Completion waits for owned background work, rejects failed children, and cannot follow another failed operation in the same tool batch. Failed writes retain unsaved results in memory with a retry control; the UI does not claim they were saved.

## Activity and recovery

Statistics uses recorded successful requests, file edits, design-plan revisions, Git commits/reverts, and completed tasks. Generated contribution data and fictional billing figures have been removed. Repeated events and unchanged plan previews are deduplicated. Date buckets use local dates.

Unreadable saved activity is preserved, and failed writes retain confirmed events for retry. Startup storage failures block writes to unknown chat/preferences data and expose a reload action. Task read failures preserve original records and expose retry instead of silently replacing the board.

## Verification

Automated coverage includes temporary real Git repositories and a bare remote, staged/worktree separation, conflicts and divergence, Windows process-tree and junction protection, local HTTP endpoint/tool streaming and GitHub authentication/error handling, skill imports, role/permission inheritance, task recovery/cancellation/persistence, credential migration, and real activity aggregation.

Final checks: 216 frontend tests and 126 native tests passed; TypeScript, the production frontend build, and whitespace checks passed.

Browser checks cover task creation/completion/reload, Unicode text, endpoint persistence, removed legacy controls, logged-out composer behavior, Orchestrator/skill screens, completed-task heatmap activity, and wide/narrow layouts. Evidence is in `.verification-2026-11-09/`.

Live GitHub account access, pull-request creation, and requests to the user's external model/MCP services require their credentials and were not exercised against their accounts. Local HTTP tests exercise the corresponding request/response paths without making remote writes.

Reference inspection and provenance: [local reference manifest](superpowers/working-integrations-reference-manifest.md).
