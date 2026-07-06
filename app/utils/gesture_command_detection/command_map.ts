import type { GestureCommand, GestureName } from './types'

export const gestureCommands = {
  swipe_up: {
    gesture: 'swipe_up',
    gestureLabel: '검지 위로 스와이프',
    label: 'Chrome 실행',
    app: 'chrome',
    mark: '↑',
  },
  swipe_down: {
    gesture: 'swipe_down',
    gestureLabel: '검지 아래로 스와이프',
    label: '메모장 실행',
    app: 'notepad',
    mark: '↓',
  },
  swipe_right: {
    gesture: 'swipe_right',
    gestureLabel: '검지 오른쪽 스와이프',
    label: 'VS Code 실행',
    app: 'vscode',
    mark: '→',
  },
  swipe_left: {
    gesture: 'swipe_left',
    gestureLabel: '검지 왼쪽 스와이프',
    label: '터미널 실행',
    app: 'terminal',
    mark: '←',
  },
  swipe_up_left: {
    gesture: 'swipe_up_left',
    gestureLabel: '검지 왼쪽 위 대각선 스와이프',
    label: '터미널 실행',
    app: 'terminal',
    mark: '↖',
  },
  swipe_up_right: {
    gesture: 'swipe_up_right',
    gestureLabel: '검지 오른쪽 위 대각선 스와이프',
    label: 'Chrome 실행',
    app: 'chrome',
    mark: '↗',
  },
  swipe_down_left: {
    gesture: 'swipe_down_left',
    gestureLabel: '검지 왼쪽 아래 대각선 스와이프',
    label: '메모장 실행',
    app: 'notepad',
    mark: '↙',
  },
  swipe_down_right: {
    gesture: 'swipe_down_right',
    gestureLabel: '검지 오른쪽 아래 대각선 스와이프',
    label: 'VS Code 실행',
    app: 'vscode',
    mark: '↘',
  },
  shape_v: {
    gesture: 'shape_v',
    gestureLabel: '검지로 V 그리기',
    label: '그림판 실행',
    app: 'paint',
    mark: 'V',
  },
  shape_w: {
    gesture: 'shape_w',
    gestureLabel: '검지로 W 그리기',
    label: 'Word 실행',
    app: 'word',
    mark: 'W',
  },
  shape_s: {
    gesture: 'shape_s',
    gestureLabel: '검지로 S 그리기',
    label: 'Spotify 실행',
    app: 'spotify',
    mark: 'S',
  },
} as const satisfies Record<GestureName, GestureCommand>

export function mapGestureToCommand(gesture: GestureName): GestureCommand {
  return gestureCommands[gesture]
}
