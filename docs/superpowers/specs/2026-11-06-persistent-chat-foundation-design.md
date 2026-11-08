# Persistent Chat Foundation Design

## Intent

Turn Taro's seeded chat preview into a durable local chat workspace. Preserve `taro / Nike/Brand Discovery` as the sole reference session, remove the other seeded folders and chats from the Explorer, and make future sessions persist and use the existing OpenAI-compatible custom-model settings.

## Goals

- Show only the `taro` workspace and its existing `Nike/Brand Discovery` conversation on first launch; preserve that conversation's current messages and structured artifacts.
- Create all new sessions inside `taro`, persist sessions and messages across restarts, and restore the most recently active session.
- Stream model output as it arrives and persist the growing response, rather than waiting for a completed response.
- Keep the current message/artifact shape extensible: activity groups, tool results, token cards, questions, skeletal layouts, permissions, and future typed artifacts must survive database round trips.
- Use the existing custom model's name, OpenAI-compatible base URL, and API-key field; do not add a second endpoint form.
- Persist endpoint/model preferences locally and protect API keys with the operating system's credential store.
- Keep model work visible through a streaming state and concise, safe progress/artifact summaries.

## Non-goals

- Delete or move real workspace files. The Explorer folders and chats named in the request are seeded app data, not filesystem directories.
- Sync sessions to a server or another device.
- Add MCP execution, built-in provider credentials, or automatic artifact generation beyond the current structured-message types.
- Expose or store raw hidden chain-of-thought. Taro can show generation status, safe summaries, and tool/activity artifacts without exposing private reasoning traces.

## Constraints

- Keep the Tauri v2, React, and pnpm stack.
- Existing custom model fields are `id`/model name, endpoint, and optional API key; the model name is the API `model` value.
- New sessions use the selected default Chat model. A configured custom model uses its OpenAI-compatible endpoint; built-in preview models remain unavailable for real requests until their provider connections are implemented.
- Database and credentials stay on the local device.

## Approaches

1. **Tauri SQLite plus streamed OpenAI-compatible requests (recommended):** use Tauri's SQL plugin with SQLite migrations for sessions, ordered typed messages, settings, and artifacts; use a small Rust `reqwest` command with a Tauri IPC channel for SSE token streaming; store API keys in the OS credential vault. This provides durable local sessions, a real stream, and avoids WebView CORS limitations, at the cost of native Rust request handling and migrations.
2. **IndexedDB plus frontend fetch:** reuse the browser database for chat and send requests from the WebView. This minimizes Rust code but makes message querying/migrations less direct and endpoint access subject to WebView CORS and streaming behavior.
3. **SQLite with simulated replies:** persists the Explorer and reference artifacts but keeps the endpoint unused. This is simpler but does not make the existing endpoint field operational.

**Recommendation:** Approach 1. The user approved a working-chat direction and specifically called out streamed generation and the existing endpoint field.

## Data and behavior

- On first database initialization, create one `taro` workspace and import the existing `Nike/Brand Discovery` seed exactly once. Do not seed the other sample folders or sessions. Later launches load the stored data without replacing it.
- Store sessions in a `sessions` table and ordered message records in a `messages` table. Each message stores its discriminator and serialized typed payload so current and future artifacts round-trip without flattening to plain text. Keep stable IDs, timestamps, ordering, and archive status.
- Persist custom-model metadata and the selected default model in local settings storage; keep secret API keys in the OS credential vault, keyed by custom-model ID. Removing a custom model also removes its stored credential.
- A new session begins empty under `taro`; its title becomes the first user prompt's title, following the current UI behavior. Persist user messages before request dispatch.
- For a configured custom model, the Rust command posts to the OpenAI-compatible `/chat/completions` endpoint with streaming enabled. It forwards content deltas over an IPC channel; the UI updates one assistant message as deltas arrive and stores its partial content at safe intervals and on completion. Persist errors/interrupted responses as typed status/activity artifacts without discarding the user's message or received text.
- Keep the existing Nike conversation as an independent reference; do not copy it into new chats. Preserve its tool, token, question, skeletal, and thought-summary artifacts in the initial seed.
- Treat model reasoning as private. Do not expose raw reasoning tokens or `reasoning_content`; use the current collapsed thought/status affordance with concise summaries and structured activity/artifact events.

## Decisions left to the implementer

- Use the official Tauri SQL plugin for SQLite and migrations, and a cross-platform Rust keyring backend for OS-protected API keys.
- Use one Rust streaming command with typed channel events for `delta`, `done`, and `error`; keep HTTP response parsing constrained to OpenAI-compatible chat-completion SSE.
- Keep the reference session visible and selectable, but do not make it the template/context for new sessions.
- Render connection, HTTP, and parse errors beside the affected assistant response; never silently fall back to fabricated model text for a configured custom model.
