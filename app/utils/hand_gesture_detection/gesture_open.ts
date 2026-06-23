import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { distance } from './geometry'

export function isOpenGesture(landmarks: NormalizedLandmark[]) {
  const extendedFingers = [
    isFingerExtendedForOpen(landmarks, 8, 6),
    isFingerExtendedForOpen(landmarks, 12, 10),
    isFingerExtendedForOpen(landmarks, 16, 14),
    isFingerExtendedForOpen(landmarks, 20, 18),
  ]

  return extendedFingers.filter(Boolean).length >= 3
}

function isFingerExtendedForOpen(
  landmarks: NormalizedLandmark[],
  tipIndex: number,
  pipIndex: number,
) {
  const tip = landmarks[tipIndex]
  const pip = landmarks[pipIndex]
  const wrist = landmarks[0]
  const indexMcp = landmarks[5]

  if (!tip || !pip || !wrist || !indexMcp) return false

  const palmSize = distance(wrist, indexMcp)

  return (
    tip.y < pip.y - palmSize * 0.1 &&
    distance(tip, wrist) > distance(pip, wrist) + palmSize * 0.12
  )
}
