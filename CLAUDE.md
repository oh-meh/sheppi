# Shep — Claude Code Guidelines

## Project Overview
Shep is a Tauri v2 desktop app (Rust backend + React/TypeScript frontend) for managing AI coding assistant sessions, terminals, git workflows, and usage tracking.

## This fork (Sheppi)
This is Rob's fork of `stumptowndoug/shep` (`oh-meh/shep`; upstream remote wired). Rob has
tried Ghostty, Zentty, and other terminal apps/workspaces and none fit his usage, so he is
building his own on top of shep's base rather than starting from scratch.

Fork rules:
- Keep customizations as a thin patch set — small, isolated commits on top of `main`.
- Sync from upstream at release tags, not every commit (upstream moves fast).
- Do not rebrand names/strings/assets while still tracking upstream — it poisons every merge.
- Auto-update stays disabled (stubbed `checkForUpdate`, `createUpdaterArtifacts: false`):
  the configured endpoint and signing key belong to upstream, so an update would replace
  this build. The updater plugin must stay registered in Rust — its config schema requires
  `endpoints`/`pubkey` and removing the config panics at startup.
- Fixes that benefit upstream go up as PRs from clean branches off `upstream/main`.

Project state and session history live in `~/ai-knowledge-rob/projects/sheppi/`, not here.

## Tech Stack
- **Frontend**: React 19, TypeScript, Zustand (state management), xterm.js (terminal)
- **Backend**: Rust / Tauri v2
- **Build**: Vite, pnpm

## React Patterns

### No useEffect for derived state or state sync
Avoid `useEffect` for synchronizing state or computing derived values. This is a core principle of the codebase.

**Instead of useEffect, prefer:**
- **Derived values**: Compute inline or with `useMemo` — don't store derived data in state
- **State resets on prop/state change**: Handle in the event handler that triggers the change, not in a reactive effect
- **Data fetching on user action**: Call fetch functions in click/event handlers, not in effects that watch state
- **Focusing elements**: Use `autoFocus` prop or ref callbacks
- **Conditional initialization**: Consolidate multiple "load if not loaded" effects into one

**Legitimate useEffect uses (keep these):**
- Setting up/tearing down event listeners (window, document, Tauri events)
- Managing intervals and timers
- Integrating with imperative external libraries (xterm.js, ResizeObserver)
- Syncing React state to external systems (DOM style properties, native window effects)
- One-time app initialization on mount

### State Management
- Use Zustand stores for shared state (`src/stores/`)
- Access store state outside React with `useStore.getState()` — valid in event handlers
- Use stable empty arrays/objects as defaults to avoid infinite re-render loops with Zustand v5

### Error Handling
- Use `pushNotice()` from `useNoticeStore` for user-facing errors
- Use `getErrorMessage()` helper to extract error messages
- Only log to console in dev mode: `if (import.meta.env.DEV) console.error(...)`
