import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export type Handedness = 'Left' | 'Right' | 'Unknown'

export type HandednessCategory = {
  categoryName?: string
  displayName?: string
}

export type PointerTrailPoint = {
  x: number
  y: number
  at: number
}

export type GestureName =
  | 'swipe_up'
  | 'swipe_down'
  | 'swipe_left'
  | 'swipe_right'
  | 'swipe_up_left'
  | 'swipe_up_right'
  | 'swipe_down_left'
  | 'swipe_down_right'
  | 'shape_v'
  | 'shape_w'
  | 'shape_s'

export type SwipeDirection =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'up_left'
  | 'up_right'
  | 'down_left'
  | 'down_right'

export type ShapeGesture = 'v' | 'w' | 's'

export type AppName =
  | 'chrome'
  | 'notepad'
  | 'vscode'
  | 'terminal'
  | 'paint'
  | 'word'
  | 'spotify'

export type GestureCommand = {
  gesture: GestureName
  app: AppName
  label: string
  gestureLabel: string
  mark: string
}

export type GestureCandidate = GestureCommand & {
  confidence: number
  detectedAt: number
  gestureStartedAt: number
  gestureEndedAt: number
}

export type RecognitionState =
  | 'tracking'
  | 'ready_to_start'
  | 'drawing'
  | 'stroke_ended'
  | 'candidate'
  | 'confirming'
  | 'executing'
  | 'cooldown'
  | 'error'

export type HandFrame = {
  landmarks: NormalizedLandmark[] | null
  handedness: Handedness
  at: number
}

export type SwipeDetectionResult =
  | {
      detected: true
      gesture: Extract<
        GestureName,
        | 'swipe_up'
        | 'swipe_down'
        | 'swipe_left'
        | 'swipe_right'
        | 'swipe_up_left'
        | 'swipe_up_right'
        | 'swipe_down_left'
        | 'swipe_down_right'
      >
      direction: SwipeDirection
      confidence: number
      startedAt: number
      endedAt: number
    }
  | {
      detected: false
      reason:
        | 'not_enough_points'
        | 'too_short'
        | 'too_slow'
        | 'too_fast'
        | 'too_diagonal'
        | 'direction_unstable'
    }

export type ShapeDetectionResult =
  | {
      detected: true
      gesture: Extract<GestureName, 'shape_v' | 'shape_w' | 'shape_s'>
      shape: ShapeGesture
      confidence: number
      startedAt: number
      endedAt: number
    }
  | {
      detected: false
      reason:
        | 'not_enough_points'
        | 'too_short'
        | 'too_slow'
        | 'too_flat'
        | 'too_line_like'
        | 'low_confidence'
    }

export type GestureDetectionResult =
  | {
      detected: true
      gesture: GestureName
      confidence: number
      startedAt: number
      endedAt: number
    }
  | {
      detected: false
      reason: SwipeDetectionResult['reason'] | ShapeDetectionResult['reason']
    }
