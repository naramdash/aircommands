export function getQueryFromEventUrl(event: {
  node?: { req?: { url?: string | null } }
}): Record<string, string> {
  const requestUrl = event.node?.req?.url
  if (typeof requestUrl !== 'string') return {}

  const queryStart = requestUrl.indexOf('?')
  if (queryStart < 0) return {}

  const searchParams = new URLSearchParams(requestUrl.slice(queryStart + 1))
  const query: Record<string, string> = {}

  for (const [key, value] of searchParams) {
    if (!(key in query)) {
      query[key] = value
    }
  }

  return query
}
