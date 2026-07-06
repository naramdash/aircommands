import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getConfirmationProgress } from '../confirmation'
import type { PointerTrailPoint } from '../types'

describe('getConfirmationProgress', () => {
  it('confirms when the pointer stays still for the hold time', () => {
    const result = getConfirmationProgress(
      makeStillPoints([0, 200, 400, 600, 800]),
      0,
      800,
    )

    assert.equal(result.confirmed, true)
    assert.equal(result.progress, 1)
  })

  it('returns partial progress before hold time', () => {
    const result = getConfirmationProgress(makeStillPoints([0, 200, 400]), 0, 400)

    assert.equal(result.confirmed, false)
    assert.equal(result.reason, 'not_enough_time')
    assert.ok(result.progress >= 0.49 && result.progress <= 0.51)
  })

  it('rejects when pointer moves too far', () => {
    const result = getConfirmationProgress(
      [
        { x: 0.5, y: 0.5, at: 0 },
        { x: 0.56, y: 0.5, at: 200 },
      ],
      0,
      200,
    )

    assert.equal(result.confirmed, false)
    assert.equal(result.reason, 'moved_too_far')
  })
})

function makeStillPoints(times: number[]): PointerTrailPoint[] {
  return times.map((at, index) => ({
    x: 0.5 + index * 0.001,
    y: 0.5,
    at,
  }))
}

