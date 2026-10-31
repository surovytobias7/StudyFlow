# StudyFlow

A local-first Windows tutor with a T3 Code-inspired workspace. Import study material, review an AI-generated learning path, and learn **one lesson at a time**. Questions, examples and optional exercises stay in that lesson. The next-lesson button saves completion and opens a fresh conversation.

## Launch

1. Double-click `release/StudyFlow Setup 0.1.1.exe` and complete the Windows installer.
2. Launch **StudyFlow** from its desktop icon or the Start menu. The default installed executable is `%LOCALAPPDATA%/Programs/StudyFlow/StudyFlow.exe`.
3. Your saved ChatGPT session is restored. If you have not connected an account yet, open **Settings → Continue with ChatGPT** and authorize eligible plan usage in your system browser.

The installed app includes the frontend, Electron backend, SQLite runtime and importers. **No Node.js, npm command, terminal, development server or cloud server is required.** Internet is needed for ChatGPT responses; saved conversations, documents and progress remain local.

The installer is unsigned. Windows may show an unknown-publisher/SmartScreen prompt. For an unpacked installation, keep the entire `release/win-unpacked/` folder together and launch its `StudyFlow.exe`; copying only that executable is insufficient.

## Development only

For development, use Node.js 24:

```powershell
npm install
npm start
```

If your Windows trust store contains an organizational CA and npm reports a certificate error, set `$env:NODE_OPTIONS='--use-system-ca'` before installing/building. Do not disable TLS verification.

## Use

Use **Normal chat → New chat** to ask any question immediately. Files and images are optional. Each chat is saved automatically; reopen, rename or delete it in the sidebar. Normal Chat never changes course progress. **Study mode** opens the structured lesson workflow below. Both modes use the same ChatGPT connection.

Settings contains separate **Interface language** and **Default AI response language (both modes)** choices. The AI-language selector in a chat or course overrides the default for that conversation/session. Changing it affects future replies and preserves history and progress, regardless of the source document's language.

1. Open **Settings → Continue with ChatGPT** and authorize eligible plan usage. Existing credentials from the connection test are retained.
2. Choose a model and your explanation language. Interface language and tutor language are independent.
3. Choose **New learning session** and import a file, URL, or pasted notes/transcript.
4. Rename, remove or reorder draft lessons, then start learning.
5. Ask questions or use quick actions. Click **I understand, next lesson** / **Rozumiem, ďalšia lekcia** when ready. Exercises are optional.
6. Use the learning-path sidebar to revisit lessons. Undo completion or mark a lesson incomplete/for review. Restarting restores the saved workspace.

Each lesson in the Learning Path sidebar has a **Mark as completed / Mark as incomplete** action, including unopened lessons. To complete the entire path at once, use **⋯ → Mark Learning Path as Completed** and confirm. **Undo** restores the exact previous lesson states. **⋯ → Reopen Learning Path** restores the previous states and opens the first unfinished lesson; for a path completed through the ordinary workflow, it reopens the first lesson and keeps the others completed. These actions never call AI or remove saved conversations/materials.

Automatic updates are not implemented. To update, close StudyFlow and run the new installer over the existing installation. Keep the same installation directory; existing Desktop/Start-menu shortcuts and `%APPDATA%/StudyFlow/` data are reused.

PDF text, PPTX, PNG/JPEG/WebP, TXT and Markdown are supported. Click a source in the learning sidebar to read extracted material and included images offline. Public HTTPS webpages are extracted locally; YouTube attempts public captions and falls back to pasted transcripts.

## Storage and security

Data lives under `%APPDATA%/StudyFlow/`: `studyflow.sqlite`, `materials/`, and DPAPI-encrypted `account.credentials`. Keep this directory when moving/backing up learning data. Windows-protected credentials are tied to the Windows account and may require signing in again after migration.

Electron uses a sandboxed isolated renderer, no Node integration, sender-validated IPC, schema validation, blocked navigation, and a restrictive CSP. Credentials stay in the main process. Original files are copied locally. No code execution, cloud database, hosting, API key or automatic billing fallback is used.

The [official ChatGPT local/open-source OAuth flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) supplies model discovery and Responses inference. `store:false`, `stream:true` and local history are used. Inference succeeds only after completed text and `response.completed`. Plan limits remain controlled by OpenAI. Disconnect attempts remote revocation and clears tokens locally.

## Validation

```powershell
npm test
npm run test:ui
npm run package:win
```

32 automated tests cover callback rejection, streaming, malformed responses, plan validation, individual/whole-path completion, idempotency, transactional rollback, undo, revisits, real v1-to-v2 SQLite migration, independent normal conversations, response-language defaults/overrides, interrupted responses, safe shutdown, plan-limit recovery, file errors, presentation ordering, localization and URL address restrictions. `test:ui` drives the actual Electron renderer and preload against an isolated SQLite database and simulated AI; it never reads credentials or uses plan allowance. It also checks concurrent startup model discovery, chat CRUD, optional attachments, Markdown/code/math, both languages, mode switching, manual lesson/path actions and restoration. Study layout screenshots cover 1920x1080, 2560x1440, 1366x768 and simulated 125%/150% scaling in `artifacts/study-layout/`.

The installed 0.1.1 EXE also passed local production regression using `node scripts/test-release.cjs "$env:LOCALAPPDATA/Programs/StudyFlow/StudyFlow.exe" --local-update`: native IPC, individual/path completion, confirmation/cancel, process restart, SQLite progress restoration, reopening, dashboard and saved Normal Chat/language preference. This uses a temporary fixture profile and no AI. Evidence: `artifacts/release-verification/local-update-result.json`. The existing installation was updated in place and its data files were verified unchanged.

Live verification on 2026-10-30 passed OAuth/model discovery/inference and a separate acceptance database using `fixtures/oop-acceptance.pptx`: generated six lessons, taught Lesson 1, answered a follow-up and example, completed Lesson 1, taught Lesson 2, preserved earlier conversations, and restored state after database reopen. Credential-free evidence is in `%APPDATA%/StudyFlow/acceptance/`. This is a service-layer acceptance run; a complete native UI click-through remains to be validated.

To repeat the live acceptance run (uses your ChatGPT allowance), close the app and run:

```powershell
npm run build
node scripts/start.cjs --acceptance
node scripts/start.cjs --acceptance-normal
```

Live Normal Chat verification on 2026-10-31 passed three streamed requests: no-file Slovak explanation, an English follow-up with saved history, and an English attachment summarized in Slovak. It created no courses or progress. Evidence: `%APPDATA%/StudyFlow/acceptance/normal-2026-10-31T18-03-40-770Z/result.json`.

## Current limitations

The following are postponed beyond the first release and do not require extra services for the core workflow:

- PDF extraction reads selectable text, not scanned pages or diagrams. Use screenshots for visual material.
- PPTX retains actual slide order and includes up to 12 embedded images (each up to 3 MB). Charts, animations and exact slide layouts are not rendered. PowerPoint/LibreOffice conversion is not installed or implemented.
- Long material is processed in bounded sections. Conversation requests currently include the last 30 complete messages; older history remains locally readable.
- One saved ChatGPT registration is supported. Live refresh/revocation and account switching need additional validation/work.
- Exercise feedback is AI-generated and saved separately; there is no deterministic mathematics checker or code execution.
- Public caption availability varies; StudyFlow never claims to have watched a video.
- An installer is built, but installation/uninstallation and packaged import flows need further testing. Native end-to-end UI acceptance is still pending.

The sole development roadmap is [ROADMAP.md](ROADMAP.md).
