import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  app: { getFileIcon: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}))

import {
  buildSteamAppLaunchCommand,
  buildWindowsAppLaunchCommand,
  launchApplication,
  validateWindowsApplicationTarget,
} from '../platform_application_adapter'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  )
})

describe('validateWindowsApplicationTarget', () => {
  it('accepts existing absolute exe and lnk files', async () => {
    const exePath = await createFile('sample.exe')
    const shortcutPath = await createFile('sample.lnk')

    await expect(validateWindowsApplicationTarget(exePath)).resolves.toEqual({ success: true })
    await expect(validateWindowsApplicationTarget(shortcutPath)).resolves.toEqual({ success: true })
  })

  it('rejects relative, missing, and disallowed targets', async () => {
    await expect(validateWindowsApplicationTarget('sample.exe')).resolves.toMatchObject({
      success: false,
    })
    await expect(
      validateWindowsApplicationTarget(path.resolve('missing.exe')),
    ).resolves.toMatchObject({ success: false })
    await expect(
      validateWindowsApplicationTarget(await createFile('script.cmd')),
    ).resolves.toMatchObject({ success: false })
  })
})

describe('launchApplication', () => {
  it('opens a validated custom target without a shell command', async () => {
    const targetPath = await createFile('sample.exe')
    const openPath = vi.fn(async () => '')

    const result = await launchApplication(
      {
        id: 'custom',
        name: 'Sample',
        target: { kind: 'windows-path', path: targetPath },
      },
      { platform: 'win32', openPath },
    )

    expect(result).toEqual({ success: true })
    expect(openPath).toHaveBeenCalledWith(targetPath)
  })

  it('reports unsupported platforms before launching a Windows target', async () => {
    const openPath = vi.fn(async () => '')
    const result = await launchApplication(
      {
        id: 'custom',
        name: 'Sample',
        target: { kind: 'windows-path', path: 'C:\\Sample.exe' },
      },
      { platform: 'linux', openPath },
    )

    expect(result).toMatchObject({ success: false, error: 'UNSUPPORTED_PLATFORM' })
    expect(openPath).not.toHaveBeenCalled()
  })

  it('hands an AppUserModelID to the Windows app launcher without shell parsing', async () => {
    const launchAppId = vi.fn(async () => undefined)
    const appUserModelId = 'Contoso.Store_123!App'
    const result = await launchApplication(
      {
        id: 'store',
        name: 'Store App',
        target: { kind: 'windows-app-id', appUserModelId },
      },
      { platform: 'win32', launchAppId },
    )

    expect(result).toEqual({ success: true })
    expect(launchAppId).toHaveBeenCalledWith(appUserModelId)
    expect(buildWindowsAppLaunchCommand(appUserModelId)).toEqual({
      executable: 'explorer.exe',
      args: [`shell:AppsFolder\\${appUserModelId}`],
    })
  })

  it('launches a Steam game through a validated App ID and separate arguments', async () => {
    const steamExecutablePath = await createFile('steam.exe')
    const launchSteamApp = vi.fn(async () => undefined)
    const result = await launchApplication(
      {
        id: 'steam-game',
        name: 'Steam Game',
        target: { kind: 'steam-app', appId: '570' },
      },
      {
        platform: 'win32',
        resolveSteamExecutable: async () => steamExecutablePath,
        launchSteamApp,
      },
    )

    expect(result).toEqual({ success: true })
    expect(launchSteamApp).toHaveBeenCalledWith(steamExecutablePath, '570')
    expect(buildSteamAppLaunchCommand(steamExecutablePath, '570')).toEqual({
      executable: steamExecutablePath,
      args: ['-applaunch', '570'],
    })
  })

  it('does not launch a Steam target when Steam is missing', async () => {
    const launchSteamApp = vi.fn(async () => undefined)
    const result = await launchApplication(
      {
        id: 'steam-game',
        name: 'Steam Game',
        target: { kind: 'steam-app', appId: '570' },
      },
      {
        platform: 'win32',
        resolveSteamExecutable: async () => null,
        launchSteamApp,
      },
    )

    expect(result).toMatchObject({
      success: false,
      error: 'APPLICATION_TARGET_MISSING',
    })
    expect(launchSteamApp).not.toHaveBeenCalled()
  })

  it('rejects shell-like Steam App ID input before building a launch command', async () => {
    const steamExecutablePath = await createFile('steam.exe')

    expect(() => buildSteamAppLaunchCommand(
      steamExecutablePath,
      '570 --shutdown',
    )).toThrow('INVALID_STEAM_APPLICATION_TARGET')
  })

  it('runs built-in applications only through their trusted registry entry', async () => {
    const runBuiltin = vi.fn(async () => ({ success: true as const }))
    const result = await launchApplication(
      {
        id: 'builtin:notepad',
        name: '메모장',
        target: { kind: 'builtin', key: 'notepad' },
      },
      { platform: 'win32', runBuiltin },
    )

    expect(result).toEqual({ success: true })
    expect(runBuiltin).toHaveBeenCalledWith(['start notepad'])
  })
})

async function createFile(fileName: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aircommands-target-'))
  temporaryDirectories.push(directory)
  const filePath = path.join(directory, fileName)
  await writeFile(filePath, '')
  return filePath
}
