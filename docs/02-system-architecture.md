# System Architecture

## Overview

The system has three layers:

1. Camera and MediaPipe hand landmark detection in the Nuxt client.
2. Two-hand fingertip touch recognition in pure utility modules.
3. Local app launch through a server API with an allowlist.

## Client Flow

```text
app.vue
  -> handLandmarker.detectForVideo(video, now)
  -> getTwoHandTouchFrame(landmarks, handednesses, now)
  -> reduceRecognitionFrame(context, touchFrame, now)
  -> /api/apps/open when executionCandidate is produced
```

## Key Modules

### `apps/aircommands-web/app/app.vue`

- Starts/stops camera.
- Runs MediaPipe per animation frame.
- Draws left/right fingertip points on Canvas 2D.
- Draws the current contact line and hold progress ring.
- Displays all 25 supported gestures.
- Sends execution requests to `/api/apps/open`.

### `hand_landmark_detection.ts`

- Initializes `@mediapipe/tasks-vision`.
- Uses the local `hand_landmarker.task` asset.
- Runs in `VIDEO` mode.
- Sets `numHands: 2`.

### `touch_detection.ts`

- Extracts five fingertip landmarks per hand.
- Finds the closest left/right fingertip pair.
- Normalizes distance by average hand scale.
- Applies enter/exit thresholds for contact hysteresis.

### `recognition_reducer.ts`

- Tracks `tracking`, `touching`, `executing`, `cooldown`, and `error` states.
- Requires `TOUCH_HOLD_MS` before producing an execution candidate.
- Applies `COOLDOWN_MS` after execution.

### `command_map.ts`

- Defines the five supported fingers.
- Generates `5 x 5 = 25` gesture commands.
- Maps each gesture to an allowlisted app command label.

## Server Flow

```text
POST /api/apps/open
  -> openAppRequest(body)
  -> validate app
  -> dedupe request id
  -> getAppCommand(app)
  -> runAppCommand(command)
```

The server never executes arbitrary user-provided commands. It only runs entries
from `apps/aircommands-web/server/utils/apps.ts`.
