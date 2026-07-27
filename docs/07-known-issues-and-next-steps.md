# Known Issues and Next Steps

## Current Known Issues

1. Electron packaging on Windows can intermittently fail with EPERM when replacing `release/*/win-unpacked`.
2. Gesture and app-launch domain logic is duplicated between `apps/electron` and `apps/web`.
3. Web app-launch command mapping is less robust than Electron mapping (no fallback list).
4. Legacy endpoint `/api/open-chrome` remains and should be evaluated for consolidation.
5. Custom application selection is Windows-only; macOS `.app` and Linux `.desktop`
   adapters have not been implemented.
6. Unpackaged AppUserModelID entries without a readable Shell icon, shortcut, or
   Appx manifest asset still fall back to the generic Windows icon.
7. The persisted discovery catalog keeps bounded thumbnail data for fast startup.
   Items whose icons exceed the limits or remain unavailable after retry still use
   the generic application glyph until a later background refresh succeeds.
8. The command set intentionally favors six memorable one-hand gestures; expanding
   command capacity should use a mode or launcher UI rather than restoring the
   removed 5×5 two-hand matrix.
9. Steam discovery relies on local Valve KeyValues files. Non-game tools are
   filtered by conservative name rules, so an unusually named tool can still
   appear or a game with a tool-like suffix can be omitted.

## Suggested Priority

1. Add macOS `.app` and Linux `.desktop` application adapters.
2. Consider native Windows Shell icon extraction for AppUserModelID targets.
3. Align web app-launch command fallback behavior with Electron.
4. Consider extracting shared gesture/app-launch domain into `packages/shared`.
5. Add explicit smoke tests/checklists per target OS (Windows, Ubuntu GNOME, Ubuntu KDE).
6. Consolidate or deprecate legacy open-chrome route after compatibility review.

## Documentation Maintenance Rule

When runtime behavior changes in either app package, update these docs in the same PR:

- 02-electron-app.md
- 03-web-app.md
- 05-command-execution-contract.md
- 07-known-issues-and-next-steps.md
