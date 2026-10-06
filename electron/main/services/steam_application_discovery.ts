import { execFile } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ApplicationTarget } from './application_settings'

type ValveKeyValues = Record<string, string | ValveKeyValues>

export type SteamDiscoveredApplication = {
  name: string
  target: Extract<ApplicationTarget, { kind: 'steam-app' }>
  iconSourcePaths?: string[]
}

type SteamDiscoveryDependencies = {
  platform?: NodeJS.Platform
  steamInstallDirectories?: string[]
  findRegistrySteamDirectories?: () => Promise<string[]>
}

const STEAM_REGISTRY_TIMEOUT_MS = 3000
const STEAM_REGISTRY_MAX_BUFFER = 256 * 1024
const STEAM_REGISTRY_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
  '$paths = @()',
  '$keys = @(',
  '  "HKCU:\\Software\\Valve\\Steam",',
  '  "HKLM:\\Software\\WOW6432Node\\Valve\\Steam",',
  '  "HKLM:\\Software\\Valve\\Steam"',
  ')',
  'foreach ($key in $keys) {',
  '  try {',
  '    $value = Get-ItemProperty -LiteralPath $key -ErrorAction Stop',
  '    if ($value.SteamPath) { $paths += $value.SteamPath }',
  '    if ($value.InstallPath) { $paths += $value.InstallPath }',
  '  } catch {}',
  '}',
  '$paths | Where-Object { $_ } | Select-Object -Unique | ConvertTo-Json -Compress',
].join('\n')
const STEAM_REGISTRY_ENCODED_COMMAND = Buffer
  .from(STEAM_REGISTRY_SCRIPT, 'utf16le')
  .toString('base64')

export async function discoverInstalledSteamApplications(
  dependencies: SteamDiscoveryDependencies = {},
): Promise<SteamDiscoveredApplication[]> {
  if ((dependencies.platform ?? process.platform) !== 'win32') return []

  const installDirectories = dependencies.steamInstallDirectories ??
    await getSteamInstallDirectories(dependencies.findRegistrySteamDirectories)
  const libraries = new Map<string, { libraryPath: string, steamRoot: string }>()

  for (const steamRoot of uniqueWindowsPaths(installDirectories)) {
    addSteamLibrary(libraries, steamRoot, steamRoot)
    for (const libraryPath of await readSteamLibraryFolders(steamRoot)) {
      addSteamLibrary(libraries, libraryPath, steamRoot)
    }
  }

  const applications = new Map<string, SteamDiscoveredApplication>()
  for (const { libraryPath, steamRoot } of libraries.values()) {
    const steamAppsDirectory = path.join(libraryPath, 'steamapps')
    let entries
    try {
      entries = await readdir(steamAppsDirectory, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !/^appmanifest_\d+\.acf$/i.test(entry.name)
      ) {
        continue
      }

      const manifest = await readSteamAppManifest(
        path.join(steamAppsDirectory, entry.name),
        libraryPath,
      )
      if (!manifest || isExcludedSteamTool(manifest.name)) continue

      const target = { kind: 'steam-app' as const, appId: manifest.appId }
      applications.set(manifest.appId, {
        name: manifest.name,
        target,
        iconSourcePaths: await getSteamIconCandidates(steamRoot, manifest.appId),
      })
    }
  }

  return [...applications.values()].sort((left, right) =>
    left.name.localeCompare(right.name, 'ko', { sensitivity: 'base' }))
}

export async function resolveSteamExecutablePath(): Promise<string | null> {
  for (const directory of await getSteamInstallDirectories()) {
    const executablePath = path.join(directory, 'steam.exe')
    try {
      if ((await stat(executablePath)).isFile()) return executablePath
    } catch {
      // Try the next registry or conventional install location.
    }
  }
  return null
}

export async function getSteamInstallDirectories(
  findRegistryDirectories: () => Promise<string[]> = findRegistrySteamDirectories,
) {
  let registryDirectories: string[] = []
  try {
    registryDirectories = await findRegistryDirectories()
  } catch {
    // Conventional locations remain useful if registry access is unavailable.
  }

  const conventionalDirectories = [
    process.env['ProgramFiles(x86)']
      ? path.join(process.env['ProgramFiles(x86)'], 'Steam')
      : '',
    process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, 'Steam')
      : '',
  ].filter(Boolean)

  return uniqueWindowsPaths([...registryDirectories, ...conventionalDirectories])
}

export function parseSteamRegistryOutput(output: string): string[] {
  const trimmed = output.trim()
  if (!trimmed) return []

  const parsed: unknown = JSON.parse(trimmed)
  const candidates = Array.isArray(parsed) ? parsed : [parsed]
  return uniqueWindowsPaths(candidates.filter((candidate): candidate is string =>
    typeof candidate === 'string' && path.win32.isAbsolute(candidate.trim())))
}

export function buildSteamRegistryCommand(systemRoot: string) {
  return {
    executable: path.join(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    ),
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      STEAM_REGISTRY_ENCODED_COMMAND,
    ],
    options: {
      encoding: 'utf8' as const,
      timeout: STEAM_REGISTRY_TIMEOUT_MS,
      maxBuffer: STEAM_REGISTRY_MAX_BUFFER,
      windowsHide: true,
    },
  }
}

export function parseValveKeyValues(contents: string): ValveKeyValues {
  const tokens = tokenizeValveKeyValues(contents)
  let index = 0

  function parseObject(expectClosingBrace: boolean): ValveKeyValues {
    const result: ValveKeyValues = {}
    while (index < tokens.length) {
      const token = tokens[index++]
      if (token === '}') {
        if (!expectClosingBrace) throw new Error('UNEXPECTED_CLOSING_BRACE')
        return result
      }
      if (token === '{') throw new Error('UNEXPECTED_OPENING_BRACE')

      const value = tokens[index++]
      if (value === undefined || value === '}') throw new Error('MISSING_VALUE')
      result[token] = value === '{'
        ? parseObject(true)
        : value
    }

    if (expectClosingBrace) throw new Error('MISSING_CLOSING_BRACE')
    return result
  }

  return parseObject(false)
}

function tokenizeValveKeyValues(contents: string) {
  const tokens: string[] = []
  let index = 0

  while (index < contents.length) {
    const character = contents[index]
    if (/\s/.test(character)) {
      index += 1
      continue
    }
    if (character === '/' && contents[index + 1] === '/') {
      index += 2
      while (index < contents.length && contents[index] !== '\n') index += 1
      continue
    }
    if (character === '{' || character === '}') {
      tokens.push(character)
      index += 1
      continue
    }
    if (character !== '"') throw new Error('INVALID_VDF_TOKEN')

    index += 1
    let value = ''
    let closed = false
    while (index < contents.length) {
      const next = contents[index++]
      if (next === '"') {
        closed = true
        break
      }
      if (next === '\\' && index < contents.length) {
        const escaped = contents[index++]
        value += escaped === 'n'
          ? '\n'
          : escaped === 't'
            ? '\t'
            : escaped === '\\' || escaped === '"'
              ? escaped
              : `\\${escaped}`
      } else {
        value += next
      }
    }
    if (!closed) throw new Error('UNTERMINATED_VDF_STRING')
    tokens.push(value)
  }

  return tokens
}

async function findRegistrySteamDirectories(): Promise<string[]> {
  const command = buildSteamRegistryCommand(process.env.SystemRoot || 'C:\\Windows')
  const output = await new Promise<string>((resolve, reject) => {
    execFile(command.executable, command.args, command.options, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
  return parseSteamRegistryOutput(output)
}

async function readSteamLibraryFolders(steamRoot: string) {
  try {
    const contents = await readFile(
      path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'),
      'utf8',
    )
    const parsed = parseValveKeyValues(contents)
    const libraryFolders = getObjectValue(parsed, 'libraryfolders')
    if (!libraryFolders) return []

    const paths: string[] = []
    for (const value of Object.values(libraryFolders)) {
      const candidate = typeof value === 'string'
        ? value
        : getStringValue(value, 'path')
      if (candidate && path.win32.isAbsolute(candidate)) paths.push(candidate)
    }
    return paths
  } catch {
    return []
  }
}

async function readSteamAppManifest(manifestPath: string, libraryPath: string) {
  try {
    const parsed = parseValveKeyValues(await readFile(manifestPath, 'utf8'))
    const appState = getObjectValue(parsed, 'AppState')
    if (!appState) return null

    const appId = getStringValue(appState, 'appid')?.trim()
    const name = getStringValue(appState, 'name')?.trim()
    const installDirectory = getStringValue(appState, 'installdir')?.trim()
    if (
      !appId ||
      !isValidSteamAppId(appId) ||
      !name ||
      !installDirectory
    ) {
      return null
    }

    const installedPath = path.join(libraryPath, 'steamapps', 'common', installDirectory)
    if (!(await stat(installedPath)).isDirectory()) return null
    return { appId, name: name.slice(0, 80) }
  } catch {
    return null
  }
}

async function getSteamIconCandidates(steamRoot: string, appId: string) {
  const cacheRoot = path.join(steamRoot, 'appcache', 'librarycache')
  const directCandidates = [
    path.join(cacheRoot, `${appId}_icon.jpg`),
    path.join(cacheRoot, `${appId}_icon.png`),
    path.join(cacheRoot, `${appId}_logo.png`),
  ]
  const applicationCacheDirectory = path.join(cacheRoot, appId)

  try {
    const entries = await readdir(applicationCacheDirectory, { withFileTypes: true })
    const imagePaths = entries
      .filter((entry) =>
        entry.isFile() && ['.png', '.jpg', '.jpeg', '.ico']
          .includes(path.extname(entry.name).toLocaleLowerCase()))
      .sort((left, right) =>
        getSteamImagePriority(left.name) - getSteamImagePriority(right.name) ||
        left.name.localeCompare(right.name))
      .map((entry) => path.join(applicationCacheDirectory, entry.name))
    return [...directCandidates, ...imagePaths]
  } catch {
    return directCandidates
  }
}

function getSteamImagePriority(fileName: string) {
  const normalized = fileName.toLocaleLowerCase()
  if (normalized.includes('icon')) return 0
  if (normalized.includes('logo')) return 1
  if (normalized.includes('header')) return 2
  if (normalized.includes('library_600x900')) return 3
  return 4
}

function addSteamLibrary(
  libraries: Map<string, { libraryPath: string, steamRoot: string }>,
  libraryPath: string,
  steamRoot: string,
) {
  if (!path.win32.isAbsolute(libraryPath)) return
  const identity = path.win32.normalize(libraryPath).toLocaleLowerCase()
  if (!libraries.has(identity)) {
    libraries.set(identity, { libraryPath, steamRoot })
  }
}

function uniqueWindowsPaths(paths: string[]) {
  const unique = new Map<string, string>()
  for (const candidate of paths) {
    const normalized = candidate.trim().replace(/[\\/]+$/, '')
    if (!normalized || !path.win32.isAbsolute(normalized)) continue
    const identity = path.win32.normalize(normalized).toLocaleLowerCase()
    if (!unique.has(identity)) unique.set(identity, normalized)
  }
  return [...unique.values()]
}

function isExcludedSteamTool(name: string) {
  return /steamworks common redistributables|steam linux runtime|(?:^|\s)proton(?:\s|$)|(?:dedicated server|server tool|sdk)$/i
    .test(name.trim())
}

export function isValidSteamAppId(value: string) {
  if (!/^\d{1,10}$/.test(value)) return false
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 0xFFFF_FFFF
}

function getObjectValue(object: ValveKeyValues, key: string) {
  const value = object[key]
  return typeof value === 'object' ? value : undefined
}

function getStringValue(object: ValveKeyValues, key: string) {
  const value = object[key]
  return typeof value === 'string' ? value : undefined
}
