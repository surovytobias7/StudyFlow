# StudyFlow — canonical roadmap

## Product invariant
Teach exactly one lesson at a time. Every lesson has its own persistent conversation. Student navigation controls the active lesson. Database state, never AI output, determines progress. Exercises are optional.

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

## Integration gate — passed
On 2026-10-30 the user completed OAuth. Authenticated model discovery and a real streamed explanation succeeded. Initial failure was an overly strict Content-Type check: the live response was HTTP 200 with SSE framing but no Content-Type. Missing headers now proceed through strict stream/completion validation; explicit non-SSE types and interrupted streams fail. Evidence: app user-data `poc-verification.json`.

## Development phases
1. **Implemented:** Electron/React foundation, SQLite migration, official OAuth proof, secure token storage/refresh/disconnect code.
2. **Implemented:** per-lesson persistent conversations, streaming, cancellation, interrupted-response handling and offline history.
3. **Core implemented:** PDF selectable text, PPTX actual slide order/embedded images, image/text import; bounded generation, validated plans and editable preview. Full slide rendering remains open.
4. **Implemented:** focused tutor, scoped quick actions, separate lesson chats, learning-path sidebar, persisted active lesson.
5. **Implemented and service-tested:** complete/next, live deterministic progress, duplicate protection, undo, revisit, incomplete and review states.
6. **Initial implementation:** optional exercises, saved attempts/feedback, math rendering, highlighted code, understanding questions. Deterministic verification and richer quiz UI remain open.
7. **Initial implementation:** readable webpages, attempted public captions, transcript fallback, T3-style UI, source reader and Windows NSIS installer. Native UI acceptance and packaged regression checks remain open.

## Completed validation
- TypeScript backend/UI checks and production Vite build.
- 18 tests: OAuth state/registration handling; supported Responses contract; fragmented UTF-8/SSE; late usage errors; missing headers; invalid plans; ordering; transactional completion/idempotency/undo; revisits; persistent conversations; active lesson restore; invalid files; presentation relationship ordering; private-address rejection.
- Live OOP PPTX service acceptance: six AI-generated lessons → Lesson 1 → follow-up → example → completion → fresh Lesson 2 → revisit Lesson 1 → database close/reopen/resume. History and completion states asserted. Evidence under `%APPDATA%/StudyFlow/acceptance/2026-10-30T15-27-53-544Z/`.
- Real webpage extraction from Wikipedia returned readable OOP content.
- Shared-browser inspection of overview/import layout and controls. Native StudyFlow window launch verified on Windows 10.
- Dependency audit reports zero known vulnerabilities after dependency overrides.
- Windows NSIS installer built; final rebuild follows latest changes.

## Current tasks
- Finish current installer/relaunch checks and document the usable build accurately.

## Remaining work and limitations
- Full native UI click-through of the user's 20-step acceptance scenario. Service-level live acceptance does not replace this check; do not call the entire core acceptance complete yet.
- PPTX chart/layout fidelity: neither PowerPoint nor LibreOffice is installed here. Current import preserves text order and selected embedded images, and explicitly discloses its limits. Add optional conversion/rendering; screenshots are the current workaround.
- Scanned PDF OCR/visual page rendering. Current importer rejects textless scans with guidance.
- Packaging install/uninstall and packaged PDF/image/URL import regression tests.
- Live refresh/revocation, multiple saved account registrations, signed installer distribution.
- Conversation context summarization beyond the last 30 complete messages; full history is still retained locally.
- Deterministic mathematical checking, structured quiz grades and richer exercise reporting. No code execution.
- More responsive/accessibility checks and localization of lower-level processing/error strings.

## Next steps
Use the native app with a real university presentation, verify native navigation/resume and visual-material handling, then complete the remaining rendering and regression work. Keep this file as the only roadmap.

## Official sources checked
- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
