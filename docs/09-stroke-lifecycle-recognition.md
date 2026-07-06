# Stroke Lifecycle Gesture Recognition

This document defines how the app separates gesture input into explicit start,
active input, end, and confirmation phases.

## States

| State | Korean UI | Meaning | Exit condition |
| --- | --- | --- | --- |
| `tracking` | 추적 중 | No usable right-index anchor exists yet. | Right index appears. |
| `ready_to_start` | 시작 가능 | Right index is visible and an anchor point is set. Recognition can start. | Pointer moves at least `STROKE_START_DISTANCE` from the anchor. |
| `drawing` | 입력 중 | The stroke is actively being captured. | Pointer stays under movement threshold for `STROKE_IDLE_MS`, or stroke exceeds `STROKE_MAX_DURATION_MS`. |
| `stroke_ended` | 종료 감지 | The stroke has ended and is held briefly on screen. | `STROKE_END_DISPLAY_MS` elapses, then the completed stroke is classified. |
| `candidate` | 실행 준비 | A gesture command was recognized. | User holds still to confirm, moves too far, or the candidate times out. |
| `confirming` | 확인 중 | Confirmation hold is progressing. | Hold completes or pointer moves too far. |
| `executing` | 실행 중 | Command request is being sent. | Server request completes. |
| `cooldown` | 쿨다운 | Duplicate inputs are suppressed briefly. | Cooldown expires. |
| `error` | 오류 | Execution failed. | Next reducer reset or cooldown expiry. |

## Start And End Rules

Start is not a button or pose. It is a stable spatial condition:

1. The right index fingertip becomes visible.
2. The first visible point becomes `strokeAnchor`.
3. While movement from the anchor is below `STROKE_START_DISTANCE`, the app
   remains in `ready_to_start`.
4. Once the pointer crosses that distance, the stroke moves to `drawing`.

End is also spatial and temporal:

1. During `drawing`, only points that move at least `STROKE_MOVEMENT_DISTANCE`
   from the previous captured point are appended.
2. If no meaningful movement happens for `STROKE_IDLE_MS`, the stroke ends with
   reason `idle`.
3. If the stroke runs longer than `STROKE_MAX_DURATION_MS`, it ends with reason
   `timeout`.
4. The app enters `stroke_ended` for `STROKE_END_DISPLAY_MS` so the user can see
   that input ended before classification creates a command candidate.

## Screen Feedback

The UI distinguishes the lifecycle in three ways:

1. The status field shows `시작 가능`, `입력 중`, and `종료 감지` as separate
   phases.
2. The camera overlay shows an instruction sentence for the current phase.
3. Canvas markers show the start point and current/end point:
   - cyan ring: ready-to-start anchor and start progress
   - cyan dot: stroke start
   - yellow dot: stroke current/end

## Recognition Between Start And End

Only the completed stroke between `ready_to_start` and `stroke_ended` is used for
classification. The five-second render trail is visual history only.

Classification order:

1. Try path-shape classification for `V`, `W`, and `S`.
2. If the path is too line-like or confidence is low, try directional swipe
   classification. Swipes support the four cardinal directions and the four
   diagonal directions.
3. If neither classifier accepts the stroke, reset to `tracking`.

Shape recognition uses normalized, resampled templates and a stroke corridor:

1. Raw MediaPipe points are converted to user-facing coordinates.
2. Single-frame spikes are removed, then the path is smoothed.
3. The stroke is simplified through a width-based corridor. Points that stay
   inside the corridor are treated as part of the same stroke surface, not as
   new turns.
4. The stroke is rejected if it has too few points, is too short, too flat, too
   slow, or too line-like.
5. The full path and bounded front/back margin-trimmed windows are considered.
6. Each candidate path is resampled to a fixed number of points.
7. The path is normalized into a square bounding box.
8. Average distance to pre-normalized templates decides the template match.
9. A structural scorer can also accept paths with the expected turn pattern:
   V has one vertical turn, W has three vertical turns, and S has two horizontal
   turns while progressing vertically.
10. The accepted candidate records `gestureStartedAt` and `gestureEndedAt` so the
   UI can highlight only the matched portion of the stroke.

## Current Tunable Constants

| Constant | Purpose |
| --- | --- |
| `STROKE_START_DISTANCE` | Distance required to leave `ready_to_start`. |
| `STROKE_MOVEMENT_DISTANCE` | Minimum point-to-point movement to append to the captured stroke. |
| `STROKE_IDLE_MS` | Idle duration that ends an active stroke. |
| `STROKE_END_DISPLAY_MS` | Time to keep `stroke_ended` visible before classification. |
| `STROKE_MAX_DURATION_MS` | Maximum active stroke length before forced end. |
| `SHAPE_MAX_AVG_DISTANCE` | Template distance used to convert match quality into confidence. |
| `SHAPE_MIN_CONFIDENCE` | Minimum accepted shape confidence. |
| `SHAPE_MAX_MARGIN_TRIM_RATIO` | Maximum front/back stroke margin considered removable for shape matching. |
| `SHAPE_STRUCTURAL_MIN_CONFIDENCE` | Minimum accepted confidence for turn-structure shape matching. |
| `SHAPE_STROKE_CORRIDOR_WIDTH` | Width of the stroke corridor used to ignore narrow in-stroke wobble. |

## Verification

The reducer tests must prove:

1. A visible `ready_to_start` state exists before drawing.
2. A visible `stroke_ended` state exists before candidate creation.
3. All supported gestures are recognized through the full lifecycle:
   `swipe_up`, `swipe_down`, `swipe_left`, `swipe_right`,
   `swipe_up_left`, `swipe_up_right`, `swipe_down_left`,
   `swipe_down_right`, `shape_v`, `shape_w`, and `shape_s`.
4. Losing the right hand cancels active stroke capture.
