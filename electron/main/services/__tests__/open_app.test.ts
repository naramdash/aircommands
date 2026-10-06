import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getFileIcon: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}))

import { createDefaultSettings } from '../application_settings'
import { clearOpenAppRequestDedupeForTests, openAppRequest } from '../open_app'

beforeEach(() => {
  clearOpenAppRequestDedupeForTests()
})

describe('openAppRequest', () => {
  it('requires a registered application id', async () => {
    await expect(openAppRequest({}, { settings: createDefaultSettings() })).resolves.toMatchObject({
      success: false,
      error: 'INVALID_BODY',
    })
  })

  it('does not accept an executable path in place of an application id', async () => {
    await expect(
      openAppRequest(
        { applicationId: 'C:\\Windows\\notepad.exe' },
        { settings: createDefaultSettings() },
      ),
    ).resolves.toMatchObject({
      success: false,
      error: 'APPLICATION_NOT_FOUND',
    })
  })

  it('launches the stored application and returns its display name', async () => {
    const launcher = vi.fn(async () => ({ success: true as const }))
    const response = await openAppRequest(
      { applicationId: 'builtin:notepad', clientRequestId: 'request-1' },
      { settings: createDefaultSettings(), launcher },
    )

    expect(response).toMatchObject({
      success: true,
      applicationId: 'builtin:notepad',
      applicationName: '메모장',
    })
    expect(launcher).toHaveBeenCalledTimes(1)
  })

  it('deduplicates recent request ids', async () => {
    const settings = createDefaultSettings()
    const launcher = vi.fn(async () => ({ success: true as const }))
    const request = {
      applicationId: 'builtin:notepad',
      clientRequestId: 'duplicate',
    }

    await openAppRequest(request, { settings, launcher, now: 100 })
    const duplicate = await openAppRequest(request, { settings, launcher, now: 101 })

    expect(duplicate).toMatchObject({ success: false, error: 'DUPLICATE_REQUEST' })
    expect(launcher).toHaveBeenCalledTimes(1)
  })
})
