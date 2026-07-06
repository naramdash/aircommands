import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  clearOpenAppRequestDedupeForTests,
  openAppRequest,
} from '../open_app'

describe('openAppRequest', () => {
  beforeEach(() => {
    clearOpenAppRequestDedupeForTests()
  })

  it('runs an allowlisted app command', async () => {
    const commands: string[] = []
    const response = await openAppRequest(
      {
        app: 'chrome',
        source: 'gesture',
        gesture: 'swipe_up',
        clientRequestId: 'test-1',
      },
      {
        now: 1000,
        runner: async (command) => {
          commands.push(command)
          return { success: true }
        },
      },
    )

    assert.equal(response.success, true)
    assert.equal(commands.length, 1)
    assert.match(commands[0], /chrome/i)
  })

  it('rejects unknown apps before running a command', async () => {
    const commands: string[] = []
    const response = await openAppRequest(
      {
        app: 'photoshop',
        clientRequestId: 'test-2',
      },
      {
        now: 1000,
        runner: async (command) => {
          commands.push(command)
          return { success: true }
        },
      },
    )

    assert.equal(response.success, false)
    if (!response.success) {
      assert.equal(response.error, 'APPLICATION_NOT_FOUND')
    }
    assert.equal(commands.length, 0)
  })

  it('rejects invalid body', async () => {
    const response = await openAppRequest(
      {
        app: '',
      },
      {
        now: 1000,
        runner: async () => ({ success: true }),
      },
    )

    assert.equal(response.success, false)
    if (!response.success) {
      assert.equal(response.error, 'INVALID_BODY')
    }
  })

  it('dedupes repeated client request ids', async () => {
    const options = {
      now: 1000,
      runner: async () => ({ success: true as const }),
    }

    const firstResponse = await openAppRequest(
      { app: 'chrome', clientRequestId: 'same-request' },
      options,
    )
    const secondResponse = await openAppRequest(
      { app: 'chrome', clientRequestId: 'same-request' },
      { ...options, now: 1200 },
    )

    assert.equal(firstResponse.success, true)
    assert.equal(secondResponse.success, false)
    if (!secondResponse.success) {
      assert.equal(secondResponse.error, 'DUPLICATE_REQUEST')
    }
  })
})

