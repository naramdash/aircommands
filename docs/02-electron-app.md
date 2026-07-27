# Electron App

## Stack

- Electron main/preload/renderer
- Vue 3 renderer
- Vite build (`vite-plugin-electron`)

## Key Runtime Files

- electron/main/index.ts: app lifecycle, tray, notifications, IPC handlers
- electron/preload/index.ts: secure bridge (app launch, settings, gesture notifications)
- src/App.vue: camera UI, overlay, gesture detection flow, command dispatch
- src/utils/gesture_command_detection/*: recognition logic and command maps

## Main Process Responsibilities

1. Single instance lock and process lifecycle
2. Tray setup and tray context menu
3. Hide-to-tray behavior on window close/minimize
4. Desktop notifications
5. IPC endpoints:
   - `app:open`
   - `settings:get`
   - `application:discover`
   - `application:add-discovered`
   - `application:assign-discovered`
   - `application:pick-and-assign`
   - `application:replace-discovered`
   - `application:pick`
   - `application:rename`
   - `application:replace-target`
   - `application:remove`
   - `application:test`
   - `gesture:assign`
   - `gesture:clear-all`
   - `app:notify-gesture`

## IPC Contract (Renderer -> Main)

- `window.aircommands.openApp(...)`: requests a registered application launch by ID
- `window.aircommands.getSettings()`: loads registered targets and gesture assignments
- `window.aircommands.discoverApplications(...)`: searches Windows Start apps,
  shortcuts, and locally installed Steam games
- `window.aircommands.addDiscoveredApplication(...)`: registers a cached discovery item
- `window.aircommands.assignDiscoveredApplication(...)`: atomically registers and assigns a discovery item
- `window.aircommands.pickAndAssignApplication(...)`: picks a file and atomically assigns it
- `window.aircommands.replaceApplicationWithDiscovered(...)`: replaces a target from discovery
- `window.aircommands.pickApplication()`: registers a Windows `.exe` or `.lnk`
- `window.aircommands.renameApplication(...)`: changes a display name
- `window.aircommands.replaceApplicationTarget(...)`: replaces a target through a native picker
- `window.aircommands.removeApplication(...)`: removes an app and clears its assignments
- `window.aircommands.assignGesture(...)`: persists one gesture assignment
- `window.aircommands.clearGestureAssignments()`: clears all six assignments
  after confirmation without deleting registered applications
- `window.aircommands.testApplication(...)`: tests a registered launch target
- `window.aircommands.notifyGesture(...)`: emits success/failure toast event

## User Application Settings

- Settings are versioned and stored under Electron's `userData/config/settings.json`.
- The discovered Windows app catalog is stored separately at
  `userData/config/application-catalog.json`. The saved catalog is loaded before
  the window is shown, then refreshed once in the background at each app start.
  Catalog v2 persists validated, size-bounded icon data so the first picker opened
  after a restart can render icons without waiting for Windows discovery.
- v1 path-only, v2 AppUserModelID, v3 one-hand, and v4 unassigned-default
  settings migrate to v5 automatically. v4 removes the retired two-hand
  assignments and seeded one-hand defaults; v5 adds Steam App ID targets.
- The first run keeps the legacy built-in registry for launch compatibility, but
  all six gesture assignments start unassigned.
- During migration, assignments that still exactly match a former seeded default
  are cleared. Assignments changed by the user are preserved.
- All six one-hand gestures can be assigned independently or left unassigned.
- Windows selection searches `Get-StartApps` and user/all-user Start Menu shortcuts.
  The picker reads the in-memory copy immediately, receives background startup
  updates, and lets users force a refresh.
- Steam discovery reads the local Steam install registry keys, `libraryfolders.vdf`,
  and installed `appmanifest_*.acf` files. Only manifests whose installation
  directory still exists are shown.
- Start apps that expose an AppUserModelID are persisted as `windows-app-id` targets.
  Absolute executables and Start Menu shortcuts are persisted as `windows-path`.
- Steam games are persisted as `steam-app` targets containing only the numeric
  Steam App ID. The Steam executable path is resolved again when a game launches.
- The native `.exe`/`.lnk` picker remains available for portable or unlisted programs.
- Renderer launch requests contain only a registered application ID. Renderer input
  cannot provide a raw command or executable path to the launch endpoint.
- Custom target selection is Windows-only in v1. Built-in applications continue to
  use the existing platform command fallbacks on macOS and Linux.

## Icon Strategy (Current)

Minimal icon set in `apps/electron/public`:

- app-icon.png: tray, notification, non-Windows window icon, favicon
- app-icon.ico: Windows window/packaging compatibility

Discovered application icons use Windows-specific fallbacks:

1. A Start Menu shortcut's explicit icon path
2. The shortcut's resolved executable
3. Electron's icon for the `.lnk` itself
4. For packaged apps, `Square44x44Logo`, `Square150x150Logo`, or package
   `Logo` from `AppxManifest.xml`, including common target-size/scale variants
5. The `shell:AppsFolder` item and finally the generic Windows-app glyph
6. For Steam games, the local Steam library cache's App ID icon or artwork and
   finally the generic game glyph

Resolved icons are normalized to small images, reused in memory, and applied to
both the picker and assigned gesture cards. Valid icon data is persisted with
per-icon, total-catalog, and catalog-file size limits. A legacy iconless catalog
is refreshed before the initial picker receives it, and failed icon extraction
gets one delayed retry.

Removed as unused in current code path:

- tray-icon.png
- logo.svg
- app-icon.svg

## Behavior Notes

- First close-to-tray can show informational notification
- If tray is unavailable, close event is not forcibly converted to hide
- Build pipeline includes electron-builder packaging
- Gesture execution pauses while an application picker is open.
- Clicking a gesture cell opens the searchable application picker directly; there
  is no separate program-library or command-editor screen.
- On Windows, the picker does not expose the legacy 21-item built-in registry as
  an available-app list. It shows Windows discovery results plus targets the user
  selected directly; a legacy built-in remains visible only as the current
  assignment until the user replaces or clears it.
- The picker edits the current target in place: test launch, display-name change,
  target replacement, and removal are available alongside assignment.
