# Known Issues and Next Steps

## Current Known Issues

1. Electron packaging on Windows can intermittently fail with EPERM when replacing `release/*/win-unpacked`.
2. Gesture and app-launch domain logic is duplicated between `apps/electron` and `apps/web`.
3. Web app-launch command mapping is less robust than Electron mapping (no fallback list).
4. Legacy endpoint `/api/open-chrome` remains and should be evaluated for consolidation.

## Suggested Priority

1. Align web app-launch command fallback behavior with Electron.
2. Consider extracting shared gesture/app-launch domain into `packages/shared`.
3. Add explicit smoke tests/checklists per target OS (Windows, Ubuntu GNOME, Ubuntu KDE).
4. Consolidate or deprecate legacy open-chrome route after compatibility review.

## Documentation Maintenance Rule

When runtime behavior changes in either app package, update these docs in the same PR:

- 02-electron-app.md
- 03-web-app.md
- 05-command-execution-contract.md
- 07-known-issues-and-next-steps.md
