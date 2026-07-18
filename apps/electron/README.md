# AirCommands Electron App

Desktop runtime for camera-based gesture control.

## Stack

- Electron main/preload/renderer
- Vue 3 renderer
- Vite build with vite-plugin-electron

## Main Features

- camera overlay and gesture state UI
- two-hand and one-hand touch gesture recognition
- desktop app launch through main-process service
- tray resident behavior and desktop notifications

## Commands

```bash
bun install
bun run dev
bun run build
```

Notes:

- `build` runs type-check, renderer build, main/preload build, then electron-builder.
- on Windows, electron-builder can intermittently fail with EPERM during output rename.

## Project Structure

- electron/main/index.ts: app lifecycle, tray, notifications, IPC handlers
- electron/main/services/*: app command mapping and execution
- electron/preload/index.ts: renderer bridge
- src/App.vue: camera UI and command dispatch flow
- src/utils/gesture_command_detection/*: gesture engine

## Icon Assets

Current minimal set in public:

- app-icon.png
- app-icon.ico

## Runtime Policy

- Do not auto-launch dev server for verification tasks.
- Prefer static inspection and production build checks unless runtime verification is explicitly requested.
