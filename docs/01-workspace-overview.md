# Repository Overview

## Scope

AirCommands is a single Electron desktop application using Vue, Vite, MediaPipe,
and Vitest. Its package and source files live directly in the repository root.

## Repository Layout

- `package.json`: application metadata, dependencies, and scripts.
- `bun.lock`: locked dependencies for the desktop application.
- `electron/`: main-process services and preload IPC bridge.
- `src/`: renderer UI, gesture recognition, and bundled model assets.
- `public/`: application icons and the local MediaPipe WASM runtime.
- `build/`: application identity used by the main process and packaging config.
- `docs/`: technical documentation.
- `.github/workflows/electron-release.yml`: Windows/Linux builds and tagged releases.
- `AGENTS.md`: repository operating rules.

## Runtime Responsibilities

- Capture camera frames and update gesture recognition in `src/App.vue`.
- Send application launch, input sequence, Windows shortcut, and Google web login
  requests to the main process through the preload IPC bridge.
- Handle application discovery, persisted settings, tray behavior, window
  lifecycle, background catalog refresh, and desktop notifications in the main
  process.

Gesture recognition modules live in `src/utils/gesture_command_detection/`.
There is no separate web application or local Nitro API server.

## Root Commands

- `bun install --frozen-lockfile`: install locked dependencies.
- `bun run dev`: start the development app when explicitly requested.
- `bun run test`: run the desktop unit tests.
- `bun run build`: check types, bundle the app, and create a local package.
