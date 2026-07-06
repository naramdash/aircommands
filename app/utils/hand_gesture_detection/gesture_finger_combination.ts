import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { HandGestureName } from '../hand_sequence_state_machine'
import { getFingerStates, type FingerName } from './hand_pose'

const fingerCombinationRequirements = {
  gesture_index_point: {
    extended: ['index'],
    folded: ['middle', 'ring', 'pinky'],
  },
  gesture_middle_point: {
    extended: ['middle'],
    folded: ['index', 'ring', 'pinky'],
  },
  gesture_pinky_point: {
    extended: ['pinky'],
    folded: ['index', 'middle', 'ring'],
  },
  gesture_peace: {
    extended: ['index', 'middle'],
    folded: ['ring', 'pinky'],
  },
  gesture_rock: {
    extended: ['index', 'pinky'],
    folded: ['middle', 'ring'],
  },
  gesture_three: {
    extended: ['index', 'middle', 'ring'],
    folded: ['pinky'],
  },
} satisfies Record<
  string,
  {
    extended: FingerName[]
    folded: FingerName[]
  }
>

export const fingerCombinationGestures = Object.keys(
  fingerCombinationRequirements,
) as HandGestureName[]

export function isFingerCombinationGesture(
  landmarks: NormalizedLandmark[],
  gesture: HandGestureName,
) {
  const requirement =
    fingerCombinationRequirements[
      gesture as keyof typeof fingerCombinationRequirements
    ]

  if (!requirement) return false

  const states = getFingerStates(landmarks)
  if (!states) return false

  return (
    requirement.extended.every((finger) => states[finger].extended) &&
    requirement.folded.every((finger) => states[finger].folded)
  )
}
