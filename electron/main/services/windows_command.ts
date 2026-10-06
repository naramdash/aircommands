import {
  executeWindowsInputSequence,
} from './windows_input_sequence'
import type { InputSequenceStep } from './input_sequence'

export const WINDOWS_COMMANDS = [
  'switch-window-next',
  'switch-window-previous',
  'open-screen-snipping',
  'save-full-screenshot',
  'toggle-screen-recording',
  'open-game-bar',
  'show-desktop',
  'task-view',
  'lock-workstation',
  'open-action-center',
  'open-file-explorer',
  'open-clipboard-history',
  'open-emoji-picker',
] as const

export type WindowsCommand = typeof WINDOWS_COMMANDS[number]

type WindowsCommandOptions = {
  platform?: NodeJS.Platform
  executeInputSequence?: (steps: InputSequenceStep[]) => Promise<void>
}

const WINDOWS_COMMAND_SET = new Set<string>(WINDOWS_COMMANDS)

export function isWindowsCommand(value: unknown): value is WindowsCommand {
  return typeof value === 'string' && WINDOWS_COMMAND_SET.has(value)
}

export function getWindowsCommandLabel(command: WindowsCommand): string {
  if (command === 'switch-window-next') return '다음 창으로 전환'
  if (command === 'switch-window-previous') return '이전 창으로 전환'
  if (command === 'open-screen-snipping') return '화면 캡처 열기'
  if (command === 'save-full-screenshot') return '전체 화면 캡처 및 즉시 저장'
  if (command === 'toggle-screen-recording') return '화면 녹화 시작 / 중지'
  if (command === 'open-game-bar') return '게임 바 (녹화 / 오디오) 열기'
  if (command === 'show-desktop') return '바탕화면 보기 / 복원'
  if (command === 'task-view') return '작업 보기 (Task View)'
  if (command === 'lock-workstation') return '컴퓨터 잠금'
  if (command === 'open-action-center') return '알림 센터 / 빠른 설정'
  if (command === 'open-file-explorer') return '파일 탐색기 열기'
  if (command === 'open-clipboard-history') return '클립보드 기록 열기'
  return '이모지 창 열기'
}

export function getWindowsCommandInputSequence(command: WindowsCommand): InputSequenceStep[] {
  if (command === 'switch-window-next') {
    return [{ type: 'keys', keys: ['ALT', 'TAB'] }]
  }
  if (command === 'switch-window-previous') {
    return [{ type: 'keys', keys: ['ALT', 'SHIFT', 'TAB'] }]
  }
  if (command === 'open-screen-snipping') {
    return [{ type: 'keys', keys: ['META', 'SHIFT', 'S'] }]
  }
  if (command === 'save-full-screenshot') {
    return [{ type: 'keys', keys: ['META', 'PRINT_SCREEN'] }]
  }
  if (command === 'toggle-screen-recording') {
    return [{ type: 'keys', keys: ['META', 'ALT', 'R'] }]
  }
  if (command === 'open-game-bar') {
    return [{ type: 'keys', keys: ['META', 'G'] }]
  }
  if (command === 'show-desktop') {
    return [{ type: 'keys', keys: ['META', 'D'] }]
  }
  if (command === 'task-view') {
    return [{ type: 'keys', keys: ['META', 'TAB'] }]
  }
  if (command === 'lock-workstation') {
    return [{ type: 'keys', keys: ['META', 'L'] }]
  }
  if (command === 'open-action-center') {
    return [{ type: 'keys', keys: ['META', 'A'] }]
  }
  if (command === 'open-file-explorer') {
    return [{ type: 'keys', keys: ['META', 'E'] }]
  }
  if (command === 'open-clipboard-history') {
    return [{ type: 'keys', keys: ['META', 'V'] }]
  }
  return [{ type: 'keys', keys: ['META', 'PERIOD'] }]
}

export async function executeWindowsCommand(
  command: WindowsCommand,
  options: WindowsCommandOptions = {},
): Promise<void> {
  if ((options.platform ?? process.platform) !== 'win32') {
    throw new Error('UNSUPPORTED_WINDOWS_COMMAND_PLATFORM')
  }

  const sequence = getWindowsCommandInputSequence(command)
  if (options.executeInputSequence) {
    await options.executeInputSequence(sequence)
    return
  }

  await executeWindowsInputSequence(sequence)
}
