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
   - `settings:set-gesture-hold-ms`
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
   - `gesture:assign-input-sequence`
   - `gesture:assign-windows-command`
   - `input-sequence:execute`
   - `windows-command:execute`
   - `gesture:clear-all`
   - `app:notify-gesture`
   - `browser:close`
   - `browser:get-status`
   - `web-login:get-settings`
   - `web-login:set-settings`
   - `web-login:open`

## Internal Google login browser

- The browser uses the persistent `persist:aircommands-browser` session partition, so a user-completed login remains available after the browser window is closed and reopened.
- The browser has no Node integration or Aircommands preload bridge. Web pages cannot access the desktop IPC surface.
- The browser allows Google Identity popups in the same persistent session and automates only the configured button and account selection steps.
- Password and two-factor authentication input remain manual.
- Google may reject OAuth from an embedded user agent with `disallowed_useragent`; changing the user agent is not used as a workaround. A service-specific fallback may be needed if its Google Identity flow cannot run inside Electron.

## Configured Google web login scenario

- The `touch_left_thumb_ring` gesture (왼손 엄지 + 약지) is reserved for the configured Google web login scenario and is not assignable to a desktop application.
- Clicking the fixed `touch_left_thumb_ring` gesture row opens a dialog where the user can save one website URL and Google `login_hint`. They are stored separately under the Electron user-data config directory.
- Triggering the fixed gesture opens the saved URL in the persistent browser. After same-origin redirects, it reinitializes the page's Google Identity Services client with the saved `login_hint` and clicks the cross-origin GSI iframe through Chromium's `Input.dispatchMouseEvent` protocol.
- The Electron GSI popup is monitored for Google Account Chooser. If it appears, Aircommands clicks only the account whose identifier exactly matches the saved `login_hint`; password, consent, and two-factor pages remain untouched.
- The configured page callback remains responsible for handling the Google ID token. Aircommands never reads or stores the token, password, or two-factor code.

## IPC Contract (Renderer -> Main)

- `window.aircommands.openApp(...)`: requests a registered application launch by ID
- `window.aircommands.getSettings()`: loads registered targets and gesture assignments
- `window.aircommands.setGestureHoldMs(...)`: validates and persists the touch hold duration
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
- `window.aircommands.assignGesture(...)`: persists one gesture application assignment
- `window.aircommands.assignInputSequence(...)`: replaces a gesture's program assignment
  with a validated key/delay/scroll sequence
- `window.aircommands.assignWindowsCommand(...)`: binds one of 13 predefined Windows
  desktop functions to a gesture
- `window.aircommands.executeInputSequence(...)`: executes the sequence already stored
  for a gesture; the renderer cannot submit arbitrary execution steps
- `window.aircommands.executeWindowsCommand(...)`: executes the Windows command stored
  for a gesture
- `window.aircommands.clearGestureAssignments()`: clears all configurable assignments
  after confirmation without deleting registered applications
- `window.aircommands.testApplication(...)`: tests a registered launch target
- `window.aircommands.notifyGesture(...)`: emits success/failure toast event
- `window.aircommands.closeBrowser()`: closes the internal browser window
- `window.aircommands.getBrowserStatus()`: returns current internal browser state
- `window.aircommands.getWebLoginSettings()`: fetches saved web login URL and login hint
- `window.aircommands.setWebLoginSettings(...)`: persists web login URL and login hint
- `window.aircommands.openWebLogin()`: launches browser and runs automated login sequence
- `window.aircommands.onBrowserStatus(listener)`: subscribes to browser status updates
- `window.aircommands.onApplicationCatalogUpdated(listener)`: subscribes to background catalog updates
- `window.aircommands.onMainProcessMessage(listener)`: receives messages from main process

## User Application Settings

- Settings are versioned and stored under Electron's `userData/config/settings.json`.
- The discovered Windows app catalog is stored separately at
  `userData/config/application-catalog.json`. The saved catalog is loaded before
  the window is shown, then refreshed once in the background at each app start.
  Catalog v2 persists validated, size-bounded icon data so the first picker opened
  after a restart can render icons without waiting for Windows discovery.
- v1 path-only, v2 AppUserModelID, v3 one-hand, v4 unassigned-default, v5 Steam,
  v6 input sequences, and v7 hold duration settings migrate to v8 automatically.
  v4 removes retired two-hand assignments; v5 adds Steam App ID targets; v6 adds
  per-gesture keyboard input sequences; v7 adds customizable touch hold duration;
  v8 adds predefined Windows command assignments (`windowsCommandAssignments`).
- The first run keeps the legacy built-in registry for launch compatibility, but
  all six gesture assignments start unassigned.
- During migration, assignments that still exactly match a former seeded default
  are cleared. Assignments changed by the user are preserved.
- The five configurable one-hand gestures can independently launch a program,
  run an input sequence, invoke a Windows function, or remain unassigned. The
  left thumb + ring gesture remains reserved for configured Google web login.
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

## Input sequences and Windows functions

- The gesture action dialog has separate `프로그램`, `입력 시퀀스`, and
  `Windows 기능` categories. Their persisted assignment maps remain separate;
  they are not merged into a generic action schema.
- A sequence contains key/chord, delay, and mouse-wheel steps. For example, `P`,
  `300ms`, scroll down three notches, and `Enter` are stored and executed in that
  order. Ctrl, Alt, Shift, Win, letters, digits, navigation keys, function keys,
  and common punctuation keys are supported.
- Windows functions provide 13 predefined desktop shortcuts: next-window (`Alt+Tab`),
  previous-window (`Alt+Shift+Tab`), screen snipping (`Win+Shift+S`), full screenshot auto-save
  (`Win+PrtScn`), screen recording toggle (`Win+Alt+R`), Xbox Game Bar overlay (`Win+G`),
  show/restore desktop (`Win+D`), Task View (`Win+Tab`), lock workstation (`Win+L`),
  action center (`Win+A`), file explorer (`Win+E`), clipboard history (`Win+V`), and emoji picker (`Win+.`).
- Program, input-sequence, and Windows-function assignments are mutually exclusive
  for each gesture. Choosing one clears the other assignments without deleting
  registered applications.
- Sequence execution is Windows-only and uses validated virtual-key codes through
  the Windows `SendInput` API for keyboard and mouse-wheel input. Input goes to the
  application that is active when the gesture executes and cannot cross a
  higher-integrity/UAC boundary.
- The renderer sends only the gesture identifier when executing. The main process
  loads the persisted sequence or fixed Windows function, revalidates it, and
  generates the native input command without accepting raw PowerShell or arbitrary
  script text from the UI.

## Gesture hold duration

- The default touch hold duration is 280ms and the supported range is 80–2,000ms.
- The existing `유지` status cell displays the saved duration and opens the settings
  dialog on click, Enter, or Space; no separate settings card is added to the page.
- Saving updates `userData/config/settings.json`, and subsequent recognition frames
  use the new duration for both progress percentage and execution timing.
- Recognition execution pauses while the hold-duration dialog is open.

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
- Gesture execution pauses while a gesture action dialog is open.
- Clicking a configurable gesture cell opens the action dialog, where the user
  chooses either the searchable program picker or the input-sequence editor.
- On Windows, the picker does not expose the legacy 21-item built-in registry as
  an available-app list. It shows Windows discovery results plus targets the user
  selected directly; a legacy built-in remains visible only as the current
  assignment until the user replaces or clears it.
- The picker edits the current target in place: test launch, display-name change,
  target replacement, and removal are available alongside assignment.
