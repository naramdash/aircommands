const MODIFIER_KEYS: InputKey[] = ['CONTROL', 'ALT', 'SHIFT', 'META']

const EVENT_KEY_MAP: Record<string, InputKey> = {
  Control: 'CONTROL',
  Alt: 'ALT',
  Shift: 'SHIFT',
  Meta: 'META',
  Enter: 'ENTER',
  ' ': 'SPACE',
  Spacebar: 'SPACE',
  Tab: 'TAB',
  Escape: 'ESCAPE',
  Esc: 'ESCAPE',
  Backspace: 'BACKSPACE',
  Delete: 'DELETE',
  Insert: 'INSERT',
  Home: 'HOME',
  End: 'END',
  PageUp: 'PAGE_UP',
  PageDown: 'PAGE_DOWN',
  ArrowUp: 'ARROW_UP',
  ArrowDown: 'ARROW_DOWN',
  ArrowLeft: 'ARROW_LEFT',
  ArrowRight: 'ARROW_RIGHT',
}

const EVENT_CODE_MAP: Record<string, InputKey> = {
  Backquote: 'BACKQUOTE',
  Minus: 'MINUS',
  Equal: 'EQUAL',
  BracketLeft: 'BRACKET_LEFT',
  BracketRight: 'BRACKET_RIGHT',
  Backslash: 'BACKSLASH',
  Semicolon: 'SEMICOLON',
  Quote: 'QUOTE',
  Comma: 'COMMA',
  Period: 'PERIOD',
  Slash: 'SLASH',
}

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

export function getInputKeysFromKeyboardEvent(event: KeyboardEvent): InputKey[] | null {
  const primaryKey = getPrimaryInputKey(event)
  if (!primaryKey) return null

  const modifiers: InputKey[] = []
  if (event.ctrlKey || primaryKey === 'CONTROL') modifiers.push('CONTROL')
  if (event.altKey || primaryKey === 'ALT') modifiers.push('ALT')
  if (event.shiftKey || primaryKey === 'SHIFT') modifiers.push('SHIFT')
  if (event.metaKey || primaryKey === 'META') modifiers.push('META')

  return MODIFIER_KEYS.includes(primaryKey)
    ? modifiers
    : [...modifiers, primaryKey]
}

export function formatInputKeys(keys: InputKey[]): string {
  return keys.map((key) => KEY_LABELS[key] ?? key).join(' + ')
}

export function formatInputSequence(steps: InputSequenceStep[]): string {
  return steps.map((step) => {
    if (step.type === 'keys') return formatInputKeys(step.keys)
    if (step.type === 'delay') {
      const seconds = Number((step.durationMs / 1000).toFixed(2))
      return `${seconds}초`
    }
    return `스크롤 ${step.direction === 'up' ? '위' : '아래'} ${step.notches}칸`
  }).join(' → ')
}

export function toSerializableInputSequence(steps: InputSequenceStep[]): InputSequenceStep[] {
  return steps.map((step) => {
    if (step.type === 'keys') return { type: 'keys', keys: [...step.keys] }
    if (step.type === 'delay') return { type: 'delay', durationMs: step.durationMs }
    return {
      type: 'scroll',
      direction: step.direction,
      notches: step.notches,
    }
  })
}

function getPrimaryInputKey(event: KeyboardEvent): InputKey | null {
  const mappedKey = EVENT_KEY_MAP[event.key]
  if (mappedKey) return mappedKey

  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3) as InputKey
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5) as InputKey
  if (/^F(?:[1-9]|1[0-2])$/.test(event.key)) return event.key as InputKey

  return EVENT_CODE_MAP[event.code] ?? null
}
