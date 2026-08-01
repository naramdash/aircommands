import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type WebLoginSettings = {
  loginUrl: string
  loginHint: string
}

const DEFAULT_SETTINGS: WebLoginSettings = {
  loginUrl: '',
  loginHint: '',
}

export class WebLoginSettingsStore {
  private cachedSettings: WebLoginSettings | null = null

  constructor(private readonly settingsPath: string) {}

  async getSettings(): Promise<WebLoginSettings> {
    if (!this.cachedSettings) this.cachedSettings = await this.loadSettings()
    return structuredClone(this.cachedSettings)
  }

  async setSettings(settings: WebLoginSettings): Promise<WebLoginSettings> {
    const normalized = {
      loginUrl: normalizeLoginUrl(settings.loginUrl),
      loginHint: normalizeLoginHint(settings.loginHint),
    }
    await this.saveSettings(normalized)
    this.cachedSettings = normalized
    return structuredClone(normalized)
  }

  private async loadSettings(): Promise<WebLoginSettings> {
    try {
      const contents = await readFile(this.settingsPath, 'utf8')
      const parsed: unknown = JSON.parse(contents)
      if (!isRecord(parsed) || typeof parsed.loginUrl !== 'string' || typeof parsed.loginHint !== 'string') {
        throw new Error('INVALID_WEB_LOGIN_SETTINGS')
      }
      return {
        loginUrl: normalizeLoginUrl(parsed.loginUrl),
        loginHint: normalizeLoginHint(parsed.loginHint),
      }
    } catch (error) {
      if (getErrorCode(error) !== 'ENOENT') {
        console.warn('Failed to load web login settings; using defaults:', error)
      }
      await this.saveSettings(DEFAULT_SETTINGS)
      return structuredClone(DEFAULT_SETTINGS)
    }
  }

  private async saveSettings(settings: WebLoginSettings) {
    const directory = path.dirname(this.settingsPath)
    const temporaryPath = `${this.settingsPath}.tmp-${process.pid}`
    await mkdir(directory, { recursive: true })
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.settingsPath)
  }
}

let settingsStore: WebLoginSettingsStore | null = null

export function configureWebLoginSettingsStore(settingsPath: string) {
  settingsStore = new WebLoginSettingsStore(settingsPath)
  return settingsStore
}

export function getWebLoginSettingsStore() {
  if (!settingsStore) throw new Error('WEB_LOGIN_SETTINGS_STORE_NOT_CONFIGURED')
  return settingsStore
}

export function normalizeLoginUrl(value: string) {
  const normalized = value.trim()
  if (!normalized) return ''
  if (normalized.length > 2048 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error('INVALID_LOGIN_URL')
  }
  try {
    const url = new URL(normalized)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('INVALID_LOGIN_URL')
    return normalized
  } catch {
    throw new Error('INVALID_LOGIN_URL')
  }
}

export function normalizeLoginHint(value: string) {
  const normalized = value.trim()
  if (normalized.length > 320 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error('INVALID_LOGIN_HINT')
  }
  return normalized
}

export function isSameLoginOrigin(currentValue: string, configuredValue: string) {
  try {
    const currentUrl = new URL(currentValue)
    const configuredUrl = new URL(configuredValue)
    return currentUrl.protocol === configuredUrl.protocol && currentUrl.host === configuredUrl.host
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getErrorCode(error: unknown) {
  if (!isRecord(error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}
