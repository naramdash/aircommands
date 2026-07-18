import { assert, describe, it } from 'vitest'
import { buildOpenAppRequestInput } from '../open_app_request_input'

describe('buildOpenAppRequestInput', () => {
  it('parses json body with app and request id', () => {
    const request = buildOpenAppRequestInput(
      JSON.stringify({
        app: 'chrome',
        source: 'gesture',
        gesture: 'touch_left_thumb_right_index',
        clientRequestId: 'req-1',
      }),
      {},
    )

    assert.equal(request.app, 'chrome')
    assert.equal(request.source, 'gesture')
    assert.equal(request.gesture, 'touch_left_thumb_right_index')
    assert.equal(request.clientRequestId, 'req-1')
  })

  it('accepts urlencoded payloads', () => {
    const request = buildOpenAppRequestInput(
      'app=vscode&source=manual&clientRequestId=req-2',
      {},
    )

    assert.equal(request.app, 'vscode')
    assert.equal(request.source, 'manual')
    assert.equal(request.clientRequestId, 'req-2')
  })

  it('falls back to query app when body is empty', () => {
    const request = buildOpenAppRequestInput('', { app: 'notepad' })
    assert.equal(request.app, 'notepad')
  })

  it('uses default app when body and query have no app', () => {
    const request = buildOpenAppRequestInput(undefined, {}, { app: 'chrome' })
    assert.equal(request.app, 'chrome')
  })
})
