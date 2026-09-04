export interface DriveConfig {
  clientId: string
  apiKey: string
  appId: string
}

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

/** Drive integration is only available when the build was given a Google OAuth client. */
export function getDriveConfig(): DriveConfig | null {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY
  const appId = import.meta.env.VITE_GOOGLE_APP_ID
  if (!clientId || !apiKey) return null
  return { clientId, apiKey, appId: appId ?? '' }
}
