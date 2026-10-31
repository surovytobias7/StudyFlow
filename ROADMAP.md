# StudyFlow — canonical roadmap

## Product invariant
Release target: one usable Windows 10 x64 desktop application, v0.1.1. Finish and validate the existing core; do not add optional features for this release.
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
- 27 tests: OAuth state/registration handling; supported Responses contract; fragmented UTF-8/SSE; late usage errors; missing headers; invalid plans; ordering; transactional completion/idempotency/undo; revisits; persistent study and Normal Chat conversations; effective language defaults/overrides on subsequent requests; interrupted/offline question persistence; safe shutdown drain; subscription-limit preservation without fallback; real v1-to-v2 migration preserving old course/lesson/chat data; localization; invalid files; presentation relationship ordering; private-address rejection.
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
- Windows 0.1.1 build and in-place installation completed. Isolated installed-EXE regression passed for current lesson/path/layout changes; see release verification below.
- Remaining release verification: full live-AI/native PDF/PPTX file-picker workflow. Prior service-layer live tests passed; the complete installed UI scenario must not yet be claimed passed. The earlier file-picker automation remains unfinished.

## Study Mode and completion improvements — 2026-11-01
- Fixed the AI-language selector inheriting a 190px vertical flex basis and global column-label styles. It now lives in the lesson header, beside lesson metadata. Normal Chat styling and authentication are unchanged.
- Study messages use up to 1120px including padding (about 1030px of readable text); the input spans up to 1064px. Study prose is 16px, code is larger, and the bottom actions remain outside the scrolling conversation.
- Retained three columns on desktop, added a navigation drawer for narrow/scaled windows, and reduced header/control height on short workspaces. Right-side learning-path visibility remains user-controlled.
- Individual unopened/draft lessons can be completed or reversed in any order through the existing LessonProgress rows, without AI calls. Progress and course summaries derive from those same rows.
- Added a separate whole-path action in the three-dot menu, a confirmation dialog, atomic completion of all lessons, a 100% completion view, Undo, and Reopen Learning Path. The existing Settings table stores the bounded undo snapshot; no schema migration or duplicate progress records. Undo restores original statuses, draft/started state and active lesson; reopening restores the earlier statuses and selects the first unfinished lesson. Conversations/materials remain untouched. Subsequent progress edits invalidate stale undo snapshots.
- Passed 32 automated tests, including disk reopen, idempotency, mixed completion/review states, draft undo and injected SQLite failure/rollback.
- Passed native Electron renderer/preload/SQLite tests for individual completion/reversal, confirmation cancellation, whole-path completion, Undo, full database reopen and reopening without any AI request. Existing Normal Chat, languages, Markdown/math/code, lesson next/revisit and mode-isolation checks also passed with simulated AI.
- Captured and visually inspected actual Electron screenshots at 1920x1080, 2560x1440, 1366x768, plus 125% and 150% Electron zoom as display-scaling approximations. Verified no document horizontal overflow, header directly below toolbar, wide input, visible completion controls and scrollable lesson conversation. Evidence: `artifacts/study-layout/`. Physical Windows DPI changes were not performed.
- Existing installed app: `%LOCALAPPDATA%/Programs/StudyFlow/StudyFlow.exe`, one Desktop shortcut and one Start-menu shortcut. No auto-updater library, updater code or configured update feed exists; generated installer metadata alone does not provide automatic updates. Preserve this installation and data while upgrading to 0.1.1.
- Complete pre-upgrade profile backup: `%LOCALAPPDATA%/StudyFlow Backups/before-0.1.1-20261101-003333/StudyFlow/`. An earlier backup was retained too; the final backup was refreshed after detecting a database change before installation.
- Pending separate request: official authenticated `web_search` capability probe/integration is not implemented or claimed supported by this release. No billed API fallback was introduced.

## Windows 0.1.1 in-place update — verified 2026-11-01
- Built `release/StudyFlow Setup 0.1.1.exe` and installed silently into the existing `%LOCALAPPDATA%/Programs/StudyFlow/` directory; installer exit code 0. No additional installation or shortcut was created.
- Verified exactly one uninstall registration at version 0.1.1, one Desktop shortcut and one Start-menu shortcut. The Desktop shortcut still targets the original `StudyFlow.exe` path.
- Launched the existing Desktop shortcut after upgrading: the installed StudyFlow window opened and responded successfully. Left the normal application running for the user. Evidence: `artifacts/shortcut-launch.json`.
- Compared all six durable files (SQLite database, three source files, encrypted account credentials and Chromium Local State) before/after installation: byte-identical. Full profile backup remains outside the project.
- Installed `resources/app.asar` SHA-256 matches the new packaged archive. Its manifest is 0.1.1 and it contains the new completePath/reopenPath IPC, wide Study layout, complete runtime/preload/frontend, and no unit-test files.
- Ran installed production EXE from an unrelated temporary directory with no dev server, real main/preload/renderer/SQLite and an isolated fixture profile. Passed manual unopened lesson completion/reversal, bulk confirmation/cancel, 100% completion, full process close/relaunch persistence, reopening with prior statuses, retained conversations/language preference and updated dashboard counts. No credentials or AI calls were used. Evidence: `artifacts/release-verification/local-update-result.json` and installed screenshots.
- Automatic updates are absent. Future releases currently require running their installer over this installation; data and shortcut targets are preserved.

## Essential release fixes
- Closing the window now cancels AI generation and waits for partial-message persistence before SQLite closes.
- Credential-protection initialization errors no longer block local snapshots, saved conversations, sources or progress; AI commands report the connection error.
- Startup failures show a native error dialog instead of silently leaving the user without a window.
- Subscription usage/rate-limit messages explain that saved data is preserved and no alternate billing is used.
- NSIS explicitly creates normal Windows shortcuts and keeps app data on uninstall. Runtime packages exclude unit-test files.

## Deferred after the first release
- PPTX chart/layout fidelity: neither PowerPoint nor LibreOffice is installed here. Current import preserves text order and selected embedded images, and explicitly discloses its limits. Add optional conversion/rendering; screenshots are the current workaround.
- Scanned PDF OCR/visual page rendering. Current importer rejects textless scans with guidance.
- Additional uninstall/upgrade regression coverage and packaged URL/image edge cases beyond the core PDF/PPTX workflow.
- Live refresh/revocation, multiple saved account registrations, signed installer distribution.
- Conversation context summarization beyond the last 30 complete messages; full history is still retained locally.
- Deterministic mathematical checking, structured quiz grades and richer exercise reporting. No code execution.
- More responsive/accessibility checks; third-party technical diagnostics remain verbatim when no application translation is available.

## Next steps
Use the updated installed v0.1.1 application. Finish the remaining live-AI/native-import acceptance check before claiming the full original release scenario verified. Rendering, OCR, account-management and richer exercise work remains postponed. Keep this file as the only roadmap.

## Official sources checked
- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
