import { assert, describe, it } from 'vitest'
import {
  getClosestTouchContact,
  getClosestOneHandTouchContact,
  getFingerTips,
  getHandPoseQuality,
  getTwoHandTouchFrame,
  isTouchEntered,
  isTouchStillActive,
} from '../touch_detection'
import type { FingerName } from '../types'

describe('two hand touch detection', () => {
  it('extracts five fingertip landmarks', () => {
    const tips = getFingerTips(createHand({}, 0.2))

    assert.deepEqual(
      tips.map((tip) => tip.finger),
      ['thumb', 'index', 'middle', 'ring', 'pinky'],
    )
  })

  it('detects the closest left/right fingertip pair by normalized hand scale', () => {
    const leftHand = createHand({
      thumb: [0.4, 0.4],
    }, 0.2)
    const rightHand = createHand({
      index: [0.43, 0.4],
    }, 0.8)
    const contact = getClosestTouchContact(leftHand, rightHand)

    assert.ok(contact)
    assert.equal(contact?.gesture, 'touch_left_thumb_right_index')
    assert.equal(isTouchEntered(contact), true)
  })

  it('keeps a near contact active until the wider exit threshold', () => {
    const leftHand = createHand({
      thumb: [0.4, 0.4],
    }, 0.2)
    const rightHand = createHand({
      thumb: [0.452, 0.4],
    }, 0.8)
    const contact = getClosestTouchContact(leftHand, rightHand)

    assert.ok(contact)
    assert.equal(isTouchEntered(contact), false)
    assert.equal(isTouchStillActive(contact), true)
  })

  it('detects supported one-hand thumb contacts on either hand', () => {
    const leftContact = getClosestOneHandTouchContact(
      createHand({
        thumb: [0.4, 0.4],
        ring: [0.43, 0.4],
      }, 0.2),
      'Left',
    )
    const rightContact = getClosestOneHandTouchContact(
      createHand({
        thumb: [0.7, 0.4],
        middle: [0.73, 0.4],
      }, 0.7),
      'Right',
    )

    assert.equal(leftContact?.gesture, 'touch_left_thumb_ring')
    assert.equal(leftContact?.contactType, 'one_hand')
    assert.equal(leftContact?.hand, 'Left')
    assert.equal(rightContact?.gesture, 'touch_right_thumb_middle')
    assert.equal(rightContact?.contactType, 'one_hand')
    assert.equal(rightContact?.hand, 'Right')
  })

  it('withholds contacts when a hand is edge-on to the camera', () => {
    const frame = getTwoHandTouchFrame(
      [
        createHand(
          {
            thumb: [0.5, 0.4],
            index: [0.53, 0.4],
          },
          0.5,
          {
            indexMcpZ: -0.35,
            pinkyMcpZ: 0.35,
          },
        ),
      ],
      [[{ categoryName: 'Right' }]],
      100,
    )

    assert.equal(frame.rightPoseQuality?.isAcceptable, false)
    assert.equal(frame.rightPoseQuality?.reason, 'palm_edge_on')
    assert.equal(frame.closestContact, null)
  })

  it('rejects one-hand contact if fingertips overlap only in 2D but differ in depth', () => {
    const contact = getClosestOneHandTouchContact(
      createHand({
        thumb: [0.4, 0.4, -0.12],
        ring: [0.43, 0.4, 0.12],
      }, 0.2),
      'Left',
    )

    assert.equal(contact, null)
  })

  it('withholds contacts when fingers are folded into a fist', () => {
    const frame = getTwoHandTouchFrame(
      [createFistHand(0.5)],
      [[{ categoryName: 'Right' }]],
      100,
    )

    assert.equal(frame.rightPoseQuality?.isAcceptable, false)
    assert.equal(frame.rightPoseQuality?.reason, 'fist_closed')
    assert.equal(frame.rightPoseQuality?.foldedFingerCount, 4)
    assert.equal(frame.closestContact, null)
  })

  it('detects a fist by finger curl ratio even when the hand has depth rotation', () => {
    const quality = getHandPoseQuality(createFistHand(0.5, { depthRotation: true }))

    assert.equal(quality.isAcceptable, false)
    assert.equal(quality.reason, 'fist_closed')
    assert.equal(quality.foldedFingerCount, 4)
  })

  it('returns a two-hand frame with the closest contact', () => {
    const frame = getTwoHandTouchFrame(
      [
        createHand({
          index: [0.62, 0.5],
        }, 0.8),
        createHand({
          middle: [0.6, 0.5],
        }, 0.2),
      ],
      [[{ categoryName: 'Right' }], [{ categoryName: 'Left' }]],
      100,
    )

    assert.equal(frame.leftHandVisible, true)
    assert.equal(frame.rightHandVisible, true)
    assert.equal(frame.closestContact?.gesture, 'touch_left_middle_right_index')
  })

  it('returns a one-hand frame when only one hand is visible', () => {
    const frame = getTwoHandTouchFrame(
      [
        createHand({
          thumb: [0.5, 0.4],
          index: [0.53, 0.4],
        }, 0.5),
      ],
      [[{ categoryName: 'Right' }]],
      100,
    )

    assert.equal(frame.leftHandVisible, false)
    assert.equal(frame.rightHandVisible, true)
    assert.equal(frame.closestContact?.gesture, 'touch_right_thumb_index')
  })
})

function createHand(
  overrides: Partial<Record<FingerName, [number, number, number?]>>,
  baseX: number,
  options: {
    indexMcpZ?: number
    pinkyMcpZ?: number
  } = {},
) {
  const landmarks = Array.from({ length: 21 }, (_, index) => ({
    x: baseX + index * 0.002,
    y: 0.2 + index * 0.005,
    z: 0,
    visibility: 1,
  }))

  landmarks[5] = {
    x: baseX - 0.05,
    y: 0.55,
    z: options.indexMcpZ ?? 0,
    visibility: 1,
  }
  landmarks[17] = {
    x: baseX + 0.05,
    y: 0.55,
    z: options.pinkyMcpZ ?? 0,
    visibility: 1,
  }

  const tipIndexes: Record<FingerName, number> = {
    thumb: 4,
    index: 8,
    middle: 12,
    ring: 16,
    pinky: 20,
  }

  for (const [finger, point] of Object.entries(overrides)) {
    const index = tipIndexes[finger as FingerName]
    landmarks[index] = {
      x: point[0],
      y: point[1],
      z: point[2] ?? 0,
      visibility: 1,
    }
  }

  return landmarks
}

function createFistHand(
  baseX: number,
  options: {
    depthRotation?: boolean
  } = {},
) {
  const landmarks = createHand(
    {
      thumb: [baseX - 0.03, 0.47, -0.01],
      index: [baseX - 0.035, 0.49, 0.01],
      middle: [baseX - 0.012, 0.5, 0.015],
      ring: [baseX + 0.012, 0.5, 0.02],
      pinky: [baseX + 0.035, 0.49, 0.025],
    },
    baseX,
    {
      pinkyMcpZ: options.depthRotation ? 0.04 : 0,
    },
  )
  const fingerChains = [
    { indexes: [5, 6, 7, 8], x: baseX - 0.045, z: 0 },
    { indexes: [9, 10, 11, 12], x: baseX - 0.015, z: 0.005 },
    { indexes: [13, 14, 15, 16], x: baseX + 0.015, z: 0.01 },
    { indexes: [17, 18, 19, 20], x: baseX + 0.045, z: 0.015 },
  ]

  for (const finger of fingerChains) {
    const [mcpIndex, pipIndex, dipIndex, tipIndex] = finger.indexes
    const depthOffset = options.depthRotation ? finger.z : 0

    landmarks[mcpIndex] = {
      x: finger.x,
      y: 0.55,
      z: depthOffset,
      visibility: 1,
    }
    landmarks[pipIndex] = {
      x: finger.x,
      y: 0.62,
      z: depthOffset + 0.01,
      visibility: 1,
    }
    landmarks[dipIndex] = {
      x: finger.x + 0.03,
      y: 0.58,
      z: depthOffset + 0.015,
      visibility: 1,
    }
    landmarks[tipIndex] = {
      x: finger.x + 0.015,
      y: 0.565,
      z: depthOffset + 0.02,
      visibility: 1,
    }
  }

  return landmarks
}
