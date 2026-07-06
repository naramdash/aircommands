import { mapGestureToCommand } from './command_map'
import { isTouchEntered, isTouchStillActive } from './touch_detection'
import type {
  GestureCandidate,
  RecognitionState,
  TouchContact,
  TwoHandTouchFrame,
} from './types'

export const TOUCH_HOLD_MS = 280
export const COOLDOWN_MS = 1500

export type RecognitionContext = {
  state: RecognitionState
  candidate: GestureCandidate | null
  activeTouch: TouchContact | null
  touchStartedAt: number
  touchProgress: number
  lastExecutedAt: number
  cooldownUntil: number
  errorMessage: string
}

export type RecognitionFrameResult = {
  context: RecognitionContext
  executionCandidate: GestureCandidate | null
}

export function createRecognitionContext(): RecognitionContext {
  return {
    state: 'tracking',
    candidate: null,
    activeTouch: null,
    touchStartedAt: 0,
    touchProgress: 0,
    lastExecutedAt: 0,
    cooldownUntil: 0,
    errorMessage: '',
  }
}

export function reduceRecognitionFrame(
  context: RecognitionContext,
  frame: TwoHandTouchFrame | null,
  now: number,
): RecognitionFrameResult {
  if (context.cooldownUntil > now) {
    return {
      context: {
        ...resetTouch(context),
        state: 'cooldown',
      },
      executionCandidate: null,
    }
  }

  if (!frame || (!frame.leftHandVisible && !frame.rightHandVisible)) {
    return {
      context: resetTouch(context),
      executionCandidate: null,
    }
  }

  const contact = frame.closestContact
  if (!contact) {
    return {
      context: resetTouch(context),
      executionCandidate: null,
    }
  }

  if (context.activeTouch) {
    const isSameTouch = context.activeTouch.gesture === contact.gesture
    const isStillActive = isSameTouch && isTouchStillActive(contact)

    if (!isStillActive) {
      if (!isTouchEntered(contact)) {
        return {
          context: resetTouch(context),
          executionCandidate: null,
        }
      }

      return startTouch(context, contact, now)
    }

    const progress = Math.min(1, (now - context.touchStartedAt) / TOUCH_HOLD_MS)

    if (progress < 1) {
      return {
        context: {
          ...context,
          state: 'touching',
          activeTouch: contact,
          candidate: null,
          touchProgress: progress,
          errorMessage: '',
        },
        executionCandidate: null,
      }
    }

    const command = mapGestureToCommand(contact.gesture)
    const candidate: GestureCandidate = {
      ...command,
      confidence: contact.confidence,
      detectedAt: now,
      gestureStartedAt: context.touchStartedAt,
      gestureEndedAt: now,
    }

    return {
      context: {
        ...resetTouch(context),
        state: 'cooldown',
        lastExecutedAt: now,
        cooldownUntil: now + COOLDOWN_MS,
        errorMessage: '',
      },
      executionCandidate: candidate,
    }
  }

  if (!isTouchEntered(contact)) {
    return {
      context: {
        ...resetTouch(context),
        state: 'tracking',
      },
      executionCandidate: null,
    }
  }

  return startTouch(context, contact, now)
}

export function markExecutionSuccess(
  context: RecognitionContext,
  now: number,
): RecognitionContext {
  return {
    ...resetTouch(context),
    state: 'cooldown',
    lastExecutedAt: now,
    cooldownUntil: now + COOLDOWN_MS,
    errorMessage: '',
  }
}

export function markExecutionFailure(
  context: RecognitionContext,
  now: number,
  message: string,
): RecognitionContext {
  return {
    ...resetTouch(context),
    state: 'cooldown',
    lastExecutedAt: now,
    cooldownUntil: now + COOLDOWN_MS,
    errorMessage: message,
  }
}

function startTouch(
  context: RecognitionContext,
  contact: TouchContact,
  now: number,
): RecognitionFrameResult {
  return {
    context: {
      ...context,
      state: 'touching',
      candidate: null,
      activeTouch: contact,
      touchStartedAt: now,
      touchProgress: 0,
      errorMessage: '',
    },
    executionCandidate: null,
  }
}

function resetTouch(context: RecognitionContext): RecognitionContext {
  return {
    ...context,
    state: 'tracking',
    candidate: null,
    activeTouch: null,
    touchStartedAt: 0,
    touchProgress: 0,
    errorMessage: '',
  }
}
