import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { distance } from './geometry'

export function isOpenGesture(landmarks: NormalizedLandmark[]) {
  const extendedFingers = [
    isFingerExtendedForOpen(landmarks, 8, 6, 5),
    isFingerExtendedForOpen(landmarks, 12, 10, 9),
    isFingerExtendedForOpen(landmarks, 16, 14, 13),
    isFingerExtendedForOpen(landmarks, 20, 18, 17),
  ]

  return extendedFingers.filter(Boolean).length >= 3
}

function isFingerExtendedForOpen(
  landmarks: NormalizedLandmark[],
  tipIndex: number,
  pipIndex: number,
  mcpIndex: number,
) {
  const tip = landmarks[tipIndex]
  const pip = landmarks[pipIndex]
  const mcp = landmarks[mcpIndex]
  const wrist = landmarks[0]
  const indexMcp = landmarks[5]
  const middleMcp = landmarks[9]
  const ringMcp = landmarks[13]
  const pinkyMcp = landmarks[17]

  if (
    !tip ||
    !pip ||
    !mcp ||
    !wrist ||
    !indexMcp ||
    !middleMcp ||
    !ringMcp ||
    !pinkyMcp
  ) {
    return false
  }

  const palmSize = distance(wrist, indexMcp)
  const palmCenter = {
    x: (wrist.x + indexMcp.x + middleMcp.x + ringMcp.x + pinkyMcp.x) / 5,
    y: (wrist.y + indexMcp.y + middleMcp.y + ringMcp.y + pinkyMcp.y) / 5,
    z: (wrist.z + indexMcp.z + middleMcp.z + ringMcp.z + pinkyMcp.z) / 5,
  }

  return (
    distance(tip, wrist) > distance(pip, wrist) + palmSize * 0.11 &&
    distance(tip, wrist) > distance(mcp, wrist) + palmSize * 0.42 &&
    distance(tip, palmCenter) > distance(pip, palmCenter) + palmSize * 0.1
  )
}
