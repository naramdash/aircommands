import assert from 'node:assert/strict'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { handCommandSequences } from '../app/utils/hand_command_sequences'
import {
  classifyHandGesture,
  isFistGesture,
  isOpenGesture,
  mirrorLandmarksHorizontally,
} from '../app/utils/hand_gesture_detection'
import {
  advanceHandSequence,
  createHandSequenceContext,
  type HandGestureName,
} from '../app/utils/hand_sequence_state_machine'

type LandmarkOverrides = Record<number, Partial<NormalizedLandmark>>

const supportedMiddleGestures = new Set<HandGestureName>([
  'gesture_thumb_up',
  'gesture_thumb_down',
  'gesture_thumb_left',
  'gesture_thumb_right',
  'gesture_index_point',
  'gesture_middle_point',
  'gesture_pinky_point',
  'gesture_peace',
  'gesture_rock',
  'gesture_three',
])

assert.equal(classifyHandGesture(createFistLandmarks(), 'no_gesture'), 'gesture_fist')
assert.equal(
  classifyHandGesture(createLooseFistLandmarks(), 'no_gesture'),
  'gesture_fist',
)
assert.equal(
  classifyHandGesture(createThumbAcrossFistLandmarks(), 'no_gesture'),
  'gesture_fist',
)
assert.equal(
  classifyHandGesture(flipVertical(createFistLandmarks()), 'no_gesture'),
  'gesture_fist',
)
assert.equal(classifyHandGesture(createOpenLandmarks(), 'no_gesture'), 'gesture_open')
assert.equal(
  classifyHandGesture(createLooseOpenLandmarks(), 'no_gesture'),
  'gesture_open',
)
assert.equal(
  classifyHandGesture(flipVertical(createOpenLandmarks()), 'no_gesture'),
  'gesture_open',
)
assert.equal(isOpenGesture(createFistLandmarks()), false)
assert.equal(isFistGesture(createOpenLandmarks()), false)
assert.equal(
  classifyHandGesture(createThumbDirectionLandmarks('up'), 'no_gesture'),
  'gesture_thumb_up',
)
assert.equal(
  classifyHandGesture(createThumbDirectionLandmarks('down'), 'no_gesture'),
  'gesture_thumb_down',
)
assert.equal(
  classifyHandGesture(createThumbDownWithInvertedFoldLandmarks(), 'no_gesture'),
  'gesture_thumb_down',
)
assert.notEqual(
  classifyHandGesture(
    createThumbOnlyDirectionLandmarks('down'),
    'gesture_thumb_down',
  ),
  'gesture_thumb_down',
)
assert.equal(
  classifyHandGesture(createThumbDirectionLandmarks('left'), 'no_gesture'),
  'gesture_thumb_left',
)
assert.equal(
  classifyHandGesture(createLooseThumbSideLandmarks('left'), 'no_gesture'),
  'gesture_thumb_left',
)
assert.equal(
  classifyHandGesture(createForeshortenedThumbSideLandmarks('left'), 'no_gesture'),
  'gesture_thumb_left',
)
assert.equal(
  classifyHandGesture(createSideThumbFistLandmarks('left'), 'no_gesture'),
  'gesture_thumb_left',
)
assert.equal(
  classifyHandGesture(createThumbDirectionLandmarks('right'), 'no_gesture'),
  'gesture_thumb_right',
)
assert.equal(
  classifyHandGesture(createLooseThumbSideLandmarks('right'), 'no_gesture'),
  'gesture_thumb_right',
)
assert.equal(
  classifyHandGesture(createForeshortenedThumbSideLandmarks('right'), 'no_gesture'),
  'gesture_thumb_right',
)
assert.equal(
  classifyHandGesture(createSideThumbFistLandmarks('right'), 'no_gesture'),
  'gesture_thumb_right',
)
assert.equal(
  classifyHandGesture(
    mirrorLandmarksHorizontally(createThumbDirectionLandmarks('left')),
    'no_gesture',
  ),
  'gesture_thumb_right',
)
assert.equal(
  classifyHandGesture(
    mirrorLandmarksHorizontally(createThumbDirectionLandmarks('right')),
    'no_gesture',
  ),
  'gesture_thumb_left',
)
assert.notEqual(
  classifyHandGesture(createThumbDirectionLandmarks('up'), 'gesture_thumb_down'),
  'gesture_thumb_down',
)
assert.equal(isFistGesture(createThumbDirectionLandmarks('up')), false)
assert.equal(isOpenGesture(createThumbDirectionLandmarks('up')), false)
assert.notEqual(
  classifyHandGesture(createThumbOnlyDirectionLandmarks('right'), 'no_gesture'),
  'gesture_thumb_right',
)
assert.notEqual(
  classifyHandGesture(createThumbOnlyDirectionLandmarks('left'), 'no_gesture'),
  'gesture_thumb_left',
)
assert.equal(
  classifyHandGesture(createFingerCombinationLandmarks(['index']), 'no_gesture'),
  'gesture_index_point',
)
assert.equal(
  classifyHandGesture(createFingerCombinationLandmarks(['middle']), 'no_gesture'),
  'gesture_middle_point',
)
assert.equal(
  classifyHandGesture(createFingerCombinationLandmarks(['pinky']), 'no_gesture'),
  'gesture_pinky_point',
)
assert.equal(
  classifyHandGesture(
    createFingerCombinationLandmarks(['index', 'middle']),
    'no_gesture',
  ),
  'gesture_peace',
)
assert.equal(
  classifyHandGesture(
    createFingerCombinationLandmarks(['index', 'pinky']),
    'no_gesture',
  ),
  'gesture_rock',
)
assert.equal(
  classifyHandGesture(
    createFingerCombinationLandmarks(['index', 'middle', 'ring']),
    'no_gesture',
  ),
  'gesture_three',
)
assert.notEqual(
  classifyHandGesture(
    createFingerCombinationLandmarks(['index', 'middle']),
    'gesture_rock',
  ),
  'gesture_rock',
)

for (const commandSequence of handCommandSequences) {
  const context = createHandSequenceContext({
    sequence: commandSequence.sequence,
  })

  assert.equal(context.sequence[0], 'gesture_fist')
  assert.equal(context.sequence[context.sequence.length - 1], 'gesture_open')
  assert.ok(context.sequence.length <= 5)

  for (const gesture of commandSequence.sequence) {
    assert.ok(supportedMiddleGestures.has(gesture), `${gesture} is not verified`)
  }
}

let thumbRightContext = createHandSequenceContext({
  sequence: ['gesture_thumb_right'],
  minHoldMs: 80,
})
thumbRightContext = advanceHandSequence(thumbRightContext, {
  type: 'GESTURE_FRAME',
  gesture: 'gesture_fist',
  hand: 'Right',
  at: 0,
})
assert.equal(thumbRightContext.stepIndex, 1)
thumbRightContext = advanceHandSequence(thumbRightContext, {
  type: 'GESTURE_FRAME',
  gesture: 'gesture_thumb_right',
  hand: 'Right',
  at: 40,
})
assert.equal(thumbRightContext.stepIndex, 1)
thumbRightContext = advanceHandSequence(thumbRightContext, {
  type: 'GESTURE_FRAME',
  gesture: 'gesture_thumb_right',
  hand: 'Right',
  at: 140,
})
assert.equal(thumbRightContext.stepIndex, 2)
thumbRightContext = advanceHandSequence(thumbRightContext, {
  type: 'GESTURE_FRAME',
  gesture: 'gesture_open',
  hand: 'Right',
  at: 180,
})
assert.equal(thumbRightContext.completedCount, 0)
thumbRightContext = advanceHandSequence(thumbRightContext, {
  type: 'GESTURE_FRAME',
  gesture: 'gesture_open',
  hand: 'Right',
  at: 280,
})
assert.equal(thumbRightContext.completedCount, 1)
assert.deepEqual(thumbRightContext.lastCompletedSequence, [
  'gesture_fist',
  'gesture_thumb_right',
  'gesture_open',
])

let thumbRightTransitionContext = createHandSequenceContext({
  sequence: ['gesture_thumb_right'],
  minHoldMs: 80,
  noGestureGraceMs: 300,
})
thumbRightTransitionContext = advanceHandSequence(thumbRightTransitionContext, {
  type: 'GESTURE_FRAME',
  gesture: 'gesture_fist',
  hand: 'Right',
  at: 0,
})
thumbRightTransitionContext = advanceHandSequence(thumbRightTransitionContext, {
  type: 'GESTURE_FRAME',
  gesture: 'gesture_thumb_right',
  hand: 'Right',
  at: 40,
})
thumbRightTransitionContext = advanceHandSequence(thumbRightTransitionContext, {
  type: 'GESTURE_FRAME',
  gesture: 'gesture_thumb_right',
  hand: 'Right',
  at: 140,
})
assert.equal(thumbRightTransitionContext.stepIndex, 2)
thumbRightTransitionContext = advanceHandSequence(thumbRightTransitionContext, {
  type: 'GESTURE_FRAME',
  gesture: 'gesture_fist',
  hand: 'Right',
  at: 190,
})
assert.equal(thumbRightTransitionContext.stepIndex, 2)
thumbRightTransitionContext = advanceHandSequence(thumbRightTransitionContext, {
  type: 'GESTURE_FRAME',
  gesture: 'gesture_open',
  hand: 'Right',
  at: 220,
})
thumbRightTransitionContext = advanceHandSequence(thumbRightTransitionContext, {
  type: 'GESTURE_FRAME',
  gesture: 'gesture_open',
  hand: 'Right',
  at: 320,
})
assert.equal(thumbRightTransitionContext.completedCount, 1)

console.log('Gesture verification passed')

function createFistLandmarks() {
  return createBaseLandmarks({
    3: { x: 0.45, y: 0.56 },
    4: { x: 0.46, y: 0.59 },
  })
}

function createLooseFistLandmarks() {
  return createBaseLandmarks({
    3: { x: 0.45, y: 0.56 },
    4: { x: 0.49, y: 0.58 },
    20: { x: 0.66, y: 0.62 },
  })
}

function createThumbAcrossFistLandmarks() {
  return createBaseLandmarks({
    3: { x: 0.47, y: 0.57 },
    4: { x: 0.54, y: 0.57 },
  })
}

function createOpenLandmarks() {
  return createBaseLandmarks({
    6: { x: 0.42, y: 0.45 },
    8: { x: 0.42, y: 0.25 },
    10: { x: 0.5, y: 0.42 },
    12: { x: 0.5, y: 0.18 },
    14: { x: 0.58, y: 0.45 },
    16: { x: 0.58, y: 0.25 },
    18: { x: 0.65, y: 0.5 },
    20: { x: 0.65, y: 0.3 },
  })
}

function createLooseOpenLandmarks() {
  return createOpenLandmarks().map((landmark, index) => {
    if (index === 20) {
      return { ...landmark, x: 0.64, y: 0.38 }
    }

    return { ...landmark }
  })
}

function createThumbDirectionLandmarks(
  direction: 'up' | 'down' | 'left' | 'right',
) {
  const thumbUpLandmarks = createBaseLandmarks({
    3: { x: 0.45, y: 0.6 },
    4: { x: 0.45, y: 0.3 },
  })

  return rotateLandmarksForDirection(thumbUpLandmarks, direction)
}

function createThumbDownWithInvertedFoldLandmarks() {
  return rotateLandmarksForDirection(createBaseLandmarks({
    3: { x: 0.45, y: 0.6 },
    4: { x: 0.45, y: 0.3 },
    8: { x: 0.43, y: 0.51 },
    12: { x: 0.5, y: 0.51 },
    16: { x: 0.57, y: 0.52 },
    20: { x: 0.64, y: 0.56 },
  }), 'down')
}

function createThumbOnlyDirectionLandmarks(
  direction: 'up' | 'down' | 'left' | 'right',
) {
  const thumbTipByDirection = {
    up: { x: 0.45, y: 0.3 },
    down: { x: 0.45, y: 0.78 },
    left: { x: 0.2, y: 0.6 },
    right: { x: 0.72, y: 0.6 },
  } satisfies Record<string, Partial<NormalizedLandmark>>

  return createOpenLandmarks().map((landmark, index) => {
    if (index === 3) {
      return { ...landmark, x: 0.45, y: 0.6 }
    }

    if (index === 4) {
      return { ...landmark, ...thumbTipByDirection[direction] }
    }

    return { ...landmark }
  })
}

function createLooseThumbSideLandmarks(direction: 'left' | 'right') {
  return createThumbDirectionLandmarks(direction).map((landmark, index) => {
    if (index === 8 || index === 12) {
      return {
        ...landmark,
        x: landmark.x + (direction === 'left' ? 0.04 : -0.04),
      }
    }

    return { ...landmark }
  })
}

function createForeshortenedThumbSideLandmarks(direction: 'left' | 'right') {
  return createThumbDirectionLandmarks(direction).map((landmark, index) => {
    if (index === 4) {
      return {
        ...landmark,
        x: landmark.x + (direction === 'left' ? 0.03 : -0.03),
      }
    }

    return { ...landmark }
  })
}

function createSideThumbFistLandmarks(direction: 'left' | 'right') {
  const thumbTip = direction === 'left'
    ? { x: 0.2, y: 0.6 }
    : { x: 0.72, y: 0.6 }

  return createBaseLandmarks({
    3: { x: 0.45, y: 0.6 },
    4: thumbTip,
  })
}

function createFingerCombinationLandmarks(
  extendedFingers: Array<'index' | 'middle' | 'ring' | 'pinky'>,
) {
  const landmarks = createBaseLandmarks({
    3: { x: 0.47, y: 0.57 },
    4: { x: 0.5, y: 0.56 },
  })
  const fingerIndexes = {
    index: { mcp: 5, pip: 6, tip: 8 },
    middle: { mcp: 9, pip: 10, tip: 12 },
    ring: { mcp: 13, pip: 14, tip: 16 },
    pinky: { mcp: 17, pip: 18, tip: 20 },
  } satisfies Record<
    'index' | 'middle' | 'ring' | 'pinky',
    { mcp: number; pip: number; tip: number }
  >

  for (const finger of extendedFingers) {
    const indexes = fingerIndexes[finger]
    const mcp = landmarks[indexes.mcp]

    Object.assign(landmarks[indexes.pip], {
      x: mcp.x,
      y: mcp.y - 0.13,
    })
    Object.assign(landmarks[indexes.tip], {
      x: mcp.x,
      y: mcp.y - 0.34,
    })
  }

  return landmarks
}

function createBaseLandmarks(overrides: LandmarkOverrides = {}) {
  const landmarks = Array.from({ length: 21 }, () => ({
    x: 0,
    y: 0,
    z: 0,
  })) satisfies NormalizedLandmark[]

  Object.assign(landmarks[0], { x: 0.5, y: 0.8 })
  Object.assign(landmarks[2], { x: 0.45, y: 0.6 })
  Object.assign(landmarks[5], { x: 0.42, y: 0.55 })
  Object.assign(landmarks[9], { x: 0.5, y: 0.5 })
  Object.assign(landmarks[13], { x: 0.58, y: 0.55 })
  Object.assign(landmarks[17], { x: 0.65, y: 0.6 })

  Object.assign(landmarks[6], { x: 0.42, y: 0.56 })
  Object.assign(landmarks[8], { x: 0.43, y: 0.62 })
  Object.assign(landmarks[10], { x: 0.5, y: 0.55 })
  Object.assign(landmarks[12], { x: 0.5, y: 0.62 })
  Object.assign(landmarks[14], { x: 0.58, y: 0.56 })
  Object.assign(landmarks[16], { x: 0.57, y: 0.63 })
  Object.assign(landmarks[18], { x: 0.65, y: 0.6 })
  Object.assign(landmarks[20], { x: 0.64, y: 0.67 })

  for (const [index, landmark] of Object.entries(overrides)) {
    Object.assign(landmarks[Number(index)], landmark)
  }

  return landmarks
}

function flipVertical(landmarks: NormalizedLandmark[]) {
  return landmarks.map((landmark) => ({
    ...landmark,
    y: 1 - landmark.y,
  }))
}

function rotateLandmarksForDirection(
  landmarks: NormalizedLandmark[],
  direction: 'up' | 'down' | 'left' | 'right',
) {
  const angleByDirection = {
    up: 0,
    right: Math.PI / 2,
    down: Math.PI,
    left: -Math.PI / 2,
  } satisfies Record<string, number>
  const angle = angleByDirection[direction]
  const center = { x: 0.5, y: 0.65 }
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  return landmarks.map((landmark) => {
    const dx = landmark.x - center.x
    const dy = landmark.y - center.y

    return {
      ...landmark,
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    }
  })
}
