# Touch Lifecycle Recognition

This file keeps its historical name for continuity, but the current lifecycle is
touch-based, not stroke-based.

## States

| State | Korean UI | Meaning |
| --- | --- | --- |
| `tracking` | 접촉 대기 | Both hands and a valid touch are not yet active. |
| `touching` | 접촉 감지 | A left/right fingertip pair is inside the contact threshold and hold progress is running. |
| `executing` | 실행 중 | A command candidate has been emitted to the app execution flow. |
| `cooldown` | 쿨다운 | Duplicate execution is suppressed. |
| `error` | 오류 | Last execution failed. |

## Lifecycle

1. MediaPipe reports up to two hands.
2. The app finds left and right hands from handedness labels.
3. Five fingertips are extracted from each hand.
4. All 25 left/right distances are computed.
5. The closest pair becomes the contact candidate.
6. If it is inside `TOUCH_ENTER_DISTANCE`, the reducer enters `touching`.
7. If the same gesture stays inside `TOUCH_EXIT_DISTANCE`, hold progress increases.
8. When hold reaches `TOUCH_HOLD_MS`, the reducer emits an execution candidate.
9. After success or failure, the reducer enters cooldown.

## Feedback

- Left fingertips are blue.
- Right fingertips are green.
- The current closest/active contact is a yellow line.
- A yellow ring shows hold progress.
- A top-center notification appears when a touch command completes.

## Tunable Constants

| Constant | Purpose |
| --- | --- |
| `TOUCH_ENTER_DISTANCE` | Starts a new touch candidate. |
| `TOUCH_EXIT_DISTANCE` | Keeps an existing touch alive despite jitter. |
| `TOUCH_HOLD_MS` | Required stable hold time. |
| `COOLDOWN_MS` | Duplicate suppression after execution. |

## Verification

Reducer tests must prove:

1. A touch does not execute immediately.
2. The same touch executes after hold completion.
3. A disappearing touch resets to tracking.
4. Cooldown suppresses another execution.
