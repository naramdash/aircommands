# AirCommands Electron App

Desktop runtime for camera-based gesture control.

## Stack

- Electron main/preload/renderer
- Vue 3 renderer
- Vite build with `vite-plugin-electron`
- Vitest test runner

## Main Features

- Camera overlay and gesture state UI with live progress indicators
- Six one-hand thumb-to-finger gesture commands (left/right thumb + index/middle/ring)
- Unassigned-by-default gesture setup with customizable touch hold duration (80ms–2,000ms)
- Three gesture action types: desktop applications, custom keyboard/scroll input sequences, and 13 predefined Windows desktop functions
- Dedicated Google Web Login gesture (`touch_left_thumb_ring`) with persistent GSI browser automation
- Confirmed bulk clearing of all gesture assignments without deleting registered apps
- Desktop app launch through main-process service with single-instance lock
- Direct per-gesture application selection, display name editing, target replacement, and test launching
- Searchable Windows Start apps, Start Menu shortcuts, and installed Steam game discovery
- Startup-loaded, disk-backed Windows application catalog (v2) with background refresh
- Resolved shortcut, executable, packaged-app, and Steam icons with bounded disk persistence and in-memory reuse
- Unified picker hiding legacy built-ins not confirmed by Windows discovery
- System tray resident behavior, configurable desktop notifications, and hide-to-tray on close/minimize

## Commands

```bash
bun install
bun run test
bun run dev
bun run build
```

Notes:

- `test` runs the Vitest test suite (80 unit tests across main services and renderer utilities).
- `build` runs type-check (`vue-tsc`), renderer build, main/preload build, then `electron-builder`.
- On Windows, `electron-builder` can intermittently fail with `EPERM` during output rename.

## Project Structure

- `electron/main/index.ts`: app lifecycle, tray, desktop notifications, browser window, IPC handlers
- `electron/main/services/application_settings.ts`: versioned user settings (v8 schema, migration, persistence)
- `electron/main/services/platform_application_adapter.ts`: target selection, validation, icon caching, and app launching
- `electron/main/services/windows_application_discovery.ts`: persistent Windows app catalog and background discovery
- `electron/main/services/steam_application_discovery.ts`: local Steam library and game manifest discovery
- `electron/main/services/windows_command.ts`: 13 predefined Windows desktop functions
- `electron/main/services/windows_input_sequence.ts`: native Windows `SendInput` API execution for key chords, delays, and wheel scroll
- `electron/main/services/input_sequence.ts`: sequence validation, normalization, and formatting
- `electron/main/services/web_login_settings.ts`: persisted Google web login URL and account hint settings
- `electron/main/services/application_icon_cache.ts`: bounded disk persistence and in-memory icon cache
- `electron/main/services/app_command_runner.ts`: builtin command fallback runner
- `electron/preload/index.ts`: secure renderer IPC bridge (`window.aircommands`)
- `src/App.vue`: camera UI, gesture recognition reducer integration, and command dispatch flow
- `src/components/ApplicationPickerDialog.vue`: installed-app search, assignment, and app editing
- `src/components/InputSequenceEditor.vue`: custom key chord, delay, and mouse scroll sequence editor
- `src/components/WebLoginDialog.vue`: Google web login URL and login hint configuration dialog
- `src/components/GestureHoldDialog.vue`: touch hold duration adjustment dialog
- `src/utils/gesture_command_detection/*`: gesture engine, command maps, touch detection, and recognition reducer

## Icon Assets

Current minimal set in public:

- `app-icon.png`
- `app-icon.ico`

## Runtime Policy

- Do not auto-launch dev server for verification tasks.
- Prefer static inspection, unit tests, and production build checks unless runtime verification is explicitly requested.
