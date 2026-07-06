import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { distance } from './geometry'

export type FingerName = 'index' | 'middle' | 'ring' | 'pinky'

type FingerLandmarkIndexes = {
  tip: number
  pip: number
  mcp: number
}

export type PalmMetrics = {
  wrist: NormalizedLandmark
  thumbMcp: NormalizedLandmark
  thumbIp: NormalizedLandmark
  thumbTip: NormalizedLandmark
  indexMcp: NormalizedLandmark
  middleMcp: NormalizedLandmark
  ringMcp: NormalizedLandmark
  pinkyMcp: NormalizedLandmark
  palmCenter: NormalizedLandmark
  palmSize: number
}

export type FingerState = {
  extended: boolean
  folded: boolean
}

const fingerIndexes = {
  index: { tip: 8, pip: 6, mcp: 5 },
  middle: { tip: 12, pip: 10, mcp: 9 },
  ring: { tip: 16, pip: 14, mcp: 13 },
  pinky: { tip: 20, pip: 18, mcp: 17 },
} satisfies Record<FingerName, FingerLandmarkIndexes>

export function getPalmMetrics(
  landmarks: NormalizedLandmark[],
): PalmMetrics | null {
  const wrist = landmarks[0]
  const thumbMcp = landmarks[2]
  const thumbIp = landmarks[3]
  const thumbTip = landmarks[4]
  const indexMcp = landmarks[5]
  const middleMcp = landmarks[9]
  const ringMcp = landmarks[13]
  const pinkyMcp = landmarks[17]

  if (
    !wrist ||
    !thumbMcp ||
    !thumbIp ||
    !thumbTip ||
    !indexMcp ||
    !middleMcp ||
    !ringMcp ||
    !pinkyMcp
  ) {
    return null
  }

  const palmCenter = {
    x: (wrist.x + indexMcp.x + middleMcp.x + ringMcp.x + pinkyMcp.x) / 5,
    y: (wrist.y + indexMcp.y + middleMcp.y + ringMcp.y + pinkyMcp.y) / 5,
    z: (wrist.z + indexMcp.z + middleMcp.z + ringMcp.z + pinkyMcp.z) / 5,
  }

  return {
    wrist,
    thumbMcp,
    thumbIp,
    thumbTip,
    indexMcp,
    middleMcp,
    ringMcp,
    pinkyMcp,
    palmCenter,
    palmSize: distance(wrist, indexMcp),
  }
}

export function getFingerStates(landmarks: NormalizedLandmark[]) {
  const palmMetrics = getPalmMetrics(landmarks)
  if (!palmMetrics) return null

  const states = {} as Record<FingerName, FingerState>

  for (const [finger, indexes] of Object.entries(fingerIndexes) as Array<
    [FingerName, FingerLandmarkIndexes]
  >) {
    const state = getFingerState(landmarks, indexes, palmMetrics)
    if (!state) return null

    states[finger] = state
  }

  return states
}

export function countFoldedFingers(landmarks: NormalizedLandmark[]) {
  const states = getFingerStates(landmarks)
  if (!states) return 0

  return Object.values(states).filter((state) => state.folded).length
}

export function isThumbExtended(
  palmMetrics: PalmMetrics,
  relaxed = false,
) {
  const tipToIp = distance(palmMetrics.thumbTip, palmMetrics.thumbIp)
  const tipToMcp = distance(palmMetrics.thumbTip, palmMetrics.thumbMcp)
  const tipToIndexMcp = distance(
    palmMetrics.thumbTip,
    palmMetrics.indexMcp,
  )

  if (relaxed) {
    return (
      (tipToIp > palmMetrics.palmSize * 0.18 ||
        tipToMcp > palmMetrics.palmSize * 0.38) &&
      tipToIndexMcp > palmMetrics.palmSize * 0.32
    )
  }

  return (
    (tipToIp > palmMetrics.palmSize * 0.22 ||
      tipToMcp > palmMetrics.palmSize * 0.42) &&
    tipToIndexMcp > palmMetrics.palmSize * 0.36
  )
}

export function getKnuckleXBounds(palmMetrics: PalmMetrics) {
  const knuckleXs = [
    palmMetrics.indexMcp.x,
    palmMetrics.middleMcp.x,
    palmMetrics.ringMcp.x,
    palmMetrics.pinkyMcp.x,
  ]

  return {
    min: Math.min(...knuckleXs),
    max: Math.max(...knuckleXs),
  }
}

function getFingerState(
  landmarks: NormalizedLandmark[],
  indexes: FingerLandmarkIndexes,
  palmMetrics: PalmMetrics,
): FingerState | null {
  const tip = landmarks[indexes.tip]
  const pip = landmarks[indexes.pip]
  const mcp = landmarks[indexes.mcp]

  if (!tip || !pip || !mcp) return null

  const tipToWrist = distance(tip, palmMetrics.wrist)
  const pipToWrist = distance(pip, palmMetrics.wrist)
  const mcpToWrist = distance(mcp, palmMetrics.wrist)
  const tipToPalmCenter = distance(tip, palmMetrics.palmCenter)
  const pipToPalmCenter = distance(pip, palmMetrics.palmCenter)

  return {
    extended:
      tipToWrist > pipToWrist + palmMetrics.palmSize * 0.08 &&
      tipToWrist > mcpToWrist + palmMetrics.palmSize * 0.35 &&
      tipToPalmCenter > pipToPalmCenter + palmMetrics.palmSize * 0.07,
    folded:
      tipToWrist < mcpToWrist + palmMetrics.palmSize * 0.7 &&
      tipToPalmCenter < palmMetrics.palmSize * 1.35,
  }
}
