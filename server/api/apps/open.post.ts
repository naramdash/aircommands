import { openAppRequest } from '../../utils/open_app'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const response = await openAppRequest(body)

  if (response.success) {
    console.info('[apps/open]', {
      requestId: response.requestId,
      app: response.app,
      success: true,
    })
  } else {
    console.warn('[apps/open]', {
      requestId: response.requestId,
      app: response.app,
      success: false,
      error: response.error,
    })
  }

  return response
})

