import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export type Handedness = 'Left' | 'Right' | 'Unknown'

export type HandednessCategory = {
  categoryName?: string
  displayName?: string
}

export type Point2D = {
  x: number
  y: number
  z?: number
}

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'
export type OneHandTouchFingerName = 'index' | 'middle' | 'ring'
export type OneHandTouchHand = 'left' | 'right'

export type TwoHandTouchGestureName = `touch_left_${FingerName}_right_${FingerName}`
export type OneHandTouchGestureName =
  `touch_${OneHandTouchHand}_thumb_${OneHandTouchFingerName}`

export type GestureName = TwoHandTouchGestureName | OneHandTouchGestureName

export type FingerDefinition = {
  name: FingerName
  label: string
  shortLabel: string
  landmarkIndex: number
}

export type AppName =
  | 'chrome'
  | 'notepad'
  | 'vscode'
  | 'terminal'
  | 'paint'
  | 'word'
  | 'spotify'

export type BaseGestureCommand = {
  gesture: GestureName
  app: AppName
  label: string
  gestureLabel: string
  mark: string
}

export type TwoHandGestureCommand = BaseGestureCommand & {
  contactType: 'two_hand'
  gesture: TwoHandTouchGestureName
  leftFinger: FingerName
  rightFinger: FingerName
}

export type OneHandGestureCommand = BaseGestureCommand & {
  contactType: 'one_hand'
  gesture: OneHandTouchGestureName
  hand: Exclude<Handedness, 'Unknown'>
  primaryFinger: 'thumb'
  secondaryFinger: OneHandTouchFingerName
}

export type GestureCommand = TwoHandGestureCommand | OneHandGestureCommand

export type GestureCandidate = GestureCommand & {
  confidence: number
  detectedAt: number
  gestureStartedAt: number
  gestureEndedAt: number
}

export type RecognitionState =
  | 'tracking'
  | 'touching'
  | 'candidate'
  | 'executing'
  | 'cooldown'
  | 'error'

export type HandFrame = {
  landmarks: NormalizedLandmark[] | null
  handedness: Handedness
  at: number
}

export type FingerTip = {
  finger: FingerName
  label: string
  shortLabel: string
  point: Point2D
}

export type HandPoseQuality = {
  isAcceptable: boolean
  reason: 'ok' | 'palm_edge_on' | 'fist_closed' | 'fingertips_overlapped'
  projectedPalmQuality: number
  fingertipSpread: number
  foldedFingerCount: number
}

export type TouchContact = {
  gesture: GestureName
  contactType: 'two_hand' | 'one_hand'
  hand: Handedness | 'Both'
  primaryFinger: FingerName
  secondaryFinger: FingerName
  leftFinger?: FingerName
  rightFinger?: FingerName
  leftPoint: Point2D
  rightPoint: Point2D
  primaryPoint: Point2D
  secondaryPoint: Point2D
  midpoint: Point2D
  normalizedDistance: number
  confidence: number
}

export type TwoHandTouchFrame = {
  at: number
  leftHandVisible: boolean
  rightHandVisible: boolean
  leftTips: FingerTip[]
  rightTips: FingerTip[]
  leftPoseQuality: HandPoseQuality | null
  rightPoseQuality: HandPoseQuality | null
  closestContact: TouchContact | null
}
