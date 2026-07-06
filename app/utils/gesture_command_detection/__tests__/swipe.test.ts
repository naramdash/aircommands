import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { detectSwipeGesture } from '../swipe'
import type { PointerTrailPoint } from '../types'

describe('detectSwipeGesture', () => {
  it('detects up swipe', () => {
    const result = detectSwipeGesture(
      fromUserFacingPoints([
        [0.5, 0.75],
        [0.5, 0.65],
        [0.5, 0.55],
        [0.5, 0.45],
      ]),
      300,
    )

    assert.equal(result.detected, true)
    if (result.detected) {
      assert.equal(result.direction, 'up')
      assert.ok(result.confidence >= 0.65)
    }
  })

  it('detects down swipe', () => {
    const result = detectSwipeGesture(
      fromUserFacingPoints([
        [0.5, 0.35],
        [0.5, 0.45],
        [0.5, 0.55],
        [0.5, 0.68],
      ]),
      300,
    )

    assert.equal(result.detected, true)
    if (result.detected) assert.equal(result.direction, 'down')
  })

  it('detects right swipe using user-facing coordinates', () => {
    const result = detectSwipeGesture(
      fromUserFacingPoints([
        [0.25, 0.5],
        [0.38, 0.5],
        [0.5, 0.5],
        [0.65, 0.5],
      ]),
      300,
    )

    assert.equal(result.detected, true)
    if (result.detected) assert.equal(result.direction, 'right')
  })

  it('detects left swipe using user-facing coordinates', () => {
    const result = detectSwipeGesture(
      fromUserFacingPoints([
        [0.75, 0.5],
        [0.62, 0.5],
        [0.5, 0.5],
        [0.35, 0.5],
      ]),
      300,
    )

    assert.equal(result.detected, true)
    if (result.detected) assert.equal(result.direction, 'left')
  })

  it('detects a slower imperfect right swipe from camera-like input', () => {
    const result = detectSwipeGesture(
      fromUserFacingPoints(
        [
          [0.28, 0.5],
          [0.34, 0.52],
          [0.42, 0.51],
          [0.5, 0.54],
          [0.58, 0.53],
          [0.66, 0.55],
        ],
        220,
      ),
      1100,
    )

    assert.equal(result.detected, true)
    if (result.detected) assert.equal(result.direction, 'right')
  })

  it('detects swipes even when the pointer bounces near the end', () => {
    const cases: Array<{
      direction: 'down' | 'left' | 'right'
      points: Array<[number, number]>
    }> = [
      {
        direction: 'down',
        points: [
          [0.5, 0.28],
          [0.51, 0.42],
          [0.49, 0.58],
          [0.5, 0.72],
          [0.51, 0.66],
        ],
      },
      {
        direction: 'left',
        points: [
          [0.78, 0.52],
          [0.64, 0.5],
          [0.48, 0.53],
          [0.32, 0.51],
          [0.38, 0.52],
        ],
      },
      {
        direction: 'right',
        points: [
          [0.22, 0.52],
          [0.36, 0.5],
          [0.52, 0.53],
          [0.68, 0.51],
          [0.62, 0.52],
        ],
      },
    ]

    for (const testCase of cases) {
      const result = detectSwipeGesture(
        fromUserFacingPoints(testCase.points, 90),
        360,
      )

      assert.equal(result.detected, true, testCase.direction)
      if (result.detected) {
        assert.equal(result.direction, testCase.direction)
      }
    }
  })

  it('rejects short movement', () => {
    const result = detectSwipeGesture(
      fromUserFacingPoints([
        [0.5, 0.5],
        [0.51, 0.5],
        [0.52, 0.5],
        [0.53, 0.5],
      ]),
      300,
    )

    assert.deepEqual(result, { detected: false, reason: 'too_short' })
  })

  it('detects diagonal swipes', () => {
    const cases: Array<{
      direction: 'up_left' | 'up_right' | 'down_left' | 'down_right'
      points: Array<[number, number]>
    }> = [
      {
        direction: 'up_left',
        points: [
          [0.7, 0.7],
          [0.58, 0.58],
          [0.46, 0.46],
          [0.34, 0.34],
        ],
      },
      {
        direction: 'up_right',
        points: [
          [0.3, 0.7],
          [0.42, 0.58],
          [0.54, 0.46],
          [0.66, 0.34],
        ],
      },
      {
        direction: 'down_left',
        points: [
          [0.7, 0.3],
          [0.58, 0.42],
          [0.46, 0.54],
          [0.34, 0.66],
        ],
      },
      {
        direction: 'down_right',
        points: [
          [0.3, 0.3],
          [0.42, 0.42],
          [0.54, 0.54],
          [0.66, 0.66],
        ],
      },
    ]

    for (const testCase of cases) {
      const result = detectSwipeGesture(
        fromUserFacingPoints(testCase.points),
        300,
      )

      assert.equal(result.detected, true, testCase.direction)
      if (result.detected) {
        assert.equal(result.direction, testCase.direction)
        assert.equal(result.gesture, `swipe_${testCase.direction}`)
      }
    }
  })

  it('keeps mostly horizontal movement as a horizontal swipe', () => {
    const result = detectSwipeGesture(
      fromUserFacingPoints([
        [0.2, 0.5],
        [0.34, 0.53],
        [0.48, 0.56],
        [0.62, 0.59],
      ]),
      300,
    )

    assert.equal(result.detected, true)
    if (result.detected) assert.equal(result.direction, 'right')
  })
})

function fromUserFacingPoints(
  points: Array<[number, number]>,
  interval = 100,
): PointerTrailPoint[] {
  return points.map(([x, y], index) => ({
    x: 1 - x,
    y,
    at: index * interval,
  }))
}
