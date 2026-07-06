# Implementation Roadmap

## Completed Current Direction

- MediaPipe hand landmarker configured for two hands.
- Two-hand fingertip extraction added.
- 25 touch commands generated from left/right finger definitions.
- Touch distance normalized by hand scale.
- Enter/exit hysteresis added.
- Hold reducer added.
- UI rewritten for touch status and 25 gesture list.
- Server API retained with allowlist and dedupe.
- Unit tests rewritten for touch command generation, touch detection, reducer, coordinates, and server API.

## Next Practical Work

1. Add runtime calibration UI for `TOUCH_ENTER_DISTANCE` and `TOUCH_EXIT_DISTANCE`.
2. Add a debug panel showing raw normalized distances for all 25 pairs.
3. Add per-command app customization instead of cycling the app list.
4. Add optional user confirmation for high-impact commands.
5. Run manual camera verification after explicit user approval.

## Removed Work

The previous pointer trail, swipe, V/W/S path-shape, and stroke lifecycle code is
not part of the current product direction.
