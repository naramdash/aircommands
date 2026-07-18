# Electron App

## Stack

- Electron main/preload/renderer
- Vue 3 renderer
- Vite build (`vite-plugin-electron`)

## Key Runtime Files

- electron/main/index.ts: app lifecycle, tray, notifications, IPC handlers
- electron/preload/index.ts: secure bridge (`openApp`, `notifyGesture`)
- src/App.vue: camera UI, overlay, gesture detection flow, command dispatch
- src/utils/gesture_command_detection/*: recognition logic and command maps

## Main Process Responsibilities

1. Single instance lock and process lifecycle
2. Tray setup and tray context menu
3. Hide-to-tray behavior on window close/minimize
4. Desktop notifications
5. IPC endpoints:
   - `app:open`
   - `app:notify-gesture`

## IPC Contract (Renderer -> Main)

- `window.aircommands.openApp(...)`: requests app launch
- `window.aircommands.notifyGesture(...)`: emits success/failure toast event

## Icon Strategy (Current)

Minimal icon set in `apps/electron/public`:

- app-icon.png: tray, notification, non-Windows window icon, favicon
- app-icon.ico: Windows window/packaging compatibility

Removed as unused in current code path:

- tray-icon.png
- logo.svg
- app-icon.svg

## Behavior Notes

- First close-to-tray can show informational notification
- If tray is unavailable, close event is not forcibly converted to hide
- Build pipeline includes electron-builder packaging
