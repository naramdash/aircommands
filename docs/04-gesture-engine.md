# Gesture Engine

## Supported Gesture Model

Current model is touch-based, not stroke/shape-based:

- one-hand touches: thumb with index/middle/ring for each hand = 6

Total command gestures: 6. The former 25-command two-hand matrix and its
cross-hand contact detection have been removed.

All six gestures start unassigned. A program is launched only after the user
explicitly assigns it.

The renderer exposes a confirmed `모든 배정 해제` action. It clears only gesture
assignments; registered and discovered application data remains intact.

## Core Modules

- command_map.ts: generates gesture-command mapping
- touch_detection.ts: computes the closest valid thumb-to-finger candidate per hand
- recognition_reducer.ts: hold/cooldown state transitions
- types.ts: shared gesture and frame contracts

## State Flow Summary

1. Tracking
2. Touching (progress accumulates by hold duration)
3. Candidate completed
4. Cooldown
5. Back to tracking

Progress is surfaced to UI as percentage and progress bar.

## Pose Quality Guards

Recognition can be paused with warnings for:

- palm edge-on
- fist-like closed fingers
- fingertip overlap in projection

## Execution Trigger

When hold threshold is met, a `GestureCandidate` is emitted and app execution is requested by:

- Electron renderer -> IPC (`app:open`)
- Web client -> Nitro route (`/api/apps/open`)
