# AirCommands Monorepo

AirCommands is a Bun workspace with two active apps:

- apps/electron: Electron desktop app (camera UI, tray, notifications, IPC)
- apps/web: Nuxt app + Nitro local API
- docs: repository documentation aligned to current code

## Workspace Structure

- apps/electron
- apps/web
- docs

## Root Commands

```bash
bun install
bun run builds
```

`bun run builds` runs the `build` script in each workspace app.

## App Commands

Electron app:

```bash
cd apps/electron
bun run build
```

Web app:

```bash
cd apps/web
bun run test
bun run build
```

## Verification Policy

- Do not auto-start dev servers for verification.
- Prefer static inspection, targeted tests, and production builds.
- Use Bun-first commands.

See docs/README.md for the full technical index.
