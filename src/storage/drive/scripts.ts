const loading = new Map<string, Promise<void>>()

/** Load an external script once. Rejects if the CSP or network blocks it. */
export function loadScript(src: string): Promise<void> {
  let p = loading.get(src)
  if (p) return p
  p = new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.defer = true
    el.onload = () => resolve()
    el.onerror = () => {
      loading.delete(src)
      reject(new Error(`Could not load ${src}`))
    }
    document.head.appendChild(el)
  })
  loading.set(src, p)
  return p
}

export const GIS_SRC = 'https://accounts.google.com/gsi/client'
export const GAPI_SRC = 'https://apis.google.com/js/api.js'
