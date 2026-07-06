import { toUserFacingPoint } from './coordinates'
import type {
  GestureName,
  PointerTrailPoint,
  ShapeDetectionResult,
  ShapeGesture,
} from './types'

export const SHAPE_MIN_POINTS = 5
export const SHAPE_MAX_DURATION_MS = 2400
export const SHAPE_MIN_PATH_LENGTH = 0.24
export const SHAPE_MIN_BOUNDS = 0.08
export const SHAPE_RESAMPLE_POINTS = 32
export const SHAPE_MAX_AVG_DISTANCE = 0.24
export const SHAPE_MIN_CONFIDENCE = 0.35
export const SHAPE_MAX_MARGIN_TRIM_RATIO = 0.25
export const SHAPE_MARGIN_SCAN_STEP_POINTS = 2
export const SHAPE_STRUCTURAL_MIN_CONFIDENCE = 0.68
export const SHAPE_MIN_TURN_PROGRESS_SPAN = 0.1
export const SHAPE_MIN_TEMPLATE_MARGIN = 0.035
export const SHAPE_SIMPLIFY_EPSILON = 0.04
export const SHAPE_STROKE_CORRIDOR_WIDTH = 0.035
export const SHAPE_SPIKE_MAX_BRIDGE_DISTANCE = 0.14
export const SHAPE_SPIKE_MIN_DETOUR_DISTANCE = 0.18
export const SHAPE_SPIKE_MIN_DETOUR_RATIO = 3.2

type TemplatePoint = {
  x: number
  y: number
}

type ShapeTemplate = {
  shape: ShapeGesture
  points: TemplatePoint[]
}

type Axis = 'x' | 'y'

type StructuralMatch = {
  shape: ShapeGesture
  confidence: number
}

type TemplateMatch = {
  shape: ShapeGesture
  distance: number
  margin: number
}

const SHAPE_TEMPLATES: ShapeTemplate[] = [
  {
    shape: 'v',
    points: [
      { x: 0, y: 0 },
      { x: 0.5, y: 1 },
      { x: 1, y: 0 },
    ],
  },
  {
    shape: 'w',
    points: [
      { x: 0, y: 0 },
      { x: 0.25, y: 1 },
      { x: 0.5, y: 0 },
      { x: 0.75, y: 1 },
      { x: 1, y: 0 },
    ],
  },
  {
    shape: 's',
    points: [
      { x: 1, y: 0 },
      { x: 0.18, y: 0.06 },
      { x: 0, y: 0.34 },
      { x: 0.82, y: 0.5 },
      { x: 1, y: 0.78 },
      { x: 0.18, y: 1 },
    ],
  },
]

const NORMALIZED_SHAPE_TEMPLATES = SHAPE_TEMPLATES.flatMap((template) => [
  {
    shape: template.shape,
    points: normalizePoints(resamplePolyline(template.points, SHAPE_RESAMPLE_POINTS)),
  },
  {
    shape: template.shape,
    points: normalizePoints(
      resamplePolyline([...template.points].reverse(), SHAPE_RESAMPLE_POINTS),
    ),
  },
])

export function detectShapeGesture(
  rawPoints: PointerTrailPoint[],
): ShapeDetectionResult {
  const points = rawPoints.map(toUserFacingPoint)

  if (points.length < SHAPE_MIN_POINTS) {
    return { detected: false, reason: 'not_enough_points' }
  }

  const fullStrokeResult = detectShapeInWindow(points)
  const subsequenceResult = detectShapeSubsequence(points)
  const bestResult =
    fullStrokeResult.detected &&
    (!subsequenceResult.detected ||
      fullStrokeResult.confidence >= subsequenceResult.confidence)
      ? fullStrokeResult
      : subsequenceResult

  if (bestResult.detected) return bestResult

  return fullStrokeResult
}

function detectShapeSubsequence(
  points: PointerTrailPoint[],
): ShapeDetectionResult {
  const maxTrimPoints = Math.floor(points.length * SHAPE_MAX_MARGIN_TRIM_RATIO)
  let bestResult: ShapeDetectionResult | null = null

  for (
    let startIndex = 0;
    startIndex <= maxTrimPoints;
    startIndex += SHAPE_MARGIN_SCAN_STEP_POINTS
  ) {
    const maxEndTrim = Math.min(
      maxTrimPoints,
      points.length - startIndex - SHAPE_MIN_POINTS,
    )

    for (
      let endTrim = 0;
      endTrim <= maxEndTrim;
      endTrim += SHAPE_MARGIN_SCAN_STEP_POINTS
    ) {
      if (startIndex === 0 && endTrim === 0) continue

      const endIndex = points.length - endTrim
      const windowPoints = points.slice(startIndex, endIndex)
      const result = detectShapeInWindow(windowPoints)

      if (!result.detected) continue

      if (!bestResult || !bestResult.detected) {
        bestResult = result
        continue
      }

      if (result.confidence > bestResult.confidence) {
        bestResult = result
      }
    }
  }

  return bestResult ?? { detected: false, reason: 'low_confidence' }
}

function detectShapeInWindow(
  points: PointerTrailPoint[],
): ShapeDetectionResult {
  if (points.length < SHAPE_MIN_POINTS) {
    return { detected: false, reason: 'not_enough_points' }
  }

  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]
  const duration = lastPoint.at - firstPoint.at

  if (duration > SHAPE_MAX_DURATION_MS) {
    return { detected: false, reason: 'too_slow' }
  }

  const preparedPoints = prepareShapePoints(points)
  if (preparedPoints.length < 2) {
    return { detected: false, reason: 'not_enough_points' }
  }

  const preparedFirstPoint = preparedPoints[0]
  const preparedLastPoint = preparedPoints[preparedPoints.length - 1]
  const bounds = getBounds(preparedPoints)
  if (bounds.width < SHAPE_MIN_BOUNDS || bounds.height < SHAPE_MIN_BOUNDS) {
    return { detected: false, reason: 'too_flat' }
  }

  const pathLength = getPathLength(preparedPoints)
  if (pathLength < SHAPE_MIN_PATH_LENGTH) {
    return { detected: false, reason: 'too_short' }
  }

  const lineDistance = Math.hypot(
    preparedLastPoint.x - preparedFirstPoint.x,
    preparedLastPoint.y - preparedFirstPoint.y,
  )
  if (lineDistance / Math.max(pathLength, 0.0001) > 0.88) {
    return { detected: false, reason: 'too_line_like' }
  }

  const normalizedPoints = normalizePoints(
    resamplePolyline(preparedPoints, SHAPE_RESAMPLE_POINTS),
  )
  const bestMatch = getBestTemplateMatch(normalizedPoints)
  const rawTemplateConfidence = Math.max(
    0,
    1 - bestMatch.distance / SHAPE_MAX_AVG_DISTANCE,
  )
  const templateConfidence =
    rawTemplateConfidence *
    (0.82 + 0.18 * clamp(bestMatch.margin / SHAPE_MIN_TEMPLATE_MARGIN, 0, 1))
  const structuralMatch = getBestStructuralMatch(normalizedPoints)

  if (
    structuralMatch &&
    structuralMatch.confidence >= SHAPE_STRUCTURAL_MIN_CONFIDENCE &&
    structuralMatch.confidence > templateConfidence
  ) {
    return {
      detected: true,
      gesture: `shape_${structuralMatch.shape}` as Extract<
        GestureName,
        'shape_v' | 'shape_w' | 'shape_s'
      >,
      shape: structuralMatch.shape,
      confidence: structuralMatch.confidence,
      startedAt: firstPoint.at,
      endedAt: lastPoint.at,
    }
  }

  if (
    templateConfidence < SHAPE_MIN_CONFIDENCE ||
    bestMatch.margin < SHAPE_MIN_TEMPLATE_MARGIN * 0.4
  ) {
    return { detected: false, reason: 'low_confidence' }
  }

  return {
    detected: true,
    gesture: `shape_${bestMatch.shape}` as Extract<
      GestureName,
      'shape_v' | 'shape_w' | 'shape_s'
    >,
    shape: bestMatch.shape,
    confidence: templateConfidence,
    startedAt: firstPoint.at,
    endedAt: lastPoint.at,
  }
}

function getBestStructuralMatch(points: TemplatePoint[]): StructuralMatch | null {
  const simplifiedPoints = simplifyPolyline(points, SHAPE_SIMPLIFY_EPSILON)
  const turnPoints = simplifiedPoints.length >= 3 ? simplifiedPoints : points
  const candidates = [
    evaluateStructuralShape(points, turnPoints, 'v', 'x', 'y', 1),
    evaluateStructuralShape(points, turnPoints, 'w', 'x', 'y', 3),
    evaluateStructuralShape(points, turnPoints, 's', 'y', 'x', 2),
  ].filter((candidate): candidate is StructuralMatch => candidate !== null)

  if (candidates.length === 0) return null

  return candidates.reduce((best, candidate) => {
    return candidate.confidence > best.confidence ? candidate : best
  })
}

function evaluateStructuralShape(
  points: TemplatePoint[],
  turnPoints: TemplatePoint[],
  shape: ShapeGesture,
  progressionAxis: Axis,
  waveAxis: Axis,
  expectedTurns: number,
): StructuralMatch | null {
  const progressRange = getAxisRange(points, progressionAxis)
  const waveRange = getAxisRange(points, waveAxis)

  if (progressRange < 0.45 || waveRange < 0.45) return null

  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]
  const netProgress =
    Math.abs(lastPoint[progressionAxis] - firstPoint[progressionAxis]) /
    Math.max(progressRange, 0.0001)

  if (netProgress < 0.55) return null

  const progressSign =
    lastPoint[progressionAxis] >= firstPoint[progressionAxis] ? 1 : -1
  const progressBacktrack = getAxisBacktrackRatio(
    points,
    progressionAxis,
    progressSign,
  )

  if (progressBacktrack > 0.45) return null

  const turnCount = getSignificantTurnCount(
    turnPoints,
    progressionAxis,
    waveAxis,
  )
  const turnScore = getTurnScore(turnCount, expectedTurns)

  if (turnScore <= 0) return null

  const waveScore = clamp(waveRange / 0.7, 0, 1)
  const progressScore = clamp(netProgress, 0, 1)
  const stabilityScore = 1 - clamp(progressBacktrack, 0, 1)
  const confidence =
    turnScore * 0.42 + progressScore * 0.24 + stabilityScore * 0.2 + waveScore * 0.14

  return {
    shape,
    confidence,
  }
}

function getAxisRange(points: TemplatePoint[], axis: Axis) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const point of points) {
    min = Math.min(min, point[axis])
    max = Math.max(max, point[axis])
  }

  return max - min
}

function getAxisBacktrackRatio(
  points: TemplatePoint[],
  axis: Axis,
  expectedSign: number,
) {
  let forward = 0
  let backward = 0

  for (let index = 1; index < points.length; index += 1) {
    const delta = points[index][axis] - points[index - 1][axis]
    const distance = Math.abs(delta)

    if (distance < 0.005) continue

    if (Math.sign(delta) === expectedSign) {
      forward += distance
    } else {
      backward += distance
    }
  }

  return backward / Math.max(forward + backward, 0.0001)
}

function getSignificantTurnCount(
  points: TemplatePoint[],
  progressionAxis: Axis,
  waveAxis: Axis,
) {
  const minDelta = 0.018
  const minAmplitude = 0.14
  let lastDirection = 0
  let lastExtreme = points[0][waveAxis]
  let lastTurnProgress = points[0][progressionAxis]
  let turns = 0

  for (let index = 1; index < points.length; index += 1) {
    const delta = points[index][waveAxis] - points[index - 1][waveAxis]

    if (Math.abs(delta) < minDelta) continue

    const direction = Math.sign(delta)
    if (lastDirection !== 0 && direction !== lastDirection) {
      const candidateExtreme = points[index - 1][waveAxis]
      const candidateProgress = points[index - 1][progressionAxis]
      const amplitude = Math.abs(candidateExtreme - lastExtreme)
      const progressSpan = Math.abs(candidateProgress - lastTurnProgress)

      if (
        amplitude >= minAmplitude &&
        progressSpan >= SHAPE_MIN_TURN_PROGRESS_SPAN
      ) {
        turns += 1
        lastExtreme = candidateExtreme
        lastTurnProgress = candidateProgress
      }
    }

    lastDirection = direction
  }

  return turns
}

function getTurnScore(turnCount: number, expectedTurns: number) {
  if (turnCount === expectedTurns) return 1
  if (turnCount === expectedTurns + 1) return 0.78

  return 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getBestTemplateMatch(points: TemplatePoint[]): TemplateMatch {
  const bestDistanceByShape = new Map<ShapeGesture, number>()

  for (const template of NORMALIZED_SHAPE_TEMPLATES) {
    const distance = getAverageDistance(points, template.points)
    const previousDistance = bestDistanceByShape.get(template.shape)

    if (previousDistance === undefined || distance < previousDistance) {
      bestDistanceByShape.set(template.shape, distance)
    }
  }

  const rankedMatches = [...bestDistanceByShape.entries()]
    .map(([shape, distance]) => ({ shape, distance }))
    .sort((first, second) => first.distance - second.distance)
  const bestMatch = rankedMatches[0]
  const secondBestDistance =
    rankedMatches[1]?.distance ?? Number.POSITIVE_INFINITY

  return {
    ...bestMatch,
    margin: Math.max(0, secondBestDistance - bestMatch.distance),
  }
}

function getAverageDistance(first: TemplatePoint[], second: TemplatePoint[]) {
  const count = Math.min(first.length, second.length)
  let totalDistance = 0

  for (let index = 0; index < count; index += 1) {
    totalDistance += Math.hypot(
      first[index].x - second[index].x,
      first[index].y - second[index].y,
    )
  }

  return totalDistance / Math.max(count, 1)
}

function normalizePoints(points: TemplatePoint[]) {
  const bounds = getBounds(points)
  const maxSize = Math.max(bounds.width, bounds.height, 0.0001)
  const offsetX = (1 - bounds.width / maxSize) / 2
  const offsetY = (1 - bounds.height / maxSize) / 2

  return points.map((point) => ({
    x: (point.x - bounds.minX) / maxSize + offsetX,
    y: (point.y - bounds.minY) / maxSize + offsetY,
  }))
}

function prepareShapePoints(points: PointerTrailPoint[]): PointerTrailPoint[] {
  const withoutSpikes = removeSingleFrameSpikes(points)

  if (withoutSpikes.length < 3) return withoutSpikes

  const smoothedPoints = withoutSpikes.map((point, index) => {
    if (index === 0 || index === withoutSpikes.length - 1) return point

    const previousPoint = withoutSpikes[index - 1]
    const nextPoint = withoutSpikes[index + 1]

    return {
      ...point,
      x: point.x * 0.62 + (previousPoint.x + nextPoint.x) * 0.19,
      y: point.y * 0.62 + (previousPoint.y + nextPoint.y) * 0.19,
    }
  })

  return simplifyPolyline(smoothedPoints, SHAPE_STROKE_CORRIDOR_WIDTH)
}

function removeSingleFrameSpikes(
  points: PointerTrailPoint[],
): PointerTrailPoint[] {
  if (points.length < 3) return points

  const filtered: PointerTrailPoint[] = [points[0]]

  for (let index = 1; index < points.length - 1; index += 1) {
    const previousPoint = points[index - 1]
    const point = points[index]
    const nextPoint = points[index + 1]
    const bridgeDistance = getDistance(previousPoint, nextPoint)
    const detourDistance =
      getDistance(previousPoint, point) + getDistance(point, nextPoint)
    const isSingleFrameSpike =
      bridgeDistance <= SHAPE_SPIKE_MAX_BRIDGE_DISTANCE &&
      detourDistance >= SHAPE_SPIKE_MIN_DETOUR_DISTANCE &&
      detourDistance >= bridgeDistance * SHAPE_SPIKE_MIN_DETOUR_RATIO

    if (!isSingleFrameSpike) filtered.push(point)
  }

  filtered.push(points[points.length - 1])

  return filtered
}

function simplifyPolyline<T extends TemplatePoint>(
  points: T[],
  epsilon: number,
): T[] {
  if (points.length <= 2) return points

  const keep = Array(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  simplifySection(points, 0, points.length - 1, epsilon, keep)

  return points.filter((_, index) => keep[index])
}

function simplifySection(
  points: TemplatePoint[],
  startIndex: number,
  endIndex: number,
  epsilon: number,
  keep: boolean[],
) {
  if (endIndex <= startIndex + 1) return

  let maxDistance = 0
  let maxIndex = startIndex

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const distance = getPointToSegmentDistance(
      points[index],
      points[startIndex],
      points[endIndex],
    )

    if (distance > maxDistance) {
      maxDistance = distance
      maxIndex = index
    }
  }

  if (maxDistance <= epsilon) return

  keep[maxIndex] = true
  simplifySection(points, startIndex, maxIndex, epsilon, keep)
  simplifySection(points, maxIndex, endIndex, epsilon, keep)
}

function getPointToSegmentDistance(
  point: TemplatePoint,
  segmentStart: TemplatePoint,
  segmentEnd: TemplatePoint,
) {
  const segmentX = segmentEnd.x - segmentStart.x
  const segmentY = segmentEnd.y - segmentStart.y
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY

  if (segmentLengthSquared === 0) return getDistance(point, segmentStart)

  const ratio = clamp(
    ((point.x - segmentStart.x) * segmentX +
      (point.y - segmentStart.y) * segmentY) /
      segmentLengthSquared,
    0,
    1,
  )
  const projectedPoint = {
    x: segmentStart.x + segmentX * ratio,
    y: segmentStart.y + segmentY * ratio,
  }

  return getDistance(point, projectedPoint)
}

function resamplePolyline(
  points: TemplatePoint[],
  targetCount: number,
) {
  if (points.length === 0) return []
  if (points.length === 1) return Array(targetCount).fill(points[0])

  const totalLength = getPathLength(points)
  if (totalLength === 0) return Array(targetCount).fill(points[0])

  const interval = totalLength / (targetCount - 1)
  const resampled: TemplatePoint[] = [{ x: points[0].x, y: points[0].y }]
  let distanceIntoSegment = 0
  let previousPoint = points[0]

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    let segmentLength = Math.hypot(
      point.x - previousPoint.x,
      point.y - previousPoint.y,
    )

    if (segmentLength === 0) continue

    while (distanceIntoSegment + segmentLength >= interval) {
      const remainingDistance = interval - distanceIntoSegment
      const ratio = remainingDistance / segmentLength
      const insertedPoint = {
        x: previousPoint.x + (point.x - previousPoint.x) * ratio,
        y: previousPoint.y + (point.y - previousPoint.y) * ratio,
      }

      resampled.push(insertedPoint)
      previousPoint = insertedPoint
      segmentLength = Math.hypot(
        point.x - previousPoint.x,
        point.y - previousPoint.y,
      )
      distanceIntoSegment = 0
    }

    distanceIntoSegment += segmentLength
    previousPoint = point
  }

  while (resampled.length < targetCount) {
    const lastPoint = points[points.length - 1]
    resampled.push({ x: lastPoint.x, y: lastPoint.y })
  }

  return resampled.slice(0, targetCount)
}

function getPathLength(points: TemplatePoint[]) {
  let length = 0

  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    )
  }

  return length
}

function getDistance(first: TemplatePoint, second: TemplatePoint) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function getBounds(points: TemplatePoint[]) {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}
