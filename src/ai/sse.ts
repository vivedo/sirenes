/**
 * Minimal Server-Sent Events parser for fetch bodies.
 * Yields the `data:` payload of each event; ignores comments (lines starting with ':').
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '')
        buffer = buffer.slice(idx + 1)
        if (line === '' || line.startsWith(':')) continue
        if (line.startsWith('data:')) yield line.slice(5).trimStart()
      }
    }
    const rest = buffer.trim()
    if (rest.startsWith('data:')) yield rest.slice(5).trimStart()
  } finally {
    reader.releaseLock()
  }
}
