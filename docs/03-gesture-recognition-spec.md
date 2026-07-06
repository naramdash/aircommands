# Gesture Recognition Spec

## Input

Recognition uses MediaPipe `NormalizedLandmark[][]` and handedness categories
from `HandLandmarker.detectForVideo`.

Both hands must be visible:

- `Left`
- `Right`

Each hand contributes five fingertip landmarks:

| Finger | Landmark |
| --- | --- |
| thumb | 4 |
| index | 8 |
| middle | 12 |
| ring | 16 |
| pinky | 20 |

## Gesture Space

Every left fingertip can touch every right fingertip:

```text
5 left fingers x 5 right fingers = 25 gestures
```

Gesture id format:

```ts
touch_left_${leftFinger}_right_${rightFinger}
```

## Distance Normalization

Raw screen-space distance is not enough because hand size changes with camera
depth. The detector computes:

```text
normalizedDistance = fingertipDistance / averageHandScale
```

`handScale` is primarily the distance between index MCP landmark `5` and pinky
MCP landmark `17`. It falls back to wrist `0` to middle MCP `9`.

## Thresholds

Current constants:

| Constant | Meaning |
| --- | --- |
| `TOUCH_ENTER_DISTANCE = 0.42` | Distance required to start a contact. |
| `TOUCH_EXIT_DISTANCE = 0.58` | Wider distance that keeps an existing contact alive. |
| `TOUCH_MIN_HAND_SCALE = 0.04` | Lower bound to avoid division by tiny hand scale. |
| `TOUCH_HOLD_MS = 280` | Stable hold duration before command execution. |
| `COOLDOWN_MS = 1500` | Duplicate suppression after execution. |

The separate enter/exit thresholds are hysteresis. They prevent the contact
from flickering when landmarks jitter around the boundary.

## Candidate Selection

For each frame:

1. Extract five fingertips from the left hand.
2. Extract five fingertips from the right hand.
3. Compute all 25 normalized distances.
4. Select the closest pair.
5. Ignore it if it is outside `TOUCH_EXIT_DISTANCE`.
6. Start a new touch only if it is inside `TOUCH_ENTER_DISTANCE`.
7. If the same touch remains active until `TOUCH_HOLD_MS`, emit a command candidate.

## Removed Recognition Modes

Swipe recognition and path-shape recognition are no longer part of the active
interaction model. They were more ambiguous than two-hand fingertip contact for
discrete app-launch commands.
