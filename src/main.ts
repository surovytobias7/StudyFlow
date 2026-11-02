import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { fileURLToPath } from "node:url";
import { Connection } from "./connection.js";
import { join } from "node:path";
import { Store } from "./database.js";
import { Learning } from "./learning.js";
import { importMaterial } from "./materials.js";
import {
  attachmentsSchema,
  languageOverride,
  planSchema,
  settingsSchema,
  uuid,
} from "./domain.js";
import { z } from "zod";
import { acceptance, normalAcceptance } from "./acceptance.js";
import { importUrl } from "./web-material.js";
import { installZoom } from "./zoom.js";
import { studyScopeSchema } from "./document-context.js";
import { searchAcceptance } from "./search-acceptance.js";
import { documentAcceptance } from "./document-acceptance.js";
import { quizTargetSchema } from "./quiz.js";
import { quizAcceptance } from "./quiz-acceptance.js";

app.setName("StudyFlow");
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window: BrowserWindow | undefined;
  let connection: Connection;
  app.on("second-instance", () => {
    window?.show();
    window?.focus();
  });
  void app
    .whenReady()
    .then(async () => {
      connection = new Connection((kind, text) => {
        if (window && !window.isDestroyed())
          window.webContents.send("studyflow:event", { kind, text });
      });
      let initError = "";
      try {
        await connection.init();
      } catch (error) {
        initError = (error as Error).message;
      }
      if (
        process.argv.includes("--acceptance") ||
        process.argv.includes("--acceptance-normal") ||
        process.argv.includes("--acceptance-web") ||
        process.argv.includes("--acceptance-documents") ||
        process.argv.includes("--acceptance-quizzes")
      ) {
        try {
          if (initError) throw new Error(initError);
          await (process.argv.includes("--acceptance-quizzes")
            ? quizAcceptance(connection)
            : process.argv.includes("--acceptance-documents")
              ? documentAcceptance(connection)
              : process.argv.includes("--acceptance-web")
                ? searchAcceptance(connection)
                : process.argv.includes("--acceptance-normal")
                  ? normalAcceptance(connection)
                  : acceptance(connection));
        } catch (error) {
          console.error((error as Error).message);
          process.exitCode = 1;
        } finally {
          app.exit(Number(process.exitCode ?? 0));
        }
        return;
      }
      if (process.argv.includes("--diagnose-connection")) {
        try {
          if (initError) throw new Error(initError);
          const status = await connection.refreshModels();
          await connection.test(status.models[0]?.slug);
          console.info("Live inference completed successfully.");
        } catch (error) {
          console.error((error as Error).message);
        } finally {
          app.quit();
        }
        return;
      }
      const store = new Store(
        join(app.getPath("userData"), "studyflow.sqlite"),
      );
      const learning = new Learning(store, connection, (event) => {
        if (window && !window.isDestroyed())
          window.webContents.send("studyflow:event", event);
      });
      const connectionStatus = () =>
        initError
          ? {
              connected: false,
              planEnabled: false,
              account: "",
              models: [],
              error: initError,
            }
          : connection.status();
      const page = new URL("../dist-ui/index.html", import.meta.url);
      window = new BrowserWindow({
        width: 1440,
        height: 940,
        minWidth: 900,
        minHeight: 650,
        title: "StudyFlow",
        backgroundColor: "#18181b",
        autoHideMenuBar: true,
        webPreferences: {
          preload: fileURLToPath(
            new URL("../poc/preload.cjs", import.meta.url),
          ),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      const changeZoom = installZoom(
        window.webContents,
        store.settings().zoomFactor,
        (factor) => store.setting("zoomFactor", String(factor)),
      );
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      window.webContents.session.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      let closing = false;
      window.on("close", (event) => {
        if (closing) return;
        event.preventDefault();
        closing = true;
        connection.cancel();
        // Let cancellation persist any partial answer before closing SQLite.
        void learning.whenIdle().finally(() => window?.destroy());
      });
      ipcMain.handle(
        "studyflow:command",
        async (event, action: unknown, value: unknown) => {
          if (
            event.sender !== window?.webContents ||
            event.senderFrame !== window.webContents.mainFrame ||
            event.senderFrame.url !== page.href
          )
            return { ok: false, error: "Untrusted IPC sender." };
          if (
            initError &&
            [
              "chat",
              "normalChat",
              "quizGenerate",
              "import",
              "transcript",
              "url",
              "login",
              "models",
              "test",
              "disconnect",
            ].includes(String(action))
          )
            return { ok: false, error: initError };
          try {
            let result;
            switch (action) {
              case "quizList":
                result = learning.quizzes.list(quizTargetSchema.parse(value));
                break;
              case "quizGet":
                result = learning.quizzes.view(uuid.parse(value));
                break;
              case "quizGenerate": {
                const input = z
                  .object({
                    target: quizTargetSchema,
                    request: z.string().max(4000),
                    attachments: attachmentsSchema.default([]),
                  })
                  .parse(value);
                result = await learning.generateQuiz(
                  input.target,
                  input.request,
                  input.attachments,
                );
                break;
              }
              case "quizAnswer": {
                const input = z
                  .object({
                    id: uuid,
                    index: z.number().int().min(0).max(9),
                    answer: z.string().min(1).max(8000),
                  })
                  .parse(value);
                result = await learning.answerQuiz(
                  input.id,
                  input.index,
                  input.answer,
                );
                break;
              }
              case "quizNext": {
                learning.assertIdle();
                const input = z
                  .object({ id: uuid, index: z.number().int().min(0).max(9) })
                  .parse(value);
                result = learning.quizzes.next(input.id, input.index);
                break;
              }
              case "openLink": {
                const url = new URL(z.string().url().max(4000).parse(value));
                if (
                  !["https:", "http:"].includes(url.protocol) ||
                  url.username ||
                  url.password
                )
                  throw new Error(
                    "Only HTTP and HTTPS source links can be opened.",
                  );
                await shell.openExternal(url.href);
                result = true;
                break;
              }
              case "zoom":
                result = changeZoom(
                  z.enum(["in", "out", "reset"]).parse(value),
                );
                break;
              case "snapshot": {
                const snapshot = store.snapshot(
                  typeof value === "string" ? uuid.parse(value) : undefined,
                );
                if (typeof value === "string" && snapshot.course)
                  store.setting("activeCourse", snapshot.course.id);
                result = snapshot;
                break;
              }
              case "settings": {
                const settings = settingsSchema.parse(value);
                store.transaction(() => {
                  for (const [key, setting] of Object.entries(settings))
                    store.setting(key, setting);
                });
                result = store.snapshot();
                break;
              }
              case "activeMode": {
                const mode = z.enum(["normal", "study"]).parse(value);
                store.setting("activeMode", mode);
                result =
                  mode === "normal" ? store.normalSnapshot() : store.snapshot();
                break;
              }
              case "normalSnapshot":
                result = store.normalSnapshot(
                  typeof value === "string" ? uuid.parse(value) : undefined,
                );
                break;
              case "normalCreate":
                learning.assertIdle();
                result = store.createNormalConversation(
                  value == null ? null : languageOverride.parse(value),
                );
                break;
              case "normalSelect":
                learning.assertIdle();
                result = store.selectNormalConversation(uuid.parse(value));
                break;
              case "normalRename": {
                const input = z
                  .object({
                    id: uuid,
                    title: z.string().trim().min(1).max(180),
                  })
                  .parse(value);
                result = store.renameNormalConversation(input.id, input.title);
                break;
              }
              case "normalDelete":
                learning.assertIdle();
                result = store.deleteNormalConversation(uuid.parse(value));
                break;
              case "normalLanguage": {
                learning.assertIdle();
                const input = z
                  .object({ id: uuid, language: languageOverride })
                  .parse(value);
                result = store.setNormalLanguage(input.id, input.language);
                break;
              }
              case "normalChat": {
                const input = z
                  .object({
                    id: uuid,
                    question: z.string().max(12000),
                    attachments: attachmentsSchema,
                    webSearch: z.boolean().default(false),
                  })
                  .parse(value);
                result = await learning.normalChat(
                  input.id,
                  input.question,
                  input.attachments,
                  input.webSearch,
                );
                break;
              }
              case "normalAttach": {
                const selection = await dialog.showOpenDialog(window!, {
                  properties: ["openFile", "multiSelections"],
                  filters: [
                    {
                      name: "Chat attachments",
                      extensions: [
                        "pdf",
                        "pptx",
                        "png",
                        "jpg",
                        "jpeg",
                        "webp",
                        "txt",
                        "md",
                      ],
                    },
                  ],
                });
                if (selection.canceled) {
                  result = [];
                  break;
                }
                const attachments = [];
                if (selection.filePaths.length > 8)
                  throw new Error("Attach at most 8 files per message.");
                let totalImages = 0;
                for (const path of selection.filePaths.slice(0, 8)) {
                  const material = await importMaterial(
                    path,
                    join(app.getPath("userData"), "materials"),
                  );
                  const images = material.images.slice(
                    0,
                    Math.max(0, 8 - totalImages),
                  );
                  totalImages += images.length;
                  attachments.push({
                    name: material.name,
                    kind: material.kind,
                    text: material.text,
                    images,
                    warning: [
                      material.warning,
                      material.text.length > 30_000 ||
                      images.length < material.images.length
                        ? "The full extracted text is saved. Relevant excerpts are selected for each question; specify a page, slide or topic for detail. Some images may be omitted."
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" "),
                  });
                }
                if (
                  attachments.reduce(
                    (sum, item) =>
                      sum +
                      item.images.reduce((n, image) => n + image.url.length, 0),
                    0,
                  ) > 24_000_000
                )
                  throw new Error(
                    "Attachments are too large to send together. Remove some images or attach a smaller file.",
                  );
                result = attachmentsSchema.parse(attachments);
                break;
              }
              case "courseLanguage": {
                learning.assertIdle();
                const input = z
                  .object({ courseId: uuid, language: languageOverride })
                  .parse(value);
                result = store.setCourseLanguage(
                  input.courseId,
                  input.language,
                );
                break;
              }
              case "source":
                result = store.source(uuid.parse(value));
                break;
              case "import": {
                learning.assertIdle();
                const scope = studyScopeSchema.parse(value ?? {});
                const selection = await dialog.showOpenDialog(window!, {
                  properties: ["openFile"],
                  filters: [
                    {
                      name: "Learning materials",
                      extensions: [
                        "pdf",
                        "pptx",
                        "png",
                        "jpg",
                        "jpeg",
                        "webp",
                        "txt",
                        "md",
                      ],
                    },
                  ],
                });
                if (selection.canceled || !selection.filePaths[0]) {
                  result = null;
                  break;
                }
                const material = await importMaterial(
                  selection.filePaths[0],
                  join(app.getPath("userData"), "materials"),
                );
                result = await learning.plan(material, scope);
                break;
              }
              case "transcript": {
                const input = z
                  .object({
                    title: z.string().min(1).max(180),
                    text: z.string().min(20).max(600000),
                    scope: studyScopeSchema.optional(),
                  })
                  .parse(value);
                result = await learning.plan(
                  learning.transcript(input.title, input.text),
                  input.scope,
                );
                break;
              }
              case "url": {
                learning.assertIdle();
                const input = z
                  .union([
                    z.string().url().max(4000),
                    z.object({
                      url: z.string().url().max(4000),
                      scope: studyScopeSchema,
                    }),
                  ])
                  .parse(value);
                result = await learning.plan(
                  await importUrl(
                    typeof input === "string" ? input : input.url,
                  ),
                  typeof input === "string" ? undefined : input.scope,
                );
                break;
              }
              case "editPlan": {
                learning.assertIdle();
                const input = z
                  .object({ courseId: uuid, plan: planSchema })
                  .parse(value);
                result = store.editPlan(input.courseId, input.plan);
                break;
              }
              case "activate":
                learning.assertIdle();
                result = store.activate(uuid.parse(value));
                break;
              case "complete": {
                learning.assertIdle();
                const input = z
                  .object({ lessonId: uuid, operationId: uuid })
                  .parse(value);
                result = store.complete(input.lessonId, input.operationId);
                break;
              }
              case "undo":
                learning.assertIdle();
                result = store.undo(uuid.parse(value));
                break;
              case "completePath": {
                learning.assertIdle();
                const input = z
                  .object({ courseId: uuid, operationId: uuid })
                  .parse(value);
                result = store.completePath(input.courseId, input.operationId);
                break;
              }
              case "reopenPath": {
                learning.assertIdle();
                const input = z
                  .object({ courseId: uuid, operationId: uuid.optional() })
                  .parse(value);
                result = store.reopenPath(input.courseId, input.operationId);
                break;
              }
              case "mark": {
                learning.assertIdle();
                const input = z
                  .object({
                    lessonId: uuid,
                    status: z.enum([
                      "not_started",
                      "in_progress",
                      "completed",
                      "needs_review",
                    ]),
                  })
                  .parse(value);
                result = store.mark(input.lessonId, input.status);
                break;
              }
              case "chat": {
                const input = z
                  .object({
                    lessonId: uuid,
                    question: z.string().max(12000),
                    mode: z
                      .enum(["chat", "exercise", "answer"])
                      .default("chat"),
                    webSearch: z.boolean().default(false),
                  })
                  .parse(value);
                result = await learning.chat(
                  input.lessonId,
                  input.question,
                  input.mode,
                  input.webSearch,
                );
                break;
              }
              case "status":
                result = connectionStatus();
                break;
              case "login":
                result = await connection.login();
                break;
              case "models":
                result = await connection.refreshModels();
                break;
              case "test":
                result = await connection.test(value);
                break;
              case "disconnect":
                result = await connection.disconnect();
                break;
              case "cancel":
                connection.cancel();
                result = connectionStatus();
                break;
              default:
                throw new Error("Unknown command.");
            }
            return { ok: true, data: result };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Operation failed.";
            return { ok: false, error: message };
          }
        },
      );
      await window.loadFile(fileURLToPath(page));
      window.show();
      window.focus();
      console.info(
        "StudyFlow window ready:",
        window.isVisible(),
        window.webContents.getTitle(),
      );
      app.on("before-quit", () => {
        connection.cancel();
      });
      app.on("quit", () => store.close());
      app.on("window-all-closed", () => app.quit());
    })
    .catch((error: unknown) => {
      dialog.showErrorBox(
        "StudyFlow",
        "StudyFlow could not start / StudyFlow sa nepodarilo spustiť.\n\n" +
          (error instanceof Error ? error.message : String(error)),
      );
      app.exit(1);
    });
}
