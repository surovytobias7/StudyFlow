# StudyFlow

A local-first desktop tutor that teaches one lesson at a time.

**Current milestone: ChatGPT plan integration proof of concept. The full learning application is not implemented.** See [ROADMAP.md](ROADMAP.md) for the canonical plan and integration gate.

## Run the connection test on Windows

Requires Node.js 24 and npm. In PowerShell:

```powershell
npm install
npx install-electron
npm start
```

If npm reports a certificate chain problem and your organization's CA is in the Windows trust store, set `$env:NODE_OPTIONS='--use-system-ca'` before installing. Do not disable TLS verification.

1. Click **Continue with ChatGPT** in the desktop window.
2. Sign in in your system browser and authorize ChatGPT plan usage. Eligibility and usage limits are controlled by OpenAI.
3. Select an account-provided model and click **Test connection**. This makes one real request against your plan allowance.
4. Success requires a text explanation and the terminal `response.completed` event. Sign-in alone is not success.
5. Use **Disconnect** to revoke the renewable session and clear local tokens. If remote revocation cannot be confirmed, the app tells you to disconnect it in ChatGPT settings.

Credentials are encrypted by Electron safeStorage (Windows DPAPI) in the application's user-data directory, outside the renderer and repository. The opaque host ID and registration mapping survive sign-out. Only non-secret status and model choices cross IPC. A successful test writes `poc-verification.json` in that directory with timestamp, model, endpoint and sample explanation; no credentials.

The proof of concept currently supports one saved account registration. Multiple-account selection, application localization and learning persistence belong to the subsequent application work.

## Verification

```powershell
npm test
```

Automated protocol tests cover OAuth callback rejection, PKCE construction, the Responses request contract, split stream events, incomplete streams and late usage-limit failures. They do **not** establish live account eligibility. Real OAuth/inference and token refresh/revocation need separate live verification.

## Supported integration

Uses the [official local/open-source OAuth flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) and public `https://api.openai.com/v1/models` / `/responses` endpoints. No scraped sessions, copied cookies, backend-api routes, API keys, automatic billing fallback, or cloud database. `@siwc/local` was unavailable from the public npm registry when checked; the documented direct flow is implemented instead.
