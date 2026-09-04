# Google Drive setup

Sirenes talks to Google Drive directly from the browser. There is no server, so the only things you need are a Google Cloud project with an OAuth client and a Picker API key, passed to the build as environment variables.

## 1. Create the project

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (or pick one).
2. **APIs & Services → Library**: enable **Google Drive API** and **Google Picker API**.

## 2. OAuth consent screen

1. **APIs & Services → OAuth consent screen**. Choose _External_ unless everyone is in your Workspace.
2. Fill in app name, support email, and the app's homepage and privacy policy URLs (the deployed Sirenes URL and its `#privacy` dialog work).
3. Add the scope `https://www.googleapis.com/auth/drive.file`. This scope only lets Sirenes see files the user picks or creates with it.
4. While the app is in _Testing_, add the Google accounts allowed to use it under **Test users**. Publishing requires Google's verification review, which asks for the privacy policy and a short justification of the scope.

## 3. OAuth client id

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type _Web application_.
2. **Authorised JavaScript origins**: add every origin Sirenes is served from, e.g. `http://localhost:5173` and `https://<user>.github.io`. No redirect URIs are needed; Sirenes uses the token model.
3. Copy the client id into `VITE_GOOGLE_CLIENT_ID`.

## 4. Picker API key

1. **Credentials → Create credentials → API key**.
2. Restrict it: _Application restrictions_ → HTTP referrers, add the same origins with `/*`. _API restrictions_ → Google Picker API.
3. Copy it into `VITE_GOOGLE_API_KEY`.

## 5. App id (optional but recommended)

The project **number** (Cloud Console → project settings) goes into `VITE_GOOGLE_APP_ID`. The Picker uses it to show files the app itself created.

## 6. Drive "Open with" (optional)

1. **APIs & Services → Google Drive API → Drive UI Integration**.
2. Set the application URL to the deployed Sirenes URL. Drive will open `https://.../?state={"ids":["<fileId>"],"action":"open"}`.
3. Add default MIME types `text/plain` and `text/markdown`, and file extensions `mmd`, `mermaid`, `md`.
4. Users install the integration from the Workspace Marketplace listing, or you enable it for your domain.

## 7. Local development

Copy `.env.example` to `.env` and fill in the three variables. Restart `npm run dev`.

For GitHub Pages, set them as repository **Variables** (not secrets; they are public by design): `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID`. The deploy workflow reads them.

## What Sirenes does with the token

- The access token lives in memory only and is never written to storage.
- Requests go to `www.googleapis.com` and `accounts.google.com` only.
- Sign out revokes the token.
