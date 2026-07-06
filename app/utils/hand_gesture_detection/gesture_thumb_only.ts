import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { distance } from './geometry'
import { isHandPointingUp } from './orientation'

export function isThumbOnlyGesture(landmarks: NormalizedLandmark[]) {
  if (!isHandPointingUp(landmarks)) return false

  const foldedFingers = [
    isFingerFoldedForThumbOnly(landmarks, 8, 6),
    isFingerFoldedForThumbOnly(landmarks, 12, 10),
    isFingerFoldedForThumbOnly(landmarks, 16, 14),
    isFingerFoldedForThumbOnly(landmarks, 20, 18),
  ]

  return (
    isThumbOutForThumbOnly(landmarks) &&
    foldedFingers.filter(Boolean).length >= 3
  )
}

function isFingerFoldedForThumbOnly(
  landmarks: NormalizedLandmark[],
  tipIndex: number,
  pipIndex: number,
) {
  const tip = landmarks[tipIndex]
  const pip = landmarks[pipIndex]

  if (!tip || !pip) return false

  return tip.y > pip.y - 0.015
}

function isThumbOutForThumbOnly(landmarks: NormalizedLandmark[]) {
  const wrist = landmarks[0]
  const thumbTip = landmarks[4]
  const thumbIp = landmarks[3]
  const indexMcp = landmarks[5]

  if (!wrist || !thumbTip || !thumbIp || !indexMcp) {
    return false
  }

  const palmSize = distance(wrist, indexMcp)

  return (
    distance(thumbTip, indexMcp) > palmSize * 0.6 &&
    distance(thumbTip, wrist) > distance(thumbIp, wrist) - palmSize * 0.02
  )
}
