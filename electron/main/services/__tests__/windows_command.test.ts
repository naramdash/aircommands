import { describe, expect, it, vi } from 'vitest'
import {
  executeWindowsCommand,
  getWindowsCommandInputSequence,
  getWindowsCommandLabel,
  isWindowsCommand,
} from '../windows_command'

describe('Windows commands', () => {
  it('maps semantic window and system commands to fixed input chords', () => {
    expect(getWindowsCommandInputSequence('switch-window-next')).toEqual([
      { type: 'keys', keys: ['ALT', 'TAB'] },
    ])
    expect(getWindowsCommandInputSequence('switch-window-previous')).toEqual([
      { type: 'keys', keys: ['ALT', 'SHIFT', 'TAB'] },
    ])
    expect(getWindowsCommandInputSequence('open-screen-snipping')).toEqual([
      { type: 'keys', keys: ['META', 'SHIFT', 'S'] },
    ])
    expect(getWindowsCommandInputSequence('save-full-screenshot')).toEqual([
      { type: 'keys', keys: ['META', 'PRINT_SCREEN'] },
    ])
    expect(getWindowsCommandInputSequence('toggle-screen-recording')).toEqual([
      { type: 'keys', keys: ['META', 'ALT', 'R'] },
    ])
    expect(getWindowsCommandInputSequence('open-game-bar')).toEqual([
      { type: 'keys', keys: ['META', 'G'] },
    ])
    expect(getWindowsCommandInputSequence('show-desktop')).toEqual([
      { type: 'keys', keys: ['META', 'D'] },
    ])
    expect(getWindowsCommandInputSequence('task-view')).toEqual([
      { type: 'keys', keys: ['META', 'TAB'] },
    ])
    expect(getWindowsCommandInputSequence('lock-workstation')).toEqual([
      { type: 'keys', keys: ['META', 'L'] },
    ])
    expect(getWindowsCommandInputSequence('open-action-center')).toEqual([
      { type: 'keys', keys: ['META', 'A'] },
    ])
    expect(getWindowsCommandInputSequence('open-file-explorer')).toEqual([
      { type: 'keys', keys: ['META', 'E'] },
    ])
    expect(getWindowsCommandInputSequence('open-clipboard-history')).toEqual([
      { type: 'keys', keys: ['META', 'V'] },
    ])
    expect(getWindowsCommandInputSequence('open-emoji-picker')).toEqual([
      { type: 'keys', keys: ['META', 'PERIOD'] },
    ])

    expect(getWindowsCommandLabel('open-screen-snipping')).toBe('화면 캡처 열기')
    expect(getWindowsCommandLabel('save-full-screenshot')).toBe('전체 화면 캡처 및 즉시 저장')
    expect(getWindowsCommandLabel('toggle-screen-recording')).toBe('화면 녹화 시작 / 중지')
    expect(getWindowsCommandLabel('show-desktop')).toBe('바탕화면 보기 / 복원')
    expect(getWindowsCommandLabel('lock-workstation')).toBe('컴퓨터 잠금')
  })

  it('validates persisted command names', () => {
    expect(isWindowsCommand('switch-window-next')).toBe(true)
    expect(isWindowsCommand('show-desktop')).toBe(true)
    expect(isWindowsCommand('lock-workstation')).toBe(true)
    expect(isWindowsCommand('run-arbitrary-command')).toBe(false)
  })

  it('executes only on Windows through the input sequence executor', async () => {
    const executeInputSequence = vi.fn(async () => undefined)

    await executeWindowsCommand('switch-window-next', {
      platform: 'win32',
      executeInputSequence,
    })

    expect(executeInputSequence).toHaveBeenCalledWith([
      { type: 'keys', keys: ['ALT', 'TAB'] },
    ])

    await expect(executeWindowsCommand('switch-window-next', {
      platform: 'darwin',
      executeInputSequence,
    })).rejects.toThrow('UNSUPPORTED_WINDOWS_COMMAND_PLATFORM')
    expect(executeInputSequence).toHaveBeenCalledOnce()
  })
})
