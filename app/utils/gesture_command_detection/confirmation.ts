import { getRecentPoints } from './pointer_trail'
import type { PointerTrailPoint } from './types'

export const CONFIRM_HOLD_MS = 800
export const CONFIRM_STATIONARY_RADIUS = 0.025

export function getConfirmationProgress(
  points: PointerTrailPoint[],
  candidateDetectedAt: number,
  now: number,
) {
  const confirmationPoints = getRecentPoints(
    points.filter((point) => point.at >= candidateDetectedAt),
    now,
    CONFIRM_HOLD_MS,
  )

  if (confirmationPoints.length < 2) {
    return {
      confirmed: false,
      progress: 0,
      reason: 'not_enough_points' as const,
    }
  }

  const firstPoint = confirmationPoints[0]
  const lastPoint = confirmationPoints[confirmationPoints.length - 1]
  const heldDuration = lastPoint.at - firstPoint.at
  const progress = Math.min(1, Math.max(0, heldDuration / CONFIRM_HOLD_MS))

  if (hasMovedTooFar(confirmationPoints, firstPoint)) {
    return {
      confirmed: false,
      progress,
      reason: 'moved_too_far' as const,
    }
  }

  if (heldDuration < CONFIRM_HOLD_MS) {
    return {
      confirmed: false,
      progress,
      reason: 'not_enough_time' as const,
    }
  }

  return {
    confirmed: true,
    progress: 1,
  }
}

function hasMovedTooFar(
  points: PointerTrailPoint[],
  anchorPoint: PointerTrailPoint,
) {
  return points.some((point) => {
    const deltaX = point.x - anchorPoint.x
    const deltaY = point.y - anchorPoint.y
    return Math.hypot(deltaX, deltaY) > CONFIRM_STATIONARY_RADIUS
  })
}

