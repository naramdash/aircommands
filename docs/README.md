# AirCommands Documentation

These documents describe the Electron application in the repository root.

## Documents

- [Repository overview](01-workspace-overview.md): layout and runtime responsibilities.
- [Electron app](02-electron-app.md): architecture, lifecycle, settings, and platform behavior.
- [Gesture engine](04-gesture-engine.md): touch detection and recognition state transitions.
- [Command execution contract](05-command-execution-contract.md): IPC requests and responses.
- [Build, test, and operations](06-build-test-and-ops.md): commands and verification policy.
- [Known issues and next steps](07-known-issues-and-next-steps.md): limitations and follow-up work.

## Maintenance Rules

- Prioritize current implementation facts over historical plans.
- Keep paths relative to the repository root and command examples Bun-first.
- Update documentation in the same change when runtime behavior changes.
