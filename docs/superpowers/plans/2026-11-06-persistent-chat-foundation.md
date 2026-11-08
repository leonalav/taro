# Persistent Chat Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the preview chat with persistent local sessions, a real OpenAI-compatible streamed chat path, and a single preserved Nike reference session.

**Architecture:** Use SQLite through Tauri SQL plugin for ordered session/message/settings persistence. Handle model streaming and secret storage in Rust commands, forwarding only content and safe activity events to React. Keep existing React components and message discriminators as the presentation contract.

**Tech Stack:** Tauri v2, Rust, SQLite, `reqwest` streaming, OS credential store, React, TypeScript, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-06-persistent-chat-foundation-design.md`

## Global Constraints

- Keep the Tauri v2, React, and pnpm stack.
- Existing custom model fields are `id`/model name, endpoint, and optional API key; the model name is the API `model` value.
- New sessions use the selected default Chat model. A configured custom model uses its OpenAI-compatible endpoint; built-in preview models remain unavailable for real requests until their provider connections are implemented.
- Database and credentials stay on the local device.
- Never expose or persist raw hidden chain-of-thought.

## Review Focus

- First launch imports the Nike reference only once; subsequent launches preserve user-created data. Verify by reopening the app after creating a chat.
- Endpoint URLs with or without trailing slash produce the correct `/chat/completions` path. Verify in stream command URL normalization.
- SSE chunk boundaries split JSON lines arbitrarily. Verify the Rust stream parser buffers partial lines and handles `[DONE]`.
- HTTP errors or interrupted streams retain the user message and received assistant text with a visible safe error artifact. Verify using typed channel events.
- `reasoning_content` is ignored even if present in provider deltas. Verify the response mapper forwards content only.

---

### Task 1: SQLite persistence and one-time seed

**Files:**
- Create: `src-tauri/migrations/001_chat.sql`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`, `src-tauri/capabilities/default.json`, `src/data/mock.ts`
- Create: `src/lib/chat-db.ts`, `src/lib/chat-types.ts`

**Interfaces:**
- Produce `initializeChatDatabase(): Promise<{ folders: Folder[]; threads: Thread[]; activeThreadId: string | null }>` and CRUD helpers for creating/updating sessions, saving ordered message arrays, and app settings.
- Migration schema stores session metadata and typed message payload JSON, preserving message IDs and array order.

- [ ] Add the Tauri SQL plugin, SQLite migration, and startup initialization that inserts only the `taro` folder and `Nike/Brand Discovery` exactly once.
- [ ] Add frontend database helpers that load persisted sessions and write session/message mutations.
- [ ] Remove non-reference sample sessions and folders from seeded initial Explorer data; keep the Nike conversation payload unchanged.
- [ ] Verify native build and TypeScript build.

### Task 2: Secure model settings

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`, `src/components/settings/settings-context.ts`, `src/components/settings/sections-workspace.tsx`
- Modify: `src/lib/chat-db.ts`

**Interfaces:**
- Rust commands `set_model_credential(model_id: String, secret: String)` and `delete_model_credential(model_id: String)` store/remove OS keyring values.
- Frontend settings persistence stores model metadata/default model in SQLite; API keys are written only through the keyring commands.

- [ ] Wire existing custom endpoint/model/API-key controls to persistent metadata and keyring operations without adding another endpoint form.
- [ ] Delete the credential when a custom model is removed.
- [ ] Verify TypeScript and native builds.

### Task 3: Real streamed OpenAI-compatible responses

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`, `src-tauri/capabilities/default.json`
- Create: `src/lib/model-stream.ts`
- Modify: `src/data/mock.ts` only if a safe typed generation status shape is needed.
- In Settings, what is written in the Models section will be the model receiving the message

**Interfaces:**
- Rust command `stream_chat(request, on_event)` receives `{ endpoint, model, messages, credential_model_id }` and reports channel events `{ type: "delta", text } | { type: "done" } | { type: "error", message }`.
- Frontend `streamChat(request, onEvent): Promise<void>` invokes the Rust command and excludes non-content reasoning fields.

- [ ] Implement endpoint normalization, bearer auth from OS keyring, SSE buffering, content delta forwarding, done handling, and safe error events.
- [ ] Add a typed activity/error artifact rendering path if current message types cannot present connection, HTTP, and interrupted-stream states.
- [ ] Verify Rust build and TypeScript build.

### Task 4: Connect app state and streaming UI

**Files:**
- Modify: `src/App.tsx`, `src/components/chat-panel.tsx`, `src/components/chat-message.tsx`, `src/components/command-palette.tsx`
- Reuse: `src/lib/chat-db.ts`, `src/lib/model-stream.ts`

**Interfaces:**
- App hydration loads database state before showing the session tree.
- Sending persists the user message, appends one assistant message, applies each content delta to that message, persists partial output periodically and on completion, and appends safe visible error status on failure.

- [ ] Replace in-memory-only seeded state and fake timed assistant response with hydrated, persisted sessions and configured-model streaming.
- [ ] Keep new chats empty and under `taro`; title from first prompt; restore the last active session.
- [ ] Ensure palette/session navigation only sees persisted sessions and no removed demo sessions.
- [ ] Verify `pnpm build` and `pnpm desktop:build`.

### Task 5: End-to-end review

**Files:**
- Review: all files above

- [ ] Check startup seed idempotency, chat creation/reopen persistence, token-by-token visible updates, endpoint errors, and ignored `reasoning_content` using code review and build output.
- [ ] Confirm no generated fake assistant reply remains on the configured custom-model path.
