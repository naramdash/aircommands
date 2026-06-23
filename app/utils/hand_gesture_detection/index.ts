import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { HandGestureName } from '../hand_sequence_state_machine'
import { isFistGesture } from './gesture_fist'
import { isOpenGesture } from './gesture_open'
import { isThumbOnlyGesture } from './gesture_thumb_only'

export { isFistGesture } from './gesture_fist'
export { isOpenGesture } from './gesture_open'
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
  if (isThumbOnlyGesture(landmarks)) return 'gesture_thumb_only'
  if (isOpenGesture(landmarks)) return 'gesture_open'

  return 'no_gesture'
}

function isExpectedGesture(
  landmarks: NormalizedLandmark[],
  gesture: HandGestureName,
) {
  if (gesture === 'gesture_fist') return isFistGesture(landmarks)
  if (gesture === 'gesture_thumb_only') return isThumbOnlyGesture(landmarks)
  if (gesture === 'gesture_open') return isOpenGesture(landmarks)

  return false
}
