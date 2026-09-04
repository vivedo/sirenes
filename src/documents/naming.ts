export function documentBaseName(fileName: string | null): string {
  return (fileName ?? 'diagram').replace(/\.(mmd|mermaid|md|txt)$/i, '')
}
