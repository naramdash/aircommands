import {
  getApplicationSettingsStore,
  type UserConfig,
} from './application_settings'
import {
  launchApplication,
  type ApplicationLaunchResult,
} from './platform_application_adapter'

export type OpenAppRequest = {
  applicationId?: unknown
  source?: unknown
  gesture?: unknown
  clientRequestId?: unknown
}

export type OpenAppResponse =
  | {
    success: true
    applicationId: string
    applicationName: string
    message: string
    requestId: string
  }
  | {
    success: false
    applicationId?: string
    error:
    | 'INVALID_BODY'
    | 'APPLICATION_NOT_FOUND'
    | 'APPLICATION_TARGET_MISSING'
    | 'UNSUPPORTED_PLATFORM'
    | 'DUPLICATE_REQUEST'
    | 'EXECUTION_FAILED'
    message: string
    requestId: string
  }

export type OpenAppOptions = {
  now?: number
  settings?: UserConfig
  launcher?: (
    application: UserConfig['applications'][number],
  ) => Promise<ApplicationLaunchResult>
}

const REQUEST_DEDUPE_MS = 3000
const recentRequests = new Map<string, number>()

export async function openAppRequest(
  request: OpenAppRequest,
  options: OpenAppOptions = {},
): Promise<OpenAppResponse> {
  const now = options.now ?? Date.now()
  const requestId = getRequestId(request, now)
  pruneRecentRequests(now)

  if (
    !isRecord(request) ||
    typeof request.applicationId !== 'string' ||
    !request.applicationId.trim()
  ) {
    return {
      success: false,
      error: 'INVALID_BODY',
      message: '실행할 프로그램 ID가 필요합니다.',
      requestId,
    }
  }

  const applicationId = request.applicationId.trim()
  if (recentRequests.has(requestId)) {
    return {
      success: false,
      applicationId,
      error: 'DUPLICATE_REQUEST',
      message: '이미 처리 중이거나 최근 처리된 요청입니다.',
      requestId,
    }
  }

  recentRequests.set(requestId, now)
  const settings = options.settings ?? await getApplicationSettingsStore().getSettings()
  const application = settings.applications.find((item) => item.id === applicationId)
  if (!application) {
    return {
      success: false,
      applicationId,
      error: 'APPLICATION_NOT_FOUND',
      message: '등록되지 않은 프로그램입니다.',
      requestId,
    }
  }

  const result = await (options.launcher ?? launchApplication)(application)
  if (!result.success) {
    return {
      success: false,
      applicationId,
      error: result.error,
      message: result.message,
      requestId,
    }
  }

  return {
    success: true,
    applicationId,
    applicationName: application.name,
    message: `${application.name} opened successfully`,
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

  const applicationId =
    isRecord(request) && typeof request.applicationId === 'string'
      ? request.applicationId
      : 'unknown'
  return `${applicationId}-${now}`
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
