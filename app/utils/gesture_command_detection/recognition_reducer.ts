import { getConfirmationProgress } from './confirmation'
import { mapGestureToCommand } from './command_map'
import { detectShapeGesture, SHAPE_MAX_DURATION_MS } from './path_shape'
import { detectSwipeStroke } from './swipe'
import type {
  GestureCandidate,
  GestureDetectionResult,
  PointerTrailPoint,
} from './types'

export const CANDIDATE_TIMEOUT_MS = 1200
export const COOLDOWN_MS = 2000
export const STROKE_START_DISTANCE = 0.025
export const STROKE_MOVEMENT_DISTANCE = 0.01
export const STROKE_IDLE_MS = 320
export const STROKE_END_DISPLAY_MS = 220
export const STROKE_MAX_DURATION_MS = SHAPE_MAX_DURATION_MS

export type StrokeEndReason = 'idle' | 'timeout'

export type RecognitionContext = {
  state:
    | 'tracking'
    | 'ready_to_start'
    | 'drawing'
    | 'stroke_ended'
    | 'candidate'
    | 'confirming'
    | 'executing'
    | 'cooldown'
    | 'error'
  candidate: GestureCandidate | null
  strokeAnchor: PointerTrailPoint | null
  strokePoints: PointerTrailPoint[]
  strokeStartedAt: number
  strokeLastMovementAt: number
  strokeStartProgress: number
  completedStrokePoints: PointerTrailPoint[]
  strokeEndedAt: number
  strokeEndReason: StrokeEndReason | null
  confirmationProgress: number
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
    strokeAnchor: null,
    strokePoints: [],
    strokeStartedAt: 0,
    strokeLastMovementAt: 0,
    strokeStartProgress: 0,
    completedStrokePoints: [],
    strokeEndedAt: 0,
    strokeEndReason: null,
    confirmationProgress: 0,
    lastExecutedAt: 0,
    cooldownUntil: 0,
    errorMessage: '',
  }
}

export function reduceRecognitionFrame(
  context: RecognitionContext,
  points: PointerTrailPoint[],
  now: number,
  rightHandVisible: boolean,
): RecognitionFrameResult {
  if (context.state === 'executing') {
    return { context, executionCandidate: null }
  }

  if (context.cooldownUntil > now) {
    return {
      context: {
        ...context,
        state: 'cooldown',
        candidate: null,
        confirmationProgress: 0,
        strokeAnchor: null,
        strokePoints: [],
        strokeStartedAt: 0,
        strokeLastMovementAt: 0,
        strokeStartProgress: 0,
        completedStrokePoints: [],
        strokeEndedAt: 0,
        strokeEndReason: null,
      },
      executionCandidate: null,
    }
  }

  if (!rightHandVisible) {
    return {
      context: {
        ...context,
        state: 'tracking',
        candidate: null,
        confirmationProgress: 0,
        strokeAnchor: null,
        strokePoints: [],
        strokeStartedAt: 0,
        strokeLastMovementAt: 0,
        strokeStartProgress: 0,
        completedStrokePoints: [],
        strokeEndedAt: 0,
        strokeEndReason: null,
        errorMessage: '',
      },
      executionCandidate: null,
    }
  }

  if (context.candidate) {
    if (now - context.candidate.detectedAt > CANDIDATE_TIMEOUT_MS) {
      return {
        context: {
          ...context,
          state: 'tracking',
          candidate: null,
          confirmationProgress: 0,
          strokeAnchor: null,
          strokePoints: [],
          strokeStartedAt: 0,
          strokeLastMovementAt: 0,
          strokeStartProgress: 0,
          completedStrokePoints: [],
          strokeEndedAt: 0,
          strokeEndReason: null,
        },
        executionCandidate: null,
      }
    }

    const confirmation = getConfirmationProgress(
      points,
      context.candidate.detectedAt,
      now,
    )

    if (confirmation.reason === 'moved_too_far') {
      return {
        context: {
          ...context,
          state: 'tracking',
          candidate: null,
          confirmationProgress: 0,
          strokeAnchor: null,
          strokePoints: [],
          strokeStartedAt: 0,
          strokeLastMovementAt: 0,
          strokeStartProgress: 0,
          completedStrokePoints: [],
          strokeEndedAt: 0,
          strokeEndReason: null,
        },
        executionCandidate: null,
      }
    }

    if (confirmation.confirmed) {
      return {
        context: {
          ...context,
          state: 'executing',
          confirmationProgress: 1,
        },
        executionCandidate: context.candidate,
      }
    }

    return {
      context: {
        ...context,
        state: confirmation.progress > 0 ? 'confirming' : 'candidate',
        confirmationProgress: confirmation.progress,
      },
      executionCandidate: null,
    }
  }

  if (context.state === 'stroke_ended') {
    if (now - context.strokeEndedAt < STROKE_END_DISPLAY_MS) {
      return { context, executionCandidate: null }
    }

    const gesture = detectCompletedStroke(context.completedStrokePoints)
    if (!gesture.detected) {
      return {
        context: resetStroke(context),
        executionCandidate: null,
      }
    }

    const command = mapGestureToCommand(gesture.gesture)
    return {
      context: {
        ...resetStroke(context),
        state: 'candidate',
        candidate: {
          ...command,
          confidence: gesture.confidence,
          detectedAt: now,
          gestureStartedAt: gesture.startedAt,
          gestureEndedAt: gesture.endedAt,
        },
        confirmationProgress: 0,
        errorMessage: '',
      },
      executionCandidate: null,
    }
  }

  const currentPoint = points[points.length - 1]
  if (!currentPoint) {
    return {
      context: resetStroke(context),
      executionCandidate: null,
    }
  }

  const strokeResult = reduceStrokeFrame(context, currentPoint, now)
  if (!strokeResult.completedStroke) {
    return {
      context: strokeResult.context,
      executionCandidate: null,
    }
  }

  return {
    context: {
      ...strokeResult.context,
      state: 'stroke_ended',
      completedStrokePoints: strokeResult.completedStroke,
      strokeEndedAt: now,
      strokeEndReason: strokeResult.endReason,
      confirmationProgress: 0,
      errorMessage: '',
    },
    executionCandidate: null,
  }
}

export function markExecutionSuccess(
  context: RecognitionContext,
  now: number,
): RecognitionContext {
  return {
    ...context,
    state: 'cooldown',
    candidate: null,
    confirmationProgress: 0,
    lastExecutedAt: now,
    cooldownUntil: now + COOLDOWN_MS,
    strokeAnchor: null,
    strokePoints: [],
    strokeStartedAt: 0,
    strokeLastMovementAt: 0,
    strokeStartProgress: 0,
    completedStrokePoints: [],
    strokeEndedAt: 0,
    strokeEndReason: null,
    errorMessage: '',
  }
}

export function markExecutionFailure(
  context: RecognitionContext,
  now: number,
  message: string,
): RecognitionContext {
  return {
    ...context,
    state: 'cooldown',
    candidate: null,
    confirmationProgress: 0,
    lastExecutedAt: now,
    cooldownUntil: now + COOLDOWN_MS,
    strokeAnchor: null,
    strokePoints: [],
    strokeStartedAt: 0,
    strokeLastMovementAt: 0,
    strokeStartProgress: 0,
    completedStrokePoints: [],
    strokeEndedAt: 0,
    strokeEndReason: null,
    errorMessage: message,
  }
}

function reduceStrokeFrame(
  context: RecognitionContext,
  currentPoint: PointerTrailPoint,
  now: number,
): {
  context: RecognitionContext
  completedStroke: PointerTrailPoint[] | null
  endReason: StrokeEndReason | null
} {
  if (context.strokePoints.length === 0) {
    if (!context.strokeAnchor) {
      return {
        context: {
          ...context,
          state: 'ready_to_start',
          strokeAnchor: currentPoint,
          strokeStartProgress: 0,
          confirmationProgress: 0,
          errorMessage: '',
        },
        completedStroke: null,
        endReason: null,
      }
    }

    const startDistance = getDistance(context.strokeAnchor, currentPoint)
    if (startDistance < STROKE_START_DISTANCE) {
      return {
        context: {
          ...context,
          state: 'ready_to_start',
          strokeStartProgress: Math.min(1, startDistance / STROKE_START_DISTANCE),
          confirmationProgress: 0,
          errorMessage: '',
        },
        completedStroke: null,
        endReason: null,
      }
    }

    return {
      context: {
        ...context,
        state: 'drawing',
        strokePoints: [context.strokeAnchor, currentPoint],
        strokeStartedAt: context.strokeAnchor.at,
        strokeLastMovementAt: now,
        strokeStartProgress: 1,
        confirmationProgress: 0,
        errorMessage: '',
      },
      completedStroke: null,
      endReason: null,
    }
  }

  const previousPoint = context.strokePoints[context.strokePoints.length - 1]
  const moved = getDistance(previousPoint, currentPoint) >= STROKE_MOVEMENT_DISTANCE
  const strokePoints = moved
    ? [...context.strokePoints, currentPoint]
    : context.strokePoints
  const strokeLastMovementAt = moved ? now : context.strokeLastMovementAt
  const isIdle = now - strokeLastMovementAt >= STROKE_IDLE_MS
  const isOverMaxDuration = now - context.strokeStartedAt >= STROKE_MAX_DURATION_MS

  if (isIdle || isOverMaxDuration) {
    return {
      context: {
        ...context,
        state: 'stroke_ended',
        strokePoints,
        strokeLastMovementAt,
      },
      completedStroke: strokePoints,
      endReason: isIdle ? 'idle' : 'timeout',
    }
  }

  return {
    context: {
      ...context,
      state: 'drawing',
      strokePoints,
      strokeLastMovementAt,
      strokeStartProgress: 1,
      confirmationProgress: 0,
      errorMessage: '',
    },
    completedStroke: null,
    endReason: null,
  }
}

function detectCompletedStroke(
  strokePoints: PointerTrailPoint[],
): GestureDetectionResult {
  const shape = detectShapeGesture(strokePoints)
  if (shape.detected) {
    return {
      detected: true,
      gesture: shape.gesture,
      confidence: shape.confidence,
      startedAt: shape.startedAt,
      endedAt: shape.endedAt,
    }
  }

  const swipe = detectSwipeStroke(strokePoints)
  if (swipe.detected) {
    return {
      detected: true,
      gesture: swipe.gesture,
      confidence: swipe.confidence,
      startedAt: swipe.startedAt,
      endedAt: swipe.endedAt,
    }
  }

  return swipe
}

function resetStroke(context: RecognitionContext): RecognitionContext {
  return {
    ...context,
    state: 'tracking',
    confirmationProgress: 0,
    errorMessage: '',
    strokeAnchor: null,
    strokePoints: [],
    strokeStartedAt: 0,
    strokeLastMovementAt: 0,
    strokeStartProgress: 0,
    completedStrokePoints: [],
    strokeEndedAt: 0,
    strokeEndReason: null,
  }
}

function getDistance(first: PointerTrailPoint, second: PointerTrailPoint) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}
