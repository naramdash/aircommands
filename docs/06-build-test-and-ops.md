# Build, Test, and Operations

## Operating Rules

From repository policy (`AGENTS.md`):

- Do not auto-start local dev server for verification.
- Prefer static inspection, targeted tests, and production builds.
- Prefer Bun commands.

## Root-Level

- install: `bun install`
- build all apps: `bun run builds`

## Electron Package

Location: `apps/electron`

- build: `bun run build`
- includes: type-check + renderer build + main/preload build + electron-builder

Known environmental issue on Windows:

- intermittent EPERM rename failure during electron-builder output folder swap

## Web Package

Location: `apps/web`

- test: `bun run test`
- build: `bun run build`

## Practical Verification Checklist

1. Run package-specific build after code changes.
2. Run web tests when touching shared gesture/server logic.
3. Verify no unresolved diagnostics in changed files.
4. Keep runtime/manual verification opt-in only (user approval first).
