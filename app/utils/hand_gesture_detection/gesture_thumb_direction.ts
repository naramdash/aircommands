import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import {
  countFoldedFingers,
  getKnuckleXBounds,
  getPalmMetrics,
  isThumbExtended,
  type PalmMetrics,
} from './hand_pose'
import {
  getHandRotationDirection,
  getThumbDirection,
  type ScreenDirection,
} from './orientation'

export type ThumbGestureDirection = Extract<
  ScreenDirection,
  'up' | 'down' | 'left' | 'right'
>

type ThumbDirectionOptions = {
  relaxed?: boolean
}

export function isThumbDirectionGesture(
  landmarks: NormalizedLandmark[],
  direction: ThumbGestureDirection,
  options: ThumbDirectionOptions = {},
) {
  const palmMetrics = getPalmMetrics(landmarks)
  if (!palmMetrics) return false

  const foldedFingerCount = countFoldedFingers(landmarks)
  const thumbDirection = getThumbDirection(landmarks)

  return (
    thumbDirection === direction &&
    hasCompatibleHandPose(landmarks, direction, palmMetrics, options.relaxed) &&
    isThumbExtended(palmMetrics, options.relaxed) &&
    foldedFingerCount >= getRequiredFoldedFingerCount(direction, options.relaxed)
  )
}

function getRequiredFoldedFingerCount(
  direction: ThumbGestureDirection,
  relaxed = false,
) {
  if (relaxed) {
    return direction === 'left' || direction === 'right' ? 1 : 1
  }

  return direction === 'left' || direction === 'right' ? 2 : 2
}

function hasCompatibleHandPose(
  landmarks: NormalizedLandmark[],
  direction: ThumbGestureDirection,
  palmMetrics: PalmMetrics,
  relaxed = false,
) {
  if (direction === 'left' || direction === 'right') {
    return hasSideThumbPose(direction, palmMetrics, relaxed)
  }

  return getHandRotationDirection(landmarks) === direction
}

function hasSideThumbPose(
  direction: Extract<ThumbGestureDirection, 'left' | 'right'>,
  palmMetrics: PalmMetrics,
  relaxed = false,
) {
  const knuckleXBounds = getKnuckleXBounds(palmMetrics)
  const sideMargin = palmMetrics.palmSize * (relaxed ? 0.12 : 0.18)

  if (direction === 'left') {
    return palmMetrics.thumbTip.x < knuckleXBounds.min - sideMargin
  }

  return palmMetrics.thumbTip.x > knuckleXBounds.max + sideMargin
}
