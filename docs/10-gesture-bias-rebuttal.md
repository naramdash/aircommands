# Gesture Bias Rebuttal

This document records the structural review behind the V/W/S recognition
hardening.

## Problem

Up swipe recognition was easier than V/W/S recognition because the classifiers
had asymmetric acceptance rules:

- Swipe detection accepted a dominant one-axis movement with very few points.
- Shape detection required enough points, two-dimensional bounds, non-linearity,
  resampling, normalization, and template distance.

That means a short upward movement can become `swipe_up`, while a valid V/W/S
can fail if the stroke contains preparation movement, endpoint jitter, missing
turn samples, or shape distortion.

## Rebuttal Rounds

| # | Claim | Counter-check | Result |
| --- | --- | --- | --- |
| 1 | This is just a threshold issue. | Lower thresholds would also increase swipe/shape false positives. | Need structural criteria, not only looser constants. |
| 2 | Shape-first classification already protects V/W/S. | Shape-first only helps when the shape classifier accepts the stroke. | Shape acceptance must improve. |
| 3 | Template distance alone is enough. | Real camera paths include lead-in and trailing jitter that distort the whole template. | Add margin/subsequence matching. |
| 4 | Arbitrary subsequence scanning is safe. | Any small squiggle could become a shape. | Only trim bounded front/back margins. |
| 5 | W should be matched as a bitmap-like template. | W is defined more by alternating turns than exact coordinates. | Add structural turn-count scoring. |
| 6 | V should use the same strict point count as W/S. | V can be drawn with fewer meaningful points. | Lower the global shape point gate. |
| 7 | S can use the same horizontal progression model as W. | S progresses vertically while x alternates. | Use per-shape progression and wave axes. |
| 8 | Up swipe could be mistaken for V after relaxing shape rules. | Vertical swipe has insufficient two-axis bounds and no valid horizontal progression. | Add negative jittered vertical-swipe test. |
| 9 | W false positives can be controlled by confidence only. | Confidence can be high for a smooth wrong curve if turn count is not checked. | Require expected turn count. |
| 10 | Extra turns should always fail. | Camera jitter can add one extra turn. | Allow one extra turn with a lower score. |
| 11 | Missing turns should be accepted. | Missing turns changes W/S into another shape or swipe. | Missing expected turns fail structural scoring. |
| 12 | Direction should matter. | Users may draw shapes forwards or backwards. | Use absolute progression and reverse template variants. |
| 13 | Endpoint jitter should define the final direction. | Endpoint jitter was a cause of swipe-only success/failure asymmetry. | Use whole-stroke extrema for swipes; use trimmed windows for shapes. |
| 14 | Shape windows should use the full render trail. | The render trail is visual history, not a single intentional gesture. | Use completed stroke only. |
| 15 | Larger margin trim is always better. | Large trims can find accidental shapes inside unrelated movement. | Cap front/back trim at 25%. |
| 16 | Structural score should replace templates. | Templates still reject many ambiguous paths cheaply. | Combine template and structural scoring. |
| 17 | Structural score should override any template result. | A clean template match is stronger evidence than a lower structural score. | Use the higher-confidence accepted result. |
| 18 | Lower `SHAPE_MIN_BOUNDS` risks swipe confusion. | Shape still requires both-axis bounds, non-linearity, and structure. | Add explicit vertical-swipe negative test. |
| 19 | Tests with perfect paths prove runtime behavior. | Perfect paths miss camera jitter and lead-in/trailing movement. | Add embedded and imperfect path tests. |
| 20 | Build success proves gesture correctness. | Build does not exercise recognition behavior. | Require unit tests for classifier behavior and reducer lifecycle. |

## Implemented Result

Shape recognition now uses three layers:

1. Full completed-stroke template matching.
2. Front/back margin trimming up to 25% of the stroke, then template matching.
3. Structural scoring for expected turns:
   - V: horizontal progression with one vertical turn.
   - W: horizontal progression with three vertical turns.
   - S: vertical progression with two horizontal turns.

The candidate stores `gestureStartedAt` and `gestureEndedAt`, so the UI can draw
only the part of the stroke that was actually accepted as the gesture.

## Verification

The tests cover:

- clean V/W/S paths
- W/S inside leading and trailing movement
- imperfect W/S paths that rely on turn structure
- vertical swipe with lateral jitter rejected as a shape
- full reducer lifecycle for swipes and shapes

