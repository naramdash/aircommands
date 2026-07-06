import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { detectShapeGesture } from '../path_shape'
import type { PointerTrailPoint } from '../types'

describe('detectShapeGesture', () => {
  it('detects a V path', () => {
    const result = detectShapeGesture(
      fromUserFacingPolyline([
        [0.25, 0.25],
        [0.5, 0.78],
        [0.75, 0.25],
      ]),
    )

    assert.equal(result.detected, true)
    if (result.detected) assert.equal(result.gesture, 'shape_v')
  })

  it('detects a V path with narrow in-stroke wobble', () => {
    const result = detectShapeGesture(
      fromUserFacingPolyline(
        [
          [0.25, 0.25],
          [0.5, 0.78],
          [0.75, 0.25],
        ],
        0.012,
      ),
    )

    assert.equal(result.detected, true)
    if (result.detected) assert.equal(result.gesture, 'shape_v')
  })

  it('detects a W path', () => {
    const result = detectShapeGesture(
      fromUserFacingPolyline([
        [0.2, 0.25],
        [0.35, 0.78],
        [0.5, 0.25],
        [0.65, 0.78],
        [0.8, 0.25],
      ]),
    )

    assert.equal(result.detected, true)
    if (result.detected) assert.equal(result.gesture, 'shape_w')
  })

  it('detects a W path embedded inside leading and trailing movement', () => {
    const points = fromUserFacingPolyline([
      [0.12, 0.46],
      [0.16, 0.34],
      [0.2, 0.25],
      [0.35, 0.78],
      [0.5, 0.25],
      [0.65, 0.78],
      [0.8, 0.25],
      [0.84, 0.34],
      [0.88, 0.46],
    ])
    const result = detectShapeGesture(points)

    assert.equal(result.detected, true)
    if (result.detected) {
      assert.equal(result.gesture, 'shape_w')
      assert.ok(result.startedAt > points[0].at)
      assert.ok(result.endedAt < points[points.length - 1].at)
    }
  })

  it('detects an imperfect W path by its turn structure', () => {
    const result = detectShapeGesture(
      fromUserFacingPolyline(
        [
          [0.18, 0.28],
          [0.31, 0.76],
          [0.47, 0.22],
          [0.63, 0.81],
          [0.82, 0.3],
        ],
        0.025,
      ),
    )

    assert.equal(result.detected, true)
    if (result.detected) assert.equal(result.gesture, 'shape_w')
  })

  it('detects a W path with a single-frame camera spike', () => {
    const points = fromUserFacingPolyline(
      [
        [0.2, 0.25],
        [0.35, 0.78],
        [0.5, 0.25],
        [0.65, 0.78],
        [0.8, 0.25],
      ],
      0.006,
    )
    points.splice(7, 0, {
      x: 1 - 0.08,
      y: 0.15,
      at: points[6].at + 40,
    })

    const result = detectShapeGesture(points)

    assert.equal(result.detected, true)
    if (result.detected) assert.equal(result.gesture, 'shape_w')
  })

  it('detects an S path embedded inside leading and trailing movement', () => {
    const points = fromUserFacingPolyline([
      [0.86, 0.1],
      [0.78, 0.16],
      [0.72, 0.2],
      [0.28, 0.24],
      [0.2, 0.42],
      [0.72, 0.52],
      [0.8, 0.72],
      [0.28, 0.82],
      [0.2, 0.9],
      [0.14, 0.96],
    ])
    const result = detectShapeGesture(points)

    assert.equal(result.detected, true)
    if (result.detected) {
      assert.equal(result.gesture, 'shape_s')
      assert.ok(result.startedAt > points[0].at)
      assert.ok(result.endedAt < points[points.length - 1].at)
    }
  })

  it('detects an imperfect S path by its turn structure', () => {
    const result = detectShapeGesture(
      fromUserFacingPolyline(
        [
          [0.76, 0.18],
          [0.24, 0.27],
          [0.18, 0.43],
          [0.78, 0.56],
          [0.83, 0.73],
          [0.26, 0.86],
        ],
        0.022,
      ),
    )

    assert.equal(result.detected, true)
    if (result.detected) assert.equal(result.gesture, 'shape_s')
  })

  it('detects an S path', () => {
    const result = detectShapeGesture(
      fromUserFacingPolyline([
        [0.72, 0.2],
        [0.28, 0.24],
        [0.2, 0.42],
        [0.72, 0.52],
        [0.8, 0.72],
        [0.28, 0.82],
      ]),
    )

    assert.equal(result.detected, true)
    if (result.detected) assert.equal(result.gesture, 'shape_s')
  })

  it('rejects a straight diagonal line as a shape', () => {
    const result = detectShapeGesture(
      fromUserFacingPolyline([
        [0.25, 0.25],
        [0.5, 0.5],
        [0.75, 0.75],
      ]),
    )

    assert.deepEqual(result, { detected: false, reason: 'too_line_like' })
  })

  it('does not treat a vertical swipe with lateral jitter as a shape', () => {
    const result = detectShapeGesture(
      fromUserFacingPolyline([
        [0.5, 0.82],
        [0.52, 0.66],
        [0.48, 0.5],
        [0.51, 0.34],
        [0.49, 0.18],
      ]),
    )

    assert.equal(result.detected, false)
  })

  it('does not treat a vertical swipe with camera-like lateral spikes as an S', () => {
    const result = detectShapeGesture(
      fromUserFacingPolyline([
        [0.5, 0.16],
        [0.52, 0.28],
        [0.15, 0.3],
        [0.85, 0.32],
        [0.5, 0.35],
        [0.52, 0.86],
      ]),
    )

    assert.equal(result.detected, false)
  })

  it('does not treat compact camera jitter as a path shape', () => {
    const result = detectShapeGesture(
      fromUserFacingPolyline([
        [0.44, 0.4],
        [0.5, 0.46],
        [0.45, 0.52],
        [0.52, 0.57],
        [0.47, 0.63],
        [0.53, 0.68],
        [0.49, 0.72],
      ]),
    )

    assert.equal(result.detected, false)
  })

  it('does not treat narrow corridor wobble along a line as a path shape', () => {
    const result = detectShapeGesture(
      fromUserFacingPolyline([
        [0.18, 0.2],
        [0.3, 0.34],
        [0.42, 0.42],
        [0.54, 0.58],
        [0.66, 0.66],
        [0.78, 0.82],
      ]),
    )

    assert.equal(result.detected, false)
  })
})

function fromUserFacingPolyline(
  controlPoints: Array<[number, number]>,
  jitter = 0,
): PointerTrailPoint[] {
  const points: PointerTrailPoint[] = []
  let at = 0

  for (let index = 1; index < controlPoints.length; index += 1) {
    const [fromX, fromY] = controlPoints[index - 1]
    const [toX, toY] = controlPoints[index]

    for (let step = 0; step < 5; step += 1) {
      const ratio = step / 5
      points.push({
        x: 1 - (fromX + (toX - fromX) * ratio + getJitter(step, jitter)),
        y: fromY + (toY - fromY) * ratio + getJitter(step + index, jitter),
        at,
      })
      at += 80
    }
  }

  const [lastX, lastY] = controlPoints[controlPoints.length - 1]
  points.push({
    x: 1 - lastX,
    y: lastY,
    at,
  })

  return points
}

function getJitter(seed: number, amount: number) {
  if (amount === 0) return 0

  return (((seed * 17) % 5) - 2) * amount
}
