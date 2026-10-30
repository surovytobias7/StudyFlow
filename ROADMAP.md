# StudyFlow — canonical development roadmap

## Product invariant
Teach exactly one lesson at a time. Every lesson has an independent persistent conversation. Only an explicit student action changes the current lesson. AI never controls completion percentages.

## Architecture decisions
- Windows desktop: Electron, isolated sandboxed renderer, Node integration disabled, strictly scoped IPC.
- Full application UI (after integration gate): React + TypeScript + Vite, Tailwind/shadcn, English/Slovak, independent tutor language, light/dark themes.
- User design direction: similar to T3 Code — compact sidebar, restrained neutral palette, clean panel boundaries, focused conversation area, persistent lesson-path panel and accessible next-lesson action.
- SQLite owned by main process; versioned migrations, foreign keys, transactions. Materials copied to app-managed local storage.
- Entities: Courses, SourceMaterials, LearningPaths, Lessons, Conversations, Messages, LessonProgress, Exercises, ExerciseAttempts, Settings. Plan content and progress are separate.
- Completion transaction takes explicit lesson ID and operation ID, records prior state for undo, updates current lesson to next unfinished lesson. Duplicate operation IDs are no-ops. Renderer immediately reflects committed database state.
- OAuth and AI stay in main process. Windows DPAPI through Electron safeStorage protects credentials. Stable host ID survives disconnect. No API-key fallback or cloud database.
- Official direct OAuth implementation is permitted by documentation; @siwc/local returned npm 404 on 2026-10-30 and is not a dependency.
- Official model catalog queried per account. Responses uses store:false, stream:true, explicit local input history; success requires response.completed.
- PDF/PPTX/image processing adapters preserve page/slide references; optional local LibreOffice conversion for slide visuals. Web extraction and legally accessible captions later; pasted transcript fallback. No code execution.
- POC is intentionally a small diagnostic Electron window; production UI follows only after authenticated inference succeeds.

## Phases and status
1. **Current:** repository initialization and real ChatGPT Plus proof of concept. Then React foundation and SQLite migrations.
2. Persistent lesson conversations, streaming, cancellation, offline reading, recoverable errors.
3. PDF/PPTX/image import, bounded extraction, source references, AI plan validation, editable plan preview.
4. Focused tutor view, per-lesson chat, scoped quick actions, path sidebar, resume last lesson.
5. Transactional one-click completion, next unfinished lesson, deterministic progress, undo, revisit/incomplete actions.
6. Optional exercises/attempts, feedback, math rendering, code highlighting, quizzes.
7. Webpages/YouTube captions, accessibility and visual polish, comprehensive tests, Windows installer.

## Completed
- Inspected empty workspace; no existing project or roadmap.
- Read official quickstart, registration, sessions, inference, token reference, limitations and recovery documentation.
- Confirmed public OpenID discovery endpoint is reachable.
- Resolved local npm certificate-chain issue by using Node's Windows system CA trust (TLS verification remains enabled).
- Implemented and compiled TypeScript/Electron connection POC: PKCE/state/nonce, loopback callback, JWKS signature/issuer/audience/expiry/nonce checks, encrypted credentials, serialized refresh, model catalog, stream test, and session revocation.
- Eight automated protocol tests pass (`npm test`): new/returning registration, callback rejection, Responses contract, fragmented UTF-8/CRLF events, interrupted/incomplete/empty streams and late usage-limit failure.
- Installed Electron runtime and launched the desktop POC. Launcher removes inherited ELECTRON_RUN_AS_NODE only from the application child process.
- Verified visible native window titled `StudyFlow · Connection test` and successful encrypted host-state creation. Fixed ESM startup ordering and the launcher hiding the interactive application window.

## Current tasks
- Build SQLite persistence and the React learning workspace with the T3 Code visual direction.
- Implement import → plan preview → one-lesson tutoring → complete/next → reopen/resume.

## Gate / blockers
- INTEGRATION GATE PASSED: live authenticated model discovery and Responses inference succeeded on 2026-10-30, with lesson text and response.completed. Evidence is stored in the app user-data poc-verification.json without credentials.
- Fixed live HTTP 200 SSE response with missing Content-Type; 11 protocol tests pass, including regression tests rejecting non-SSE and partial streams. Live refresh/revocation are not yet verified.
- If access is technically blocked, capture a credential-free diagnostic and ask the user how to proceed. Never substitute billed API usage.

## Required validation after the gate
- Lesson plan generation/order and invalid plans.
- Deterministic progress, idempotent completion, next unfinished selection, undo.
- Revisit completed lessons without changing state, persistence and active-lesson restoration.
- Conversations never cross lesson boundaries; interrupted streams and retries remain identifiable.
- Malformed/oversized imports, empty extraction, unavailable captions.
- Full user acceptance scenario: import OOP PPTX → preview → Lesson 1 → follow-up → example → complete → Lesson 2 → revisit Lesson 1 → restart/resume.

## Next steps
Run POC checks, launch StudyFlow, complete browser sign-in and inference. Update this file with actual evidence. Proceed to the core workflow only after success.

## Official references (checked 2026-10-30)
- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
