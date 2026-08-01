import { describe, expect, it } from 'vitest'
import { isProxy, reactive } from 'vue'
import {
  formatInputSequence,
  getInputKeysFromKeyboardEvent,
  toSerializableInputSequence,
} from '../input_sequence'

function keyboardEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...overrides,
  } as KeyboardEvent
}

describe('input sequence keyboard capture', () => {
  it('captures a regular key with active modifiers', () => {
    expect(getInputKeysFromKeyboardEvent(keyboardEvent({
      key: 'p',
      code: 'KeyP',
      ctrlKey: true,
      shiftKey: true,
    }))).toEqual(['CONTROL', 'SHIFT', 'P'])
  })

  it('captures Enter and punctuation by physical key code', () => {
    expect(getInputKeysFromKeyboardEvent(keyboardEvent({
      key: 'Enter',
      code: 'Enter',
    }))).toEqual(['ENTER'])
    expect(getInputKeysFromKeyboardEvent(keyboardEvent({
      key: '?',
      code: 'Slash',
      shiftKey: true,
    }))).toEqual(['SHIFT', 'SLASH'])
  })

  it('formats the requested P, delay, Enter sequence', () => {
    expect(formatInputSequence([
      { type: 'keys', keys: ['P'] },
      { type: 'delay', durationMs: 300 },
      { type: 'keys', keys: ['ENTER'] },
    ])).toBe('P → 0.3초 → Enter')
  })

  it('converts Vue proxies into values Electron IPC can structured-clone', () => {
    const reactiveSteps = reactive<InputSequenceStep[]>([
      { type: 'keys', keys: ['P'] },
      { type: 'delay', durationMs: 300 },
      { type: 'keys', keys: ['ENTER'] },
    ])

    const serializable = toSerializableInputSequence(reactiveSteps)

    expect(isProxy(reactiveSteps[0])).toBe(true)
    expect(isProxy(serializable)).toBe(false)
    expect(isProxy(serializable[0])).toBe(false)
    expect(structuredClone(serializable)).toEqual([
      { type: 'keys', keys: ['P'] },
      { type: 'delay', durationMs: 300 },
      { type: 'keys', keys: ['ENTER'] },
    ])
  })
})
