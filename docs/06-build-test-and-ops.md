# Build, Test, and Operations

## Commands

Run all commands from the repository root:

```bash
bun install --frozen-lockfile
bun run test
bun run build
```

Use Node.js 24 for the build and test tools. `bun run dev` starts the development
server and Electron app only when interactive runtime verification is requested.

The build runs `vue-tsc --noEmit`, builds the renderer and Electron main/preload
code with Vite, and packages the current platform with `electron-builder` using
`--publish never`. Packages are written to `release/<version>/`.

Vitest includes `electron/**/*.test.ts` and `src/**/*.test.ts`. The default build
type check uses `tsconfig.json`; `tsconfig.node.json` defines the separate
main-process/build configuration.

## MediaPipe Assets

The model is bundled from `src/assets/hand_landmarker.task`. Runtime files are
served from `public/mediapipe/tasks-vision/wasm/` and copied into the production
bundle by Vite.

When updating `@mediapipe/tasks-vision`, replace the public runtime files with
those from the installed package's `wasm/` directory. Keep the JavaScript loaders
and WASM binaries on the same version as the package.

## CI and Releases

`.github/workflows/electron-release.yml` installs locked dependencies, runs unit
tests, and builds Windows and Linux packages. It uploads files from `release/`.
On version tags matching `v*`, it attaches the artifacts to a GitHub Release.
The workflow can also be run manually to build artifacts without publishing a
release.

## Verification Policy

From [AGENTS.md](../AGENTS.md):

- Prefer static inspection, targeted tests, and production builds.
- Prefer Bun commands.
- Do not automatically start a development server, open a browser, or launch a GUI.
- Obtain explicit approval before development-server runtime verification.

After changes, run relevant unit tests and the production build. On Windows,
packaging can intermittently fail with `EPERM` when replacing
`release/<version>/win-unpacked`; ensure no running app holds those output files.
