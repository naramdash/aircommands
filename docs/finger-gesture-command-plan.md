# Finger Touch Command Plan

## Summary

AirCommands now uses two-hand fingertip contact commands. The user touches a
left-hand finger to a right-hand finger and holds briefly. The app recognizes
the pair and executes the mapped allowlisted app command.

## MVP Scope

- Track both hands with MediaPipe.
- Extract five fingertips per hand.
- Generate and display all 25 left/right touch commands.
- Detect the closest fingertip pair using hand-scale-normalized distance.
- Require a short hold before execution.
- Show contact progress and completion notification.
- Execute app launch through `/api/apps/open`.

## Finger Set

| Finger | Landmark |
| --- | --- |
| thumb | 4 |
| index | 8 |
| middle | 12 |
| ring | 16 |
| pinky | 20 |

## Command Generation

Commands are generated from the Cartesian product of left and right fingers:

```ts
fingerDefinitions.flatMap(left =>
  fingerDefinitions.map(right =>
    `touch_left_${left.name}_right_${right.name}`
  )
)
```

## Recognition Algorithm

1. Read MediaPipe landmarks and handedness.
2. Select left and right hand.
3. Extract fingertip points.
4. Compute average hand scale.
5. Compute all 25 normalized fingertip distances.
6. Pick the closest contact.
7. Enter touch state if distance is below `TOUCH_ENTER_DISTANCE`.
8. Keep the same touch alive while below `TOUCH_EXIT_DISTANCE`.
9. Execute after `TOUCH_HOLD_MS`.
10. Enter cooldown.

## UI Plan

- Camera on top.
- Canvas overlay with fingertip dots.
- Yellow contact line and hold progress ring.
- Status panel with current touch, candidate, progress, distance, cooldown.
- 25 supported gestures shown in a 5-column grid.

## Verification

- `npm run test`
- `npm run build`
- Manual camera verification only after explicit approval.
