import type { PointerTrailPoint } from './types'

export const RENDER_TRAIL_MS = 5000
export const RECOGNITION_WINDOW_MS = 800
export const MAX_RENDER_TRAIL_POINTS = 300

export function pruneTrail(
  points: PointerTrailPoint[],
  now: number,
  maxAgeMs: number,
) {
  return points.filter((point) => now - point.at <= maxAgeMs)
}

export function getRecentPoints(
  points: PointerTrailPoint[],
  now: number,
  windowMs: number,
) {
  return points.filter((point) => now - point.at <= windowMs)
}

export function appendTrailPoint(
  points: PointerTrailPoint[],
  point: PointerTrailPoint,
) {
  const nextPoints = [...points, point]

  if (nextPoints.length <= MAX_RENDER_TRAIL_POINTS) {
    return nextPoints
  }

  return nextPoints.slice(nextPoints.length - MAX_RENDER_TRAIL_POINTS)
}

