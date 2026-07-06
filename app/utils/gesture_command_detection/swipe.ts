import { toUserFacingPoint } from './coordinates'
import { getRecentPoints, RECOGNITION_WINDOW_MS } from './pointer_trail'
import type {
  PointerTrailPoint,
  GestureName,
  SwipeDetectionResult,
  SwipeDirection,
} from './types'

export const SWIPE_MIN_DURATION_MS = 60
export const SWIPE_MAX_DURATION_MS = 1300
export const SWIPE_MIN_DISTANCE = 0.09
export const SWIPE_AXIS_DOMINANCE_RATIO = 0.6
export const SWIPE_DIAGONAL_MIN_TOTAL_DISTANCE = 0.13
export const SWIPE_DIAGONAL_MIN_AXIS_DISTANCE = 0.075
export const SWIPE_DIAGONAL_MIN_BALANCE_RATIO = 0.48
export const SWIPE_MAX_BACKTRACK_RATIO = 0.48
export const SWIPE_MIN_POINTS = 2
export const SWIPE_MIN_CONFIDENCE = 0.55

type Axis = 'x' | 'y'

export function detectSwipeGesture(
  rawPoints: PointerTrailPoint[],
  now: number,
): SwipeDetectionResult {
  const points = getRecentPoints(rawPoints, now, RECOGNITION_WINDOW_MS).map(
    toUserFacingPoint,
  )

  return detectSwipeFromUserFacingPoints(points)
}

export function detectSwipeStroke(
  rawPoints: PointerTrailPoint[],
): SwipeDetectionResult {
  return detectSwipeFromUserFacingPoints(rawPoints.map(toUserFacingPoint))
}

function detectSwipeFromUserFacingPoints(
  points: PointerTrailPoint[],
): SwipeDetectionResult {
  if (points.length < SWIPE_MIN_POINTS) {
    return { detected: false, reason: 'not_enough_points' }
  }

  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]
  const duration = lastPoint.at - firstPoint.at

  if (duration < SWIPE_MIN_DURATION_MS) {
    return { detected: false, reason: 'too_fast' }
  }

  if (duration > SWIPE_MAX_DURATION_MS) {
    return { detected: false, reason: 'too_slow' }
  }

  const xMovement = getAxisMovement(points, 'x')
  const yMovement = getAxisMovement(points, 'y')
  const axis: Axis = yMovement.distance >= xMovement.distance ? 'y' : 'x'
  const mainMovement = axis === 'y' ? yMovement : xMovement
  const crossMovement = axis === 'y' ? xMovement : yMovement
  const mainDistance = mainMovement.distance
  const totalDistance = Math.hypot(xMovement.distance, yMovement.distance)

  if (mainDistance < SWIPE_MIN_DISTANCE && totalDistance < SWIPE_MIN_DISTANCE) {
    return { detected: false, reason: 'too_short' }
  }

  const axisDominanceRatio =
    mainDistance / Math.max(mainDistance + crossMovement.distance, 0.0001)
  if (axisDominanceRatio < SWIPE_AXIS_DOMINANCE_RATIO) {
    return detectDiagonalSwipe(points, xMovement, yMovement, firstPoint, lastPoint)
  }

  const expectedSign = mainMovement.sign
  const backtrackRatio = getBacktrackRatio(points, axis, expectedSign)
  if (backtrackRatio > SWIPE_MAX_BACKTRACK_RATIO) {
    return { detected: false, reason: 'direction_unstable' }
  }

  const confidence = getSwipeConfidence(
    mainDistance,
    axisDominanceRatio,
    backtrackRatio,
  )

  if (confidence < SWIPE_MIN_CONFIDENCE) {
    return { detected: false, reason: 'direction_unstable' }
  }

  const direction = getSwipeDirection(axis, expectedSign)

  return {
    detected: true,
    gesture: `swipe_${direction}` as Extract<
      GestureName,
      | 'swipe_up'
      | 'swipe_down'
      | 'swipe_left'
      | 'swipe_right'
      | 'swipe_up_left'
      | 'swipe_up_right'
      | 'swipe_down_left'
      | 'swipe_down_right'
    >,
    direction,
    confidence,
    startedAt: firstPoint.at,
    endedAt: lastPoint.at,
  }
}

function detectDiagonalSwipe(
  points: PointerTrailPoint[],
  xMovement: ReturnType<typeof getAxisMovement>,
  yMovement: ReturnType<typeof getAxisMovement>,
  firstPoint: PointerTrailPoint,
  lastPoint: PointerTrailPoint,
): SwipeDetectionResult {
  const smallerAxisDistance = Math.min(xMovement.distance, yMovement.distance)
  const largerAxisDistance = Math.max(xMovement.distance, yMovement.distance)
  const totalDistance = Math.hypot(xMovement.distance, yMovement.distance)

  if (totalDistance < SWIPE_DIAGONAL_MIN_TOTAL_DISTANCE) {
    return { detected: false, reason: 'too_short' }
  }

  if (smallerAxisDistance < SWIPE_DIAGONAL_MIN_AXIS_DISTANCE) {
    return { detected: false, reason: 'too_diagonal' }
  }

  const balanceRatio =
    smallerAxisDistance / Math.max(largerAxisDistance, 0.0001)
  if (balanceRatio < SWIPE_DIAGONAL_MIN_BALANCE_RATIO) {
    return { detected: false, reason: 'too_diagonal' }
  }

  const xBacktrackRatio = getBacktrackRatio(points, 'x', xMovement.sign)
  const yBacktrackRatio = getBacktrackRatio(points, 'y', yMovement.sign)
  const backtrackRatio = Math.max(xBacktrackRatio, yBacktrackRatio)

  if (backtrackRatio > SWIPE_MAX_BACKTRACK_RATIO) {
    return { detected: false, reason: 'direction_unstable' }
  }

  const direction = getDiagonalSwipeDirection(xMovement.sign, yMovement.sign)
  const confidence = getDiagonalSwipeConfidence(
    totalDistance,
    balanceRatio,
    backtrackRatio,
  )

  if (confidence < SWIPE_MIN_CONFIDENCE) {
    return { detected: false, reason: 'direction_unstable' }
  }

  return {
    detected: true,
    gesture: `swipe_${direction}` as Extract<
      GestureName,
      | 'swipe_up'
      | 'swipe_down'
      | 'swipe_left'
      | 'swipe_right'
      | 'swipe_up_left'
      | 'swipe_up_right'
      | 'swipe_down_left'
      | 'swipe_down_right'
    >,
    direction,
    confidence,
    startedAt: firstPoint.at,
    endedAt: lastPoint.at,
  }
}

function getAxisMovement(points: PointerTrailPoint[], axis: Axis) {
  let minIndex = 0
  let maxIndex = 0

  for (let index = 1; index < points.length; index += 1) {
    if (points[index][axis] < points[minIndex][axis]) {
      minIndex = index
    }

    if (points[index][axis] > points[maxIndex][axis]) {
      maxIndex = index
    }
  }

  const distance = points[maxIndex][axis] - points[minIndex][axis]
  const sign = maxIndex > minIndex ? 1 : -1

  return {
    distance: Math.abs(distance),
    sign,
  }
}

function getSwipeDirection(axis: Axis, sign: number): SwipeDirection {
  if (axis === 'y') {
    return sign < 0 ? 'up' : 'down'
  }

  return sign < 0 ? 'left' : 'right'
}

function getDiagonalSwipeDirection(
  xSign: number,
  ySign: number,
): SwipeDirection {
  const verticalDirection = ySign < 0 ? 'up' : 'down'
  const horizontalDirection = xSign < 0 ? 'left' : 'right'

  return `${verticalDirection}_${horizontalDirection}` as Extract<
    SwipeDirection,
    'up_left' | 'up_right' | 'down_left' | 'down_right'
  >
}

function getBacktrackRatio(
  points: PointerTrailPoint[],
  axis: Axis,
  expectedSign: number,
) {
  let forward = 0
  let backward = 0

  for (let index = 1; index < points.length; index += 1) {
    const delta = points[index][axis] - points[index - 1][axis]
    const distance = Math.abs(delta)

    if (distance === 0) continue

    if (Math.sign(delta) === expectedSign) {
      forward += distance
    } else {
      backward += distance
    }
  }

  return backward / Math.max(forward + backward, 0.0001)
}

function getSwipeConfidence(
  mainDistance: number,
  axisDominanceRatio: number,
  backtrackRatio: number,
) {
  const distanceScore = clamp(mainDistance / 0.25, 0, 1)
  const axisScore = clamp(axisDominanceRatio, 0, 1)
  const smoothnessScore = 1 - clamp(backtrackRatio, 0, 1)

  return distanceScore * 0.4 + axisScore * 0.4 + smoothnessScore * 0.2
}

function getDiagonalSwipeConfidence(
  totalDistance: number,
  balanceRatio: number,
  backtrackRatio: number,
) {
  const distanceScore = clamp(totalDistance / 0.32, 0, 1)
  const balanceScore = clamp(
    (balanceRatio - SWIPE_DIAGONAL_MIN_BALANCE_RATIO) /
      (1 - SWIPE_DIAGONAL_MIN_BALANCE_RATIO),
    0,
    1,
  )
  const smoothnessScore = 1 - clamp(backtrackRatio, 0, 1)

  return distanceScore * 0.4 + balanceScore * 0.35 + smoothnessScore * 0.25
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
