import { describe, expect, it } from 'vitest'
import {
  createRecognitionContext,
  reduceRecognitionFrame,
} from '../recognition_reducer'
import type { TouchContact, TouchFrame } from '../types'

const contact: TouchContact = {
  gesture: 'touch_left_thumb_index',
  hand: 'Left',
  primaryFinger: 'thumb',
  secondaryFinger: 'index',
  primaryPoint: { x: 0.4, y: 0.4 },
  secondaryPoint: { x: 0.41, y: 0.41 },
  midpoint: { x: 0.405, y: 0.405 },
  normalizedDistance: 0.2,
  confidence: 0.9,
}

const frame: TouchFrame = {
  at: 0,
  leftHandVisible: true,
  rightHandVisible: false,
  leftTips: [],
  rightTips: [],
  leftPoseQuality: null,
  rightPoseQuality: null,
  closestContact: contact,
}

describe('gesture hold duration', () => {
  it('uses the configured hold duration for progress and execution', () => {
    const started = reduceRecognitionFrame(createRecognitionContext(), frame, 1_000, 600)
    const halfway = reduceRecognitionFrame(started.context, frame, 1_300, 600)
    const completed = reduceRecognitionFrame(halfway.context, frame, 1_600, 600)

    expect(started.executionCandidate).toBeNull()
    expect(halfway.context.touchProgress).toBe(0.5)
    expect(halfway.executionCandidate).toBeNull()
    expect(completed.executionCandidate?.gesture).toBe('touch_left_thumb_index')
    expect(completed.executionCandidate?.gestureStartedAt).toBe(1_000)
    expect(completed.executionCandidate?.gestureEndedAt).toBe(1_600)
  })
})
