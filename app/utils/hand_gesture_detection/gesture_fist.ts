import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { distance } from './geometry'

export function isFistGesture(landmarks: NormalizedLandmark[]) {
  const foldedFingers = [
    isFingerFoldedForFist(landmarks, 8, 6, 5),
    isFingerFoldedForFist(landmarks, 12, 10, 9),
    isFingerFoldedForFist(landmarks, 16, 14, 13),
    isFingerFoldedForFist(landmarks, 20, 18, 17),
  ]

  return foldedFingers.every(Boolean) && isThumbFoldedForFist(landmarks)
}

function isFingerFoldedForFist(
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
    tip.y > pip.y - palmSize * 0.015 &&
    distance(tip, wrist) < distance(mcp, wrist) + palmSize * 0.55 &&
    distance(tip, palmCenter) < palmSize * 1.2
  )
}

function isThumbFoldedForFist(landmarks: NormalizedLandmark[]) {
  const wrist = landmarks[0]
  const thumbTip = landmarks[4]
  const thumbIp = landmarks[3]
  const indexMcp = landmarks[5]
  const middleMcp = landmarks[9]
  const ringMcp = landmarks[13]
  const pinkyMcp = landmarks[17]

  if (
    !wrist ||
    !thumbTip ||
    !thumbIp ||
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
    distance(thumbTip, indexMcp) < palmSize * 0.82 &&
    distance(thumbTip, palmCenter) < palmSize * 0.72 &&
    distance(thumbTip, wrist) < distance(thumbIp, wrist) + palmSize * 0.1
  )
}
