import { assert, describe, it } from 'vitest'
import {
  COOLDOWN_MS,
  createRecognitionContext,
  markExecutionSuccess,
  reduceRecognitionFrame,
  TOUCH_HOLD_MS,
} from '../recognition_reducer'
import type { HandPoseQuality, TouchContact, TwoHandTouchFrame } from '../types'

describe('touch recognition reducer', () => {
  it('waits for a stable touch hold before creating an execution candidate', () => {
    let context = createRecognitionContext()
    const contact = createContact('touch_left_thumb_right_index', 0.2)
    const firstFrame = createFrame(contact, 0)
    const firstResult = reduceRecognitionFrame(context, firstFrame, 0)

    context = firstResult.context
    assert.equal(context.state, 'touching')
    assert.equal(firstResult.executionCandidate, null)

    const partialResult = reduceRecognitionFrame(
      context,
      createFrame(contact, TOUCH_HOLD_MS / 2),
      TOUCH_HOLD_MS / 2,
    )

    context = partialResult.context
    assert.equal(context.state, 'touching')
    assert.ok(context.touchProgress > 0)
    assert.equal(partialResult.executionCandidate, null)

    const completedResult = reduceRecognitionFrame(
      context,
      createFrame(contact, TOUCH_HOLD_MS + 1),
      TOUCH_HOLD_MS + 1,
    )

    assert.equal(completedResult.context.state, 'executing')
    assert.equal(
      completedResult.executionCandidate?.gesture,
      'touch_left_thumb_right_index',
    )
  })

  it('resets if the touch disappears before hold completion', () => {
    let context = createRecognitionContext()
    const contact = createContact('touch_left_index_right_index', 0.2)

    context = reduceRecognitionFrame(context, createFrame(contact, 0), 0).context
    const result = reduceRecognitionFrame(context, createFrame(null, 100), 100)

    assert.equal(result.context.state, 'tracking')
    assert.equal(result.context.activeTouch, null)
    assert.equal(result.executionCandidate, null)
  })

  it('uses cooldown after execution success', () => {
    const context = markExecutionSuccess(createRecognitionContext(), 100)
    const result = reduceRecognitionFrame(
      context,
      createFrame(createContact('touch_left_middle_right_pinky', 0.2), 200),
      200,
    )

    assert.equal(result.context.state, 'cooldown')
    assert.equal(result.context.cooldownUntil, 100 + COOLDOWN_MS)
    assert.equal(result.executionCandidate, null)
  })

  it('recognizes a one-hand thumb touch without requiring both hands', () => {
    let context = createRecognitionContext()
    const contact = createContact('touch_right_thumb_index', 0.2)

    context = reduceRecognitionFrame(
      context,
      createFrame(contact, 0, {
        leftHandVisible: false,
        rightHandVisible: true,
      }),
      0,
    ).context
    const result = reduceRecognitionFrame(
      context,
      createFrame(contact, TOUCH_HOLD_MS + 1, {
        leftHandVisible: false,
        rightHandVisible: true,
      }),
      TOUCH_HOLD_MS + 1,
    )

    assert.equal(result.context.state, 'executing')
    assert.equal(result.executionCandidate?.gesture, 'touch_right_thumb_index')
  })
})

function createFrame(
  contact: TouchContact | null,
  at: number,
  options: {
    leftHandVisible?: boolean
    rightHandVisible?: boolean
  } = {},
): TwoHandTouchFrame {
  return {
    at,
    leftHandVisible: options.leftHandVisible ?? true,
    rightHandVisible: options.rightHandVisible ?? true,
    leftTips: [],
    rightTips: [],
    leftPoseQuality:
      options.leftHandVisible === false ? null : createAcceptablePoseQuality(),
    rightPoseQuality:
      options.rightHandVisible === false ? null : createAcceptablePoseQuality(),
    closestContact: contact,
  }
}

function createAcceptablePoseQuality(): HandPoseQuality {
  return {
    isAcceptable: true,
    reason: 'ok',
    projectedPalmQuality: 1,
    fingertipSpread: 1,
    foldedFingerCount: 0,
  }
}

function createContact(
  gesture: TouchContact['gesture'],
  normalizedDistance: number,
): TouchContact {
  if (gesture.startsWith('touch_left_thumb_') || gesture.startsWith('touch_right_thumb_')) {
    const hand = gesture.startsWith('touch_left_thumb_') ? 'Left' : 'Right'
    const secondaryFinger = gesture.split('_').at(-1) as TouchContact['secondaryFinger']

    return {
      gesture,
      contactType: 'one_hand',
      hand,
      primaryFinger: 'thumb',
      secondaryFinger,
      leftPoint: { x: 0.4, y: 0.4 },
      rightPoint: { x: 0.42, y: 0.4 },
      primaryPoint: { x: 0.4, y: 0.4 },
      secondaryPoint: { x: 0.42, y: 0.4 },
      midpoint: { x: 0.41, y: 0.4 },
      normalizedDistance,
      confidence: 0.8,
    }
  }

  const [, , leftFinger, , rightFinger] = gesture.split('_')

  return {
    gesture,
    contactType: 'two_hand',
    hand: 'Both',
    primaryFinger: leftFinger as TouchContact['primaryFinger'],
    secondaryFinger: rightFinger as TouchContact['secondaryFinger'],
    leftFinger: leftFinger as TouchContact['leftFinger'],
    rightFinger: rightFinger as TouchContact['rightFinger'],
    leftPoint: { x: 0.4, y: 0.4 },
    rightPoint: { x: 0.42, y: 0.4 },
    primaryPoint: { x: 0.4, y: 0.4 },
    secondaryPoint: { x: 0.42, y: 0.4 },
    midpoint: { x: 0.41, y: 0.4 },
    normalizedDistance,
    confidence: 0.8,
  }
}
