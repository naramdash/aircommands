# Client Implementation Spec

## Files

```text
app/
  app.vue
  utils/
    hand_landmark_detection.ts
    gesture_command_detection/
      command_map.ts
      coordinates.ts
      recognition_reducer.ts
      touch_detection.ts
      types.ts
```

## `types.ts`

The active gesture type is a template literal:

```ts
type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'
type TouchGestureName = `touch_left_${FingerName}_right_${FingerName}`
type GestureName = TouchGestureName
```

`TwoHandTouchFrame` contains visibility flags, fingertip arrays, and the closest
contact candidate.

## `command_map.ts`

- Exports `fingerDefinitions`.
- Generates `touchGestureCommands`.
- Exposes `gestureCommands` as a lookup by gesture id.
- `touchGestureCommands.length` must be `25`.

## `touch_detection.ts`

Primary API:

```ts
getTwoHandTouchFrame(hands, handednesses, at): TwoHandTouchFrame
```

Supporting APIs:

```ts
getFingerTips(hand)
getClosestTouchContact(leftHand, rightHand)
isTouchEntered(contact)
isTouchStillActive(contact)
```

## `recognition_reducer.ts`

Primary API:

```ts
reduceRecognitionFrame(context, frame, now)
```

Reducer states:

| State | Meaning |
| --- | --- |
| `tracking` | Waiting for both hands and a valid contact. |
| `touching` | A stable contact is being held. |
| `executing` | An execution candidate has been emitted. |
| `cooldown` | Duplicate execution is suppressed. |
| `error` | Last execution failed. |

## `app.vue`

The UI must:

- Start the camera.
- Run `handLandmarker.detectForVideo` each frame.
- Build a `TwoHandTouchFrame`.
- Draw left fingertips in blue and right fingertips in green.
- Draw the closest/active contact as a yellow line and progress ring.
- Show status, current touch, candidate, hold progress, normalized distance, and cooldown.
- Render all 25 supported gestures from `touchGestureCommands`.
- POST to `/api/apps/open` when an execution candidate is produced.

## Visual Rules

The camera and canvas are both horizontally mirrored with CSS. Canvas drawing
uses raw MediaPipe coordinates so overlays remain aligned after the shared
mirror transform.
