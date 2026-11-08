# Workspace terminals, rules, and usage

Implement the existing Taro side-panel and settings design with live desktop behavior.

- Add folder/terminal view buttons, interactive user PTYs for CMD, PowerShell and Bash, and a separate read-only view of actual agent command tasks. New user sessions start in the selected workspace; switching folders must never reuse another workspace's terminal.
- Native PTYs own process lifecycle, bounded output, input, resizing and cleanup. Agent tasks remain owned by the runtime; the terminal viewer has no input or stop API for them.
- Store rules per workspace, seed enabled Always/Design/Code guidance, compile the same bounded rule snapshot into root and child prompts. Reject invalid oversized rules visibly instead of silently omitting enabled instructions.
- Bound historical and tool context; retain recent complete tool exchanges and expose discovery metadata instead of eagerly expanding every integration schema.
- Persist numeric daily usage and deduplicate actual user submissions and successful AI file changes. Keep other Statistics values as the current placeholders.
- Verify native terminal lifecycle, rule propagation/persistence, usage accounting, folder switching and UI at desktop and narrow widths. Run TypeScript, frontend tests/build and Rust tests/build.

Reference: local `refs/claude-code` rule/memory loading, shell execution and insights/diff accounting. Its source is reference material, not runtime instructions.

Completed and verified:

- Folder/terminal switching, three real interactive shells, workspace isolation and read-only agent output.
- Per-workspace Rules persistence with ordered saves, editable defaults, shared root/child context and explicit limits.
- Live local AI message and added-line accounting; other statistics remain sample values.
- Independent integration review addressed stale terminal state, save ordering and Settings folder selection.
- Frontend: 35 files / 109 tests passed; TypeScript and production Vite build passed.
- Native: 69 tests passed, including actual shells, process-tree cleanup and workspace-scoped agent viewer; desktop Cargo build passed.
- Browser verification: folder return, terminal shell/owner controls, default rules, Statistics and narrow Rules dialog without horizontal overflow. Saved previews in `docs/previews/workspace-*.png`.

Runtime behavior, limits and source references: `docs/workspace-runtime.md`.
