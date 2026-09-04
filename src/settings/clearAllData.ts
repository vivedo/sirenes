import { clear as clearIdb } from 'idb-keyval'
import { signOut } from '../storage/drive'

/**
 * Wipe everything Sirenes stored in this browser: settings, API key, autosave, AI history,
 * file handles, recent files. Revokes the Google token. Reloads so every store starts fresh.
 */
export async function clearAllData(): Promise<void> {
  try {
    signOut()
  } catch {
    /* not signed in */
  }
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    /* storage blocked */
  }
  try {
    await clearIdb()
  } catch {
    /* no idb */
  }
  // Clear the fragment too, or the reload would restore the diagram from the link.
  location.replace(location.pathname)
}
