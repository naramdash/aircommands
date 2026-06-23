// Rules:
// 1. Only the right hand is recognized.
// 2. Every sequence starts with gesture_fist.
// 3. Every sequence ends with gesture_open, meaning "paper".
// 4. Brief no_gesture frames during an active sequence are tolerated.

import { assign, setup } from 'xstate'

export type Handedness = 'Left' | 'Right' | 'Unknown'
export type HandGestureName =
  | 'gesture_open'
  | 'gesture_fist'
  | 'gesture_pinch'
  | 'gesture_thumb_only'
  | 'no_gesture'
  | (string & {})

export type HandSequenceOptions = {
  sequence?: HandGestureName[]
  minHoldMs?: number
  maxGapMs?: number
  noGestureGraceMs?: number
  requireSameHand?: boolean
}

type HandSequenceStateValue =
  | 'no_gesture'
  | 'start_gesture'
  | 'sequence_gesture'
  | 'end_gesture'

export type HandSequenceContext = {
  stateValue: HandSequenceStateValue
  sequence: HandGestureName[]
  stepIndex: number
  minHoldMs: number
  maxGapMs: number
  noGestureGraceMs: number
  requireSameHand: boolean
  candidateGesture: HandGestureName
  candidateHand: Handedness
  candidateSince: number
  activeHand: Handedness | null
  lastAcceptedAt: number
  completedAt: number | null
  completedCount: number
  lastCompletedSequence: HandGestureName[]
}

export type HandSequenceEvent =
  | {
      type: 'GESTURE_FRAME'
      gesture: HandGestureName
      hand?: Handedness
      at?: number
    }
  | {
      type: 'SET_SEQUENCE'
      sequence: HandGestureName[]
    }
  | {
      type: 'RESET'
    }

const RECOGNIZED_HAND: Handedness = 'Right'
const START_GESTURE: HandGestureName = 'gesture_fist'
const END_GESTURE: HandGestureName = 'gesture_open'
const DEFAULT_SEQUENCE: HandGestureName[] = [START_GESTURE, END_GESTURE]
const DEFAULT_MIN_HOLD_MS = 250
const DEFAULT_MAX_GAP_MS = 1200
const DEFAULT_NO_GESTURE_GRACE_MS = 750

export const handSequenceStateMachine = setup({
  types: {
    context: {} as HandSequenceContext,
    events: {} as HandSequenceEvent,
    input: {} as HandSequenceOptions | undefined,
  },
  guards: {
    isNoGesture: ({ context }) => context.stateValue === 'no_gesture',
    isStartGesture: ({ context }) => context.stateValue === 'start_gesture',
    isSequenceGesture: ({ context }) =>
      context.stateValue === 'sequence_gesture',
    isEndGesture: ({ context }) => context.stateValue === 'end_gesture',
  },
}).createMachine({
  id: 'handSequence',
  initial: 'no_gesture',
  context: ({ input }) => createHandSequenceContext(input),
  states: {
    no_gesture: {
      on: {
        GESTURE_FRAME: {
          target: 'route',
          actions: assign(({ context, event }) =>
            advanceHandSequence(context, event),
          ),
        },
        SET_SEQUENCE: {
          target: 'no_gesture',
          actions: assign(({ context, event }) => ({
            ...resetSequenceProgress(context),
            sequence: normalizeHandSequence(event.sequence),
            completedAt: null,
            lastCompletedSequence: [],
          })),
        },
        RESET: {
          target: 'no_gesture',
          actions: assign(({ context }) => ({
            ...resetSequenceProgress(context),
            completedAt: null,
            lastCompletedSequence: [],
          })),
        },
      },
    },
    start_gesture: {
      on: {
        GESTURE_FRAME: {
          target: 'route',
          actions: assign(({ context, event }) =>
            advanceHandSequence(context, event),
          ),
        },
        SET_SEQUENCE: {
          target: 'no_gesture',
          actions: assign(({ context, event }) => ({
            ...resetSequenceProgress(context),
            sequence: normalizeHandSequence(event.sequence),
            completedAt: null,
            lastCompletedSequence: [],
          })),
        },
        RESET: {
          target: 'no_gesture',
          actions: assign(({ context }) => ({
            ...resetSequenceProgress(context),
            completedAt: null,
            lastCompletedSequence: [],
          })),
        },
      },
    },
    sequence_gesture: {
      on: {
        GESTURE_FRAME: {
          target: 'route',
          actions: assign(({ context, event }) =>
            advanceHandSequence(context, event),
          ),
        },
        SET_SEQUENCE: {
          target: 'no_gesture',
          actions: assign(({ context, event }) => ({
            ...resetSequenceProgress(context),
            sequence: normalizeHandSequence(event.sequence),
            completedAt: null,
            lastCompletedSequence: [],
          })),
        },
        RESET: {
          target: 'no_gesture',
          actions: assign(({ context }) => ({
            ...resetSequenceProgress(context),
            completedAt: null,
            lastCompletedSequence: [],
          })),
        },
      },
    },
    end_gesture: {
      on: {
        GESTURE_FRAME: {
          target: 'route',
          actions: assign(({ context, event }) =>
            advanceHandSequence(context, event),
          ),
        },
        SET_SEQUENCE: {
          target: 'no_gesture',
          actions: assign(({ context, event }) => ({
            ...resetSequenceProgress(context),
            sequence: normalizeHandSequence(event.sequence),
            completedAt: null,
            lastCompletedSequence: [],
          })),
        },
        RESET: {
          target: 'no_gesture',
          actions: assign(({ context }) => ({
            ...resetSequenceProgress(context),
            completedAt: null,
            lastCompletedSequence: [],
          })),
        },
      },
    },
    route: {
      always: [
        { guard: 'isNoGesture', target: 'no_gesture' },
        { guard: 'isStartGesture', target: 'start_gesture' },
        { guard: 'isSequenceGesture', target: 'sequence_gesture' },
        { guard: 'isEndGesture', target: 'end_gesture' },
      ],
    },
  },
})

export function createHandSequenceContext(
  options: HandSequenceOptions = {},
): HandSequenceContext {
  return {
    stateValue: 'no_gesture',
    sequence: normalizeHandSequence(options.sequence ?? DEFAULT_SEQUENCE),
    stepIndex: 0,
    minHoldMs: options.minHoldMs ?? DEFAULT_MIN_HOLD_MS,
    maxGapMs: options.maxGapMs ?? DEFAULT_MAX_GAP_MS,
    noGestureGraceMs: options.noGestureGraceMs ?? DEFAULT_NO_GESTURE_GRACE_MS,
    requireSameHand: options.requireSameHand ?? true,
    candidateGesture: 'no_gesture',
    candidateHand: 'Unknown',
    candidateSince: 0,
    activeHand: null,
    lastAcceptedAt: 0,
    completedAt: null,
    completedCount: 0,
    lastCompletedSequence: [],
  }
}

export function advanceHandSequence(
  context: HandSequenceContext,
  event: Extract<HandSequenceEvent, { type: 'GESTURE_FRAME' }>,
): HandSequenceContext {
  const at = event.at ?? getNow()
  const hand = event.hand ?? 'Unknown'
  const gesture = event.gesture

  if (hand !== RECOGNIZED_HAND) {
    return {
      ...resetSequenceProgress(context),
      candidateGesture: 'no_gesture',
      candidateHand: hand,
      candidateSince: at,
    }
  }

  if (gesture === START_GESTURE) {
    return acceptStartGesture(context, hand, at)
  }

  const timedOut =
    context.lastAcceptedAt > 0 && at - context.lastAcceptedAt > context.maxGapMs
  const baseContext = timedOut ? resetSequenceProgress(context) : context

  if (!baseContext.sequence.length) {
    return {
      ...resetSequenceProgress(baseContext),
      candidateGesture: gesture,
      candidateHand: hand,
      candidateSince: at,
    }
  }

  if (gesture === 'no_gesture') {
    return handleNoGestureFrame(baseContext, hand, at)
  }

  if (
    gesture !== baseContext.candidateGesture ||
    hand !== baseContext.candidateHand
  ) {
    return {
      ...baseContext,
      candidateGesture: gesture,
      candidateHand: hand,
      candidateSince: at,
    }
  }

  if (at - baseContext.candidateSince < baseContext.minHoldMs) {
    return baseContext
  }

  const expectedGesture = baseContext.sequence[baseContext.stepIndex]
  const previousGesture =
    baseContext.sequence[Math.max(0, baseContext.stepIndex - 1)]
  const sameActiveHand =
    !baseContext.requireSameHand ||
    baseContext.activeHand === null ||
    baseContext.activeHand === hand

  if (gesture === expectedGesture && sameActiveHand) {
    return acceptSequenceStep(baseContext, gesture, hand, at)
  }

  if (gesture === previousGesture && sameActiveHand) {
    return baseContext
  }

  if (gesture === baseContext.sequence[0]) {
    return acceptSequenceStep(resetSequenceProgress(baseContext), gesture, hand, at)
  }

  return {
    ...resetSequenceProgress(baseContext),
    candidateGesture: gesture,
    candidateHand: hand,
    candidateSince: at,
  }
}

function acceptSequenceStep(
  context: HandSequenceContext,
  gesture: HandGestureName,
  hand: Handedness,
  at: number,
): HandSequenceContext {
  const nextStepIndex = context.stepIndex + 1
  const activeHand = context.activeHand ?? hand

  if (nextStepIndex >= context.sequence.length) {
    return {
      ...context,
      stateValue: 'end_gesture',
      stepIndex: context.sequence.length,
      activeHand,
      lastAcceptedAt: at,
      candidateGesture: gesture,
      candidateHand: hand,
      candidateSince: at,
      completedAt: at,
      completedCount: context.completedCount + 1,
      lastCompletedSequence: [...context.sequence],
    }
  }

  return {
    ...context,
    stateValue: getAcceptedStateValue(context, nextStepIndex),
    stepIndex: nextStepIndex,
    activeHand,
    lastAcceptedAt: at,
    candidateGesture: gesture,
    candidateHand: hand,
    candidateSince: at,
  }
}

function handleNoGestureFrame(
  context: HandSequenceContext,
  hand: Handedness,
  at: number,
): HandSequenceContext {
  const hasStartedSequence = context.stepIndex > 0 && context.lastAcceptedAt > 0
  const isBriefGapFromAcceptedGesture =
    hasStartedSequence && at - context.lastAcceptedAt <= context.noGestureGraceMs
  const expectedGesture = context.sequence[context.stepIndex]
  const isBriefGapFromCandidate =
    context.candidateGesture === expectedGesture &&
    context.candidateSince > 0 &&
    at - context.candidateSince <= context.noGestureGraceMs

  if (isBriefGapFromAcceptedGesture || isBriefGapFromCandidate) {
    return {
      ...context,
      candidateHand: hand,
    }
  }

  return {
    ...resetSequenceProgress(context),
    candidateGesture: 'no_gesture',
    candidateHand: hand,
    candidateSince: at,
  }
}

function acceptStartGesture(
  context: HandSequenceContext,
  hand: Handedness,
  at: number,
): HandSequenceContext {
  const resetContext = resetSequenceProgress(context)
  const nextStepIndex = Math.min(1, resetContext.sequence.length)

  return {
    ...resetContext,
    stateValue:
      nextStepIndex >= resetContext.sequence.length
        ? 'end_gesture'
        : 'start_gesture',
    stepIndex: nextStepIndex,
    activeHand: hand,
    lastAcceptedAt: at,
    candidateGesture: START_GESTURE,
    candidateHand: hand,
    candidateSince: at,
  }
}

function resetSequenceProgress(
  context: HandSequenceContext,
): HandSequenceContext {
  return {
    ...context,
    stateValue: 'no_gesture',
    stepIndex: 0,
    activeHand: null,
    lastAcceptedAt: 0,
  }
}

function getAcceptedStateValue(
  context: HandSequenceContext,
  nextStepIndex: number,
): HandSequenceStateValue {
  if (nextStepIndex >= context.sequence.length) {
    return 'end_gesture'
  }

  if (context.stepIndex === 0) {
    return 'start_gesture'
  }

  return 'sequence_gesture'
}

function normalizeHandSequence(sequence: HandGestureName[]) {
  const normalized = sequence.filter((gesture) => gesture !== 'no_gesture')

  if (!normalized.length) {
    return [...DEFAULT_SEQUENCE]
  }

  if (normalized[0] !== START_GESTURE) {
    normalized.unshift(START_GESTURE)
  }

  if (normalized[normalized.length - 1] !== END_GESTURE) {
    normalized.push(END_GESTURE)
  }

  return normalized
}

function getNow() {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}
