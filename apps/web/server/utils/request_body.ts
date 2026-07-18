export async function readRequestBodyText(event: {
  node?: {
    req?: {
      on?: (event: string, listener: (...args: unknown[]) => void) => void
      readableEnded?: boolean
      body?: unknown
    }
  }
}): Promise<string | undefined> {
  const request = event.node?.req
  if (!request) return undefined

  if (typeof request.body === 'string') return request.body
  if (request.body instanceof Uint8Array) {
    return new TextDecoder().decode(request.body)
  }
  if (request.body instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(request.body))
  }

  if (typeof request.on !== 'function') return undefined
  if (request.readableEnded) return ''

  return new Promise<string>((resolve) => {
    const chunks: Uint8Array[] = []

    request.on!('data', (chunk: unknown) => {
      if (chunk instanceof Uint8Array) {
        chunks.push(chunk)
        return
      }

      if (typeof chunk === 'string') {
        chunks.push(new TextEncoder().encode(chunk))
      }
    })

    request.on!('end', () => {
      if (chunks.length === 0) {
        resolve('')
        return
      }

      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
      const merged = new Uint8Array(totalLength)

      let offset = 0
      for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.byteLength
      }

      resolve(new TextDecoder().decode(merged))
    })

    request.on!('error', () => {
      resolve('')
    })

    request.on!('aborted', () => {
      resolve('')
    })
  })
}
