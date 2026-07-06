import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createRecognitionContext,
  reduceRecognitionFrame,
  STROKE_END_DISPLAY_MS,
  STROKE_IDLE_MS,
} from '../recognition_reducer'
import type { GestureName, PointerTrailPoint } from '../types'

describe('reduceRecognitionFrame', () => {
  it('enters a visible ready-to-start state before drawing begins', () => {
    const context = createRecognitionContext()
    const points = fromUserFacingPolyline([
      [0.5, 0.5],
      [0.505, 0.5],
    ])

    const firstFrame = reduceRecognitionFrame(context, [points[0]], 0, true)
    const secondFrame = reduceRecognitionFrame(
      firstFrame.context,
      [points[0], points[1]],
      points[1].at,
      true,
    )

    assert.equal(firstFrame.context.state, 'ready_to_start')
    assert.equal(secondFrame.context.state, 'ready_to_start')
    assert.ok(secondFrame.context.strokeStartProgress < 1)
    assert.equal(secondFrame.context.strokePoints.length, 0)
  })

  it('creates a candidate only after a stroke ended state is visible', () => {
    let context = createRecognitionContext()
    const points: PointerTrailPoint[] = []

    for (const point of fromUserFacingPolyline([
      [0.25, 0.25],
      [0.5, 0.78],
      [0.75, 0.25],
    ])) {
      points.push(point)
      const result = reduceRecognitionFrame(context, points, point.at, true)
      context = result.context

      assert.equal(result.executionCandidate, null)
      assert.notEqual(context.state, 'candidate')
      assert.notEqual(context.state, 'stroke_ended')
    }

    const lastPoint = points[points.length - 1]
    points.push({
      ...lastPoint,
      at: lastPoint.at + STROKE_IDLE_MS + 1,
    })

    const result = reduceRecognitionFrame(
      context,
      points,
      points[points.length - 1].at,
      true,
    )

    assert.equal(result.context.state, 'stroke_ended')
    assert.equal(result.context.strokeEndReason, 'idle')
    assert.equal(result.context.completedStrokePoints.length > 0, true)

    const candidateResult = reduceRecognitionFrame(
      result.context,
      points,
      points[points.length - 1].at + STROKE_END_DISPLAY_MS + 1,
      true,
    )

    assert.equal(candidateResult.context.state, 'candidate')
    assert.equal(candidateResult.context.candidate?.gesture, 'shape_v')
  })

  it('recognizes supported swipes and path shapes through the stroke lifecycle', () => {
    const cases: Array<{
      gesture: GestureName
      controlPoints: Array<[number, number]>
    }> = [
      {
        gesture: 'swipe_up',
        controlPoints: [
          [0.5, 0.75],
          [0.5, 0.35],
        ],
      },
      {
        gesture: 'swipe_down',
        controlPoints: [
          [0.5, 0.35],
          [0.5, 0.75],
        ],
      },
      {
        gesture: 'swipe_left',
        controlPoints: [
          [0.75, 0.5],
          [0.35, 0.5],
        ],
      },
      {
        gesture: 'swipe_right',
        controlPoints: [
          [0.25, 0.5],
          [0.65, 0.5],
        ],
      },
      {
        gesture: 'swipe_up_left',
        controlPoints: [
          [0.72, 0.72],
          [0.34, 0.34],
        ],
      },
      {
        gesture: 'swipe_up_right',
        controlPoints: [
          [0.28, 0.72],
          [0.66, 0.34],
        ],
      },
      {
        gesture: 'swipe_down_left',
        controlPoints: [
          [0.72, 0.28],
          [0.34, 0.66],
        ],
      },
      {
        gesture: 'swipe_down_right',
        controlPoints: [
          [0.28, 0.28],
          [0.66, 0.66],
        ],
      },
      {
        gesture: 'shape_v',
        controlPoints: [
          [0.25, 0.25],
          [0.5, 0.78],
          [0.75, 0.25],
        ],
      },
      {
        gesture: 'shape_w',
        controlPoints: [
          [0.2, 0.25],
          [0.35, 0.78],
          [0.5, 0.25],
          [0.65, 0.78],
          [0.8, 0.25],
        ],
      },
      {
        gesture: 'shape_s',
        controlPoints: [
          [0.72, 0.2],
          [0.28, 0.24],
          [0.2, 0.42],
          [0.72, 0.52],
          [0.8, 0.72],
          [0.28, 0.82],
        ],
      },
    ]

    for (const testCase of cases) {
      assert.equal(
        getCandidateGesture(testCase.controlPoints),
        testCase.gesture,
        testCase.gesture,
      )
    }
  })

  it('cancels an active stroke when the right hand disappears', () => {
    let context = createRecognitionContext()
    const points: PointerTrailPoint[] = []

    for (const point of fromUserFacingPolyline([
      [0.25, 0.25],
      [0.5, 0.78],
    ])) {
      points.push(point)
      const result = reduceRecognitionFrame(context, points, point.at, true)
      context = result.context
    }

    const result = reduceRecognitionFrame(context, points, 1000, false)

    assert.equal(result.context.state, 'tracking')
    assert.equal(result.context.strokePoints.length, 0)
    assert.equal(result.context.candidate, null)
  })
})

function getCandidateGesture(controlPoints: Array<[number, number]>) {
  let context = createRecognitionContext()
  const points: PointerTrailPoint[] = []

  for (const point of fromUserFacingPolyline(controlPoints)) {
    points.push(point)
    const result = reduceRecognitionFrame(context, points, point.at, true)
    context = result.context
  }

  const lastPoint = points[points.length - 1]
  points.push({
    ...lastPoint,
    at: lastPoint.at + STROKE_IDLE_MS + 1,
  })

  const result = reduceRecognitionFrame(
    context,
    points,
    points[points.length - 1].at,
    true,
  )

  assert.equal(result.context.state, 'stroke_ended')

  const candidateResult = reduceRecognitionFrame(
    result.context,
    points,
    points[points.length - 1].at + STROKE_END_DISPLAY_MS + 1,
    true,
  )

  return candidateResult.context.candidate?.gesture
}

function fromUserFacingPolyline(
  controlPoints: Array<[number, number]>,
): PointerTrailPoint[] {
  const points: PointerTrailPoint[] = []
  let at = 0

  for (let index = 1; index < controlPoints.length; index += 1) {
    const [fromX, fromY] = controlPoints[index - 1]
    const [toX, toY] = controlPoints[index]

    for (let step = 0; step < 5; step += 1) {
      const ratio = step / 5
      points.push({
        x: 1 - (fromX + (toX - fromX) * ratio),
        y: fromY + (toY - fromY) * ratio,
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
