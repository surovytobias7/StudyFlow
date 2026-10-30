# StudyFlow

A local-first Windows tutor with a T3 Code-inspired workspace. Import study material, review an AI-generated learning path, and learn **one lesson at a time**. Questions, examples and optional exercises stay in that lesson. The next-lesson button saves completion and opens a fresh conversation.

## Launch

Open `release/StudyFlow Setup 0.1.0.exe` to install, or `release/win-unpacked/StudyFlow.exe` to run the unpacked build. The installer is unsigned.

For development, use Node.js 24:

```powershell
npm install
npx install-electron
npm start
```

If your Windows trust store contains an organizational CA and npm reports a certificate error, set `$env:NODE_OPTIONS='--use-system-ca'` before installing/building. Do not disable TLS verification.

## Use

1. Open **Settings → Continue with ChatGPT** and authorize eligible plan usage. Existing credentials from the connection test are retained.
2. Choose a model and your explanation language. Interface language and tutor language are independent.
3. Choose **New learning session** and import a file, URL, or pasted notes/transcript.
4. Rename, remove or reorder draft lessons, then start learning.
5. Ask questions or use quick actions. Click **I understand, next lesson** / **Rozumiem, ďalšia lekcia** when ready. Exercises are optional.
6. Use the learning-path sidebar to revisit lessons. Undo completion or mark a lesson incomplete/for review. Restarting restores the saved workspace.

PDF text, PPTX, PNG/JPEG/WebP, TXT and Markdown are supported. Click a source in the learning sidebar to read extracted material and included images offline. Public HTTPS webpages are extracted locally; YouTube attempts public captions and falls back to pasted transcripts.

## Storage and security

Data lives under `%APPDATA%/StudyFlow/`: `studyflow.sqlite`, `materials/`, and DPAPI-encrypted `account.credentials`. Keep this directory when moving/backing up learning data. Windows-protected credentials are tied to the Windows account and may require signing in again after migration.

Electron uses a sandboxed isolated renderer, no Node integration, sender-validated IPC, schema validation, blocked navigation, and a restrictive CSP. Credentials stay in the main process. Original files are copied locally. No code execution, cloud database, hosting, API key or automatic billing fallback is used.

The [official ChatGPT local/open-source OAuth flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) supplies model discovery and Responses inference. `store:false`, `stream:true` and local history are used. Inference succeeds only after completed text and `response.completed`. Plan limits remain controlled by OpenAI. Disconnect attempts remote revocation and clears tokens locally.

## Validation

```powershell
npm test
npm run package:win
```

18 automated tests cover callback rejection, streaming, malformed responses, plan validation, completion/idempotency, undo, revisits, SQLite reopen/resume, file errors, presentation ordering and URL address restrictions.

Live verification on 2026-10-30 passed OAuth/model discovery/inference and a separate acceptance database using `fixtures/oop-acceptance.pptx`: generated six lessons, taught Lesson 1, answered a follow-up and example, completed Lesson 1, taught Lesson 2, preserved earlier conversations, and restored state after database reopen. Credential-free evidence is in `%APPDATA%/StudyFlow/acceptance/`. This is a service-layer acceptance run; a complete native UI click-through remains to be validated.

To repeat the live acceptance run (uses your ChatGPT allowance), close the app and run:

```powershell
npm run build
node scripts/start.cjs --acceptance
```

## Current limitations

- PDF extraction reads selectable text, not scanned pages or diagrams. Use screenshots for visual material.
- PPTX retains actual slide order and includes up to 12 embedded images (each up to 3 MB). Charts, animations and exact slide layouts are not rendered. PowerPoint/LibreOffice conversion is not installed or implemented.
- Long material is processed in bounded sections. Conversation requests currently include the last 30 complete messages; older history remains locally readable.
- One saved ChatGPT registration is supported. Live refresh/revocation and account switching need additional validation/work.
- Exercise feedback is AI-generated and saved separately; there is no deterministic mathematics checker or code execution.
- Public caption availability varies; StudyFlow never claims to have watched a video.
- An installer is built, but installation/uninstallation and packaged import flows need further testing. Native end-to-end UI acceptance is still pending.

The sole development roadmap is [ROADMAP.md](ROADMAP.md).
