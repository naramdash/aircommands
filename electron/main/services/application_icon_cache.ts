import path from 'node:path'
import type { ApplicationTarget } from './application_settings'

const iconCache = new Map<string, string>()

export function getCachedApplicationIcon(target: ApplicationTarget) {
  return iconCache.get(getApplicationIconCacheKey(target))
}

export function cacheApplicationIcon(target: ApplicationTarget, iconDataUrl: string) {
  iconCache.set(getApplicationIconCacheKey(target), iconDataUrl)
}

export function getApplicationIconCacheKey(target: ApplicationTarget) {
  if (target.kind === 'builtin') {
    return `builtin:${target.key.toLocaleLowerCase()}`
  }
  if (target.kind === 'windows-path') {
    return `windows-path:${path.normalize(target.path).toLocaleLowerCase()}`
  }
  if (target.kind === 'windows-app-id') {
    return `windows-app-id:${target.appUserModelId.toLocaleLowerCase()}`
  }
  return `steam-app:${target.appId}`
}

export function clearApplicationIconCache() {
  iconCache.clear()
}
