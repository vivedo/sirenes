export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const SHORT_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

/** Short, URL- and file-safe id (10 chars, ~50 bits) for things that end up in files. */
export function shortId(length = 10): string {
  const bytes = new Uint8Array(length)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(bytes)
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  let out = ''
  for (const b of bytes) out += SHORT_ALPHABET[b % SHORT_ALPHABET.length]
  return out
}
