import { describe, expect, it, vi } from 'vitest'
import {
  formatInputSequence,
  normalizeInputSequence,
} from '../input_sequence'
import {
  executeWindowsInputSequence,
  getVirtualKey,
} from '../windows_input_sequence'

describe('input sequence validation', () => {
  it('normalizes modifier order and formats a timed key sequence', () => {
    const sequence = normalizeInputSequence([
      { type: 'keys', keys: ['P', 'SHIFT', 'CONTROL'] },
      { type: 'delay', durationMs: 300 },
      { type: 'keys', keys: ['ENTER'] },
    ])

    expect(sequence).toEqual([
      { type: 'keys', keys: ['CONTROL', 'SHIFT', 'P'] },
      { type: 'delay', durationMs: 300 },
      { type: 'keys', keys: ['ENTER'] },
    ])
    expect(formatInputSequence(sequence!)).toBe('Ctrl + Shift + P → 0.3초 → Enter')
  })

  it('rejects duplicate keys and invalid delays', () => {
    expect(normalizeInputSequence([
      { type: 'keys', keys: ['CONTROL', 'CONTROL'] },
    ])).toBeNull()
    expect(normalizeInputSequence([
      { type: 'delay', durationMs: 0 },
    ])).toBeNull()
  })
})

describe('Windows input sequence execution', () => {
  it('builds and sends a PowerShell command that preserves key and delay order', async () => {
    const runPowerShell = vi.fn(async () => undefined)

    await executeWindowsInputSequence([
      { type: 'keys', keys: ['CONTROL', 'P'] },
      { type: 'delay', durationMs: 300 },
      { type: 'keys', keys: ['ENTER'] },
    ], {
      platform: 'win32',
      runPowerShell,
    })

    expect(runPowerShell).toHaveBeenCalledOnce()
    const [encodedCommand, timeoutMs] = runPowerShell.mock.calls[0]
    const script = Buffer.from(encodedCommand, 'base64').toString('utf16le')

    expect(script).toContain('[AircommandsNativeInput]::Key(17, $false, $false)')
    expect(script).toContain('[AircommandsNativeInput]::Key(80, $false, $false)')
    expect(script).toContain('Start-Sleep -Milliseconds 300')
    const controlDownIndex = script.indexOf('Key(17, $false')
    const pDownIndex = script.indexOf('Key(80, $false')
    const pUpIndex = script.indexOf('Key(80, $true')
    const controlUpIndex = script.indexOf('Key(17, $true')
    expect(controlDownIndex).toBeLessThan(pDownIndex)
    expect(pUpIndex).toBeLessThan(controlUpIndex)
    expect(timeoutMs).toBeGreaterThan(300)
  })

  it('maps function and extended navigation keys to Windows virtual keys', () => {
    expect(getVirtualKey('F12')).toEqual({ code: 0x7B })
    expect(getVirtualKey('ARROW_DOWN')).toEqual({ code: 0x28, extended: true })
  })

  it('does not attempt system input outside Windows', async () => {
    const runPowerShell = vi.fn(async () => undefined)

    await expect(executeWindowsInputSequence([
      { type: 'keys', keys: ['P'] },
    ], {
      platform: 'darwin',
      runPowerShell,
    })).rejects.toThrow('UNSUPPORTED_INPUT_PLATFORM')
    expect(runPowerShell).not.toHaveBeenCalled()
  })
})
