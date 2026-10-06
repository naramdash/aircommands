import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  buildSteamRegistryCommand,
  discoverInstalledSteamApplications,
  isValidSteamAppId,
  parseSteamRegistryOutput,
  parseValveKeyValues,
} from '../steam_application_discovery'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  )
})

describe('Steam registry discovery', () => {
  it('uses a fixed encoded PowerShell command and parses single or duplicate paths', () => {
    const command = buildSteamRegistryCommand('C:\\Windows')

    expect(command.executable).toBe(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    )
    expect(command.args.slice(0, 4)).toEqual([
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
    ])
    expect(command.options.timeout).toBe(3000)
    expect(parseSteamRegistryOutput('"C:\\\\Program Files (x86)\\\\Steam"')).toEqual([
      'C:\\Program Files (x86)\\Steam',
    ])
    expect(parseSteamRegistryOutput(JSON.stringify([
      'D:\\Steam',
      'd:\\steam\\',
      'relative',
    ]))).toEqual(['D:\\Steam'])
  })
})

describe('Valve KeyValues parser', () => {
  it('parses nested VDF values, comments, and escaped Windows paths', () => {
    const parsed = parseValveKeyValues(`
      // Steam library metadata
      "libraryfolders"
      {
        "0"
        {
          "path" "D:\\\\SteamLibrary"
        }
      }
    `)

    expect(parsed).toEqual({
      libraryfolders: {
        0: {
          path: 'D:\\SteamLibrary',
        },
      },
    })
  })
})

describe('discoverInstalledSteamApplications', () => {
  it('finds installed games across Steam libraries and skips tools or missing installs', async () => {
    const steamRoot = await createDirectory('aircommands-steam-root-')
    const secondaryLibrary = await createDirectory('aircommands-steam-library-')
    await mkdir(path.join(steamRoot, 'steamapps'), { recursive: true })
    await writeFile(
      path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders" { "1" { "path" "${escapeVdfPath(secondaryLibrary)}" } }`,
      'utf8',
    )
    await createInstalledApp(steamRoot, {
      appId: '570',
      name: 'Dota 2',
      installDirectory: 'dota 2 beta',
    })
    await createInstalledApp(secondaryLibrary, {
      appId: '730',
      name: 'Counter-Strike 2',
      installDirectory: 'Counter-Strike Global Offensive',
    })
    await createInstalledApp(secondaryLibrary, {
      appId: '228980',
      name: 'Steamworks Common Redistributables',
      installDirectory: 'Steamworks Shared',
    })
    await writeManifest(secondaryLibrary, {
      appId: '999',
      name: 'Missing Game',
      installDirectory: 'missing',
    })

    const applications = await discoverInstalledSteamApplications({
      platform: 'win32',
      steamInstallDirectories: [steamRoot],
    })

    expect(applications.map((application) => ({
      name: application.name,
      target: application.target,
    }))).toEqual([
      {
        name: 'Counter-Strike 2',
        target: { kind: 'steam-app', appId: '730' },
      },
      {
        name: 'Dota 2',
        target: { kind: 'steam-app', appId: '570' },
      },
    ])
    expect(applications[1]?.iconSourcePaths?.[0]).toBe(
      path.join(steamRoot, 'appcache', 'librarycache', '570_icon.jpg'),
    )
  })

  it('returns an empty list outside Windows without touching Steam paths', async () => {
    await expect(discoverInstalledSteamApplications({
      platform: 'linux',
      steamInstallDirectories: ['C:\\Steam'],
    })).resolves.toEqual([])
  })
})

describe('Steam App ID validation', () => {
  it('accepts unsigned 32-bit IDs and rejects commands or out-of-range values', () => {
    expect(isValidSteamAppId('570')).toBe(true)
    expect(isValidSteamAppId('0')).toBe(false)
    expect(isValidSteamAppId('570 -silent')).toBe(false)
    expect(isValidSteamAppId('4294967296')).toBe(false)
  })
})

async function createDirectory(prefix: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

async function createInstalledApp(
  libraryPath: string,
  application: { appId: string, name: string, installDirectory: string },
) {
  await mkdir(
    path.join(libraryPath, 'steamapps', 'common', application.installDirectory),
    { recursive: true },
  )
  await writeManifest(libraryPath, application)
}

async function writeManifest(
  libraryPath: string,
  application: { appId: string, name: string, installDirectory: string },
) {
  await mkdir(path.join(libraryPath, 'steamapps'), { recursive: true })
  await writeFile(
    path.join(libraryPath, 'steamapps', `appmanifest_${application.appId}.acf`),
    [
      '"AppState"',
      '{',
      `  "appid" "${application.appId}"`,
      `  "name" "${application.name}"`,
      `  "installdir" "${application.installDirectory}"`,
      '}',
    ].join('\n'),
    'utf8',
  )
}

function escapeVdfPath(value: string) {
  return value.replace(/\\/g, '\\\\')
}
