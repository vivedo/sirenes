/**
 * Drive "Open with" sends ?state={"ids":["<fileId>"],"action":"open","userId":"..."}.
 * We also accept a plain ?driveId=<fileId> for hand-made links.
 */
export function parseDriveDeepLink(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const direct = params.get('driveId')
  if (direct) return direct
  const state = params.get('state')
  if (!state) return null
  try {
    const parsed = JSON.parse(state) as { ids?: unknown; action?: unknown }
    if (
      Array.isArray(parsed.ids) &&
      typeof parsed.ids[0] === 'string' &&
      parsed.action !== 'create'
    ) {
      return parsed.ids[0]
    }
  } catch {
    /* not ours */
  }
  return null
}

/** Remove the query string but keep the fragment. */
export function stripQuery() {
  if (!location.search) return
  history.replaceState(history.state, '', location.pathname + location.hash)
}
