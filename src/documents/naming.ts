export function documentBaseName(fileName: string | null): string {
  return (fileName ?? 'diagram').replace(/\.(mmd|mermaid|md|txt)$/i, '')
}

/** Base name for exports: the active diagram's name when it has one, else the file's. */
export function exportBaseName(
  fileName: string | null,
  diagramName: string | null | undefined,
): string {
  if (diagramName)
    return diagramName.replace(/[\\/:*?"<>|]+/g, '-').trim() || documentBaseName(fileName)
  return documentBaseName(fileName)
}
