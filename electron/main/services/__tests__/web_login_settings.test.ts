import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  normalizeLoginHint,
  normalizeLoginUrl,
  isSameLoginOrigin,
  WebLoginSettingsStore,
} from '../web_login_settings'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  )
})

describe('WebLoginSettingsStore', () => {
  it('creates empty settings and persists a login URL and hint', async () => {
    const settingsPath = await createSettingsPath()
    const store = new WebLoginSettingsStore(settingsPath)

    expect(await store.getSettings()).toEqual({ loginUrl: '', loginHint: '' })
    await store.setSettings({
      loginUrl: ' https://service.example.com/login ',
      loginHint: ' user@example.com ',
    })

    const expected = {
      loginUrl: 'https://service.example.com/login',
      loginHint: 'user@example.com',
    }
    expect(await new WebLoginSettingsStore(settingsPath).getSettings()).toEqual(expected)
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual(expected)
  })

  it('validates login URLs', () => {
    expect(normalizeLoginUrl('')).toBe('')
    expect(normalizeLoginUrl('http://localhost/login')).toBe('http://localhost/login')
    expect(() => normalizeLoginUrl('not-a-url')).toThrow('INVALID_LOGIN_URL')
    expect(() => normalizeLoginUrl('file:///tmp/login')).toThrow('INVALID_LOGIN_URL')
  })

  it('keeps login automation active after same-origin redirects', () => {
    expect(isSameLoginOrigin(
      'https://service.example.com/member/login/',
      'https://service.example.com',
    )).toBe(true)
    expect(isSameLoginOrigin(
      'https://accounts.example.com/member/login/',
      'https://service.example.com',
    )).toBe(false)
  })

  it('rejects control characters and oversized hints', () => {
    expect(() => normalizeLoginHint('user\n@example.com')).toThrow('INVALID_LOGIN_HINT')
    expect(() => normalizeLoginHint('x'.repeat(321))).toThrow('INVALID_LOGIN_HINT')
  })

  it('falls back to empty settings for malformed files', async () => {
    const settingsPath = await createSettingsPath()
    await writeFile(settingsPath, '{not-json', 'utf8')

    expect(await new WebLoginSettingsStore(settingsPath).getSettings()).toEqual({
      loginUrl: '',
      loginHint: '',
    })
  })
})

async function createSettingsPath() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aircommands-web-login-'))
  temporaryDirectories.push(directory)
  return path.join(directory, 'web-login.json')
}
