# Tauri Desktop Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Taro React/Vite preview runnable as a Tauri v2 desktop app with its custom window controls.

**Architecture:** Keep the React app as the sole UI and add Tauri v2 configuration and Rust shell under `src-tauri/`. Use the Tauri window API for minimize, maximize/restore, and close, and mark the existing header as a Tauri drag region. Keep browser Vite scripts usable.

**Tech Stack:** React 19, Vite 7, Tauri v2, Rust.

**Spec:** `docs/superpowers/specs/2026-11-06-tauri-desktop-design.md`

## Global Constraints

- Preserve the current React app and its mock data/flows.
- Add desktop packaging and window controls, not backend agent capabilities or persistent project access.
- Keep browser preview/dev behavior available.

## Review Focus

- Browser rendering without Tauri APIs: window-control handlers must not break the existing Vite preview.
- Maximize state and repeated toggling: custom green control must restore as well as maximize.
- Drag input over controls: buttons must remain clickable while the rest of the header drags.
- Distribution config paths: Tauri must resolve the Vite dev server and production `dist` assets.
- Window resize: undecorated window must remain resizable and expose close/minimize/maximize actions.

---

### Task 1: Add the Tauri v2 shell

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/taro-icon.svg` and desktop icon files in `src-tauri/icons/`
- Modify: `.gitignore`

**Interfaces:**
- Produces Tauri commands `tauri dev` and `tauri build`, plus npm scripts `desktop:dev` and `desktop:build`.
- The Tauri window label is `main`; window actions are allowed by the default capability.

- [x] Add Tauri v2 CLI and JS API dependencies and scripts while preserving existing `dev`, `build`, and `preview` scripts.
- [x] Configure Vite dev URL `http://127.0.0.1:1420`, fixed strict port 1420, and production frontend output at `../dist` from `src-tauri`.
- [x] Add the minimal Rust binary and Tauri v2 build dependency/configuration for a resizable, undecorated main window with practical desktop dimensions and the `main` capability.
- [x] Grant the main window only the permissions needed to listen for resize state changes, start dragging, inspect maximize state, minimize, toggle maximize, and close.
- [x] Ignore generated Rust build output under `src-tauri/target` and generated schemas under `src-tauri/gen/schemas`.
- [x] Generate desktop platform icons from the existing Taro mark so Windows bundling has the required `.ico` resource.

### Task 2: Connect the custom title bar

**Files:**
- Modify: `src/components/title-bar.tsx`
- Modify: `src/index.css`

**Interfaces:**
- `TitleBar` receives the existing `crumbs: string[]` prop and owns the window action controls.
- The browser preview retains visible controls without invoking Tauri-only APIs.

- [x] Replace decorative traffic-light spans with labeled native-window action buttons: red closes, yellow minimizes, green toggles maximize/restore.
- [x] Call Tauri window APIs only when running inside Tauri; safely no-op the handlers in a regular browser preview.
- [x] Reflect maximized/restored state in the green control's accessible label and hover affordance.
- [x] Add a deep Tauri drag region across the whole header while excluding only the clickable controls; retain existing no-drag styles.

### Task 3: Desktop build readiness

**Files:**
- Modify only files above if integration requires a correction.

- [x] Check the project scripts, Tauri config paths, and capability names against the installed Tauri v2 package/toolchain.
- [x] Run the frontend production build and launch Tauri dev long enough to confirm the shell opens; build the Windows MSI and NSIS installers.

**Review note:** Do not add automated tests as part of this conversion; the requested change is packaging and direct window-control wiring.
