import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendTrailPoint,
  getRecentPoints,
  MAX_RENDER_TRAIL_POINTS,
  pruneTrail,
} from '../pointer_trail'
import type { PointerTrailPoint } from '../types'

describe('pointer trail', () => {
  it('prunes points outside the requested age', () => {
    const points = makePoints([0, 100, 500, 900])

    assert.deepEqual(
      pruneTrail(points, 1000, 500).map((point) => point.at),
      [500, 900],
    )
  })

  it('returns points in a recent window', () => {
    const points = makePoints([0, 200, 600, 900])

    assert.deepEqual(
      getRecentPoints(points, 1000, 400).map((point) => point.at),
      [600, 900],
    )
  })

  it('caps render trail length', () => {
    let points: PointerTrailPoint[] = []

    for (let index = 0; index < MAX_RENDER_TRAIL_POINTS + 5; index += 1) {
      points = appendTrailPoint(points, { x: 0.5, y: 0.5, at: index })
    }

    assert.equal(points.length, MAX_RENDER_TRAIL_POINTS)
    assert.equal(points[0].at, 5)
  })
})

function makePoints(times: number[]): PointerTrailPoint[] {
  return times.map((at) => ({ x: 0.5, y: 0.5, at }))
}

