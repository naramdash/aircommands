/// <reference types="bun" />

import { openAppRequest } from '../utils/open_app'
import { buildOpenAppRequestInput } from '../utils/open_app_request_input'
import { readRequestBodyText } from '../utils/request_body'
import { getQueryFromEventUrl } from '../utils/request_query'

export default defineEventHandler(async (event) => {
  const body = await readRequestBodyText(event)
  const request = buildOpenAppRequestInput(body, getQueryFromEventUrl(event), {
    app: 'chrome',
    source: 'manual',
  })

  return openAppRequest(request)
})
