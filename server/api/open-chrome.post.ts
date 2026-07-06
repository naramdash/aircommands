import { openAppRequest } from '../utils/open_app'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const query = getQuery(event)
  const bodyApp =
    typeof (body as { app?: unknown }).app === 'string'
      ? (body as { app: string }).app
      : undefined
  const queryApp = typeof query.app === 'string' ? query.app : undefined

  return openAppRequest({
    ...(typeof body === 'object' && body !== null ? body : {}),
    app: bodyApp ?? queryApp ?? 'chrome',
    source: 'manual',
  })
})
