/** URL-safe base64 without padding. Decoding also accepts the standard alphabet and padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array {
  let b64 = text.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '')
  const pad = b64.length % 4
  if (pad === 1) throw new Error('Invalid base64 length')
  if (pad) b64 += '='.repeat(4 - pad)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
