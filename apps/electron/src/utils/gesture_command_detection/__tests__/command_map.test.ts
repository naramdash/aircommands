import { describe, expect, it } from 'vitest'
import {
  oneHandTouchGestureCommands,
  touchGestureCommands,
} from '../command_map'

describe('gesture command definitions', () => {
  it('defines six unique one-hand gestures without application assignments', () => {
    expect(oneHandTouchGestureCommands).toHaveLength(6)
    expect(touchGestureCommands).toHaveLength(6)
    expect(new Set(touchGestureCommands.map((command) => command.gesture)).size).toBe(6)
    expect(touchGestureCommands.every((command) =>
      command.gesture.startsWith('touch_left_thumb_') ||
      command.gesture.startsWith('touch_right_thumb_'))).toBe(true)

    for (const command of touchGestureCommands) {
      expect(command).not.toHaveProperty('app')
      expect(command).not.toHaveProperty('label')
    }
  })
})
