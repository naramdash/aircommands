import type {
  FingerDefinition,
  FingerName,
  GestureCommand,
  GestureName,
  OneHandGestureCommand,
  OneHandTouchGestureName,
  OneHandTouchFingerName,
} from './types'

export const fingerDefinitions: FingerDefinition[] = [
  {
    name: 'thumb',
    label: '엄지',
    shortLabel: '엄',
    landmarkIndex: 4,
  },
  {
    name: 'index',
    label: '검지',
    shortLabel: '검',
    landmarkIndex: 8,
  },
  {
    name: 'middle',
    label: '중지',
    shortLabel: '중',
    landmarkIndex: 12,
  },
  {
    name: 'ring',
    label: '약지',
    shortLabel: '약',
    landmarkIndex: 16,
  },
  {
    name: 'pinky',
    label: '새끼',
    shortLabel: '새',
    landmarkIndex: 20,
  },
]

const oneHandTouchFingerNames: OneHandTouchFingerName[] = [
  'index',
  'middle',
  'ring',
]

export const oneHandTouchGestureCommands: OneHandGestureCommand[] =
  (['Left', 'Right'] as const).flatMap((hand) => {
    return oneHandTouchFingerNames.map((fingerName) => {
      const thumb = getRequiredFingerDefinition('thumb')
      const finger = getRequiredFingerDefinition(fingerName)
      const handPrefix = hand === 'Left' ? 'left' : 'right'
      const handLabel = hand === 'Left' ? '왼손' : '오른손'
      const gesture = `touch_${handPrefix}_thumb_${fingerName}` as OneHandTouchGestureName

      return {
        gesture,
        gestureLabel: `${handLabel} ${thumb.label} + ${finger.label}`,
        mark: `${handLabel[0]} ${thumb.shortLabel}+${finger.shortLabel}`,
        hand,
        primaryFinger: 'thumb',
        secondaryFinger: fingerName,
      }
    })
  })

export const touchGestureCommands: GestureCommand[] = [
  ...oneHandTouchGestureCommands,
]

export const gestureCommands = Object.fromEntries(
  touchGestureCommands.map((command) => [command.gesture, command]),
) as Record<GestureName, GestureCommand>

export function getFingerDefinition(finger: FingerName) {
  return fingerDefinitions.find((definition) => definition.name === finger)
}

function getRequiredFingerDefinition(finger: FingerName) {
  const definition = getFingerDefinition(finger)

  if (!definition) {
    throw new Error(`Missing finger definition for ${finger}`)
  }

  return definition
}

export function mapGestureToCommand(gesture: GestureName): GestureCommand {
  return gestureCommands[gesture]
}
