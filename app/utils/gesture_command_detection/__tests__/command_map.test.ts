import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  fingerDefinitions,
  mapGestureToCommand,
  oneHandTouchGestureCommands,
  touchGestureCommands,
  twoHandTouchGestureCommands,
} from '../command_map'

describe('touch command map', () => {
  it('lists all 5 by 5 left/right finger touch commands', () => {
    assert.equal(twoHandTouchGestureCommands.length, 25)
    assert.equal(
      new Set(twoHandTouchGestureCommands.map((item) => item.gesture)).size,
      25,
    )

    for (const leftFinger of fingerDefinitions) {
      for (const rightFinger of fingerDefinitions) {
        const gesture =
          `touch_left_${leftFinger.name}_right_${rightFinger.name}` as const
        const command = mapGestureToCommand(gesture)

        assert.equal(command.contactType, 'two_hand')
        assert.equal(command.leftFinger, leftFinger.name)
        assert.equal(command.rightFinger, rightFinger.name)
        assert.equal(
          command.gestureLabel,
          `왼손 ${leftFinger.label} + 오른손 ${rightFinger.label}`,
        )
      }
    }
  })

  it('lists one-hand thumb touch commands separately for each hand', () => {
    assert.equal(oneHandTouchGestureCommands.length, 6)
    assert.equal(touchGestureCommands.length, 31)
    assert.deepEqual(
      oneHandTouchGestureCommands.map((item) => item.gesture),
      [
        'touch_left_thumb_index',
        'touch_left_thumb_middle',
        'touch_left_thumb_ring',
        'touch_right_thumb_index',
        'touch_right_thumb_middle',
        'touch_right_thumb_ring',
      ],
    )

    const leftCommand = mapGestureToCommand('touch_left_thumb_ring')
    const rightCommand = mapGestureToCommand('touch_right_thumb_ring')

    assert.equal(leftCommand.contactType, 'one_hand')
    assert.equal(leftCommand.hand, 'Left')
    assert.equal(leftCommand.gestureLabel, '왼손 엄지 + 약지')
    assert.equal(leftCommand.mark, '왼 엄+약')
    assert.equal(rightCommand.contactType, 'one_hand')
    assert.equal(rightCommand.hand, 'Right')
    assert.equal(rightCommand.gestureLabel, '오른손 엄지 + 약지')
    assert.equal(rightCommand.mark, '오 엄+약')
  })

  it('maps a touch gesture to an executable app command', () => {
    const command = mapGestureToCommand('touch_left_thumb_right_index')

    assert.equal(command.gesture, 'touch_left_thumb_right_index')
    assert.equal(command.mark, '엄+검')
    assert.equal(typeof command.label, 'string')
    assert.equal(typeof command.app, 'string')
  })
})
