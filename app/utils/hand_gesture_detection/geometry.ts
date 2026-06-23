import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export function distance(from: NormalizedLandmark, to: NormalizedLandmark) {
  return Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z)
}
