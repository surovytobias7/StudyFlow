# StudyFlow — canonical roadmap

## Product invariant
Teach exactly one lesson at a time. Every lesson has its own persistent conversation. Student navigation controls the active lesson. Database state, never AI output, determines progress. Exercises are optional.
Normal Chat is a separate general-purpose conversation mode with its own conversation/message tables; it can be used without a course or material and never changes study progress. Both modes share the existing official ChatGPT connection.

## Architecture decisions
- Windows 10 desktop: Electron 45, React, TypeScript and Vite. Custom CSS tokens implement the requested T3 Code-inspired neutral panels, compact sidebar and restrained violet accents. No hosting or cloud database.
- SQLite through Node's built-in SQLite driver, owned by the main process: versioned migration, foreign keys, WAL, transactional transitions.
- Courses, SourceMaterials, LearningPaths, Lessons, Conversations, Messages, LessonProgress, Exercises, ExerciseAttempts, Settings and CompletionEvents. Plans and progress remain separate.
- Completion uses explicit lesson/operation IDs and a transaction; repeat events are no-ops. Undo, revisit and incomplete/review states are application-controlled.
- OAuth/AI/file processing live outside the renderer. Windows DPAPI protects tokens; stable host ID survives disconnect. Narrow validated IPC, sandbox/context isolation, CSP, no Node integration, no arbitrary code execution.
- Official direct OAuth is implemented because @siwc/local returned public npm 404. No copied cookies, unofficial ChatGPT routes, API key or alternative billing path.
- Models are discovered per account. Responses always use store:false, stream:true and explicit history. Success requires completed text and response.completed.
- Modular local importers for PDF/PPTX/images/text, public HTTPS readability, public YouTube captions and pasted transcript fallback. Public URL fetches validate and pin DNS results, bound downloads and recheck redirects.
- Interface English/Slovak and tutor language are independent. Dark/light settings persist locally.
- Tutor response language can be overridden per normal conversation and per study course; null overrides use the global preference.

## Integration gate — passed
On 2026-10-30 the user completed OAuth. Authenticated model discovery and a real streamed explanation succeeded. Initial failure was an overly strict Content-Type check: the live response was HTTP 200 with SSE framing but no Content-Type. Missing headers now proceed through strict stream/completion validation; explicit non-SSE types and interrupted streams fail. Evidence: app user-data `poc-verification.json`.

## Development phases
1. **Implemented:** Electron/React foundation, SQLite migration, official OAuth proof, secure token storage/refresh/disconnect code.
2. **Implemented:** per-lesson persistent conversations, streaming, cancellation, interrupted-response handling and offline history. Separate Normal Chat now has optional multi-file/image attachments, Markdown/math/code rendering, independent saved conversations, rename/delete/reopen, streaming and a per-conversation AI language override.
3. **Core implemented:** PDF selectable text, PPTX actual slide order/embedded images, image/text import; bounded generation, validated plans and editable preview. Full slide rendering remains open.
4. **Implemented:** focused tutor, scoped quick actions, separate lesson chats, learning-path sidebar, persisted active lesson.
5. **Implemented and service-tested:** complete/next, live deterministic progress, duplicate protection, undo, revisit, incomplete and review states.
6. **Initial implementation:** optional exercises, saved attempts/feedback, math rendering, highlighted code, understanding questions. Deterministic verification and richer quiz UI remain open.
7. **Initial implementation:** readable webpages, attempted public captions, transcript fallback, T3-style UI, source reader and Windows NSIS installer. Native UI acceptance and packaged regression checks remain open.

## Completed validation
- TypeScript backend/UI checks and production Vite build.
- 24 tests: OAuth state/registration handling; supported Responses contract; fragmented UTF-8/SSE; late usage errors; missing headers; invalid plans; ordering; transactional completion/idempotency/undo; revisits; persistent study and Normal Chat conversations; effective language defaults/overrides on subsequent requests; interrupted/offline question persistence; real v1-to-v2 migration preserving old course/lesson/chat data; localization; invalid files; presentation relationship ordering; private-address rejection.
- Added Normal Chat and Study Mode switching, automatic mode/conversation restoration, persistent conversation list actions and separate AI-language controls. Normal Chat remains available without an uploaded file and has no path to course progress.
- Live OOP PPTX service acceptance: six AI-generated lessons → Lesson 1 → follow-up → example → completion → fresh Lesson 2 → revisit Lesson 1 → database close/reopen/resume. History and completion states asserted. Evidence under `%APPDATA%/StudyFlow/acceptance/2026-10-30T15-27-53-544Z/`.
- Real webpage extraction from Wikipedia returned readable OOP content.
- Shared-browser inspection of overview/import layout and controls. Native StudyFlow window launch verified on Windows 10.
- Dependency audit reports zero known vulnerabilities after dependency overrides.
- Windows NSIS installer rebuilt after Normal Chat changes; generated `release/StudyFlow Setup 0.1.0.exe` (unsigned, as configured).
- Current packaged `release/win-unpacked/StudyFlow.exe` launched successfully on Windows and its StudyFlow window is responding. The launcher must remove inherited `ELECTRON_RUN_AS_NODE` when started from an Electron-based IDE. A full interactive, signed-account click-through is still pending.
- Native automated UI test (`npm run test:ui`) uses the real renderer/preload, SQLite and learning service with simulated AI and an isolated profile. Verified chat creation, rename via native-compatible dialog, inactive-chat rename without navigation, deletion, optional attachment reading, Markdown/code/math, independent languages, session override before starting, one-click completion, lesson revisit and database reopen/resume. Also fixed a CSP font restriction discovered by this test.
- Native UI regression also verifies deleting the active/last chat clears its draft, creating a fresh chat afterwards, and light/dark themes. Screenshots: `artifacts/normal-chat-smoke.png` and `artifacts/normal-chat-light-smoke.png` (test fixture content).
- Live Normal Chat acceptance on 2026-10-31: three real streamed Responses requests through the existing ChatGPT plan; Slovak no-file reply, English follow-up using local history, English attachment summarized in Slovak. Confirmed no course/progress creation. Evidence: `%APPDATA%/StudyFlow/acceptance/normal-2026-10-31T18-03-40-770Z/result.json`.
- Localized app-owned connection/import/error notices and attachment warnings; provider diagnostics retain their original error codes. Conversation and course language overrides preserve history/progress. Attachment limits are validated again at the sending IPC boundary.

## Current tasks
- Complete native UI click-through for both modes, including Slovak/English interface and response-language changes, chat CRUD, attachments, and app restart restoration.

## Remaining work and limitations
- Full native UI click-through of the user's 20-step acceptance scenario. Service-level live acceptance does not replace this check; do not call the entire core acceptance complete yet.
- Normal Chat has passed live service acceptance and native UI automation with simulated AI. A complete native UI workflow combining real file pickers and live AI remains to be validated.
- PPTX chart/layout fidelity: neither PowerPoint nor LibreOffice is installed here. Current import preserves text order and selected embedded images, and explicitly discloses its limits. Add optional conversion/rendering; screenshots are the current workaround.
- Scanned PDF OCR/visual page rendering. Current importer rejects textless scans with guidance.
- Packaging install/uninstall and packaged PDF/image/URL import regression tests.
- Live refresh/revocation, multiple saved account registrations, signed installer distribution.
- Conversation context summarization beyond the last 30 complete messages; full history is still retained locally.
- Deterministic mathematical checking, structured quiz grades and richer exercise reporting. No code execution.
- More responsive/accessibility checks; third-party technical diagnostics remain verbatim when no application translation is available.

## Next steps
Use the native app with the user's signed-in ChatGPT account to verify Normal Chat, mode switching, language overrides, optional attachments and restart restoration; then continue with visual-material rendering/regression work. Keep this file as the only roadmap.

## Official sources checked
- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
