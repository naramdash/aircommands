import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export type ScreenDirection = 'up' | 'down' | 'left' | 'right' | 'unknown'

const DIRECTION_AXIS_RATIO = 1.15

export function isHandPointingUp(landmarks: NormalizedLandmark[]) {
  return getPalmAxisDirection(landmarks) === 'up'
}

export function getPalmAxisDirection(
  landmarks: NormalizedLandmark[],
): ScreenDirection {
  const wrist = landmarks[0]
  const middleMcp = landmarks[9]

  if (!wrist || !middleMcp) return 'unknown'

  return getScreenDirection(wrist, middleMcp)
}

export function getHandRotationDirection(
  landmarks: NormalizedLandmark[],
): ScreenDirection {
  const wrist = landmarks[0]
  const middleMcp = landmarks[9]

  if (!wrist || !middleMcp) return 'unknown'

  return getScreenDirection(wrist, middleMcp, 0.75)
}

export function getThumbDirection(
  landmarks: NormalizedLandmark[],
): ScreenDirection {
  const thumbMcp = landmarks[2]
  const thumbIp = landmarks[3]
  const thumbTip = landmarks[4]

  if (!thumbIp || !thumbTip) return 'unknown'

  const tipDirection = getScreenDirection(thumbIp, thumbTip, 0.75)
  const thumbAxisDirection = thumbMcp
    ? getScreenDirection(thumbMcp, thumbTip, 0.8)
    : 'unknown'

  if (thumbAxisDirection !== 'unknown') {
    return tipDirection !== 'unknown' ? tipDirection : thumbAxisDirection
  }

  if (tipDirection !== 'unknown') {
    return tipDirection
  }

  return 'unknown'
}

function getScreenDirection(
  from: NormalizedLandmark,
  to: NormalizedLandmark,
  axisRatio = DIRECTION_AXIS_RATIO,
): ScreenDirection {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)

  if (absX > absY * axisRatio) {
    return dx > 0 ? 'right' : 'left'
  }

  if (absY > absX * axisRatio) {
    return dy > 0 ? 'down' : 'up'
  }

  return 'unknown'
}
