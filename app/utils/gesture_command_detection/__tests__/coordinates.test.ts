import { assert, describe, it } from 'vitest'
import {
  getHandedness,
  getLeftHandIndex,
  getRightHandIndex,
  toUserFacingPoint,
} from '../coordinates'

describe('coordinates', () => {
  it('mirrors raw x into user-facing x', () => {
    assert.deepEqual(toUserFacingPoint({ x: 0.25, y: 0.5 }), {
      x: 0.75,
      y: 0.5,
    })
  })

  it('reads handedness labels', () => {
    assert.equal(getHandedness([{ categoryName: 'Left' }]), 'Left')
    assert.equal(getHandedness([{ displayName: 'Right' }]), 'Right')
    assert.equal(getHandedness([]), 'Unknown')
  })

  it('finds left and right hand indices', () => {
    const handednesses = [
      [{ categoryName: 'Right' }],
      [{ categoryName: 'Left' }],
    ]

    assert.equal(getRightHandIndex(handednesses), 0)
    assert.equal(getLeftHandIndex(handednesses), 1)
  })
})
