import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  app: { getFileIcon: vi.fn() },
  nativeImage: { createFromPath: vi.fn() },
  shell: { readShortcutLink: vi.fn() },
}))

import { createDefaultSettings } from '../application_settings'
import { clearApplicationIconCache } from '../application_icon_cache'
import {
  buildGetStartAppsCommand,
  getShortcutIconCandidates,
  mergeDiscoveredApplications,
  parseGetStartAppsOutput,
  WindowsApplicationDiscoveryService,
  type RawDiscoveredApplication,
} from '../windows_application_discovery'

const temporaryDirectories: string[] = []

afterEach(async () => {
  clearApplicationIconCache()
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  )
})

describe('parseGetStartAppsOutput', () => {
  it('accepts both a single object and an array while removing duplicate AppIDs', () => {
    expect(parseGetStartAppsOutput('{"Name":"설정","AppID":"settings!app"}')).toEqual([
      { Name: '설정', AppID: 'settings!app' },
    ])
    expect(parseGetStartAppsOutput(JSON.stringify([
      { Name: '설정', AppID: 'settings!app' },
      { Name: '중복', AppID: 'SETTINGS!APP' },
      { Name: '메모장', AppID: 'notepad.exe' },
    ]))).toEqual([
      { Name: '설정', AppID: 'settings!app' },
      { Name: '메모장', AppID: 'notepad.exe' },
    ])
  })

  it('keeps an Appx manifest icon path returned by the fixed discovery script', () => {
    expect(parseGetStartAppsOutput(JSON.stringify({
      Name: '사진',
      AppID: 'Microsoft.Windows.Photos_8wekyb3d8bbwe!App',
      IconPath: 'C:\\Program Files\\WindowsApps\\Photos\\Assets\\Logo.scale-200.png',
    }))).toEqual([{
      Name: '사진',
      AppID: 'Microsoft.Windows.Photos_8wekyb3d8bbwe!App',
      IconPath: 'C:\\Program Files\\WindowsApps\\Photos\\Assets\\Logo.scale-200.png',
    }])
  })

  it('rejects malformed JSON', () => {
    expect(() => parseGetStartAppsOutput('{bad-json')).toThrow()
  })
})

describe('Get-StartApps command', () => {
  it('uses a fixed encoded command with a five second timeout', () => {
    const command = buildGetStartAppsCommand('C:\\Windows')

    expect(command.executable).toBe(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    )
    expect(command.args.slice(0, 4)).toEqual([
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
    ])
    expect(command.args).toHaveLength(5)
    expect(command.options).toMatchObject({
      timeout: 5000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    })
  })
})

describe('mergeDiscoveredApplications', () => {
  it('prefers one matching shortcut but preserves ambiguous AppIDs with the same name', () => {
    const startApplications = [
      createRaw('Chrome', 'windows-app-id', 'chrome-app'),
      createRaw('Photos', 'windows-app-id', 'photos-one'),
      createRaw('Photos', 'windows-app-id', 'photos-two'),
    ]
    const shortcuts = [
      createRaw('Chrome', 'windows-path', 'C:\\Start\\Chrome.lnk'),
      createRaw('Photos', 'windows-path', 'C:\\Start\\Photos.lnk'),
    ]

    const merged = mergeDiscoveredApplications(startApplications, shortcuts)

    expect(merged.some((item) =>
      item.target.kind === 'windows-app-id' &&
      item.target.appUserModelId === 'chrome-app')).toBe(false)
    expect(merged.filter((item) => item.name === 'Photos')).toHaveLength(3)
  })

  it('prefers a Steam App ID over a Windows shortcut with the same game name', () => {
    const shortcut = createRaw(
      'Counter-Strike 2',
      'windows-path',
      'C:\\Start\\Counter-Strike 2.lnk',
    )
    const steamApplication: RawDiscoveredApplication = {
      discoveryId: 'steam:730',
      name: 'Counter-Strike 2',
      target: { kind: 'steam-app', appId: '730' },
    }

    const merged = mergeDiscoveredApplications([], [shortcut], [steamApplication])

    expect(merged).toEqual([steamApplication])
  })
})

describe('shortcut icon candidates', () => {
  it('prefers an explicit shortcut icon, then its executable, then the shortcut', () => {
    expect(getShortcutIconCandidates('C:\\Start\\Paint.lnk', {
      icon: 'C:\\Apps\\Paint.ico',
      target: 'C:\\Apps\\Paint.exe',
    })).toEqual([
      'C:\\Apps\\Paint.ico',
      'C:\\Apps\\Paint.exe',
      'C:\\Start\\Paint.lnk',
    ])
  })
})

describe('WindowsApplicationDiscoveryService', () => {
  it('merges valid shortcuts, marks registered apps, caches, and force-refreshes', async () => {
    const startMenu = await createStartMenu()
    const shortcutPath = path.join(startMenu, 'Tools', 'Paint.lnk')
    const runPowerShell = vi.fn(async () => JSON.stringify([
      { Name: '설정', AppID: 'windows.settings!App' },
      { Name: 'Paint', AppID: 'paint-app' },
    ]))
    const service = new WindowsApplicationDiscoveryService({
      platform: 'win32',
      waitBeforeIconRetry: async () => {},
      discoverSteamApplications: async () => [],
      runPowerShell,
      startMenuDirectories: [startMenu],
      readShortcut: (candidate) => {
        if (candidate !== shortcutPath) throw new Error('broken shortcut')
        return {}
      },
      getFileIcon: async () => 'data:image/png;base64,icon',
    })
    const settings = createDefaultSettings()
    settings.applications.push({
      id: 'registered-settings',
      name: '설정',
      target: {
        kind: 'windows-app-id',
        appUserModelId: 'windows.settings!App',
      },
    })

    const first = await service.discover(settings)
    const cached = await service.discover(settings)
    const refreshed = await service.discover(settings, true)

    expect(runPowerShell).toHaveBeenCalledTimes(2)
    expect(first.applications).toHaveLength(2)
    expect(cached.applications).toEqual(first.applications)
    expect(refreshed.applications).toEqual(first.applications)
    expect(first.applications.find((item) => item.name === 'Paint')).toMatchObject({
      targetKind: 'windows-path',
      iconDataUrl: 'data:image/png;base64,icon',
    })
    expect(first.applications.find((item) => item.name === '설정')).toMatchObject({
      registeredApplicationId: 'registered-settings',
    })
  })

  it('loads a Start Menu shortcut icon from its resolved executable before the lnk', async () => {
    const startMenu = await createStartMenu()
    const shortcutPath = path.join(startMenu, 'Tools', 'Paint.lnk')
    const executablePath = 'C:\\Apps\\Paint.exe'
    const getFileIcon = vi.fn(async (candidate: string) =>
      candidate === executablePath ? 'data:image/png;base64,target-icon' : undefined)
    const service = new WindowsApplicationDiscoveryService({
      platform: 'win32',
      waitBeforeIconRetry: async () => {},
      discoverSteamApplications: async () => [],
      runPowerShell: async () => '[]',
      startMenuDirectories: [startMenu],
      readShortcut: (candidate) => {
        if (candidate !== shortcutPath) throw new Error('broken shortcut')
        return { target: executablePath }
      },
      getFileIcon,
    })

    const result = await service.discover(createDefaultSettings())

    expect(result.applications[0]?.iconDataUrl).toBe('data:image/png;base64,target-icon')
    expect(getFileIcon).toHaveBeenCalledWith(executablePath)
  })

  it('loads a packaged Windows app icon from its manifest asset', async () => {
    const iconPath = 'C:\\Program Files\\WindowsApps\\Photos\\Assets\\Logo.scale-200.png'
    const loadImage = vi.fn((candidate: string) =>
      candidate === iconPath ? 'data:image/png;base64,appx-icon' : undefined)
    const service = new WindowsApplicationDiscoveryService({
      platform: 'win32',
      waitBeforeIconRetry: async () => {},
      discoverSteamApplications: async () => [],
      runPowerShell: async () => JSON.stringify({
        Name: '사진',
        AppID: 'Microsoft.Windows.Photos_8wekyb3d8bbwe!App',
        IconPath: iconPath,
      }),
      startMenuDirectories: [],
      loadImage,
    })

    const result = await service.discover(createDefaultSettings())

    expect(result.applications[0]?.iconDataUrl).toBe('data:image/png;base64,appx-icon')
    expect(loadImage).toHaveBeenCalledWith(iconPath)
  })

  it('includes Steam games and marks an already registered App ID', async () => {
    const settings = createDefaultSettings()
    settings.applications.push({
      id: 'registered-steam-game',
      name: 'Steam Game',
      target: { kind: 'steam-app', appId: '570' },
    })
    const service = new WindowsApplicationDiscoveryService({
      platform: 'win32',
      waitBeforeIconRetry: async () => {},
      runPowerShell: async () => '[]',
      startMenuDirectories: [],
      discoverSteamApplications: async () => [{
        name: 'Steam Game',
        target: { kind: 'steam-app', appId: '570' },
      }],
    })

    const result = await service.discover(settings)

    expect(result.applications).toEqual([
      expect.objectContaining({
        name: 'Steam Game',
        targetKind: 'steam-app',
        iconText: '🎮',
        registeredApplicationId: 'registered-steam-game',
      }),
    ])
  })

  it('keeps the startup catalog until an explicit refresh', async () => {
    const runPowerShell = vi.fn(async () =>
      '{"Name":"설정","AppID":"windows.settings!App"}')
    const service = new WindowsApplicationDiscoveryService({
      platform: 'win32',
      waitBeforeIconRetry: async () => {},
      discoverSteamApplications: async () => [],
      runPowerShell,
      startMenuDirectories: [],
    })
    const settings = createDefaultSettings()

    await service.discover(settings)
    await service.discover(settings)
    await service.discover(settings, true)

    expect(runPowerShell).toHaveBeenCalledTimes(2)
  })

  it('persists a refreshed catalog and loads it before running discovery', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'aircommands-catalog-'))
    temporaryDirectories.push(directory)
    const catalogPath = path.join(directory, 'application-catalog.json')
    const firstRunPowerShell = vi.fn(async () =>
      '{"Name":"설정","AppID":"windows.settings!App"}')
    const firstService = new WindowsApplicationDiscoveryService({
      platform: 'win32',
      waitBeforeIconRetry: async () => {},
      discoverSteamApplications: async () => [],
      catalogPath,
      runPowerShell: firstRunPowerShell,
      startMenuDirectories: [],
      getFileIcon: async () => 'data:image/png;base64,aWNvbg==',
    })

    await firstService.discover(createDefaultSettings())

    expect(JSON.parse(await readFile(catalogPath, 'utf8'))).toMatchObject({
      version: 2,
      applications: [
        {
          name: '설정',
          iconDataUrl: 'data:image/png;base64,aWNvbg==',
          target: {
            kind: 'windows-app-id',
            appUserModelId: 'windows.settings!App',
          },
        },
      ],
    })

    clearApplicationIconCache()
    const secondRunPowerShell = vi.fn(async () => {
      throw new Error('startup should use the saved catalog')
    })
    const secondService = new WindowsApplicationDiscoveryService({
      platform: 'win32',
      waitBeforeIconRetry: async () => {},
      discoverSteamApplications: async () => [],
      catalogPath,
      runPowerShell: secondRunPowerShell,
      startMenuDirectories: [],
    })
    await secondService.initialize()
    const cached = await secondService.discover(createDefaultSettings())

    expect(cached.applications.map((application) => application.name)).toEqual(['설정'])
    expect(cached.applications[0]?.iconDataUrl)
      .toBe('data:image/png;base64,aWNvbg==')
    expect(secondRunPowerShell).not.toHaveBeenCalled()
  })

  it('refreshes a legacy iconless catalog before returning it to an initial picker', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'aircommands-catalog-v1-'))
    temporaryDirectories.push(directory)
    const catalogPath = path.join(directory, 'application-catalog.json')
    await writeFile(catalogPath, JSON.stringify({
      version: 1,
      applications: [{
        discoveryId: 'e22d78e46edffa1def527de7cb1ddf3ff5944aa5085f8732e0f7669ac995b377',
        name: '설정',
        target: {
          kind: 'windows-app-id',
          appUserModelId: 'windows.settings!App',
        },
      }],
    }), 'utf8')
    const runPowerShell = vi.fn(async () =>
      '{"Name":"설정","AppID":"windows.settings!App"}')
    const service = new WindowsApplicationDiscoveryService({
      platform: 'win32',
      waitBeforeIconRetry: async () => {},
      discoverSteamApplications: async () => [],
      catalogPath,
      runPowerShell,
      startMenuDirectories: [],
      getFileIcon: async () => 'data:image/png;base64,bmV3LWljb24=',
    })

    await service.initialize()
    const result = await service.discover(createDefaultSettings())

    expect(runPowerShell).toHaveBeenCalledOnce()
    expect(result.applications[0]?.iconDataUrl)
      .toBe('data:image/png;base64,bmV3LWljb24=')
    expect(JSON.parse(await readFile(catalogPath, 'utf8')).version).toBe(2)
  })

  it('retries icon hydration once after a transient Windows icon failure', async () => {
    const waitBeforeIconRetry = vi.fn(async () => {})
    const getFileIcon = vi.fn(async () =>
      getFileIcon.mock.calls.length === 1
        ? undefined
        : 'data:image/png;base64,cmV0cmllZA==')
    const service = new WindowsApplicationDiscoveryService({
      platform: 'win32',
      waitBeforeIconRetry,
      discoverSteamApplications: async () => [],
      runPowerShell: async () =>
        '{"Name":"날씨","AppID":"Microsoft.BingWeather_8wekyb3d8bbwe!App"}',
      startMenuDirectories: [],
      getFileIcon,
    })

    const result = await service.discover(createDefaultSettings())

    expect(waitBeforeIconRetry).toHaveBeenCalledOnce()
    expect(getFileIcon).toHaveBeenCalledTimes(2)
    expect(result.applications[0]?.iconDataUrl)
      .toBe('data:image/png;base64,cmV0cmllZA==')
  })

  it('backs up a corrupt persisted catalog before rebuilding it', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'aircommands-catalog-corrupt-'))
    temporaryDirectories.push(directory)
    const catalogPath = path.join(directory, 'application-catalog.json')
    await writeFile(catalogPath, '{bad-json', 'utf8')
    const service = new WindowsApplicationDiscoveryService({
      platform: 'win32',
      waitBeforeIconRetry: async () => {},
      discoverSteamApplications: async () => [],
      catalogPath,
      runPowerShell: async () =>
        '{"Name":"메모장","AppID":"Microsoft.WindowsNotepad_8wekyb3d8bbwe!App"}',
      startMenuDirectories: [],
    })

    await service.initialize()
    await service.discover(createDefaultSettings())

    const files = await readdir(directory)
    expect(files.some((file) => file.startsWith('application-catalog.corrupt-'))).toBe(true)
    expect(files).toContain('application-catalog.json')
  })

  it('rejects unknown discovery IDs after refreshing the catalog', async () => {
    const runPowerShell = vi.fn(async () =>
      '{"Name":"설정","AppID":"windows.settings!App"}')
    const service = new WindowsApplicationDiscoveryService({
      platform: 'win32',
      waitBeforeIconRetry: async () => {},
      discoverSteamApplications: async () => [],
      runPowerShell,
      startMenuDirectories: [],
    })

    await expect(service.resolve('unknown', createDefaultSettings())).resolves.toBeNull()
    expect(runPowerShell).toHaveBeenCalledTimes(2)
  })

  it('reports discovery failure when both usable sources are empty', async () => {
    const service = new WindowsApplicationDiscoveryService({
      platform: 'win32',
      waitBeforeIconRetry: async () => {},
      discoverSteamApplications: async () => [],
      runPowerShell: async () => {
        throw new Error('timeout')
      },
      startMenuDirectories: [],
    })

    await expect(service.discover(createDefaultSettings())).rejects
      .toThrow('APPLICATION_DISCOVERY_FAILED')
  })
})

function createRaw(
  name: string,
  kind: 'windows-path' | 'windows-app-id',
  value: string,
): RawDiscoveredApplication {
  return {
    discoveryId: `${kind}:${value}`,
    name,
    target: kind === 'windows-path'
      ? { kind, path: value }
      : { kind, appUserModelId: value },
  }
}

async function createStartMenu() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aircommands-start-menu-'))
  temporaryDirectories.push(directory)
  const tools = path.join(directory, 'Tools')
  await mkdir(tools)
  await writeFile(path.join(tools, 'Paint.lnk'), '')
  await writeFile(path.join(tools, 'Broken.lnk'), '')
  return directory
}
