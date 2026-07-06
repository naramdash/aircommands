import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export function distance(from: NormalizedLandmark, to: NormalizedLandmark) {
  return Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z)
}

export function mirrorLandmarksHorizontally(
  landmarks: NormalizedLandmark[],
) {
  return landmarks.map((landmark) => ({
    ...landmark,
    x: 1 - landmark.x,
  }))
}
