import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getHandedness,
  getRightHandIndex,
  toUserFacingPoint,
} from '../coordinates'

describe('coordinates', () => {
  it('mirrors raw x into user-facing x', () => {
    assert.deepEqual(toUserFacingPoint({ x: 0.2, y: 0.4, at: 100 }), {
      x: 0.8,
      y: 0.4,
      at: 100,
    })
  })

  it('reads handedness labels', () => {
    assert.equal(getHandedness([{ categoryName: 'Right' }]), 'Right')
    assert.equal(getHandedness([{ displayName: 'Left' }]), 'Left')
    assert.equal(getHandedness([]), 'Unknown')
  })

  it('finds the right hand index', () => {
    assert.equal(
      getRightHandIndex([
        [{ categoryName: 'Left' }],
        [{ categoryName: 'Right' }],
      ]),
      1,
    )
  })
})

