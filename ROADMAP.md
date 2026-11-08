# StudyFlow — canonical roadmap

## Product invariant
Release target achieved for the core workflow: one usable Windows 10 x64 desktop application. Installed v0.1.5 in the existing location; current quiz-performance, local and focused live installed acceptance passed. Broader v0.1.4 acceptance remains recorded below. Optional limitations remain explicitly deferred.
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
5. **Implemented and installed-tested:** complete/next, live deterministic progress, duplicate protection, undo, revisit, incomplete and review states.
6. **Implemented:** interactive source-grounded quizzes and multiple exercise formats, local choice grading, hidden answer keys, in-request AI solution/distractor checks and written feedback, persisted results/revision/resume, math rendering and highlighted code. Deterministic written mathematics verification remains deferred.
7. **Core implemented:** readable webpages, attempted public captions, transcript fallback, responsive T3-style UI, source reader and Windows NSIS installer. Final current-release installed acceptance is recorded above.

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

## Quiz performance update: 0.1.5 (2026-11-08)
- [x] Diagnosed real 4-question latency on the selected `gpt-6-luna`: programming 67.53s, mathematics 53.26s, theory 59.68s. Two sequential full-bank generations consumed >99.9% of service time; no search or retries occurred.
- [x] Replaced the unconditional second full-bank AI audit with in-request solution/distractor checking. Valid output takes one request; malformed output gets one bounded repair. No provider/model/billing changes.
- [x] Compact choice-only JSON schema enforces requested count/type/difficulty, exactly four distinct ABCD options and one valid answer index. Removed duplicated overall feedback and unused written fields from choice generation; normalized into the existing persisted quiz shape without migration.
- [x] Locally shuffled paired options/feedback and randomized balanced answer slots fix all-A banks. Existing saved quizzes retain their original order and answers. Correct-answer feedback no longer repeats itself.
- [x] Bounded large lesson context to 18k source characters and 12k discussion characters, retaining explicit whole-course coverage. Stream-derived question preparation status exposes no question text or answer keys. Regeneration shows generation status; independent post-save UI refreshes run together.
- [x] TypeScript/backend/UI build and 51/51 automated tests passed, including single-request generation, exact shape, paired shuffle/grading, persistence, malformed recovery, no-search streaming progress and scoped large-context bounds.
- [x] Final live comparison on the same `gpt-6-luna` and three sources: programming 31.85s (67.53s before), mathematics 20.39s (53.26s), theory 32.52s (59.68s), one request each, no search/repair. Average reduction 53.0%. Earlier optimized probe was 25.9–27.3s; subsequent inspection found a wrong distractor-feedback arithmetic claim and an underspecified code signature. Prompt checks now explicitly verify feedback calculations, code assumptions and topic language; final 12-question sample was inspected. This is sample evidence, not guaranteed semantic correctness or a provider latency SLA. Evidence: `artifacts/quiz-performance-0.1.5.json`; raw outputs remain in the temporary diagnostic folder.
- [x] A deliberately truncated REAL generated response recovered with exactly one real AI repair (50.24s total), without dropping questions or fake fallback. Format/auth/usage error regressions passed.
- [x] Native Electron UI regression passed for shuffled ABCD, submission, 75% results/mistakes, resume, selected coding, chat quizzes and unchanged lesson progress; existing chat/language/progress/zoom regressions passed. Captured quiz screenshot inspected.
- [x] Production Windows package completed and existing installation updated to 0.1.5 (exit 0), with matching packaged/installed ASAR hashes. SQLite, encrypted credentials, Local State and all four saved material files were byte-identical across installation. Full backup: `%LOCALAPPDATA%/StudyFlow Backups/before-0.1.5-20261108-205622/`. Evidence: `artifacts/installation-0.1.5.json`.
- [x] Installed EXE local regression passed for launch without servers, lesson/path completion/reversal, dashboard/history/languages and restart/zoom persistence. Focused LIVE installed quiz passed for four Slovak ABCD questions, streamed preparation status, private keys, balanced options, wrong/correct feedback, full process restart with unchanged shuffled question, all submissions, 75% result and unchanged lesson progress. That additional live generation took 40.86s; provider latency varies, so the three-source average is not a guarantee. Evidence: `artifacts/installed-local-0.1.5.log`, `artifacts/installed-quiz-0.1.5.log`, `artifacts/release-verification/quiz-update-result.json`; actual installed screenshots inspected.
- [x] One uninstall registration at 0.1.5, one existing Desktop shortcut and one Start-menu shortcut. Original Desktop shortcut launched the updated installed EXE with a responding window; left open. All 14 preexisting database tables retained identical counts/content hashes after startup. Evidence: `artifacts/installation-0.1.5.json`, `artifacts/shortcut-launch-0.1.5.json`, `artifacts/profile-preservation-0.1.5.json`. Installer: `release/StudyFlow Setup 0.1.5.exe` (unsigned; no public release published).

## Release: 0.1.4 (2026-11-03)
- [x] Existing Normal Chat/document attachments, focused/full learning, lesson/path completion, languages, zoom and history retained.
- [x] New courses: complete-source concept inventories, global topic/prerequisite grouping, independent coverage/source audit and saved concept mapping. Transport chunks never define lessons. Existing paths/progress are untouched. Real 6-slide OOP material produced 3 coherent lessons, plus a separate focused slide-5 lesson.
- [x] Tutor: appropriate prerequisites, what/why/how/when, substantive examples/limitations, useful background knowledge, adaptive focused follow-ups and no fixed explanation word cap.
- [x] Automatic official web_search in both modes, adaptive basic/standard/deep guidance, compact Deep research control, authoritative/independent verification, actual provider citations and clear unavailable-search errors. No separate API billing. Live automatic probe: 3 completed searches, 2 citations from Python.org and endoflife.date (`web-1793735787460/result.json`). Search-count limits are guidance because this OAuth route rejects max_tool_calls.
- [x] Default lesson practice: automatic 4 ABCD questions, no required text input; unfinished quizzes resume. Optional collapsed customization for concept/count/difficulty/type; written/coding/math only on explicit request or selection. Current explanation/questions join source context.
- [x] Strict Responses JSON schema for generation, independent quality audit and written grading; local schema/business validation; one repair attempt per stage, no malformed-question dropping or fabricated fallback. Usage/auth/network failures are not format retries. Exact answer keys stay outside renderer until submission.
- [x] Quiz keyboard navigation, question focus/scroll reset, source-referenced results/mistake review, compact short-window layout and LaTeX \( \)/\[ \] compatibility outside code. Quiz completion never changes lesson progress.
- [x] 48/48 automated tests passed. Native Electron regression passed: four questions, answers, feedback, 75% results, mistake review, resume, optional coding, Normal Chat quiz, unchanged progress, manual lesson/path actions, zoom and reader-aware scrolling. Study and quiz layout checked at 1920x1080, 2560x1440, 1366x768 and 125%/150% Electron zoom. Actual screenshots inspected; physical Windows DPI changes were not performed.
- [x] Live quizzes: four ABCD questions for programming, mathematics and theory; real repair of an intentionally truncated real response; explicit math/written/coding selections; persisted 75% results. The broad run `quiz-1793735224731` failed its final custom-count check; the detected natural-language parser defect was fixed. Targeted real repeat `quiz-1793735662905/result.json` PASSED custom count/type/difficulty and structured written grading. The original intermittent user response was unavailable and did not reproduce in the baseline; regression tests cover malformed JSON, wrong answer encodings, missing questions and exhausted recovery.
- [x] Live full/focused planning, source coverage and substantive same-lesson explanation/follow-up PASSED: `documents-1793736036115/result.json`. An earlier run failed reference formatting; explicit canonical reference values and repair diagnostics fixed it. Existing multi-document Normal Chat/follow-up live checks passed before that failure.
- [x] Final Windows NSIS build and in-place update: installer exit 0, installed ASAR SHA-256 matches the production build, registry version 0.1.4, one installation and one shortcut each on Desktop/Start menu. All durable profile files and materials were byte-identical across installation. Backup: `%LOCALAPPDATA%/StudyFlow Backups/before-0.1.4-20261103-210425/`. Evidence: `artifacts/installation-0.1.4.json`.
- [x] Installed-EXE offline regression: manual lesson/path actions, confirmation/cancel, full process restart, retained progress/history/language, dashboard and persisted zoom passed. Evidence: `artifacts/release-verification/local-update-result.json`.
- [x] Final live installed-EXE acceptance PASSED all 17 checks: restored account, no-file chat, language change, invalid/valid PDF, native PPTX import to 3 logical lessons, focused explanation/follow-up, interactive quiz submission, deterministic progress/next lesson, revisit, full process restart, retained chat/language, Slovak navigation/dashboard, document chat/web citations and focused slide-5 plan/follow-up/restart. Evidence: `artifacts/release-verification/result.json` and actual production screenshots.
- [x] Original desktop shortcut launched the updated installed EXE; its StudyFlow window is responding and left open for the user. After startup all 14 preexisting database tables have identical counts and content hashes, including courses, lessons, conversations, messages, progress, saved quiz and settings. Material files were preserved. Evidence: `artifacts/shortcut-launch-0.1.4.json`, `artifacts/profile-before-0.1.4.json`, `artifacts/profile-after-0.1.4.json`. No duplicate installations or shortcuts. Installer: `release/StudyFlow Setup 0.1.4.exe` (unsigned). No automatic updates or public release publication.

Evidence paths above are under `%APPDATA%/StudyFlow/acceptance/`; local regression logs/screenshots are in `artifacts/`. Historical milestones below describe prior releases.

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
- Historical v0.1.1 limitation: web search was pending then. Implemented and authenticated-probed in the current release work; see Current tasks.

## Windows 0.1.1 in-place update — verified 2026-11-01
- Built `release/StudyFlow Setup 0.1.1.exe` and installed silently into the existing `%LOCALAPPDATA%/Programs/StudyFlow/` directory; installer exit code 0. No additional installation or shortcut was created.
- Verified exactly one uninstall registration at version 0.1.1, one Desktop shortcut and one Start-menu shortcut. The Desktop shortcut still targets the original `StudyFlow.exe` path.
- Launched the existing Desktop shortcut after upgrading: the installed StudyFlow window opened and responded successfully. Left the normal application running for the user. Evidence: `artifacts/shortcut-launch.json`.
- Compared all six durable files (SQLite database, three source files, encrypted account credentials and Chromium Local State) before/after installation: byte-identical. Full profile backup remains outside the project.
- Installed `resources/app.asar` SHA-256 matches the new packaged archive. Its manifest is 0.1.1 and it contains the new completePath/reopenPath IPC, wide Study layout, complete runtime/preload/frontend, and no unit-test files.
- Ran installed production EXE from an unrelated temporary directory with no dev server, real main/preload/renderer/SQLite and an isolated fixture profile. Passed manual unopened lesson completion/reversal, bulk confirmation/cancel, 100% completion, full process close/relaunch persistence, reopening with prior statuses, retained conversations/language preference and updated dashboard counts. No credentials or AI calls were used. Evidence: `artifacts/release-verification/local-update-result.json` and installed screenshots.
- Automatic updates are absent. Future releases currently require running their installer over this installation; data and shortcut targets are preserved.

## UI/UX release 0.1.2 — 2026-11-01
- Persisted application zoom with Ctrl Plus/Equal, Minus, 0 and numpad plus/minus; compact toolbar controls. Native keyboard tests cover focused message input, renderer reload and SQLite settings.
- Wider Normal Chat and Study conversation/input, readable prose/code, compact lesson/language header, multiline composer, responsive navigation drawer and narrow-window path overlay.
- Reader-aware streaming scroll preserves earlier messages; explicit latest-message action. Initial lesson explanation and follow-up questions are visually separated.
- Clear current/completed/review/upcoming lesson states, accessible progress values and remaining counts, compact independent completion controls, collapsible source section and completed course indicators. Existing whole-path completion/undo/reopen remains intact.
- Passed 34 unit/service tests and native Electron UI regression with simulated AI, including language preferences, history, attachments, navigation, individual/bulk completion and database reopen. No new dependencies or billing providers.
- Layout assertions passed at 1920x1080, 2560x1440, 1366x768 and 125%/150% Electron zoom. Actual Study and Normal Chat screenshots visually inspected. Electron zoom approximates scaling; physical Windows DPI changes were not tested.

## Essential release fixes (retained)
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
- Deterministic written mathematics checking and richer long-term exercise reporting. Structured quiz scores and mistake review are implemented; written answers use AI feedback. No code execution.
- More responsive/accessibility checks; third-party technical diagnostics remain verbatim when no application translation is available.

## Next steps
Use the updated installed v0.1.5 through the existing desktop shortcut. The quiz optimization and installed checks are complete; monitor real lesson quality and latency during daily use before further model/reasoning changes. OCR, complete PPTX visual rendering, signing/automatic updates, account switching, physical DPI testing and deterministic written mathematics remain deferred. Keep this file as the only roadmap.

## Official sources checked
- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations

- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/tools-web-search
