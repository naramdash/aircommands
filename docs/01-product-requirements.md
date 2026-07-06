# Product Requirements

## Goal

AirCommands lets the user launch local applications with explicit two-hand
finger-touch gestures. The user touches one fingertip on the left hand to one
fingertip on the right hand and holds briefly to execute the mapped command.

## Supported Gestures

The MVP supports every left/right fingertip pair:

- Left hand: thumb, index, middle, ring, pinky
- Right hand: thumb, index, middle, ring, pinky
- Total: `5 x 5 = 25` touch gestures

Gesture names use this format:

```ts
touch_left_${leftFinger}_right_${rightFinger}
```

Example:

```ts
touch_left_thumb_right_index
```

## Requirements

- The camera view must track both hands.
- The UI must show fingertip points for both hands.
- The UI must show the current closest contact candidate.
- The UI must list all 25 supported touch gestures.
- A command must execute only after the same touch is held for the configured hold duration.
- The app must suppress duplicate execution through a cooldown.
- The server must execute only allowlisted local applications.
- Tests must cover command generation, contact detection, reducer hold behavior, and server request handling.

## Non-Goals

- Drawing recognition, swipes, V/W/S path shapes, and single-hand pose commands are not current scope.
- The browser should not be opened automatically for verification.
- The app does not attempt to infer hidden fingertips when MediaPipe fails to report them.

## Completion Definition

- `app/app.vue` uses two-hand touch detection, not pointer trail recognition.
- `command_map.ts` exposes exactly 25 touch commands.
- `touch_detection.ts` normalizes fingertip distance by hand scale.
- `recognition_reducer.ts` requires stable contact hold before execution.
- `npm run test` passes.
- `npm run build` passes.
