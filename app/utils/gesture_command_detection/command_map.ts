import type {
  AppName,
  FingerDefinition,
  FingerName,
  GestureCommand,
  GestureName,
  OneHandGestureCommand,
  OneHandTouchFingerName,
  TwoHandGestureCommand,
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

const appCycle: Array<{
  app: AppName
  label: string
}> = [
  { app: 'chrome', label: 'Chrome 실행' },
  { app: 'notepad', label: '메모장 실행' },
  { app: 'vscode', label: 'VS Code 실행' },
  { app: 'terminal', label: '터미널 실행' },
  { app: 'paint', label: '그림판 실행' },
  { app: 'word', label: 'Word 실행' },
  { app: 'spotify', label: 'Spotify 실행' },
]

const oneHandTouchFingerNames: OneHandTouchFingerName[] = [
  'index',
  'middle',
  'ring',
]

export const twoHandTouchGestureCommands: TwoHandGestureCommand[] =
  fingerDefinitions.flatMap((leftFinger, leftIndex) => {
    return fingerDefinitions.map((rightFinger, rightIndex) => {
      const appCommand =
        appCycle[(leftIndex * fingerDefinitions.length + rightIndex) % appCycle.length]
      const gesture =
        `touch_left_${leftFinger.name}_right_${rightFinger.name}` as const

      return {
        contactType: 'two_hand',
        gesture,
        gestureLabel: `왼손 ${leftFinger.label} + 오른손 ${rightFinger.label}`,
        label: appCommand.label,
        app: appCommand.app,
        mark: `${leftFinger.shortLabel}+${rightFinger.shortLabel}`,
        leftFinger: leftFinger.name,
        rightFinger: rightFinger.name,
      }
    })
  })

export const oneHandTouchGestureCommands: OneHandGestureCommand[] =
  (['Left', 'Right'] as const).flatMap((hand, handIndex) => {
    return oneHandTouchFingerNames.map((fingerName, fingerIndex) => {
      const thumb = getRequiredFingerDefinition('thumb')
      const finger = getRequiredFingerDefinition(fingerName)
      const commandIndex =
        twoHandTouchGestureCommands.length +
        handIndex * oneHandTouchFingerNames.length +
        fingerIndex
      const appCommand = appCycle[commandIndex % appCycle.length]
      const handPrefix = hand === 'Left' ? 'left' : 'right'
      const handLabel = hand === 'Left' ? '왼손' : '오른손'
      const gesture = `touch_${handPrefix}_thumb_${finger.name}` as const

      return {
        contactType: 'one_hand',
        gesture,
        gestureLabel: `${handLabel} ${thumb.label} + ${finger.label}`,
        label: appCommand.label,
        app: appCommand.app,
        mark: `${handLabel[0]} ${thumb.shortLabel}+${finger.shortLabel}`,
        hand,
        primaryFinger: 'thumb',
        secondaryFinger: finger.name,
      }
    })
  })

export const touchGestureCommands: GestureCommand[] = [
  ...twoHandTouchGestureCommands,
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
