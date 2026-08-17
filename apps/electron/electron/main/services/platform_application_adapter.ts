import { app, dialog, shell, type BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import {
  getBuiltinPresentation,
  type ApplicationRecord,
  type ApplicationSummary,
  type ApplicationTarget,
  type UserConfig,
  type UserSettingsView,
} from './application_settings'
import { getAppCommands } from './apps'
import { runAppCommand, type CommandResult } from './app_command_runner'
import {
  cacheApplicationIcon,
  getCachedApplicationIcon,
} from './application_icon_cache'
import {
  isValidSteamAppId,
  resolveSteamExecutablePath,
} from './steam_application_discovery'

export type ApplicationLaunchError =
  | 'APPLICATION_NOT_FOUND'
  | 'APPLICATION_TARGET_MISSING'
  | 'UNSUPPORTED_PLATFORM'
  | 'EXECUTION_FAILED'

export type ApplicationLaunchResult =
  | { success: true }
  | { success: false, error: ApplicationLaunchError, message: string }

export type ApplicationPickerResult =
  | { success: true, canceled: true }
  | { success: true, canceled: false, path: string, suggestedName: string }
  | { success: false, error: 'UNSUPPORTED_PLATFORM' | 'INVALID_APPLICATION_TARGET', message: string }

export async function pickWindowsApplication(
  parentWindow?: BrowserWindow | null,
): Promise<ApplicationPickerResult> {
  if (process.platform !== 'win32') {
    return {
      success: false,
      error: 'UNSUPPORTED_PLATFORM',
      message: '사용자 프로그램 추가는 현재 Windows에서만 지원합니다.',
    }
  }

  const options: Electron.OpenDialogOptions = {
    title: '실행할 프로그램 선택',
    buttonLabel: '프로그램 추가',
    properties: ['openFile', 'dontAddToRecent'],
    filters: [
      { name: 'Windows 프로그램', extensions: ['exe', 'lnk'] },
    ],
  }
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) return { success: true, canceled: true }

  const targetPath = result.filePaths[0]
  const validation = await validateWindowsApplicationTarget(targetPath)
  if (!validation.success) return validation

  return {
    success: true,
    canceled: false,
    path: targetPath,
    suggestedName: path.basename(targetPath, path.extname(targetPath)),
  }
}

export async function validateWindowsApplicationTarget(
  targetPath: string,
): Promise<
  | { success: true }
  | { success: false, error: 'INVALID_APPLICATION_TARGET', message: string }
> {
  if (!path.isAbsolute(targetPath)) {
    return {
      success: false,
      error: 'INVALID_APPLICATION_TARGET',
      message: '프로그램 경로는 절대 경로여야 합니다.',
    }
  }

  if (!['.exe', '.lnk'].includes(path.extname(targetPath).toLowerCase())) {
    return {
      success: false,
      error: 'INVALID_APPLICATION_TARGET',
      message: '.exe 또는 .lnk 파일만 선택할 수 있습니다.',
    }
  }

  try {
    const targetStat = await stat(targetPath)
    if (!targetStat.isFile()) throw new Error('NOT_A_FILE')
  } catch {
    return {
      success: false,
      error: 'INVALID_APPLICATION_TARGET',
      message: '선택한 프로그램 파일을 찾을 수 없습니다.',
    }
  }

  return { success: true }
}

let webLoginLauncher: (() => Promise<ApplicationLaunchResult>) | null = null

export function registerWebLoginLauncher(launcher: () => Promise<ApplicationLaunchResult>) {
  webLoginLauncher = launcher
}

export async function launchApplication(
  application: ApplicationRecord,
  options: {
    runBuiltin?: (command: string | string[]) => Promise<CommandResult>
    openPath?: (targetPath: string) => Promise<string>
    launchAppId?: (appUserModelId: string) => Promise<void>
    resolveSteamExecutable?: () => Promise<string | null>
    launchSteamApp?: (steamExecutablePath: string, appId: string) => Promise<void>
    openWebLogin?: () => Promise<ApplicationLaunchResult>
    platform?: NodeJS.Platform
  } = {},
): Promise<ApplicationLaunchResult> {
  const platform = options.platform ?? process.platform

  if (application.target.kind === 'builtin') {
    if (application.target.key === 'google-login') {
      const launcher = options.openWebLogin ?? webLoginLauncher
      if (!launcher) {
        return {
          success: false,
          error: 'EXECUTION_FAILED',
          message: 'Google 웹 로그인 기능을 실행할 수 없습니다.',
        }
      }
      return launcher()
    }

    const commands = getAppCommands(application.target.key, platform)
    if (!commands) {
      return {
        success: false,
        error: 'EXECUTION_FAILED',
        message: `실행 명령을 찾을 수 없습니다: ${application.name}`,
      }
    }

    const result = await (options.runBuiltin ?? runAppCommand)(commands)
    return result.success
      ? { success: true }
      : { success: false, error: 'EXECUTION_FAILED', message: result.message }
  }

  if (platform !== 'win32') {
    return {
      success: false,
      error: 'UNSUPPORTED_PLATFORM',
      message: '이 사용자 프로그램은 Windows에서만 실행할 수 있습니다.',
    }
  }

  if (application.target.kind === 'windows-app-id') {
    try {
      await (options.launchAppId ?? launchWindowsAppId)(application.target.appUserModelId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: 'EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Windows 앱을 실행하지 못했습니다.',
      }
    }
  }

  if (application.target.kind === 'steam-app') {
    if (!isValidSteamAppId(application.target.appId)) {
      return {
        success: false,
        error: 'EXECUTION_FAILED',
        message: 'Steam App ID가 올바르지 않습니다.',
      }
    }

    const steamExecutablePath = await (
      options.resolveSteamExecutable ?? resolveSteamExecutablePath
    )()
    if (!steamExecutablePath) {
      return {
        success: false,
        error: 'APPLICATION_TARGET_MISSING',
        message: 'Steam 설치 파일을 찾을 수 없습니다.',
      }
    }

    try {
      await (options.launchSteamApp ?? launchSteamApplication)(
        steamExecutablePath,
        application.target.appId,
      )
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: 'EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Steam 게임을 실행하지 못했습니다.',
      }
    }
  }

  const validation = await validateWindowsApplicationTarget(application.target.path)
  if (!validation.success) {
    return {
      success: false,
      error: 'APPLICATION_TARGET_MISSING',
      message: validation.message,
    }
  }

  const errorMessage = await (options.openPath ?? shell.openPath)(application.target.path)
  if (errorMessage) {
    return {
      success: false,
      error: 'EXECUTION_FAILED',
      message: errorMessage,
    }
  }

  return { success: true }
}

export async function buildSettingsView(
  settings: UserConfig,
  recoveryNotice?: string,
): Promise<UserSettingsView> {
  const applications = await Promise.all(settings.applications.map(toApplicationSummary))
  return {
    applications,
    gestureAssignments: { ...settings.gestureAssignments },
    inputSequenceAssignments: structuredClone(settings.inputSequenceAssignments),
    windowsCommandAssignments: { ...settings.windowsCommandAssignments },
    gestureModifierAssignments: { ...settings.gestureModifierAssignments },
    gestureHoldMs: settings.gestureHoldMs,
    platform: process.platform,
    supportsCustomApplications: process.platform === 'win32',
    ...(recoveryNotice ? { recoveryNotice } : {}),
  }
}

async function toApplicationSummary(application: ApplicationRecord): Promise<ApplicationSummary> {
  const iconText = application.target.kind === 'builtin'
    ? getBuiltinPresentation(application.target.key).icon
    : application.target.kind === 'windows-app-id'
      ? '⊞'
      : application.target.kind === 'steam-app'
        ? '🎮'
        : '🧩'
  const targetLabel = application.target.kind === 'builtin'
    ? `기본 앱: ${application.target.key}`
    : application.target.kind === 'windows-app-id'
      ? `Windows 앱: ${application.target.appUserModelId}`
      : application.target.kind === 'steam-app'
        ? `Steam 게임: ${application.target.appId}`
        : application.target.path
  const iconDataUrl = application.target.kind === 'builtin'
    ? undefined
    : getCachedApplicationIcon(application.target) ??
      (
        application.target.kind === 'windows-path'
          ? await getApplicationIcon(application.target)
          : undefined
      )

  return {
    id: application.id,
    name: application.name,
    targetKind: application.target.kind,
    targetLabel,
    iconText,
    ...(iconDataUrl ? { iconDataUrl } : {}),
  }
}

export function buildWindowsAppLaunchCommand(appUserModelId: string) {
  return {
    executable: 'explorer.exe',
    args: [`shell:AppsFolder\\${appUserModelId}`],
  }
}

export function buildSteamAppLaunchCommand(
  steamExecutablePath: string,
  appId: string,
) {
  if (!path.isAbsolute(steamExecutablePath) || !isValidSteamAppId(appId)) {
    throw new Error('INVALID_STEAM_APPLICATION_TARGET')
  }
  return {
    executable: steamExecutablePath,
    args: ['-applaunch', appId],
  }
}

function launchWindowsAppId(appUserModelId: string): Promise<void> {
  const command = buildWindowsAppLaunchCommand(appUserModelId)
  return new Promise((resolve, reject) => {
    const child = spawn(
      command.executable,
      command.args,
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      },
    )
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

function launchSteamApplication(
  steamExecutablePath: string,
  appId: string,
): Promise<void> {
  const command = buildSteamAppLaunchCommand(steamExecutablePath, appId)
  return launchDetached(command.executable, command.args)
}

function launchDetached(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

async function getApplicationIcon(target: Extract<ApplicationTarget, { kind: 'windows-path' }>) {
  const cached = getCachedApplicationIcon(target)
  if (cached) return cached

  try {
    const icon = await app.getFileIcon(target.path, { size: 'normal' })
    if (icon.isEmpty()) return undefined
    const dataUrl = icon.toDataURL()
    cacheApplicationIcon(target, dataUrl)
    return dataUrl
  } catch {
    return undefined
  }
}
