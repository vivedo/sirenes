import { downloadBlob } from '../shared/download'

/** Ensure the SVG is a standalone document with the xmlns and explicit size. */
export function standaloneSvg(svg: string): string {
  let out = svg
  if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(out)) {
    out = out.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  if (!/xmlns:xlink=/.test(out)) {
    out = out.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
  }
  const size = svgSize(out)
  if (size) {
    out = out.replace(/<svg([^>]*?)>/, (_, attrs: string) => {
      let a = attrs.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '')
      a += ` width="${size.width}" height="${size.height}"`
      return `<svg${a}>`
    })
  }
  return out
}

/** Intrinsic size of a Mermaid SVG, read from the viewBox. */
export function svgSize(svg: string): { width: number; height: number } | null {
  const m = /viewBox="([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)"/.exec(svg)
  if (!m) return null
  const width = Math.ceil(Number(m[3]))
  const height = Math.ceil(Number(m[4]))
  if (!width || !height) return null
  return { width, height }
}

export function downloadSvg(svg: string, baseName: string) {
  downloadBlob(
    new Blob([standaloneSvg(svg)], { type: 'image/svg+xml;charset=utf-8' }),
    `${baseName}.svg`,
  )
}

export async function svgToPngBlob(
  svg: string,
  scale: number,
  background: string | null,
): Promise<Blob> {
  const standalone = standaloneSvg(svg)
  const size = svgSize(standalone) ?? { width: 800, height: 600 }
  const url = URL.createObjectURL(new Blob([standalone], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(size.width * scale)
    canvas.height = Math.round(size.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))),
        'image/png',
      ),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function downloadPng(
  svg: string,
  baseName: string,
  scale: number,
  background: string | null,
) {
  const blob = await svgToPngBlob(svg, scale, background)
  downloadBlob(blob, `${baseName}${scale > 1 ? `@${scale}x` : ''}.png`)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not rasterise SVG'))
    img.src = src
  })
}
