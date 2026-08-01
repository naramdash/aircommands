import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AVAILABLE_APPS } from './apps'
import {
  normalizeInputSequence,
  type InputSequenceStep,
} from './input_sequence'

export type ApplicationTarget =
  | { kind: 'builtin', key: string }
  | { kind: 'windows-path', path: string }
  | { kind: 'windows-app-id', appUserModelId: string }
  | { kind: 'steam-app', appId: string }

export type ApplicationRecord = {
  id: string
  name: string
  target: ApplicationTarget
}

export type UserConfigV1 = {
  version: 1
  applications: ApplicationRecord[]
  gestureAssignments: Record<string, string | null>
}

export type UserConfigV2 = {
  version: 2
  applications: ApplicationRecord[]
  gestureAssignments: Record<string, string | null>
}

export type UserConfigV3 = {
  version: 3
  applications: ApplicationRecord[]
  gestureAssignments: Record<string, string | null>
}

export type UserConfigV4 = {
  version: 4
  applications: ApplicationRecord[]
  gestureAssignments: Record<string, string | null>
}

export type UserConfigV5 = {
  version: 5
  applications: ApplicationRecord[]
  gestureAssignments: Record<string, string | null>
}

export type UserConfigV6 = {
  version: 6
  applications: ApplicationRecord[]
  gestureAssignments: Record<string, string | null>
  inputSequenceAssignments: Record<string, InputSequenceStep[] | null>
}

export type UserConfigV7 = {
  version: 7
  applications: ApplicationRecord[]
  gestureAssignments: Record<string, string | null>
  inputSequenceAssignments: Record<string, InputSequenceStep[] | null>
  gestureHoldMs: number
}

export type UserConfig = UserConfigV7

export type ApplicationSummary = {
  id: string
  name: string
  targetKind: ApplicationTarget['kind']
  targetLabel: string
  iconText: string
  iconDataUrl?: string
}

export type UserSettingsView = {
  applications: ApplicationSummary[]
  gestureAssignments: Record<string, string | null>
  inputSequenceAssignments: Record<string, InputSequenceStep[] | null>
  gestureHoldMs: number
  platform: NodeJS.Platform
  supportsCustomApplications: boolean
  recoveryNotice?: string
}

const ONE_HAND_FINGER_NAMES = ['index', 'middle', 'ring'] as const
export const DEFAULT_GESTURE_HOLD_MS = 280
export const MIN_GESTURE_HOLD_MS = 80
export const MAX_GESTURE_HOLD_MS = 2_000
const LEGACY_DEFAULT_APP_CYCLE = [
  'chrome',
  'notepad',
  'vscode',
  'terminal',
  'paint',
  'word',
  'spotify',
] as const

const APP_PRESENTATION: Record<string, { name: string, icon: string }> = {
  chrome: { name: 'Chrome', icon: '🌐' },
  firefox: { name: 'Firefox', icon: '🦊' },
  paint: { name: '그림판', icon: '🎨' },
  vscode: { name: 'VS Code', icon: '💻' },
  notepad: { name: '메모장', icon: '📝' },
  terminal: { name: '터미널', icon: '🖥️' },
  powershell: { name: 'PowerShell', icon: '⌨️' },
  explorer: { name: '파일 탐색기', icon: '📁' },
  vlc: { name: 'VLC', icon: '▶️' },
  discord: { name: 'Discord', icon: '💬' },
  slack: { name: 'Slack', icon: '💬' },
  zoom: { name: 'Zoom', icon: '📹' },
  teams: { name: 'Teams', icon: '👥' },
  spotify: { name: 'Spotify', icon: '🎵' },
  gimp: { name: 'GIMP', icon: '🖼️' },
  blender: { name: 'Blender', icon: '🧊' },
  word: { name: 'Word', icon: '📄' },
  excel: { name: 'Excel', icon: '📊' },
  powerpoint: { name: 'PowerPoint', icon: '📽️' },
  whatsapp: { name: 'WhatsApp', icon: '💬' },
  telegram: { name: 'Telegram', icon: '✈️' },
}

export const ALL_GESTURE_NAMES = [
  ...(['left', 'right'] as const).flatMap((hand) =>
    ONE_HAND_FINGER_NAMES.map((finger) => `touch_${hand}_thumb_${finger}`)),
]

const LEGACY_V3_DEFAULT_ASSIGNMENTS = Object.fromEntries(
  ALL_GESTURE_NAMES.map((gesture, index) => [
    gesture,
    getBuiltinApplicationId(
      LEGACY_DEFAULT_APP_CYCLE[index % LEGACY_DEFAULT_APP_CYCLE.length],
    ),
  ]),
)

const LEGACY_V1_V2_DEFAULT_ASSIGNMENTS = Object.fromEntries(
  ALL_GESTURE_NAMES.map((gesture, index) => [
    gesture,
    getBuiltinApplicationId(
      LEGACY_DEFAULT_APP_CYCLE[(25 + index) % LEGACY_DEFAULT_APP_CYCLE.length],
    ),
  ]),
)

export function createDefaultSettings(): UserConfig {
  const applications = AVAILABLE_APPS.map<ApplicationRecord>((availableApp) => ({
    id: getBuiltinApplicationId(availableApp.name),
    name: getBuiltinPresentation(availableApp.name).name,
    target: {
      kind: 'builtin',
      key: availableApp.name,
    },
  }))

  const gestureAssignments = Object.fromEntries(
    ALL_GESTURE_NAMES.map((gesture) => [gesture, null]),
  )
  const inputSequenceAssignments = Object.fromEntries(
    ALL_GESTURE_NAMES.map((gesture) => [gesture, null]),
  )

  return {
    version: 7,
    applications,
    gestureAssignments,
    inputSequenceAssignments,
    gestureHoldMs: DEFAULT_GESTURE_HOLD_MS,
  }
}

export function getBuiltinApplicationId(key: string) {
  return `builtin:${key}`
}

export function getBuiltinPresentation(key: string) {
  return APP_PRESENTATION[key] ?? { name: key, icon: '☁️' }
}

export function isGestureName(value: string) {
  return ALL_GESTURE_NAMES.includes(value)
}

export class ApplicationSettingsStore {
  private cachedSettings: UserConfig | null = null
  private recoveryNotice: string | undefined

  constructor(private readonly settingsPath: string) {}

  async getSettings(): Promise<UserConfig> {
    if (!this.cachedSettings) {
      this.cachedSettings = await this.loadSettings()
    }

    return structuredClone(this.cachedSettings)
  }

  consumeRecoveryNotice() {
    const notice = this.recoveryNotice
    this.recoveryNotice = undefined
    return notice
  }

  async addWindowsApplication(targetPath: string, name: string): Promise<UserConfig> {
    const result = await this.registerApplication(name, {
      kind: 'windows-path',
      path: targetPath,
    })
    return result.settings
  }

  async registerApplication(
    name: string,
    target: ApplicationTarget,
  ): Promise<{ settings: UserConfig, applicationId: string, created: boolean }> {
    let applicationId = ''
    let created = false
    const settings = await this.updateSettings((draft) => {
      const existing = draft.applications.find((application) =>
        targetsMatch(application.target, target))
      if (existing) {
        applicationId = existing.id
        return
      }

      applicationId = randomUUID()
      created = true
      draft.applications.push({
        id: applicationId,
        name: normalizeApplicationName(name),
        target: structuredClone(target),
      })
    })

    return { settings, applicationId, created }
  }

  async registerAndAssignApplication(
    gesture: string,
    name: string,
    target: ApplicationTarget,
  ): Promise<{ settings: UserConfig, applicationId: string, created: boolean }> {
    let applicationId = ''
    let created = false
    const settings = await this.updateSettings((draft) => {
      if (!isGestureName(gesture)) throw new Error('GESTURE_NOT_FOUND')
      const existing = draft.applications.find((application) =>
        targetsMatch(application.target, target))
      if (existing) {
        applicationId = existing.id
      } else {
        applicationId = randomUUID()
        created = true
        draft.applications.push({
          id: applicationId,
          name: normalizeApplicationName(name),
          target: structuredClone(target),
        })
      }
      draft.gestureAssignments[gesture] = applicationId
      draft.inputSequenceAssignments[gesture] = null
    })

    return { settings, applicationId, created }
  }

  async renameApplication(applicationId: string, name: string): Promise<UserConfig> {
    return this.updateSettings((settings) => {
      const application = getRequiredApplication(settings, applicationId)
      application.name = normalizeApplicationName(name)
    })
  }

  async replaceWithWindowsTarget(
    applicationId: string,
    targetPath: string,
  ): Promise<UserConfig> {
    return this.replaceApplicationTarget(applicationId, {
      kind: 'windows-path',
      path: targetPath,
    })
  }

  async replaceApplicationTarget(
    applicationId: string,
    target: ApplicationTarget,
  ): Promise<UserConfig> {
    return this.updateSettings((settings) => {
      const application = getRequiredApplication(settings, applicationId)
      const duplicate = settings.applications.find((item) =>
        item.id !== applicationId && targetsMatch(item.target, target))
      if (duplicate) throw new Error('APPLICATION_ALREADY_REGISTERED')
      application.target = structuredClone(target)
    })
  }

  async removeApplication(applicationId: string): Promise<{
    settings: UserConfig
    clearedAssignments: number
  }> {
    let clearedAssignments = 0
    const settings = await this.updateSettings((draft) => {
      const applicationIndex = draft.applications.findIndex((item) => item.id === applicationId)
      if (applicationIndex < 0) throw new Error('APPLICATION_NOT_FOUND')

      draft.applications.splice(applicationIndex, 1)
      for (const gesture of ALL_GESTURE_NAMES) {
        if (draft.gestureAssignments[gesture] === applicationId) {
          draft.gestureAssignments[gesture] = null
          clearedAssignments += 1
        }
      }
    })

    return { settings, clearedAssignments }
  }

  async assignGesture(gesture: string, applicationId: string | null): Promise<UserConfig> {
    return this.updateSettings((settings) => {
      if (!isGestureName(gesture)) throw new Error('GESTURE_NOT_FOUND')
      if (
        applicationId !== null &&
        !settings.applications.some((application) => application.id === applicationId)
      ) {
        throw new Error('APPLICATION_NOT_FOUND')
      }

      settings.gestureAssignments[gesture] = applicationId
      settings.inputSequenceAssignments[gesture] = null
    })
  }

  async assignInputSequence(
    gesture: string,
    steps: InputSequenceStep[],
  ): Promise<UserConfig> {
    return this.updateSettings((settings) => {
      if (!isGestureName(gesture)) throw new Error('GESTURE_NOT_FOUND')
      const normalized = normalizeInputSequence(steps)
      if (!normalized) throw new Error('INVALID_INPUT_SEQUENCE')

      settings.gestureAssignments[gesture] = null
      settings.inputSequenceAssignments[gesture] = normalized
    })
  }

  async setGestureHoldMs(gestureHoldMs: number): Promise<UserConfig> {
    return this.updateSettings((settings) => {
      if (!isValidGestureHoldMs(gestureHoldMs)) {
        throw new Error('INVALID_GESTURE_HOLD_MS')
      }
      settings.gestureHoldMs = gestureHoldMs
    })
  }

  async clearGestureAssignments(): Promise<{
    settings: UserConfig
    clearedAssignments: number
  }> {
    let clearedAssignments = 0
    const settings = await this.updateSettings((draft) => {
      for (const gesture of ALL_GESTURE_NAMES) {
        if (
          draft.gestureAssignments[gesture] !== null ||
          draft.inputSequenceAssignments[gesture] !== null
        ) {
          draft.gestureAssignments[gesture] = null
          draft.inputSequenceAssignments[gesture] = null
          clearedAssignments += 1
        }
      }
    })

    return { settings, clearedAssignments }
  }

  private async updateSettings(
    mutate: (settings: UserConfig) => void,
  ): Promise<UserConfig> {
    const settings = await this.getSettings()
    mutate(settings)
    await this.saveSettings(settings)
    this.cachedSettings = settings
    return structuredClone(settings)
  }

  private async loadSettings(): Promise<UserConfig> {
    try {
      const contents = await readFile(this.settingsPath, 'utf8')
      const parsed = JSON.parse(contents)
      const settings = migrateSettings(parsed)
      if (!settings) throw new Error('INVALID_SETTINGS')
      if (isRecord(parsed) && parsed.version !== settings.version) {
        await this.saveSettings(settings)
      }
      return settings
    } catch (error) {
      if (getErrorCode(error) !== 'ENOENT') {
        await this.backupCorruptSettings()
        this.recoveryNotice = '손상된 설정을 백업하고 기본 명령으로 복구했습니다.'
      }

      const defaults = createDefaultSettings()
      await this.saveSettings(defaults)
      return defaults
    }
  }

  private async backupCorruptSettings() {
    const backupPath = this.settingsPath.replace(
      /\.json$/i,
      `.corrupt-${Date.now()}.json`,
    )

    try {
      await rename(this.settingsPath, backupPath)
    } catch (error) {
      if (getErrorCode(error) !== 'ENOENT') throw error
    }
  }

  private async saveSettings(settings: UserConfig) {
    const directory = path.dirname(this.settingsPath)
    const temporaryPath = `${this.settingsPath}.tmp-${process.pid}`
    await mkdir(directory, { recursive: true })
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.settingsPath)
  }
}

let settingsStore: ApplicationSettingsStore | null = null

export function configureApplicationSettingsStore(settingsPath: string) {
  settingsStore = new ApplicationSettingsStore(settingsPath)
  return settingsStore
}

export function getApplicationSettingsStore() {
  if (!settingsStore) throw new Error('APPLICATION_SETTINGS_STORE_NOT_CONFIGURED')
  return settingsStore
}

export function migrateSettings(value: unknown): UserConfig | null {
  if (
    !isRecord(value) ||
    (
      value.version !== 1 &&
      value.version !== 2 &&
      value.version !== 3 &&
      value.version !== 4 &&
      value.version !== 5 &&
      value.version !== 6 &&
      value.version !== 7
    )
  ) {
    return null
  }
  if (!Array.isArray(value.applications) || !isRecord(value.gestureAssignments)) return null

  const applications: ApplicationRecord[] = []
  const applicationIds = new Set<string>()
  for (const candidate of value.applications) {
    if (!isRecord(candidate)) return null
    if (typeof candidate.id !== 'string' || !candidate.id) return null
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) return null
    if (applicationIds.has(candidate.id)) return null
    const target = parseApplicationTarget(candidate.target, value.version)
    if (!target) return null
    applicationIds.add(candidate.id)
    applications.push({
      id: candidate.id,
      name: normalizeApplicationName(candidate.name),
      target,
    })
  }

  const gestureAssignments = Object.fromEntries(
    ALL_GESTURE_NAMES.map((gesture) => {
      const assignment = value.gestureAssignments[gesture]
      const validAssignment =
        typeof assignment === 'string' && applicationIds.has(assignment)
          ? assignment
          : null
      return [
        gesture,
        isLegacyDefaultAssignment(value.version, gesture, validAssignment)
          ? null
          : validAssignment,
      ]
    }),
  )

  const inputSequenceAssignments = Object.fromEntries(
    ALL_GESTURE_NAMES.map((gesture) => {
      if (value.version < 6 || !isRecord(value.inputSequenceAssignments)) {
        return [gesture, null]
      }
      return [
        gesture,
        normalizeInputSequence(value.inputSequenceAssignments[gesture]),
      ]
    }),
  )

  for (const gesture of ALL_GESTURE_NAMES) {
    if (inputSequenceAssignments[gesture] !== null) {
      gestureAssignments[gesture] = null
    }
  }

  const gestureHoldMs = value.version >= 7 && isValidGestureHoldMs(value.gestureHoldMs)
    ? value.gestureHoldMs
    : DEFAULT_GESTURE_HOLD_MS

  return {
    version: 7,
    applications,
    gestureAssignments,
    inputSequenceAssignments,
    gestureHoldMs,
  }
}

function parseApplicationTarget(
  value: unknown,
  settingsVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7,
): ApplicationTarget | null {
  if (!isRecord(value)) return null
  if (value.kind === 'builtin' && typeof value.key === 'string' && value.key) {
    if (!AVAILABLE_APPS.some((application) => application.name === value.key)) return null
    return { kind: 'builtin', key: value.key }
  }
  if (
    value.kind === 'windows-path' &&
    typeof value.path === 'string' &&
    path.isAbsolute(value.path)
  ) {
    return { kind: 'windows-path', path: value.path }
  }
  if (
    settingsVersion >= 2 &&
    value.kind === 'windows-app-id' &&
    typeof value.appUserModelId === 'string' &&
    value.appUserModelId.trim() &&
    value.appUserModelId.length <= 1024
  ) {
    return { kind: 'windows-app-id', appUserModelId: value.appUserModelId.trim() }
  }
  if (
    settingsVersion >= 5 &&
    value.kind === 'steam-app' &&
    typeof value.appId === 'string' &&
    isValidSteamAppId(value.appId)
  ) {
    return { kind: 'steam-app', appId: value.appId }
  }
  return null
}

function isLegacyDefaultAssignment(
  settingsVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  gesture: string,
  applicationId: string | null,
) {
  if (!applicationId || settingsVersion >= 4) return false
  const defaults = settingsVersion === 3
    ? LEGACY_V3_DEFAULT_ASSIGNMENTS
    : LEGACY_V1_V2_DEFAULT_ASSIGNMENTS
  return defaults[gesture] === applicationId
}

function getRequiredApplication(settings: UserConfig, applicationId: string) {
  const application = settings.applications.find((item) => item.id === applicationId)
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  return application
}

export function targetsMatch(left: ApplicationTarget, right: ApplicationTarget) {
  if (left.kind !== right.kind) return false
  if (left.kind === 'builtin' && right.kind === 'builtin') {
    return left.key.toLocaleLowerCase() === right.key.toLocaleLowerCase()
  }
  if (left.kind === 'windows-path' && right.kind === 'windows-path') {
    return path.normalize(left.path).toLocaleLowerCase() ===
      path.normalize(right.path).toLocaleLowerCase()
  }
  if (left.kind === 'windows-app-id' && right.kind === 'windows-app-id') {
    return left.appUserModelId.toLocaleLowerCase() ===
      right.appUserModelId.toLocaleLowerCase()
  }
  if (left.kind === 'steam-app' && right.kind === 'steam-app') {
    return left.appId === right.appId
  }
  return false
}

function normalizeApplicationName(name: string) {
  const normalized = name.trim()
  if (!normalized) throw new Error('INVALID_APPLICATION_NAME')
  return normalized.slice(0, 80)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getErrorCode(error: unknown) {
  if (!isRecord(error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function isValidSteamAppId(value: string) {
  if (!/^\d{1,10}$/.test(value)) return false
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 0xFFFF_FFFF
}

function isValidGestureHoldMs(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_GESTURE_HOLD_MS &&
    value <= MAX_GESTURE_HOLD_MS
}
