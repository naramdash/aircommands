# Test And Verification Plan

## Automated Tests

Run:

```bash
npm run test
```

Current test coverage:

- `command_map.test.ts`
  - Verifies exactly 25 touch commands.
  - Verifies every left/right finger pair exists.
- `coordinates.test.ts`
  - Verifies handedness parsing and hand index lookup.
- `touch_detection.test.ts`
  - Verifies fingertip extraction.
  - Verifies closest pair selection.
  - Verifies enter/exit threshold behavior.
  - Verifies two-hand frame construction.
- `recognition_reducer.test.ts`
  - Verifies hold is required before execution.
  - Verifies disappearing contact resets state.
  - Verifies cooldown after success.
- `open_app.test.ts`
  - Verifies allowlisted execution, invalid body rejection, unknown app rejection, and dedupe.

## Build Verification

Run:

```bash
npm run build
```

Build must pass. Existing Nuxt sourcemap and dependency deprecation warnings do
not block this feature unless they become failures.

## Manual Camera Verification

Do not start a dev server or browser automatically. If the user explicitly
approves runtime verification:

1. Start the Nuxt dev server.
2. Confirm both hands are visible.
3. Confirm five fingertip points are drawn per hand.
4. Touch several left/right finger pairs.
5. Confirm the yellow line follows the closest pair.
6. Confirm hold progress reaches 100%.
7. Confirm the top-center completion notice appears.
8. Confirm duplicate execution is suppressed during cooldown.

## Acceptance Evidence

Completion requires both automated test pass and production build pass. Runtime
camera behavior requires manual verification because MediaPipe output depends on
camera, lighting, and hand visibility.
