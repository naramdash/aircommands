import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { distance } from './geometry'

export function isFistGesture(landmarks: NormalizedLandmark[]) {
  const fingerStates = [
    getFingerFoldStateForFist(landmarks, 8, 6, 5),
    getFingerFoldStateForFist(landmarks, 12, 10, 9),
    getFingerFoldStateForFist(landmarks, 16, 14, 13),
    getFingerFoldStateForFist(landmarks, 20, 18, 17),
  ]
  const foldedFingerCount = fingerStates.filter((state) => state.folded).length
  const extendedFingerCount = fingerStates.filter(
    (state) => state.extended,
  ).length

  return (
    foldedFingerCount >= 3 &&
    extendedFingerCount === 0 &&
    isThumbFoldedForFist(landmarks)
  )
}

function getFingerFoldStateForFist(
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
    return { folded: false, extended: false }
  }

  const palmSize = distance(wrist, indexMcp)
  const palmCenter = {
    x: (wrist.x + indexMcp.x + middleMcp.x + ringMcp.x + pinkyMcp.x) / 5,
    y: (wrist.y + indexMcp.y + middleMcp.y + ringMcp.y + pinkyMcp.y) / 5,
    z: (wrist.z + indexMcp.z + middleMcp.z + ringMcp.z + pinkyMcp.z) / 5,
  }
  const tipToWrist = distance(tip, wrist)
  const pipToWrist = distance(pip, wrist)
  const mcpToWrist = distance(mcp, wrist)
  const tipToPalmCenter = distance(tip, palmCenter)

  return {
    folded:
      tipToWrist < mcpToWrist + palmSize * 0.62 &&
      tipToPalmCenter < palmSize * 1.28,
    extended:
      tipToWrist > pipToWrist + palmSize * 0.13 &&
      tipToPalmCenter > palmSize * 1.05,
  }
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
  const thumbTipToPalmCenter = distance(thumbTip, palmCenter)
  const thumbTipToIndexMcp = distance(thumbTip, indexMcp)
  const thumbTipToMiddleMcp = distance(thumbTip, middleMcp)
  const thumbTipToWrist = distance(thumbTip, wrist)
  const thumbIpToWrist = distance(thumbIp, wrist)
  const thumbTipToIp = distance(thumbTip, thumbIp)
  const thumbIsClearlyExtended =
    thumbTipToIp > palmSize * 0.42 && thumbTipToIndexMcp > palmSize * 0.72

  return (
    !thumbIsClearlyExtended &&
    (thumbTipToIndexMcp < palmSize * 0.92 ||
      thumbTipToMiddleMcp < palmSize * 0.9 ||
      thumbTipToPalmCenter < palmSize * 0.86) &&
    thumbTipToWrist < thumbIpToWrist + palmSize * 0.24
  )
}
