export const INPUT_KEYS = [
  'CONTROL',
  'ALT',
  'SHIFT',
  'META',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'0123456789'.split(''),
  'ENTER',
  'SPACE',
  'TAB',
  'ESCAPE',
  'BACKSPACE',
  'DELETE',
  'INSERT',
  'HOME',
  'END',
  'PAGE_UP',
  'PAGE_DOWN',
  'ARROW_UP',
  'ARROW_DOWN',
  'ARROW_LEFT',
  'ARROW_RIGHT',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'BACKQUOTE',
  'MINUS',
  'EQUAL',
  'BRACKET_LEFT',
  'BRACKET_RIGHT',
  'BACKSLASH',
  'SEMICOLON',
  'QUOTE',
  'COMMA',
  'PERIOD',
  'SLASH',
] as const

export type InputKey = typeof INPUT_KEYS[number]

export type InputSequenceStep =
  | { type: 'keys', keys: InputKey[] }
  | { type: 'delay', durationMs: number }

export const MAX_INPUT_SEQUENCE_STEPS = 32
export const MAX_INPUT_SEQUENCE_KEYS = 5
export const MIN_INPUT_SEQUENCE_DELAY_MS = 10
export const MAX_INPUT_SEQUENCE_DELAY_MS = 10_000
export const MAX_INPUT_SEQUENCE_TOTAL_DELAY_MS = 30_000

const INPUT_KEY_SET = new Set<string>(INPUT_KEYS)
const MODIFIER_ORDER: InputKey[] = ['CONTROL', 'ALT', 'SHIFT', 'META']
const KEY_LABELS: Partial<Record<InputKey, string>> = {
  CONTROL: 'Ctrl',
  ALT: 'Alt',
  SHIFT: 'Shift',
  META: 'Win',
  ENTER: 'Enter',
  SPACE: 'Space',
  TAB: 'Tab',
  ESCAPE: 'Esc',
  BACKSPACE: 'Backspace',
  DELETE: 'Delete',
  INSERT: 'Insert',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'Page Up',
  PAGE_DOWN: 'Page Down',
  ARROW_UP: '↑',
  ARROW_DOWN: '↓',
  ARROW_LEFT: '←',
  ARROW_RIGHT: '→',
  BACKQUOTE: '`',
  MINUS: '-',
  EQUAL: '=',
  BRACKET_LEFT: '[',
  BRACKET_RIGHT: ']',
  BACKSLASH: '\\',
  SEMICOLON: ';',
  QUOTE: "'",
  COMMA: ',',
  PERIOD: '.',
  SLASH: '/',
}

export function normalizeInputSequence(value: unknown): InputSequenceStep[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_INPUT_SEQUENCE_STEPS) {
    return null
  }

  const normalized: InputSequenceStep[] = []
  let totalDelayMs = 0

  for (const candidate of value) {
    if (!isRecord(candidate)) return null

    if (candidate.type === 'keys') {
      if (
        !Array.isArray(candidate.keys) ||
        candidate.keys.length === 0 ||
        candidate.keys.length > MAX_INPUT_SEQUENCE_KEYS
      ) {
        return null
      }

      const uniqueKeys = [...new Set(candidate.keys)]
      if (
        uniqueKeys.length !== candidate.keys.length ||
        uniqueKeys.some((key) => typeof key !== 'string' || !INPUT_KEY_SET.has(key))
      ) {
        return null
      }

      normalized.push({
        type: 'keys',
        keys: sortInputKeys(uniqueKeys as InputKey[]),
      })
      continue
    }

    if (candidate.type === 'delay') {
      if (
        typeof candidate.durationMs !== 'number' ||
        !Number.isInteger(candidate.durationMs) ||
        candidate.durationMs < MIN_INPUT_SEQUENCE_DELAY_MS ||
        candidate.durationMs > MAX_INPUT_SEQUENCE_DELAY_MS
      ) {
        return null
      }

      totalDelayMs += candidate.durationMs
      if (totalDelayMs > MAX_INPUT_SEQUENCE_TOTAL_DELAY_MS) return null
      normalized.push({ type: 'delay', durationMs: candidate.durationMs })
      continue
    }

    return null
  }

  return normalized
}

export function formatInputKeys(keys: InputKey[]): string {
  return keys.map((key) => KEY_LABELS[key] ?? key).join(' + ')
}

export function formatInputSequence(steps: InputSequenceStep[]): string {
  return steps.map((step) => {
    if (step.type === 'keys') return formatInputKeys(step.keys)
    const seconds = Number((step.durationMs / 1000).toFixed(2))
    return `${seconds}초`
  }).join(' → ')
}

function sortInputKeys(keys: InputKey[]): InputKey[] {
  const modifiers = MODIFIER_ORDER.filter((modifier) => keys.includes(modifier))
  const regularKeys = keys.filter((key) => !MODIFIER_ORDER.includes(key))
  return [...modifiers, ...regularKeys]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
