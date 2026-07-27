# AirCommands Electron App

Desktop runtime for camera-based gesture control.

## Stack

- Electron main/preload/renderer
- Vue 3 renderer
- Vite build with vite-plugin-electron

## Main Features

- camera overlay and gesture state UI
- six one-hand thumb-to-finger gesture commands
- unassigned-by-default gesture setup
- confirmed bulk clearing of all gesture assignments without deleting apps
- desktop app launch through main-process service
- direct per-gesture application selection and editing
- searchable Windows Start app, Start Menu shortcut, and installed Steam game discovery
- startup-loaded, disk-backed Windows application catalog
- resolved shortcut, executable, packaged-app, and Steam icons with bounded
  disk persistence and in-memory reuse
- a unified picker that hides legacy built-ins not confirmed by Windows discovery
- tray resident behavior and desktop notifications

## Commands

```bash
bun install
bun run test
bun run dev
bun run build
```

Notes:

- `build` runs type-check, renderer build, main/preload build, then electron-builder.
- on Windows, electron-builder can intermittently fail with EPERM during output rename.

## Project Structure

- electron/main/index.ts: app lifecycle, tray, notifications, IPC handlers
- electron/main/services/*: app command mapping and execution
- electron/main/services/application_settings.ts: versioned user settings
- electron/main/services/platform_application_adapter.ts: target selection, validation, icons, and launch
- electron/main/services/windows_application_discovery.ts: persistent Windows app catalog and discovery
- electron/main/services/steam_application_discovery.ts: local Steam library and game manifest discovery
- electron/preload/index.ts: renderer bridge
- src/App.vue: camera UI and command dispatch flow
- src/components/ApplicationPickerDialog.vue: installed-app search, assignment, and app editing
- src/utils/gesture_command_detection/*: gesture engine

## Icon Assets

Current minimal set in public:

- app-icon.png
- app-icon.ico

## Runtime Policy

- Do not auto-launch dev server for verification tasks.
- Prefer static inspection and production build checks unless runtime verification is explicitly requested.
