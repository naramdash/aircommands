import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  ALL_GESTURE_NAMES,
  ApplicationSettingsStore,
  createDefaultSettings,
  migrateSettings,
} from '../application_settings'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  )
})

describe('ApplicationSettingsStore', () => {
  it('creates unassigned one-hand gestures on first load', async () => {
    const settingsPath = await createSettingsPath()
    const store = new ApplicationSettingsStore(settingsPath)

    const settings = await store.getSettings()

    expect(settings.version).toBe(9)
    expect(settings.gestureHoldMs).toBe(280)
    expect(settings.applications).toHaveLength(21)
    expect(Object.keys(settings.gestureAssignments)).toHaveLength(6)
    expect(Object.values(settings.gestureAssignments).every((assignment) =>
      assignment === null)).toBe(true)
    expect(Object.values(settings.inputSequenceAssignments).every((assignment) =>
      assignment === null)).toBe(true)
    expect(Object.values(settings.windowsCommandAssignments).every((assignment) =>
      assignment === null)).toBe(true)
    expect(Object.values(settings.gestureModifierAssignments).every((modifier) =>
      modifier === 'none')).toBe(true)
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual(settings)
  })

  it('persists names and assignments across store instances', async () => {
    const settingsPath = await createSettingsPath()
    const firstStore = new ApplicationSettingsStore(settingsPath)
    await firstStore.getSettings()
    await firstStore.renameApplication('builtin:chrome', '업무용 브라우저')
    await firstStore.assignGesture(ALL_GESTURE_NAMES[0], 'builtin:spotify')

    const reloaded = await new ApplicationSettingsStore(settingsPath).getSettings()

    expect(reloaded.applications.find((item) => item.id === 'builtin:chrome')?.name)
      .toBe('업무용 브라우저')
    expect(reloaded.gestureAssignments[ALL_GESTURE_NAMES[0]]).toBe('builtin:spotify')
  })

  it('clears every assignment when an application is removed', async () => {
    const settingsPath = await createSettingsPath()
    const store = new ApplicationSettingsStore(settingsPath)
    await store.getSettings()
    await store.assignGesture(ALL_GESTURE_NAMES[0], 'builtin:chrome')

    const result = await store.removeApplication('builtin:chrome')

    expect(result.clearedAssignments).toBeGreaterThan(0)
    expect(result.settings.applications.some((item) => item.id === 'builtin:chrome')).toBe(false)
    expect(Object.values(result.settings.gestureAssignments)).not.toContain('builtin:chrome')
  })

  it('clears all gesture assignments without removing applications and persists it', async () => {
    const settingsPath = await createSettingsPath()
    const store = new ApplicationSettingsStore(settingsPath)
    const initial = await store.getSettings()
    await store.assignGesture(ALL_GESTURE_NAMES[0], 'builtin:chrome')
    await store.assignInputSequence(ALL_GESTURE_NAMES[1], [
      { type: 'keys', keys: ['P'] },
      { type: 'delay', durationMs: 300 },
      { type: 'keys', keys: ['ENTER'] },
    ])
    await store.assignWindowsCommand(ALL_GESTURE_NAMES[2], 'switch-window-next')

    const result = await store.clearGestureAssignments()
    const reloaded = await new ApplicationSettingsStore(settingsPath).getSettings()

    expect(result.clearedAssignments).toBe(3)
    expect(result.settings.applications).toEqual(initial.applications)
    expect(Object.values(result.settings.gestureAssignments).every((assignment) =>
      assignment === null)).toBe(true)
    expect(Object.values(result.settings.inputSequenceAssignments).every((assignment) =>
      assignment === null)).toBe(true)
    expect(Object.values(result.settings.windowsCommandAssignments).every((assignment) =>
      assignment === null)).toBe(true)
    expect(reloaded).toEqual(result.settings)
  })

  it('persists input sequences and keeps program and sequence assignments exclusive', async () => {
    const settingsPath = await createSettingsPath()
    const gesture = ALL_GESTURE_NAMES[0]
    const store = new ApplicationSettingsStore(settingsPath)
    await store.getSettings()

    const withSequence = await store.assignInputSequence(gesture, [
      { type: 'keys', keys: ['CONTROL', 'P'] },
      { type: 'delay', durationMs: 300 },
      { type: 'keys', keys: ['ENTER'] },
    ])

    expect(withSequence.gestureAssignments[gesture]).toBeNull()
    expect(withSequence.inputSequenceAssignments[gesture]).toEqual([
      { type: 'keys', keys: ['CONTROL', 'P'] },
      { type: 'delay', durationMs: 300 },
      { type: 'keys', keys: ['ENTER'] },
    ])

    const withApplication = await store.assignGesture(gesture, 'builtin:notepad')
    const reloaded = await new ApplicationSettingsStore(settingsPath).getSettings()

    expect(withApplication.gestureAssignments[gesture]).toBe('builtin:notepad')
    expect(withApplication.inputSequenceAssignments[gesture]).toBeNull()
    expect(reloaded).toEqual(withApplication)
  })

  it('persists Windows commands separately and keeps every assignment type exclusive', async () => {
    const settingsPath = await createSettingsPath()
    const gesture = ALL_GESTURE_NAMES[0]
    const store = new ApplicationSettingsStore(settingsPath)
    await store.getSettings()
    await store.assignGesture(gesture, 'builtin:notepad')

    const withWindowsCommand = await store.assignWindowsCommand(
      gesture,
      'switch-window-next',
    )

    expect(withWindowsCommand.gestureAssignments[gesture]).toBeNull()
    expect(withWindowsCommand.inputSequenceAssignments[gesture]).toBeNull()
    expect(withWindowsCommand.windowsCommandAssignments[gesture]).toBe('switch-window-next')

    const withSequence = await store.assignInputSequence(gesture, [
      { type: 'scroll', direction: 'down', notches: 3 },
    ])
    expect(withSequence.windowsCommandAssignments[gesture]).toBeNull()
    expect(withSequence.inputSequenceAssignments[gesture]).toEqual([
      { type: 'scroll', direction: 'down', notches: 3 },
    ])
  })

  it('rejects invalid input sequences without changing the saved assignment', async () => {
    const settingsPath = await createSettingsPath()
    const gesture = ALL_GESTURE_NAMES[0]
    const store = new ApplicationSettingsStore(settingsPath)
    await store.getSettings()

    await expect(store.assignInputSequence(gesture, [
      { type: 'delay', durationMs: 0 },
    ])).rejects.toThrow('INVALID_INPUT_SEQUENCE')

    expect((await store.getSettings()).inputSequenceAssignments[gesture]).toBeNull()
  })

  it('persists a customized gesture hold duration and rejects out-of-range values', async () => {
    const settingsPath = await createSettingsPath()
    const store = new ApplicationSettingsStore(settingsPath)
    await store.getSettings()

    await store.setGestureHoldMs(80)
    await expect(store.setGestureHoldMs(79)).rejects.toThrow('INVALID_GESTURE_HOLD_MS')

    const reloaded = await new ApplicationSettingsStore(settingsPath).getSettings()
    expect(reloaded.gestureHoldMs).toBe(80)
  })

  it('deduplicates discovered targets and registers plus assigns atomically', async () => {
    const settingsPath = await createSettingsPath()
    const store = new ApplicationSettingsStore(settingsPath)
    await store.getSettings()
    const target = {
      kind: 'windows-app-id' as const,
      appUserModelId: 'Contoso.App_123!App',
    }

    const first = await store.registerAndAssignApplication(
      ALL_GESTURE_NAMES[0],
      'Contoso',
      target,
    )
    const second = await store.registerAndAssignApplication(
      ALL_GESTURE_NAMES[1],
      'Contoso duplicate',
      { ...target, appUserModelId: 'contoso.app_123!app' },
    )

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.applicationId).toBe(first.applicationId)
    expect(second.settings.applications.filter((item) =>
      item.target.kind === 'windows-app-id')).toHaveLength(1)
    expect(second.settings.gestureAssignments[ALL_GESTURE_NAMES[0]]).toBe(first.applicationId)
    expect(second.settings.gestureAssignments[ALL_GESTURE_NAMES[1]]).toBe(first.applicationId)
  })

  it('backs up malformed settings and restores defaults', async () => {
    const settingsPath = await createSettingsPath()
    await writeFile(settingsPath, '{not-json', 'utf8')

    const store = new ApplicationSettingsStore(settingsPath)
    const settings = await store.getSettings()
    const files = await readdir(path.dirname(settingsPath))

    expect(settings).toEqual(createDefaultSettings())
    expect(store.consumeRecoveryNotice()).toContain('복구')
    expect(files.some((file) => file.startsWith('settings.corrupt-'))).toBe(true)
  })

  it('persists v2 cleanup of retired two-hand assignments during load', async () => {
    const settingsPath = await createSettingsPath()
    const current = createDefaultSettings()
    await writeFile(settingsPath, JSON.stringify({
      ...current,
      version: 2,
      gestureAssignments: {
        ...current.gestureAssignments,
        touch_left_index_right_index: 'builtin:chrome',
      },
    }), 'utf8')

    const migrated = await new ApplicationSettingsStore(settingsPath).getSettings()
    const persisted = JSON.parse(await readFile(settingsPath, 'utf8'))

    expect(migrated.version).toBe(9)
    expect(migrated.gestureAssignments).not.toHaveProperty('touch_left_index_right_index')
    expect(persisted).toEqual(migrated)
  })
})

describe('migrateSettings', () => {
  it('migrates v1 settings to v9 without changing custom one-hand assignments', () => {
    const current = createDefaultSettings()
    const legacy = {
      ...current,
      version: 1 as const,
      gestureAssignments: {
        ...current.gestureAssignments,
        [ALL_GESTURE_NAMES[0]]: 'builtin:spotify',
      },
    }

    const migrated = migrateSettings(legacy)

    expect(migrated?.version).toBe(9)
    expect(migrated?.gestureHoldMs).toBe(280)
    expect(migrated?.applications).toEqual(current.applications)
    expect(migrated?.gestureAssignments).toEqual({
      ...current.gestureAssignments,
      [ALL_GESTURE_NAMES[0]]: 'builtin:spotify',
    })
    expect(migrated?.gestureAssignments[ALL_GESTURE_NAMES[0]]).toBe('builtin:spotify')
  })

  it('accepts Windows AppUserModelID targets from v2', () => {
    const settings = createDefaultSettings()
    const versionTwoSettings = { ...settings, version: 2 as const }
    versionTwoSettings.applications.push({
      id: 'store-app',
      name: 'Store App',
      target: {
        kind: 'windows-app-id',
        appUserModelId: 'Contoso.Store_123!App',
      },
    })

    expect(migrateSettings(versionTwoSettings)?.applications.at(-1)?.target).toEqual({
      kind: 'windows-app-id',
      appUserModelId: 'Contoso.Store_123!App',
    })
  })

  it('migrates v4 settings to v9 without changing user assignments', () => {
    const current = createDefaultSettings()
    const versionFourSettings = {
      ...current,
      version: 4 as const,
      gestureAssignments: {
        ...current.gestureAssignments,
        [ALL_GESTURE_NAMES[0]]: 'builtin:spotify',
      },
    }

    expect(migrateSettings(versionFourSettings)).toEqual({
      ...versionFourSettings,
      version: 9,
    })
  })

  it('persists Steam App ID targets in v5 and deduplicates them by App ID', async () => {
    const settingsPath = await createSettingsPath()
    const store = new ApplicationSettingsStore(settingsPath)
    await store.getSettings()
    const first = await store.registerAndAssignApplication(
      ALL_GESTURE_NAMES[0],
      'Steam Game',
      { kind: 'steam-app', appId: '570' },
    )
    const second = await store.registerAndAssignApplication(
      ALL_GESTURE_NAMES[1],
      'Steam Game duplicate',
      { kind: 'steam-app', appId: '570' },
    )
    const reloaded = await new ApplicationSettingsStore(settingsPath).getSettings()

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.applicationId).toBe(first.applicationId)
    expect(reloaded.version).toBe(9)
    expect(reloaded.applications.filter((application) =>
      application.target.kind === 'steam-app')).toEqual([
      expect.objectContaining({
        id: first.applicationId,
        target: { kind: 'steam-app', appId: '570' },
      }),
    ])
  })

  it('drops removed two-hand assignments while preserving one-hand assignments', () => {
    const current = createDefaultSettings()
    const legacy = {
      ...current,
      version: 2 as const,
      gestureAssignments: {
        ...current.gestureAssignments,
        touch_left_thumb_right_index: 'builtin:spotify',
      },
    }

    const migrated = migrateSettings(legacy)

    expect(migrated?.gestureAssignments).toEqual(current.gestureAssignments)
    expect(migrated?.gestureAssignments).not.toHaveProperty('touch_left_thumb_right_index')
  })

  it('clears v3 seeded defaults but preserves changed assignments', () => {
    const current = createDefaultSettings()
    const legacy = {
      ...current,
      version: 3 as const,
      gestureAssignments: {
        touch_left_thumb_index: 'builtin:chrome',
        touch_left_thumb_middle: 'builtin:notepad',
        touch_left_thumb_ring: 'builtin:spotify',
        touch_right_thumb_index: 'builtin:terminal',
        touch_right_thumb_middle: 'builtin:paint',
        touch_right_thumb_ring: 'builtin:word',
      },
    }

    const migrated = migrateSettings(legacy)

    expect(migrated?.gestureAssignments.touch_left_thumb_index).toBeNull()
    expect(migrated?.gestureAssignments.touch_left_thumb_middle).toBeNull()
    expect(migrated?.gestureAssignments.touch_left_thumb_ring).toBe('builtin:spotify')
    expect(migrated?.gestureAssignments.touch_right_thumb_index).toBeNull()
    expect(migrated?.gestureAssignments.touch_right_thumb_middle).toBeNull()
    expect(migrated?.gestureAssignments.touch_right_thumb_ring).toBeNull()
  })

  it('normalizes missing and invalid assignments to unassigned', () => {
    const settings = createDefaultSettings()
    const gesture = ALL_GESTURE_NAMES[0]
    settings.gestureAssignments[gesture] = 'missing'

    expect(migrateSettings(settings)?.gestureAssignments[gesture]).toBeNull()
  })

  it('preserves valid v6 input sequences and drops invalid ones', () => {
    const settings = {
      ...createDefaultSettings(),
      version: 6 as const,
    }
    const validGesture = ALL_GESTURE_NAMES[0]
    const invalidGesture = ALL_GESTURE_NAMES[1]
    settings.inputSequenceAssignments[validGesture] = [
      { type: 'keys', keys: ['SHIFT', 'P'] },
      { type: 'delay', durationMs: 300 },
      { type: 'keys', keys: ['ENTER'] },
    ]
    settings.gestureAssignments[validGesture] = 'builtin:chrome'
    settings.inputSequenceAssignments[invalidGesture] = [
      { type: 'delay', durationMs: 0 },
    ]

    const migrated = migrateSettings(settings)

    expect(migrated?.inputSequenceAssignments[validGesture]).toEqual(
      settings.inputSequenceAssignments[validGesture],
    )
    expect(migrated?.gestureAssignments[validGesture]).toBeNull()
    expect(migrated?.inputSequenceAssignments[invalidGesture]).toBeNull()
  })

  it('preserves valid v8 Windows commands and clears conflicting assignments', () => {
    const settings = createDefaultSettings()
    const validGesture = ALL_GESTURE_NAMES[0]
    const invalidGesture = ALL_GESTURE_NAMES[1]
    settings.gestureAssignments[validGesture] = 'builtin:chrome'
    settings.inputSequenceAssignments[validGesture] = [
      { type: 'keys', keys: ['P'] },
    ]
    settings.windowsCommandAssignments[validGesture] = 'open-screen-snipping'
    settings.windowsCommandAssignments[invalidGesture] = 'unsupported' as never

    const migrated = migrateSettings(settings)

    expect(migrated?.windowsCommandAssignments[validGesture]).toBe('open-screen-snipping')
    expect(migrated?.gestureAssignments[validGesture]).toBeNull()
    expect(migrated?.inputSequenceAssignments[validGesture]).toBeNull()
    expect(migrated?.windowsCommandAssignments[invalidGesture]).toBeNull()
  })

  it('assigns and persists gesture modifier requirements', async () => {
    const settingsPath = await createSettingsPath()
    const store = new ApplicationSettingsStore(settingsPath)
    const gesture = ALL_GESTURE_NAMES[0]

    await store.assignGestureModifier(gesture, 'control_left')
    const settings = await store.getSettings()

    expect(settings.gestureModifierAssignments[gesture]).toBe('control_left')
  })

  it('rejects unknown settings versions', () => {
    expect(migrateSettings({ version: 99 })).toBeNull()
  })
})

async function createSettingsPath() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aircommands-settings-'))
  temporaryDirectories.push(directory)
  return path.join(directory, 'settings.json')
}
