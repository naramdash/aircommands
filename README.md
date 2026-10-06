# AirCommands

AirCommands is an Electron desktop app that turns camera-based hand gestures into
application launches, keyboard input sequences, and Windows desktop shortcuts.
The Electron app lives directly in the repository root.

## Features

- Six one-hand gestures: touch your thumb to your index, middle, or ring finger
  on either hand.
- Five configurable gestures for launching applications, running keyboard and
  mouse-wheel sequences, or invoking one of 13 Windows shortcuts.
- A dedicated left thumb-to-ring gesture for a configured Google web login flow
  in a persistent Electron browser session.
- Adjustable gesture hold duration from 80 to 2,000 ms, with a 280 ms default,
  live camera overlays, and recognition progress indicators.
- Windows Start apps, Start Menu shortcuts, and installed Steam game discovery,
  with searchable selection and cached application icons.
- Tray operation, hide-to-tray behavior, desktop notifications, and persisted
  settings and gesture assignments.

Windows is the primary platform for application discovery, custom target
selection, and synthetic keyboard/mouse input. Packaging is also configured for
macOS and Linux, but those Windows-specific features are not available there.

## Requirements

- [Bun](https://bun.sh/) for dependency installation and package scripts.
- Node.js 24 for the build and test tools.
- A camera for gesture recognition.

## Development

Run commands from the repository root:

```bash
bun install --frozen-lockfile
bun run dev
```

`bun run dev` starts Vite and the Electron application. Camera access is requested
when you start camera capture in the app.

To run unit tests:

```bash
bun run test
```

Tests cover main-process services and renderer utilities using Vitest.

## Build

```bash
bun run build
```

The build checks Vue/TypeScript types, bundles the renderer and Electron
main/preload code, and creates a package for the current operating system with
`electron-builder`. It does not publish the package.

Build outputs:

- `dist/`: renderer bundle and static assets.
- `dist-electron/`: Electron main and preload bundles.
- `release/<version>/`: Windows NSIS installer, macOS DMG, or Linux AppImage.

The GitHub release workflow builds Windows and Linux packages. Version tags
matching `v*` also attach those packages to a GitHub Release.

## Project Structure

```text
electron/
  main/                 App lifecycle, IPC handlers, settings, and services
  preload/              Renderer-to-main IPC bridge
src/
  components/           Application and gesture configuration dialogs
  utils/                Gesture recognition and renderer utilities
  assets/               MediaPipe hand-landmarker model
  App.vue               Camera UI and command dispatch
public/
  mediapipe/            Local MediaPipe WASM runtime files
build/
  app_identity.json     Application ID and product name
docs/                   Technical documentation
```

MediaPipe loads its model and WASM assets locally. When updating
`@mediapipe/tasks-vision`, also replace the runtime files in
`public/mediapipe/tasks-vision/wasm/` with the matching files from
`node_modules/@mediapipe/tasks-vision/wasm/`.

Application identity is defined in `build/app_identity.json`. User settings and
discovery caches are stored under Electron's user-data directory.

See [the documentation index](docs/README.md) for runtime architecture, gesture
recognition, command contracts, and known limitations. Repository verification
rules are in [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE).
