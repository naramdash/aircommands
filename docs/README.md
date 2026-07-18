# AirCommands Docs Index

This docs set is maintained against the current monorepo codebase state.

## Documents

1. [01-workspace-overview.md](./01-workspace-overview.md)
   - monorepo layout and package roles
2. [02-electron-app.md](./02-electron-app.md)
   - Electron runtime architecture and lifecycle behavior
3. [03-web-app.md](./03-web-app.md)
   - Nuxt app and Nitro server structure
4. [04-gesture-engine.md](./04-gesture-engine.md)
   - gesture model, touch detection, and reducer flow
5. [05-command-execution-contract.md](./05-command-execution-contract.md)
   - request and response contract for app launching
6. [06-build-test-and-ops.md](./06-build-test-and-ops.md)
   - build, test, and operating rules
7. [07-known-issues-and-next-steps.md](./07-known-issues-and-next-steps.md)
   - known risks and practical follow-up order

## Maintenance Rules

- prioritize current implementation facts over historical plans
- keep paths and command examples Bun-first
- update docs in the same change when runtime behavior changes
