# AirCommands Monorepo

This repository is a Bun workspace monorepo.

## Workspace Layout

- `apps/aircommands-web`: Nuxt client and Nitro API for gesture-driven app commands
- `docs`: Product, architecture, API, and verification documents

## Commands

Install dependencies from the repository root:

```bash
bun install
```

Run app package checks:

```bash
cd apps/aircommands-web
bun run test
bun run build
```

Do not start a dev server automatically for verification. Use static inspection,
targeted tests, and production builds unless runtime verification is explicitly approved.
