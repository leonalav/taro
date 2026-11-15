# Workspace terminals, Rules and Statistics

The Explorer toolbar has adjacent Folder and Terminal buttons. Folder returns to the file tree; Terminal opens workspace sessions in the same side panel. File tabs remain available. The terminal renderer loads only when first opened.

Explorer subscribes to native filesystem notifications for the workspace root, expanded directories and the parents of displayed search matches. External creates, edits, renames and deletions refresh visible entries, open previews and active searches. Notifications are coalesced into 180 ms batches; refreshes are serialized. Subscriptions remain stable across renders and are released on folder changes or unmount. This follows the stable subscription/debounce lifecycle in the reference's `hooks/useTaskListWatcher.ts`. Collapsed subtrees are read when expanded, avoiding recursive watches of dependency/build directories.

## User terminals

User terminals are native pseudoterminals, rendered with xterm.js. CMD, Windows PowerShell and an installed Bash are supported on Windows. Bash prefers Git for Windows. Missing shells produce an error; Taro does not install them automatically. New sessions start at the selected workspace directory. A session may subsequently change its own directory using normal shell commands.

Sessions are associated with their original workspace. Switching folders selects that folder's sessions, never another folder's stdin. Hiding the panel keeps shells running. Closing a user tab stops its shell and descendants; exiting Taro closes all user terminals. Sessions do not resume after restarting Taro.

Carriage-return progress updates replace the current logical line, including its wrapped rows in narrow panels, instead of accumulating a new row on every update. Parser writes are serialized so wrap positions are current. Normal CRLF output and alternate-screen applications retain normal behavior. Read-only agent output and terminal chat logs also collapse carriage-return updates; raw native task output is retained.

Native commands: `terminal_create`, `terminal_read`, `terminal_write`, `terminal_resize`, `terminal_close`. Only IDs created by the user-terminal registry can be written. Limits: eight sessions, 1 MiB output ring per session, 64 KiB read pages/input requests, 1–1000 columns and 1–500 rows. Output uses base64 byte pages so split UTF-8 sequences reach xterm intact. Stale cursors report discarded history; exit is reported only after all remaining pages drain. Windows Job Objects stop process trees. ConPTY's initial cursor query is answered before returning the session.

## Agent terminals

The Agent tab views actual Bash/PowerShell tasks from the existing agent runtime, including foreground, background and child-agent tasks. It is read only: no stdin, close or stop action is exposed there. Runtime cancellation and approvals retain their existing behavior.

`agent_terminal_list` returns at most 64 task summaries for the canonical selected workspace, without copying every output buffer. `agent_terminal_read` retrieves one actual bounded task snapshot and rejects IDs belonging to another workspace. Agent process metadata is held for the current desktop lifetime; bounded output files remain under `.taro/tasks`.

## Workspace rules

Always, Design and Code organize guidance; every enabled category is included in every coding run. New workspaces receive six enabled defaults covering intent, focused changes, verification, existing visual conventions, accessibility and maintainable code. Rules can be added, edited, toggled and deleted.

Preferences are keyed by normalized workspace path, with a folder-ID fallback before a physical directory is selected. Desktop settings save in SQLite; browser previews save locally. SQLite writes are serialized. Empty rule lists and custom text are preserved; only the exact old demo seed is eligible for migration.

The compiler emits one stable, encoded rules block, shared by the root agent and its children for that run. Limits: 24 rules, 600 characters per rule and 8,000 compiled characters for enabled rules. Oversized enabled configurations visibly block starting a task until repaired; no enabled rule is silently discarded. Changing a rule affects subsequent runs; already-running children keep their captured rules snapshot. Rules supply model guidance; native tool boundaries and user approvals remain authoritative.

## Context management

Professional tool schemas remain deferred behind ToolSearch. MCP startup now supplies a compact index of names/descriptions; ToolSearch retrieves matching arguments on demand. Discovery reports schemas exceeding its budget instead of returning cut JSON.

Root and child model requests apply a 64,000-character history target. Tool-call/result exchanges are retained or removed together. System guidance, the latest user request and the most recent exchange remain pinned, so exceptionally large current inputs can exceed that target. Omissions are explicitly indicated to the model. This is bounded history selection, not an invented semantic summary or a provider token-limit guarantee.

## Recorded usage

Messages sent to AI counts each actual user turn submitted to the main model once, including retries as new submissions. Tool rounds, title generation, internal child prompts and the simulated browser conversation do not increment it. An attempted request counts even if its connection later fails.

Lines of code by AI counts added diff lines after successful native Write/Edit calls, including replacements and child-agent edits. NotebookEdit counts code-cell source changes only. Removed lines, unchanged lines, CRLF differences, manual edits and shell-side changes are excluded. The counter measures editing activity; it is not the final net size of the codebase. Pathological diffs exceeding the computation limit are skipped.

Statistics reads lifetime totals, monthly totals and the last 28 daily message counts. All other figures retain their sample values. The local usage ledger stores numbers, timestamps and event/workspace IDs only, with 400 daily buckets and 2,000 recent IDs for deduplication. It stores no prompts or source bodies. Clearing application data clears these local statistics.

## Reference sources and verification

Implementation uses local `refs/claude-code` as reference material: `utils/claudemd.ts` and `context.ts` for scoped, deterministic guidance; native shell/task lifecycle patterns; `utils/diff.ts`, FileWriteTool/FileEditTool, `cost-tracker.ts` and `commands/insights.ts` for successful-edit and human-message accounting. Reference content is not imported as runtime instructions.

Verification covers actual CMD, PowerShell and Bash processes, working directories, input/output, resizing, exit paging, child-process cleanup, read-only viewer isolation, rule propagation and persistence, usage deduplication/diffs, and existing model/tool/approval workflows. Provider behavior is tested with mocked I/O; no real remote AI request is required by these checks.
