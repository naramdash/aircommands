# Gesture Direction Decision Log

## Previous Problem

The earlier implementation tried to recognize commands from right-index pointer
trails: swipes, diagonal swipes, and V/W/S path shapes. That caused repeated
ambiguity:

- small landmark jitter looked like turns,
- fast movement lost shape detail,
- shape-vs-swipe priority needed constant tuning,
- users had to draw gestures precisely in camera space.

## Current Decision

Use two-hand fingertip contact instead of drawn paths.

The new command signal is discrete:

```text
left fingertip + right fingertip held briefly
```

This matches app launching better than drawing recognition because the user is
selecting from finite button-like combinations rather than asking the system to
interpret a trajectory.

## Why This Is Better

| Concern | Path Recognition | Touch Recognition |
| --- | --- | --- |
| Camera jitter | Can become fake turns. | Usually stays within distance hysteresis. |
| User speed | Changes path sampling. | Only needs stable contact. |
| Command count | More shapes become harder to remember. | 25 visible combinations are generated systematically. |
| False positives | Motion can accidentally match a template. | Requires two hands and a held contact. |
| Debuggability | Hard to explain why a path matched. | Normalized distance and pair id are visible. |

## Remaining Tradeoff

Touch recognition depends on both hands being visible. It is still a better
tradeoff for this app because the commands are discrete and should be
intentional.
