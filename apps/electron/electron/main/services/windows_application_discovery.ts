import { app, nativeImage, shell } from 'electron'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  targetsMatch,
  type ApplicationTarget,
  type UserConfig,
} from './application_settings'
import {
  cacheApplicationIcon,
  getCachedApplicationIcon,
} from './application_icon_cache'
import {
  discoverInstalledSteamApplications,
  isValidSteamAppId,
  type SteamDiscoveredApplication,
} from './steam_application_discovery'

type DiscoverableApplicationTarget = Exclude<
  ApplicationTarget,
  { kind: 'builtin' }
>

export type DiscoveredApplication = {
  discoveryId: string
  name: string
  targetKind: DiscoverableApplicationTarget['kind']
  iconText: string
  iconDataUrl?: string
  registeredApplicationId?: string
}

export type DiscoveryResult = {
  applications: DiscoveredApplication[]
  warning?: string
}

export type RawDiscoveredApplication = {
  discoveryId: string
  name: string
  target: DiscoverableApplicationTarget
  iconDataUrl?: string
  iconSourcePaths?: string[]
}

type StartApplication = {
  Name: string
  AppID: string
  IconPath?: string
}

type ShortcutIconDetails = {
  target?: string
  icon?: string
}

type DiscoveryDependencies = {
  platform?: NodeJS.Platform
  catalogPath?: string
  runPowerShell?: () => Promise<string>
  startMenuDirectories?: string[]
  readShortcut?: (shortcutPath: string) => ShortcutIconDetails
  getFileIcon?: (targetPath: string) => Promise<string | undefined>
  loadImage?: (targetPath: string) => string | undefined
  discoverSteamApplications?: () => Promise<SteamDiscoveredApplication[]>
  waitBeforeIconRetry?: () => Promise<void>
}

const MAX_SHORTCUTS = 5000
const POWER_SHELL_TIMEOUT_MS = 5000
const POWER_SHELL_MAX_BUFFER = 4 * 1024 * 1024
const MAX_PERSISTED_ICON_DATA_URL_LENGTH = 128 * 1024
const MAX_PERSISTED_ICON_TOTAL_LENGTH = 16 * 1024 * 1024
const MAX_PERSISTED_CATALOG_FILE_SIZE = 32 * 1024 * 1024
const ICON_RETRY_DELAY_MS = 200
const POWERSHELL_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
  '$packages = @{}',
  'Get-AppxPackage | ForEach-Object { $packages[$_.PackageFamilyName] = $_ }',
  '$apps = Get-StartApps | ForEach-Object {',
  '  $startApp = $_',
  '  $iconPath = $null',
  '  $parts = $startApp.AppID -split "!", 2',
  '  if ($parts.Length -eq 2 -and $packages.ContainsKey($parts[0])) {',
  '    try {',
  '      $package = $packages[$parts[0]]',
  '      $manifestPath = Join-Path $package.InstallLocation "AppxManifest.xml"',
  '      [xml]$manifest = Get-Content -LiteralPath $manifestPath',
  '      $application = @($manifest.SelectNodes("/*[local-name()=\'Package\']/*[local-name()=\'Applications\']/*[local-name()=\'Application\']")) | Where-Object { $_.GetAttribute("Id") -eq $parts[1] } | Select-Object -First 1',
  '      $visualElements = $application.SelectSingleNode("./*[local-name()=\'VisualElements\']")',
  '      $logo = $visualElements.GetAttribute("Square44x44Logo")',
  '      if (-not $logo) { $logo = $visualElements.GetAttribute("Square150x150Logo") }',
  '      if (-not $logo) { $logo = $manifest.SelectSingleNode("/*[local-name()=\'Package\']/*[local-name()=\'Properties\']/*[local-name()=\'Logo\']").InnerText }',
  '      if ($logo -and $logo -notlike "ms-resource:*") {',
  '        $basePath = Join-Path $package.InstallLocation ($logo -replace "/", "\\")',
  '        $directory = Split-Path -Parent $basePath',
  '        $stem = [IO.Path]::GetFileNameWithoutExtension($basePath)',
  '        $extension = [IO.Path]::GetExtension($basePath)',
  '        $preferred = @(',
  '          "$directory\\$stem.targetsize-48$extension",',
  '          "$directory\\$stem.targetsize-44$extension",',
  '          "$directory\\$stem.targetsize-32$extension",',
  '          "$directory\\$stem.scale-200$extension",',
  '          "$directory\\$stem.scale-100$extension",',
  '          $basePath',
  '        )',
  '        $iconPath = $preferred | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1',
  '        if (-not $iconPath -and (Test-Path -LiteralPath $directory -PathType Container)) {',
  '          $iconPath = Get-ChildItem -LiteralPath $directory -File | Where-Object { $_.BaseName -like "$stem*" } | Sort-Object Name | Select-Object -ExpandProperty FullName -First 1',
  '        }',
  '      }',
  '    } catch {}',
  '  }',
  '  [PSCustomObject]@{ Name = $startApp.Name; AppID = $startApp.AppID; IconPath = $iconPath }',
  '}',
  '$apps | ConvertTo-Json -Compress',
].join('\n')
const POWERSHELL_ENCODED_COMMAND = Buffer
  .from(POWERSHELL_SCRIPT, 'utf16le')
  .toString('base64')

export class WindowsApplicationDiscoveryService {
  private cache: { applications: RawDiscoveredApplication[], warning?: string } | null = null
  private pendingDiscovery: Promise<{
    applications: RawDiscoveredApplication[]
    warning?: string
  }> | null = null
  private initialized = false
  private cacheReady = false

  constructor(private readonly dependencies: DiscoveryDependencies = {}) {}

  async initialize() {
    if (this.initialized) return
    this.initialized = true
    if ((this.dependencies.platform ?? process.platform) !== 'win32') return

    const catalogPath = this.dependencies.catalogPath
    if (!catalogPath) return

    try {
      if ((await stat(catalogPath)).size > MAX_PERSISTED_CATALOG_FILE_SIZE) {
        throw new Error('APPLICATION_CATALOG_TOO_LARGE')
      }
      const contents = await readFile(catalogPath, 'utf8')
      const parsedCatalog: unknown = JSON.parse(contents)
      const applications = parsePersistedCatalog(parsedCatalog)
      if (!applications) throw new Error('INVALID_APPLICATION_CATALOG')
      for (const application of applications) {
        if (application.iconDataUrl) {
          cacheApplicationIcon(application.target, application.iconDataUrl)
        }
      }
      this.cache = {
        applications,
      }
      this.cacheReady = isRecord(parsedCatalog) && parsedCatalog.version === 2
    } catch (error) {
      if (getErrorCode(error) !== 'ENOENT') {
        await backupCorruptCatalog(catalogPath)
      }
    }
  }

  async discover(settings: UserConfig, forceRefresh = false): Promise<DiscoveryResult> {
    if ((this.dependencies.platform ?? process.platform) !== 'win32') {
      throw new Error('UNSUPPORTED_PLATFORM')
    }

    await this.initialize()
    if (!forceRefresh && this.cache && this.cacheReady) {
      return this.toDiscoveryResult(this.cache, settings)
    }

    if (this.pendingDiscovery) {
      const cache = await this.pendingDiscovery
      return this.toDiscoveryResult(cache, settings)
    }

    this.pendingDiscovery = this.collectApplications()
    try {
      this.cache = await this.pendingDiscovery
      this.cacheReady = true
      try {
        await this.persistCatalog(this.cache.applications)
      } catch {
        const persistenceWarning = '프로그램 목록을 디스크에 저장하지 못했습니다.'
        this.cache.warning = this.cache.warning
          ? `${this.cache.warning} ${persistenceWarning}`
          : persistenceWarning
      }
      return this.toDiscoveryResult(this.cache, settings)
    } finally {
      this.pendingDiscovery = null
    }
  }

  async resolve(
    discoveryId: string,
    settings: UserConfig,
  ): Promise<RawDiscoveredApplication | null> {
    const firstResult = await this.getRawApplications(settings, false)
    const cached = firstResult.find((application) => application.discoveryId === discoveryId)
    if (cached) return structuredClone(cached)

    const refreshed = await this.getRawApplications(settings, true)
    const found = refreshed.find((application) => application.discoveryId === discoveryId)
    return found ? structuredClone(found) : null
  }

  getCachedIcon(target: ApplicationTarget) {
    return getCachedApplicationIcon(target)
  }

  private async getRawApplications(settings: UserConfig, forceRefresh: boolean) {
    await this.discover(settings, forceRefresh)
    return this.cache?.applications ?? []
  }

  private async collectApplications() {
    const discoverSteamApplications = this.dependencies.discoverSteamApplications ??
      (() => discoverInstalledSteamApplications())
    const [startAppsResult, shortcutsResult, steamResult] = await Promise.allSettled([
      this.collectStartApplications(),
      this.collectStartMenuShortcuts(),
      discoverSteamApplications(),
    ])

    const warnings: string[] = []
    const startApplications = startAppsResult.status === 'fulfilled'
      ? startAppsResult.value
      : []
    if (startAppsResult.status === 'rejected') {
      warnings.push('Windows 설치 앱 목록을 불러오지 못했습니다.')
    }

    const shortcuts = shortcutsResult.status === 'fulfilled'
      ? shortcutsResult.value
      : []
    if (shortcutsResult.status === 'rejected') {
      warnings.push('시작 메뉴 바로가기를 불러오지 못했습니다.')
    }

    const steamApplications = steamResult.status === 'fulfilled'
      ? steamResult.value.map((application) => createRawApplication(
        application.name,
        application.target,
        application.iconSourcePaths,
      ))
      : []
    if (steamResult.status === 'rejected') {
      warnings.push('Steam 게임 목록을 불러오지 못했습니다.')
    }

    const applications = mergeDiscoveredApplications(
      startApplications,
      shortcuts,
      steamApplications,
    )
    if (applications.length === 0 && warnings.length > 0) {
      throw new Error('APPLICATION_DISCOVERY_FAILED')
    }

    const hydratedApplications = await this.hydrateIcons(applications)
    return {
      applications: hydratedApplications,
      ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
    }
  }

  private async persistCatalog(applications: RawDiscoveredApplication[]) {
    const catalogPath = this.dependencies.catalogPath
    if (!catalogPath) return

    const directory = path.dirname(catalogPath)
    const temporaryPath = `${catalogPath}.tmp-${process.pid}`
    let remainingIconLength = MAX_PERSISTED_ICON_TOTAL_LENGTH
    const catalog = {
      version: 2,
      applications: applications.map(({ discoveryId, name, target, iconDataUrl }) => {
        const shouldPersistIcon = (
          isPersistableIconDataUrl(iconDataUrl) &&
          iconDataUrl.length <= remainingIconLength
        )
        if (shouldPersistIcon) remainingIconLength -= iconDataUrl.length
        return {
          discoveryId,
          name,
          target,
          ...(shouldPersistIcon ? { iconDataUrl } : {}),
        }
      }),
    }
    await mkdir(directory, { recursive: true })
    await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, catalogPath)
  }

  private async collectStartApplications(): Promise<RawDiscoveredApplication[]> {
    const runPowerShell = this.dependencies.runPowerShell ?? runGetStartApps
    const output = await runPowerShell()
    const parsed = parseGetStartAppsOutput(output)
    const applications: RawDiscoveredApplication[] = []

    for (const candidate of parsed) {
      const target = await classifyStartApplicationTarget(candidate.AppID)
      applications.push(createRawApplication(
        candidate.Name,
        target,
        candidate.IconPath ? [candidate.IconPath] : undefined,
      ))
    }

    return applications
  }

  private async collectStartMenuShortcuts(): Promise<RawDiscoveredApplication[]> {
    const directories = this.dependencies.startMenuDirectories ?? getStartMenuDirectories()
    const readShortcut = this.dependencies.readShortcut ??
      ((shortcutPath: string) => shell.readShortcutLink(shortcutPath))
    const shortcutPaths: string[] = []

    for (const directory of directories) {
      await collectShortcutPaths(directory, shortcutPaths)
      if (shortcutPaths.length >= MAX_SHORTCUTS) break
    }

    const applications: RawDiscoveredApplication[] = []
    for (const shortcutPath of shortcutPaths.slice(0, MAX_SHORTCUTS)) {
      try {
        const shortcutDetails = readShortcut(shortcutPath)
        applications.push(createRawApplication(
          path.basename(shortcutPath, path.extname(shortcutPath)),
          { kind: 'windows-path', path: shortcutPath },
          getShortcutIconCandidates(shortcutPath, shortcutDetails),
        ))
      } catch {
        // Skip broken or unreadable shortcuts.
      }
    }

    return applications
  }

  private async hydrateIcons(applications: RawDiscoveredApplication[]) {
    const getFileIcon = this.dependencies.getFileIcon ?? getPathIcon
    const loadImage = this.dependencies.loadImage ?? loadImageFile
    const result = applications.map((application) => ({ ...application }))
    await this.hydrateIconPass(result, getFileIcon, loadImage)

    const retryApplications = result.filter((application) =>
      !application.iconDataUrl && getIconCandidates(application).length > 0)
    if (retryApplications.length > 0) {
      await (
        this.dependencies.waitBeforeIconRetry ??
        (() => wait(ICON_RETRY_DELAY_MS))
      )()
      await this.hydrateIconPass(retryApplications, getFileIcon, loadImage)
    }

    return result
  }

  private async hydrateIconPass(
    applications: RawDiscoveredApplication[],
    getFileIcon: (targetPath: string) => Promise<string | undefined>,
    loadImage: (targetPath: string) => string | undefined,
  ) {
    let nextIndex = 0

    const workers = Array.from({ length: Math.min(8, applications.length) }, async () => {
      while (nextIndex < applications.length) {
        const index = nextIndex
        nextIndex += 1
        const application = applications[index]

        const cached = getCachedApplicationIcon(application.target)
        if (cached) {
          application.iconDataUrl = cached
          continue
        }

        const candidates = getIconCandidates(application)
        for (const candidate of candidates) {
          if (!isSafeIconCandidate(candidate)) continue
          try {
            const iconDataUrl = isImageAsset(candidate)
              ? loadImage(candidate)
              : await getFileIcon(candidate)
            if (!iconDataUrl) continue

            cacheApplicationIcon(application.target, iconDataUrl)
            application.iconDataUrl = iconDataUrl
            break
          } catch {
            // Keep trying fallbacks before using the generic icon.
          }
        }
      }
    })

    await Promise.all(workers)
  }

  private toDiscoveryResult(
    cache: { applications: RawDiscoveredApplication[], warning?: string },
    settings: UserConfig,
  ): DiscoveryResult {
    return {
      applications: cache.applications.map((application) => {
        const registered = settings.applications.find((item) =>
          targetsMatch(item.target, application.target))
        return {
          discoveryId: application.discoveryId,
          name: application.name,
          targetKind: application.target.kind,
          iconText: application.target.kind === 'windows-path'
            ? '🧩'
            : application.target.kind === 'windows-app-id'
              ? '⊞'
              : '🎮',
          ...(application.iconDataUrl ? { iconDataUrl: application.iconDataUrl } : {}),
          ...(registered ? { registeredApplicationId: registered.id } : {}),
        }
      }),
      ...(cache.warning ? { warning: cache.warning } : {}),
    }
  }
}

export function parseGetStartAppsOutput(output: string): StartApplication[] {
  const trimmed = output.trim()
  if (!trimmed) return []

  const parsed: unknown = JSON.parse(trimmed)
  const candidates = Array.isArray(parsed) ? parsed : [parsed]
  const applications: StartApplication[] = []
  const seenAppIds = new Set<string>()

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue
    if (typeof candidate.Name !== 'string' || typeof candidate.AppID !== 'string') continue
    const name = candidate.Name.trim()
    const appId = candidate.AppID.trim()
    if (!name || !appId || appId.length > 1024) continue
    const identity = appId.toLocaleLowerCase()
    if (seenAppIds.has(identity)) continue
    seenAppIds.add(identity)
    const iconPath = typeof candidate.IconPath === 'string'
      ? candidate.IconPath.trim()
      : ''
    applications.push({
      Name: name,
      AppID: appId,
      ...(iconPath ? { IconPath: iconPath } : {}),
    })
  }

  return applications
}

export function mergeDiscoveredApplications(
  startApplications: RawDiscoveredApplication[],
  shortcuts: RawDiscoveredApplication[],
  steamApplications: RawDiscoveredApplication[] = [],
) {
  const shortcutNameCounts = new Map<string, number>()
  for (const shortcut of shortcuts) {
    const name = normalizeName(shortcut.name)
    shortcutNameCounts.set(name, (shortcutNameCounts.get(name) ?? 0) + 1)
  }

  const startNameCounts = new Map<string, number>()
  for (const application of startApplications) {
    const name = normalizeName(application.name)
    startNameCounts.set(name, (startNameCounts.get(name) ?? 0) + 1)
  }

  const merged = startApplications.filter((application) => {
    const name = normalizeName(application.name)
    return !(startNameCounts.get(name) === 1 && shortcutNameCounts.get(name) === 1)
  })
  merged.push(...shortcuts)

  const steamNames = new Set(
    steamApplications.map((application) => normalizeName(application.name)),
  )
  const deduped = new Map<string, RawDiscoveredApplication>()
  for (const application of [
    ...merged.filter((candidate) => !steamNames.has(normalizeName(candidate.name))),
    ...steamApplications,
  ]) {
    deduped.set(getTargetIdentity(application.target), application)
  }

  return [...deduped.values()].sort((left, right) =>
    left.name.localeCompare(right.name, 'ko', { sensitivity: 'base' }))
}

function createRawApplication(
  name: string,
  target: DiscoverableApplicationTarget,
  iconSourcePaths?: string[],
): RawDiscoveredApplication {
  return {
    discoveryId: createDiscoveryId(target),
    name: name.trim().slice(0, 80),
    target,
    ...(iconSourcePaths?.length ? { iconSourcePaths } : {}),
  }
}

function createDiscoveryId(target: ApplicationTarget) {
  return createHash('sha256').update(getTargetIdentity(target)).digest('hex')
}

function getTargetIdentity(target: ApplicationTarget) {
  if (target.kind === 'builtin') return `builtin:${target.key.toLocaleLowerCase()}`
  if (target.kind === 'windows-path') {
    return `windows-path:${path.normalize(target.path).toLocaleLowerCase()}`
  }
  if (target.kind === 'windows-app-id') {
    return `windows-app-id:${target.appUserModelId.toLocaleLowerCase()}`
  }
  return `steam-app:${target.appId}`
}

async function classifyStartApplicationTarget(
  appId: string,
): Promise<Extract<ApplicationTarget, { kind: 'windows-path' | 'windows-app-id' }>> {
  if (path.isAbsolute(appId) && path.extname(appId).toLocaleLowerCase() === '.exe') {
    try {
      if ((await stat(appId)).isFile()) {
        return { kind: 'windows-path', path: appId }
      }
    } catch {
      // Fall through to AppUserModelID launching.
    }
  }

  return { kind: 'windows-app-id', appUserModelId: appId }
}

async function collectShortcutPaths(directory: string, result: string[]) {
  if (!directory || result.length >= MAX_SHORTCUTS) return

  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (result.length >= MAX_SHORTCUTS) return
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await collectShortcutPaths(entryPath, result)
    } else if (entry.isFile() && path.extname(entry.name).toLocaleLowerCase() === '.lnk') {
      result.push(entryPath)
    }
  }
}

function getStartMenuDirectories() {
  return [
    process.env.APPDATA
      ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
      : '',
    process.env.ProgramData
      ? path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
      : '',
  ].filter(Boolean)
}

function runGetStartApps(): Promise<string> {
  const command = buildGetStartAppsCommand(process.env.SystemRoot || 'C:\\Windows')

  return new Promise((resolve, reject) => {
    execFile(
      command.executable,
      command.args,
      command.options,
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }
        resolve(stdout)
      },
    )
  })
}

export function buildGetStartAppsCommand(systemRoot: string) {
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
      POWERSHELL_ENCODED_COMMAND,
    ],
    options: {
      encoding: 'utf8' as const,
      timeout: POWER_SHELL_TIMEOUT_MS,
      maxBuffer: POWER_SHELL_MAX_BUFFER,
      windowsHide: true,
    },
  }
}

export function getShortcutIconCandidates(
  shortcutPath: string,
  shortcutDetails: ShortcutIconDetails,
) {
  const candidates = [
    shortcutDetails.icon,
    shortcutDetails.target,
    shortcutPath,
  ]
    .flatMap((candidate) => {
      if (!candidate) return []
      const expanded = expandWindowsEnvironmentVariables(candidate.trim())
      return path.isAbsolute(expanded) ? [expanded] : []
    })

  return [...new Set(candidates)]
}

function expandWindowsEnvironmentVariables(value: string) {
  return value.replace(/%([^%]+)%/g, (match, variableName: string) => {
    const matchingKey = Object.keys(process.env).find((key) =>
      key.toLocaleLowerCase() === variableName.toLocaleLowerCase())
    return matchingKey ? process.env[matchingKey] ?? match : match
  })
}

function isSafeIconCandidate(candidate: string) {
  return path.isAbsolute(candidate) || candidate.startsWith('shell:AppsFolder\\')
}

function isImageAsset(targetPath: string) {
  return ['.png', '.jpg', '.jpeg', '.ico'].includes(
    path.extname(targetPath).toLocaleLowerCase(),
  )
}

function loadImageFile(targetPath: string) {
  try {
    const icon = nativeImage.createFromPath(targetPath)
    if (icon.isEmpty()) return undefined
    const size = icon.getSize()
    const normalizedIcon = size.width > 64 || size.height > 64
      ? icon.resize({ width: 64, quality: 'good' })
      : icon
    return normalizedIcon.toDataURL()
  } catch {
    return undefined
  }
}

async function getPathIcon(targetPath: string) {
  try {
    const icon = await app.getFileIcon(targetPath, { size: 'normal' })
    return icon.isEmpty() ? undefined : icon.toDataURL()
  } catch {
    return undefined
  }
}

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

let discoveryService: WindowsApplicationDiscoveryService | null = null

export function configureWindowsApplicationDiscoveryService(catalogPath: string) {
  discoveryService = new WindowsApplicationDiscoveryService({ catalogPath })
  return discoveryService
}

export function getWindowsApplicationDiscoveryService() {
  if (!discoveryService) {
    discoveryService = new WindowsApplicationDiscoveryService()
  }
  return discoveryService
}

export function parsePersistedCatalog(value: unknown): RawDiscoveredApplication[] | null {
  if (
    !isRecord(value) ||
    (value.version !== 1 && value.version !== 2) ||
    !Array.isArray(value.applications)
  ) {
    return null
  }

  const applications: RawDiscoveredApplication[] = []
  const seenTargets = new Set<string>()
  for (const candidate of value.applications) {
    if (!isRecord(candidate)) return null
    if (
      typeof candidate.discoveryId !== 'string' ||
      typeof candidate.name !== 'string' ||
      !candidate.name.trim() ||
      !isRecord(candidate.target)
    ) {
      return null
    }

    let target: RawDiscoveredApplication['target']
    if (
      candidate.target.kind === 'windows-path' &&
      typeof candidate.target.path === 'string' &&
      path.isAbsolute(candidate.target.path)
    ) {
      target = { kind: 'windows-path', path: candidate.target.path }
    } else if (
      candidate.target.kind === 'windows-app-id' &&
      typeof candidate.target.appUserModelId === 'string' &&
      candidate.target.appUserModelId.trim()
    ) {
      target = {
        kind: 'windows-app-id',
        appUserModelId: candidate.target.appUserModelId.trim(),
      }
    } else if (
      candidate.target.kind === 'steam-app' &&
      typeof candidate.target.appId === 'string' &&
      isValidSteamAppId(candidate.target.appId)
    ) {
      target = {
        kind: 'steam-app',
        appId: candidate.target.appId,
      }
    } else {
      return null
    }

    const identity = getTargetIdentity(target)
    if (seenTargets.has(identity) || createDiscoveryId(target) !== candidate.discoveryId) {
      return null
    }
    seenTargets.add(identity)
    applications.push({
      discoveryId: candidate.discoveryId,
      name: candidate.name.trim().slice(0, 80),
      target,
      ...(
        value.version === 2 && isPersistableIconDataUrl(candidate.iconDataUrl)
          ? { iconDataUrl: candidate.iconDataUrl }
          : {}
      ),
    })
  }

  return applications.sort((left, right) =>
    left.name.localeCompare(right.name, 'ko', { sensitivity: 'base' }))
}

async function backupCorruptCatalog(catalogPath: string) {
  const backupPath = catalogPath.replace(/\.json$/i, `.corrupt-${Date.now()}.json`)
  try {
    await rename(catalogPath, backupPath)
  } catch (error) {
    if (getErrorCode(error) !== 'ENOENT') throw error
  }
}

function getErrorCode(error: unknown) {
  if (!isRecord(error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function getIconCandidates(application: RawDiscoveredApplication) {
  return application.iconSourcePaths ?? (
    application.target.kind === 'windows-path'
      ? [application.target.path]
      : application.target.kind === 'windows-app-id'
        ? [`shell:AppsFolder\\${application.target.appUserModelId}`]
        : []
  )
}

function isPersistableIconDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_PERSISTED_ICON_DATA_URL_LENGTH &&
    /^data:image\/(?:png|jpe?g|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=]+$/i
      .test(value)
  )
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}
