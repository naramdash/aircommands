import type { OpenAppRequest } from './open_app'

type QueryValue = string | string[] | undefined
type QueryRecord = Record<string, QueryValue>

export type OpenAppRequestDefaults = {
  app?: string
  source?: string
}

export function buildOpenAppRequestInput(
  rawBody: unknown,
  query: QueryRecord,
  defaults: OpenAppRequestDefaults = {},
): OpenAppRequest {
  const body = parseBodyToRecord(rawBody)

  return {
    ...body,
    app:
      pickString(body, 'app', 'appName', 'application') ??
      pickString(query, 'app', 'appName', 'application') ??
      defaults.app,
    source: pickString(body, 'source') ?? pickString(query, 'source') ?? defaults.source,
    gesture: pickString(body, 'gesture') ?? pickString(query, 'gesture'),
    clientRequestId:
      pickString(body, 'clientRequestId', 'requestId') ??
      pickString(query, 'clientRequestId', 'requestId'),
  }
}

function parseBodyToRecord(rawBody: unknown): Record<string, unknown> {
  if (rawBody instanceof URLSearchParams) {
    const record: Record<string, unknown> = {}
    for (const [key, value] of rawBody) {
      if (!(key in record)) {
        record[key] = value
      }
    }
    return record
  }

  if (hasStringGetter(rawBody)) {
    const app = rawBody.get('app') ?? rawBody.get('appName') ?? rawBody.get('application')
    const source = rawBody.get('source')
    const gesture = rawBody.get('gesture')
    const clientRequestId = rawBody.get('clientRequestId') ?? rawBody.get('requestId')

    return {
      ...(typeof app === 'string' ? { app } : {}),
      ...(typeof source === 'string' ? { source } : {}),
      ...(typeof gesture === 'string' ? { gesture } : {}),
      ...(typeof clientRequestId === 'string' ? { clientRequestId } : {}),
    }
  }

  if (isRecord(rawBody)) {
    if (pickString(rawBody, 'app', 'appName', 'application')) {
      return rawBody
    }

    for (const nestedKey of ['body', 'data', '_data', 'payload'] as const) {
      if (nestedKey in rawBody) {
        const nested = parseBodyToRecord(rawBody[nestedKey])
        if (Object.keys(nested).length > 0) return nested
      }
    }

    return rawBody
  }

  const textBody = toBodyText(rawBody)
  if (textBody === undefined) return {}

  const trimmed = textBody.trim()
  if (!trimmed) return {}

  const jsonValue = tryParseJson(trimmed)
  if (jsonValue !== undefined) {
    if (isRecord(jsonValue)) return jsonValue
    if (typeof jsonValue === 'string') return { app: jsonValue }
    return {}
  }

  if (looksLikeUrlEncoded(trimmed)) {
    const params = new URLSearchParams(trimmed)
    const record: Record<string, unknown> = {}
    for (const [key, value] of params) {
      if (!(key in record)) {
        record[key] = value
      }
    }
    return record
  }

  return { app: trimmed }
}

function toBodyText(rawBody: unknown): string | undefined {
  if (typeof rawBody === 'string') return rawBody

  if (rawBody instanceof Uint8Array) {
    return new TextDecoder().decode(rawBody)
  }

  if (rawBody instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(rawBody))
  }

  return undefined
}

function looksLikeUrlEncoded(value: string) {
  return value.includes('=') || value.includes('&')
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function pickString(source: QueryRecord | Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }

    if (Array.isArray(value)) {
      const firstString = value.find((item) => typeof item === 'string' && item.trim())
      if (firstString) return firstString.trim()
    }
  }

  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasStringGetter(
  value: unknown,
): value is { get: (key: string) => string | null | undefined } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'get' in value &&
    typeof (value as { get?: unknown }).get === 'function'
  )
}
