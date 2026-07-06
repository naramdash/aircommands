# Self Review And Hardening

## Current Strengths

- The active gesture space is explicit and finite: 25 left/right fingertip pairs.
- Contact detection is simpler than path interpretation.
- Distances are normalized by hand size.
- Enter/exit hysteresis reduces flicker.
- Hold time prevents accidental instant execution.
- Cooldown suppresses duplicate app launches.
- Server execution remains allowlisted.

## Remaining Risks

- Fingertip occlusion can occur exactly when fingers touch.
- MediaPipe handedness can become unstable when hands cross or overlap.
- Thumb tips are less stable than index/middle fingertips in some camera angles.
- A fixed threshold may not fit every camera distance and hand size.
- Cycling 25 gestures across a small app allowlist is functional but not an ideal product mapping.

## Hardening Checklist

- Add calibration controls for touch thresholds.
- Add per-pair enable/disable controls.
- Add user-editable command mapping.
- Add a debug distance matrix for all 25 pairs.
- Add a visible warning when handedness swaps or one hand disappears.
- Consider requiring contact release before accepting the next command.
- Consider a minimum confidence floor from MediaPipe if available.

## What Not To Reintroduce

Do not reintroduce swipe or path-shape recognition as the primary command
system. Those modes are more ambiguous for discrete app commands than explicit
two-hand touch pairs.
