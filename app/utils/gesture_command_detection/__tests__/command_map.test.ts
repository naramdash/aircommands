import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mapGestureToCommand } from '../command_map'

describe('command map', () => {
  it('maps swipes to app commands', () => {
    assert.deepEqual(mapGestureToCommand('swipe_up'), {
      gesture: 'swipe_up',
      gestureLabel: '검지 위로 스와이프',
      label: 'Chrome 실행',
      app: 'chrome',
      mark: '↑',
    })
    assert.equal(mapGestureToCommand('swipe_right').app, 'vscode')
    assert.equal(mapGestureToCommand('swipe_up_left').mark, '↖')
    assert.equal(mapGestureToCommand('swipe_up_right').gestureLabel, '검지 오른쪽 위 대각선 스와이프')
    assert.equal(mapGestureToCommand('swipe_down_left').app, 'notepad')
    assert.equal(mapGestureToCommand('swipe_down_right').mark, '↘')
    assert.equal(mapGestureToCommand('shape_v').mark, 'V')
    assert.equal(mapGestureToCommand('shape_w').app, 'word')
    assert.equal(mapGestureToCommand('shape_s').gestureLabel, '검지로 S 그리기')
  })
})
