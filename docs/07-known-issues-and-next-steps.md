# Known Issues and Next Steps

## Current Known Issues

1. Windows packaging can intermittently fail with `EPERM` when replacing
   `release/<version>/win-unpacked`.
2. Custom application selection is Windows-only; macOS `.app` and Linux `.desktop`
   adapters have not been implemented.
3. Unpackaged AppUserModelID entries without a readable Shell icon, shortcut, or
   Appx manifest asset fall back to the generic Windows icon.
4. Discovery catalog thumbnails have size limits. Missing or oversized icons can
   remain generic until a later background refresh succeeds.
5. Steam discovery relies on local Valve KeyValues files. Conservative tool-name
   filtering can include an unusually named tool or omit a game with a tool-like
   suffix.
6. Google may reject an embedded login flow with `disallowed_useragent`. Password,
   consent, and two-factor input remain manual.

## Suggested Priority

1. Add macOS `.app` and Linux `.desktop` application adapters.
2. Consider native Windows Shell icon extraction for AppUserModelID targets.
3. Add explicit runtime verification checklists for each target OS.
4. Expand gesture capacity through a mode or launcher UI if needed; the current
   command set uses six one-hand gestures.

## Documentation Maintenance

Update the Electron architecture, gesture engine, command contract, and relevant
known issues when runtime behavior changes.
