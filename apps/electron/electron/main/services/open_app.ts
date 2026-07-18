import { AVAILABLE_APPS, getAppCommands } from './apps'
import { runAppCommand, type CommandResult } from './app_command_runner'
import { buildOpenAppRequestInput } from './open_app_request_input'

export type OpenAppRequest = {
  app?: unknown
  source?: unknown
  gesture?: unknown
  clientRequestId?: unknown
}

export type OpenAppResponse =
  | {
    success: true
    app: string
    message: string
    requestId: string
  }
  | {
    success: false
    app?: string
    error:
    | 'INVALID_BODY'
    | 'APPLICATION_NOT_FOUND'
    | 'DUPLICATE_REQUEST'
    | 'EXECUTION_FAILED'
    message: string
    availableApps?: string[]
    requestId: string
  }

export type OpenAppOptions = {
  now?: number
  runner?: (command: string | string[]) => Promise<CommandResult>
}

const REQUEST_DEDUPE_MS = 3000
const recentRequests = new Map<string, number>()

export async function openAppRequest(
  request: OpenAppRequest,
  options: OpenAppOptions = {},
): Promise<OpenAppResponse> {
  const normalizedRequest = buildOpenAppRequestInput(request, {})
  const now = options.now ?? Date.now()
  const runner = options.runner ?? runAppCommand
  const requestId = getRequestId(normalizedRequest, now)

  pruneRecentRequests(now)

  if (
    !isRecord(normalizedRequest) ||
    typeof normalizedRequest.app !== 'string' ||
    !normalizedRequest.app.trim()
  ) {
    return {
      success: false,
      error: 'INVALID_BODY',
      message: '실행할 앱 이름이 필요합니다.',
      requestId,
    }
  }

  const app = normalizedRequest.app.trim().toLowerCase()

  if (recentRequests.has(requestId)) {
    return {
      success: false,
      app,
      error: 'DUPLICATE_REQUEST',
      message: '이미 처리 중이거나 최근 처리된 요청입니다.',
      requestId,
    }
  }

  recentRequests.set(requestId, now)

  const commands = getAppCommands(app)
  if (!commands) {
    return {
      success: false,
      app,
      error: 'APPLICATION_NOT_FOUND',
      message: `등록되지 않은 앱입니다: ${app}`,
      availableApps: AVAILABLE_APPS.map((availableApp) => availableApp.name),
      requestId,
    }
  }

  const result = await runner(commands)
  if (!result.success) {
    return {
      success: false,
      app,
      error: 'EXECUTION_FAILED',
      message: result.message,
      requestId,
    }
  }

  return {
    success: true,
    app,
    message: `${app} opened successfully`,
    requestId,
  }
}

export function clearOpenAppRequestDedupeForTests() {
  recentRequests.clear()
}

function getRequestId(request: OpenAppRequest, now: number) {
  if (isRecord(request) && typeof request.clientRequestId === 'string') {
    const requestId = request.clientRequestId.trim()
    if (requestId) return requestId
  }

  const app = isRecord(request) && typeof request.app === 'string' ? request.app : 'unknown'
  return `${app}-${now}`
}

function pruneRecentRequests(now: number) {
  for (const [requestId, requestedAt] of recentRequests) {
    if (now - requestedAt > REQUEST_DEDUPE_MS) {
      recentRequests.delete(requestId)
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
