# Refactor TODOs

This document tracks the current code review findings and concrete refactor work needed to make gesture recognition more reliable and safer.

## Priority 1

### 1. Keep the camera frame loop alive after per-frame errors

**Problem**

`app/app.vue` runs MediaPipe detection, touch-frame creation, drawing, reducer updates, and command dispatch inside one frame callback. If any step throws before the next `requestAnimationFrame` is scheduled, recognition stops until the camera is restarted.

**Relevant code**

- `app/app.vue` `drawCameraFrame`
- `app/utils/hand_landmark_detection.ts`
- `app/utils/gesture_command_detection/touch_detection.ts`

**Refactor**

- Wrap the frame body in `try/catch/finally`.
- Always schedule the next animation frame in `finally` while the camera is active.
- On recoverable frame errors, clear only transient drawing/state and show a compact error message.
- Avoid calling `stopCamera()` for a single frame failure unless the media stream itself is invalid.

**Verification**

- Add a unit-testable helper around frame reduction if practical.
- Manually inject a thrown error in detection/drawing during development and confirm the next frame still runs.
- Run tests and production build.

### 2. Add release-latch logic after command completion

**Problem**

After a gesture completes, the reducer enters cooldown. If the user keeps the same fingers touching until cooldown ends, the same command can trigger repeatedly. Server request dedupe does not prevent this because client request IDs include `detectedAt`.

**Relevant code**

- `app/utils/gesture_command_detection/recognition_reducer.ts`
- `app/app.vue` `executeCandidate`
- `server/utils/open_app.ts`

**Refactor**

- Add a post-completion `awaitingRelease` or `blockedGesture` field to recognition context.
- After command completion, require the active contact to disappear or exceed the exit threshold before a new hold can start.
- Keep cooldown for accidental rapid retriggers, but do not rely on cooldown alone for repeated-contact prevention.
- Make client request IDs stable for the same gesture cycle if server dedupe is still used as a backup.

**Verification**

- Add reducer tests:
  - same contact held through cooldown does not fire again
  - same contact released then touched again can fire
  - different contact after release can fire

### 3. Harden local app-launch API against cross-origin requests

**Problem**

The local API launches allowlisted desktop apps. Even with an allowlist, another webpage can potentially POST to the local server if the dev/prod server is reachable from the browser.

**Relevant code**

- `server/api/apps/open.post.ts`
- `server/api/open-chrome.post.ts`
- `server/utils/open_app.ts`
- `server/utils/app_command_runner.ts`

**Refactor**

- Validate `Origin` and/or `Referer` against the local app origin.
- Require a per-session token from the client for app-launch requests.
- Reject unsafe methods and malformed bodies early.
- Consider disabling the legacy `/api/open-chrome` endpoint or making it call the same guarded path.

**Verification**

- Add server tests for accepted same-origin requests.
- Add server tests for rejected missing/foreign origin requests.
- Confirm manual API calls without the token fail.

## Priority 2

### 4. Separate two-hand and one-hand gesture priority

**Problem**

Two-hand and one-hand contact candidates are currently mixed and the smallest normalized distance wins. When both hands are visible, an unintended one-hand thumb contact can beat the intended two-hand command.

**Relevant code**

- `app/utils/gesture_command_detection/touch_detection.ts`
- `app/utils/gesture_command_detection/command_map.ts`

**Refactor**

- Prefer two-hand contacts when both hands are visible and both hand poses are acceptable.
- Use one-hand contacts only when exactly one hand is visible, or after an explicit one-hand mode decision.
- Alternatively add weighted priority: two-hand candidates beat one-hand candidates unless their distance is clearly worse.

**Verification**

- Add tests where both hands are visible and a one-hand thumb contact is closer than the two-hand intended contact.
- Add tests for one-hand-only frames to ensure they still work.

### 5. Move MediaPipe initialization out of top-level module await

**Problem**

`hand_landmark_detection.ts` initializes `FilesetResolver` and `HandLandmarker` at module import time. If model/WASM loading fails or is slow, the app cannot show a controlled loading/error/retry state.

**Relevant code**

- `app/utils/hand_landmark_detection.ts`
- `app/app.vue` `startCamera`

**Refactor**

- Export an async `getHandLandmarker()` or `createHandLandmarker()` function.
- Cache the initialized landmarker after successful load.
- Let `startCamera()` handle loading, failure, and retry UI explicitly.
- Show a distinct model-loading state separate from camera permission state.

**Verification**

- Add tests for initialization wrapper if feasible with mocks.
- Confirm app shows a meaningful error if model path or WASM path is invalid.

### 6. Add server-side timeout/cancellation for app commands

**Problem**

Client-side fetch abort does not stop the server process launched by `exec`. A slow or hanging command can continue after the browser has timed out.

**Relevant code**

- `server/utils/app_command_runner.ts`
- `server/utils/open_app.ts`

**Refactor**

- Add a server-side command timeout.
- Prefer `spawn` with explicit args over shell command strings where possible.
- Return a specific timeout error from `runAppCommand`.
- Keep the allowlist, but represent commands as executable plus args instead of raw shell strings if practical.

**Verification**

- Add tests using a fake runner that never resolves.
- Add tests for timeout response shape.

## Priority 3

### 7. Align recognition states with actual reducer behavior

**Problem**

`RecognitionState` includes `candidate`, `executing`, and `error`, but current reducer output is effectively `tracking`, `touching`, and `cooldown`. Dead states make UI and reducer changes easier to desynchronize.

**Relevant code**

- `app/utils/gesture_command_detection/types.ts`
- `app/utils/gesture_command_detection/recognition_reducer.ts`
- `app/app.vue` status UI

**Refactor**

- Remove unused states from `RecognitionState`, or reintroduce them deliberately with reducer tests.
- If app execution status is needed, model it separately from recognition state.
- Keep recognition state focused on camera/contact lifecycle.

**Verification**

- Type-check/build should reveal removed-state references.
- Update reducer tests to document every valid state transition.

### 8. Clean up obsolete test runner and documentation drift

**Problem**

`apps/aircommands-web/scripts/run-tests.mjs` was an older Node test runner path, while the app package now uses Vitest. README previously documented npm commands, while project instructions prefer Bun.

**Relevant code**

- `apps/aircommands-web/scripts/run-tests.mjs`
- `apps/aircommands-web/README.md`
- `apps/aircommands-web/package.json`
- `AGENTS.md`

**Refactor**

- Remove `apps/aircommands-web/scripts/run-tests.mjs` if it is no longer used.
- Update README commands to Bun-first with npm fallback if needed.
- Update README interaction model to include one-hand thumb contacts.
- Keep docs aligned with current gesture command map.

**Verification**

- Search for references to `apps/aircommands-web/scripts/run-tests.mjs`.
- Run tests/build after removing obsolete files.

## Current Verification Baseline

- `bun run test` passes: 5 files, 24 tests.
- `bun run build` passes.
- `bun` is available on PATH.
- Dev server and browser runtime verification are intentionally not started automatically.
