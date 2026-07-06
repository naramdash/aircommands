import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { HandGestureName } from '../hand_sequence_state_machine'
import {
  fingerCombinationGestures,
  isFingerCombinationGesture,
} from './gesture_finger_combination'
import { isFistGesture } from './gesture_fist'
import { isOpenGesture } from './gesture_open'
import { isThumbDirectionGesture } from './gesture_thumb_direction'
import { isThumbOnlyGesture } from './gesture_thumb_only'

export { mirrorLandmarksHorizontally } from './geometry'
export {
  fingerCombinationGestures,
  isFingerCombinationGesture,
} from './gesture_finger_combination'
export { isFistGesture } from './gesture_fist'
export { isOpenGesture } from './gesture_open'
export { isThumbDirectionGesture } from './gesture_thumb_direction'
export { isThumbOnlyGesture } from './gesture_thumb_only'

export function classifyHandGesture(
  landmarks: NormalizedLandmark[] | undefined,
  expectedGesture: HandGestureName,
): HandGestureName {
  if (!landmarks?.length) return 'no_gesture'

  if (isExpectedGesture(landmarks, expectedGesture)) {
    return expectedGesture
  }

  if (isFistGesture(landmarks)) return 'gesture_fist'
  if (isThumbDirectionGesture(landmarks, 'up')) return 'gesture_thumb_up'
  if (isThumbDirectionGesture(landmarks, 'down')) return 'gesture_thumb_down'
  if (isThumbDirectionGesture(landmarks, 'left')) return 'gesture_thumb_left'
  if (isThumbDirectionGesture(landmarks, 'right')) return 'gesture_thumb_right'
  if (isThumbOnlyGesture(landmarks)) return 'gesture_thumb_only'
  for (const gesture of fingerCombinationGestures) {
    if (isFingerCombinationGesture(landmarks, gesture)) return gesture
  }
  if (isOpenGesture(landmarks)) return 'gesture_open'

  return 'no_gesture'
}

function isExpectedGesture(
  landmarks: NormalizedLandmark[],
  gesture: HandGestureName,
) {
  if (gesture === 'gesture_fist') return isFistGesture(landmarks)
  if (gesture === 'gesture_thumb_up') {
    return isThumbDirectionGesture(landmarks, 'up', { relaxed: true })
  }
  if (gesture === 'gesture_thumb_down') {
    return isThumbDirectionGesture(landmarks, 'down', { relaxed: true })
  }
  if (gesture === 'gesture_thumb_left') {
    return isThumbDirectionGesture(landmarks, 'left', { relaxed: true })
  }
  if (gesture === 'gesture_thumb_right') {
    return isThumbDirectionGesture(landmarks, 'right', { relaxed: true })
  }
  if (gesture === 'gesture_thumb_only') return isThumbOnlyGesture(landmarks)
  if (fingerCombinationGestures.includes(gesture)) {
    return isFingerCombinationGesture(landmarks, gesture)
  }
  if (gesture === 'gesture_open') return isOpenGesture(landmarks)

  return false
}
