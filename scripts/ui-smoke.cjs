// Isolated native renderer/SQLite integration test. No real credentials or AI calls.
const { app, BrowserWindow, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { tmpdir } = require("node:os");
const { randomUUID } = require("node:crypto");
const root = join(__dirname, "..");
const temp = mkdtempSync(join(tmpdir(), "studyflow-native-"));
app.setPath("userData", join(temp, "profile"));
let window, store;
const load = (file) => import(pathToFileURL(join(root, "dist", file)).href);
const instructions = [];
const failures = [];
async function evaluate(script) {
  try {
    return await window.webContents.executeJavaScript(script, true);
  } catch (error) {
    throw new Error(
      `${error.message}\nScript: ${script}\nRenderer: ${failures.join("\n")}`,
    );
  }
}
async function waitFor(expression, description = expression) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(
    `Timed out: ${description}\n${await evaluate("document.body.innerText")}`,
  );
}
async function click(selector, index = 0) {
  await waitFor(
    `!!document.querySelectorAll(${JSON.stringify(selector)})[${index}] && !document.querySelectorAll(${JSON.stringify(selector)})[${index}].disabled`,
  );
  await evaluate(
    `document.querySelectorAll(${JSON.stringify(selector)})[${index}].click()`,
  );
}
async function textButton(text) {
  const expression = `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled)`;
  await waitFor(`!!(${expression})`, `button ${text}`);
  await evaluate(`(${expression}).click()`);
}
async function fill(selector, value) {
  await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(
    `(() => { const el=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`,
  );
}
async function send(text, expectedCount) {
  await fill(".normal-composer textarea", text);
  await click(".normal-composer button[type=submit]");
  await waitFor(
    `document.querySelectorAll('.normal-messages .message').length === ${expectedCount} && !document.querySelector('.normal-messages .spin')`,
  );
}
app
  .whenReady()
  .then(async () => {
    const { Connection } = await load("connection.js");
    const startupConnection = new Connection(() => {});
    startupConnection.state = { hostId: "isolated-test" };
    let releaseModels;
    const catalog = new Promise((resolve) => {
      releaseModels = resolve;
    });
    let discoveries = 0;
    startupConnection.loadModels = async () => {
      discoveries++;
      await catalog;
      startupConnection.models = [
        { slug: "test-model", display_name: "Test model" },
      ];
    };
    startupConnection.accessToken = async () => "test-only-token";
    startupConnection.request = async () =>
      new Response(
        'data: {"type":"response.output_text.delta","delta":"Ready"}\n\ndata: {"type":"response.completed"}\n\n',
        { headers: { "Content-Type": "text/event-stream" } },
      );
    const modelOne = startupConnection.refreshModels();
    const modelTwo = startupConnection.refreshModels();
    const firstResponse = startupConnection.generate(
      "test-model",
      "Test",
      [],
      () => {},
    );
    const startup = Promise.all([modelOne, modelTwo, firstResponse]);
    releaseModels();
    const startupResults = await startup;
    assert.equal(discoveries, 1);
    assert.equal(startupResults[2], "Ready");
    console.info(
      "PASS: first AI request safely joins concurrent startup model discovery",
    );
    const { Store } = await load("database.js");
    const { Learning } = await load("learning.js");
    store = new Store(join(temp, "test.sqlite"));
    store.setting("model", "fixture-model");
    const connection = {
      async refreshModels() {
        return status;
      },
      async generate(_model, prompt, _input, delta) {
        instructions.push(prompt);
        const response = `${prompt.includes("Respond in Slovak") ? "Slovenská odpoveď" : "English answer"}\n\n**Clear explanation**\n\n\`\`\`typescript\nconst answer = 42;\n\`\`\`\n\n$x^2 + 1$`;
        for (const part of [response.slice(0, 20), response.slice(20)]) {
          delta(part);
          await new Promise((r) => setTimeout(r, 35));
        }
        return response;
      },
    };
    const status = {
      connected: true,
      planEnabled: true,
      account: "Isolated UI test",
      models: [{ slug: "fixture-model", display_name: "Test model" }],
    };
    let learning = new Learning(store, connection, (event) =>
      window.webContents.send("studyflow:event", event),
    );
    const attachment = {
      name: "English notes.txt",
      kind: "txt",
      text: "English material about classes and objects.",
      images: [],
      warning:
        "Only part of this attachment fits in the chat context. Use Study Mode for the full document.",
    };
    ipcMain.handle("studyflow:command", async (_event, action, value) => {
      try {
        let result;
        switch (action) {
          case "status":
          case "models":
            result = status;
            break;
          case "snapshot":
            if (value) store.setting("activeCourse", value);
            result = store.snapshot(value);
            break;
          case "normalSnapshot":
            result = store.normalSnapshot(value);
            break;
          case "normalCreate":
            result = store.createNormalConversation(value);
            break;
          case "normalSelect":
            result = store.selectNormalConversation(value);
            break;
          case "normalRename":
            result = store.renameNormalConversation(value.id, value.title);
            break;
          case "normalDelete":
            result = store.deleteNormalConversation(value);
            break;
          case "normalLanguage":
            result = store.setNormalLanguage(value.id, value.language);
            break;
          case "courseLanguage":
            result = store.setCourseLanguage(value.courseId, value.language);
            break;
          case "activeMode":
            store.setting("activeMode", value);
            result =
              value === "normal" ? store.normalSnapshot() : store.snapshot();
            break;
          case "settings":
            for (const [key, setting] of Object.entries(value))
              store.setting(key, setting);
            result = store.snapshot();
            break;
          case "normalChat":
            result = await learning.normalChat(
              value.id,
              value.question,
              value.attachments,
            );
            break;
          case "normalAttach":
            result = [attachment];
            break;
          case "chat":
            result = await learning.chat(
              value.lessonId,
              value.question,
              value.mode,
            );
            break;
          case "editPlan":
            result = store.editPlan(value.courseId, value.plan);
            break;
          case "activate":
            result = store.activate(value);
            break;
          case "complete":
            result = store.complete(value.lessonId, value.operationId);
            break;
          case "mark":
            result = store.mark(value.lessonId, value.status);
            break;
          case "completePath":
            result = store.completePath(value.courseId, value.operationId);
            break;
          case "reopenPath":
            result = store.reopenPath(value.courseId, value.operationId);
            break;
          case "undo":
            result = store.undo(value);
            break;
          default:
            throw new Error(`Unexpected test IPC: ${action}`);
        }
        return { ok: true, data: result };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
    window = new BrowserWindow({
      show: false,
      width: 1440,
      height: 940,
      webPreferences: {
        preload: join(root, "poc", "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    window.webContents.on("console-message", (event) => {
      if (event.level === "error") failures.push(event.message);
    });
    await window.loadFile(join(root, "dist-ui", "index.html"));
    await textButton("Normal chat");
    await send("Explain a vector", 2);
    const first = store.normalSnapshot().conversation.id;
    assert.equal(store.courses().length, 0);
    assert.match(instructions.at(-1), /Respond in Slovak/);
    await waitFor(
      "!!document.querySelector('.katex') && !!document.querySelector('code.hljs')",
    );
    await click('[aria-label="Rename conversation"]');
    await fill(".conversation-dialog input", "Vectors");
    await click(".conversation-dialog button[type=submit]");
    await waitFor(
      "document.querySelector('.normal-chat-heading h1').textContent === 'Vectors'",
    );
    await click(".new-button");
    await waitFor(
      "document.querySelectorAll('.normal-messages .message').length === 0",
    );
    const second = store.normalSnapshot().conversation.id;
    await click(".chat-select", 1);
    await waitFor(
      "document.querySelectorAll('.normal-messages .message').length === 2",
    );
    await click('[aria-label="Rename conversation"]', 0);
    await fill(".conversation-dialog input", "Other chat");
    await click(".conversation-dialog button[type=submit]");
    await waitFor("!document.querySelector('dialog[open]')");
    assert.equal(store.normalSnapshot().conversation.id, first);
    assert.equal(
      await evaluate(
        "document.querySelector('.normal-chat-heading h1').textContent",
      ),
      "Vectors",
    );
    await click('[aria-label="Delete conversation"]', 0);
    await click(".conversation-dialog button[type=submit]");
    await waitFor("document.querySelectorAll('.chat-select').length === 1");
    assert.equal(store.normalSnapshot(second).conversation, null);
    await textButton("Attach");
    await waitFor("!!document.querySelector('.attachment-list')");
    await click(".normal-composer button[type=submit]");
    await waitFor(
      "document.querySelectorAll('.normal-messages .message').length === 4 && !document.querySelector('.normal-messages .spin')",
    );
    assert.equal(
      store.normalMessages(first)[2].attachments[0].name,
      attachment.name,
    );
    await click(".normal-messages .attachment-chip");
    await waitFor("!!document.querySelector('.source-dialog[open]')");
    await click(".source-dialog button");
    await click(".sidebar-bottom .nav");
    await fill(
      ".settings-section:nth-of-type(2) label:nth-of-type(1) select",
      "sk",
    );
    await waitFor("document.documentElement.lang === 'sk'");
    await fill(
      ".settings-section:nth-of-type(2) label:nth-of-type(2) select",
      "en",
    );
    await textButton("Bežný chat");
    await waitFor(
      "document.querySelector('.language-inline select option')?.textContent.includes('English')",
    );
    await send("Next question", 6);
    assert.match(instructions.at(-1), /Respond in English/);
    await fill(".language-inline select", "sk");
    await send("Another question", 8);
    assert.match(instructions.at(-1), /Respond in Slovak/);
    const course = store.create(
      {
        id: randomUUID(),
        name: "OOP slides",
        kind: "pptx",
        text: "[Slide 1] Classes and objects. [Slide 2] Properties.",
        images: [],
        warning: "",
      },
      {
        title: "OOP",
        lessons: ["Classes", "Properties"].map((title) => ({
          title,
          objective: title,
          references: ["Slide 1"],
        })),
      },
    );
    await textButton("Študijný režim");
    const beforeManualAI = instructions.length;
    await click(".lesson-status-action", 1);
    await waitFor(
      "document.querySelectorAll('.lesson-open.done').length === 1",
    );
    assert.equal(store.snapshot().course.completed, 1);
    assert.equal(store.snapshot().course.started, 0);
    assert.equal(store.snapshot().messages.length, 0);
    await click(".lesson-status-action", 1);
    await waitFor(
      "document.querySelectorAll('.lesson-open.done').length === 0",
    );
    assert.equal(store.snapshot().course.completed, 0);
    assert.equal(instructions.length, beforeManualAI);
    await fill(".lesson-language select", "en");
    await textButton("Začať štúdium");
    await waitFor(
      "document.querySelectorAll('.messages .message').length === 1 && !document.querySelector('.messages .spin')",
    );
    assert.match(instructions.at(-1), /Respond in English/);
    assert.match(instructions.at(-1), /Teach ONLY the current lesson: Classes/);
    const one = store.snapshot().lessons[0].id;
    await click(".next-button");
    await waitFor(
      "document.querySelector('.lesson-heading h1')?.textContent === 'Properties' && !document.querySelector('.messages .spin')",
    );
    assert.equal(store.snapshot().course.completed, 1);
    assert.equal(store.snapshot().messages.length, 1);
    await click(".lesson-open", 0);
    await waitFor(
      "document.querySelector('.lesson-heading h1')?.textContent === 'Classes' && !document.querySelector('.messages .spin')",
    );
    assert.equal(store.lesson(one).status, "completed");
    const beforePathAI = instructions.length;
    const beforePath = store.snapshot();
    await click(".path-menu summary");
    await textButton("Označiť celý Learning Path ako hotový");
    await waitFor("!!document.querySelector('.path-completion-dialog[open]')");
    await textButton("Zrušiť");
    assert.equal(store.snapshot().course.completed, 1);
    await click(".path-menu summary");
    await textButton("Označiť celý Learning Path ako hotový");
    await textButton("Dokončiť celý plán");
    await waitFor(
      "document.querySelector('.path-progress strong').textContent === '100%'",
    );
    assert.equal(store.snapshot().course.completed, 2);
    assert.equal(store.snapshot().course.activeLessonId, null);
    assert.equal(instructions.length, beforePathAI);
    await click(".path-undo button");
    await waitFor(
      "document.querySelector('.path-progress strong').textContent === '50%'",
    );
    assert.deepEqual(store.snapshot().lessons, beforePath.lessons);
    assert.equal(store.snapshot().course.activeLessonId, one);
    await click(".path-menu summary");
    await textButton("Označiť celý Learning Path ako hotový");
    await textButton("Dokončiť celý plán");
    await waitFor(
      "document.querySelector('.path-progress strong').textContent === '100%'",
    );
    store.close();
    store = new Store(join(temp, "test.sqlite"));
    learning = new Learning(store, connection, (event) =>
      window.webContents.send("studyflow:event", event),
    );
    await window.loadFile(join(root, "dist-ui", "index.html"));
    await waitFor(
      "document.querySelector('.path-progress strong')?.textContent === '100%'",
    );
    assert.equal(store.snapshot().course.completed, 2);
    await click(".path-menu summary");
    await textButton("Znovu otvoriť študijný plán");
    await waitFor(
      "document.querySelector('.path-progress strong')?.textContent === '50%'",
    );
    assert.deepEqual(store.snapshot().lessons, beforePath.lessons);
    assert.equal(instructions.length, beforePathAI);
    // Exercise real renderer layout at requested desktop sizes and scaled workspaces.
    mkdirSync(join(root, "artifacts", "study-layout"), { recursive: true });
    for (const [width, height, zoom] of [
      [1920, 1080, 1],
      [2560, 1440, 1],
      [1366, 768, 1],
      [1366, 768, 1.25],
      [1366, 768, 1.5],
    ]) {
      window.setContentSize(width, height);
      window.webContents.setZoomFactor(zoom);
      await new Promise((r) => setTimeout(r, 150));
      await evaluate(
        "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))",
      );
      const metrics = await evaluate(`(() => {
        const rect = selector => { const r=document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
        return { width:innerWidth,height:innerHeight,header:rect('.lesson-heading'),language:rect('.lesson-language'),chat:rect('.message-width'),messages:rect('.messages'),composer:rect('.composer'),next:rect('.next-button'),toolbar:rect('.topbar'),path:rect('.path-panel'),horizontal:document.documentElement.scrollWidth>innerWidth, proseSize:getComputedStyle(document.querySelector('.messages .prose')).fontSize };
      })()`);
      assert.equal(metrics.horizontal, false, JSON.stringify(metrics));
      assert.ok(
        metrics.header.y - metrics.toolbar.bottom < 2,
        JSON.stringify(metrics),
      );
      assert.ok(
        metrics.language.bottom <= metrics.header.bottom,
        JSON.stringify(metrics),
      );
      assert.ok(
        metrics.composer.bottom <= metrics.height + 1,
        JSON.stringify(metrics),
      );
      assert.ok(
        metrics.composer.width > metrics.chat.width - 100,
        JSON.stringify(metrics),
      );
      assert.ok(metrics.messages.height > 150, JSON.stringify(metrics));
      assert.ok(
        metrics.next.bottom <= metrics.composer.y,
        JSON.stringify(metrics),
      );
      assert.equal(metrics.proseSize, "16px");
      if (zoom === 1 && width >= 1920)
        assert.ok(metrics.chat.width >= 1000, JSON.stringify(metrics));
      writeFileSync(
        join(
          root,
          "artifacts",
          "study-layout",
          `${width}x${height}-${zoom}.png`,
        ),
        (await window.webContents.capturePage()).toPNG(),
      );
      console.info("PASS layout", width, height, zoom, JSON.stringify(metrics));
    }
    window.webContents.setZoomFactor(1);
    window.setContentSize(1440, 940);
    await click(".lesson-status-action", 1);
    await waitFor(
      "document.querySelector('.path-progress strong').textContent === '100%'",
    );
    assert.equal(instructions.length, beforePathAI);
    await click(".lesson-status-action", 1);
    await waitFor(
      "document.querySelector('.path-progress strong').textContent === '50%'",
    );
    assert.equal(instructions.length, beforePathAI);
    console.info(
      "PASS: manual lesson completion/reversal, confirmed whole-path completion/cancel/undo/reopen, no AI calls, SQLite restart persistence",
    );

    await textButton("Bežný chat");
    await waitFor(
      "document.querySelectorAll('.normal-messages .message').length === 8",
    );
    store.close();
    store = new Store(join(temp, "test.sqlite"));
    learning = new Learning(store, connection, (event) =>
      window.webContents.send("studyflow:event", event),
    );
    await window.loadFile(join(root, "dist-ui", "index.html"));
    await waitFor(
      "document.querySelectorAll('.normal-messages .message').length === 8",
    );
    assert.equal(store.normalSnapshot().conversation.id, first);
    assert.equal(store.snapshot(course.course.id).course.completed, 1);
    assert.equal(await evaluate("document.documentElement.lang"), "sk");
    assert.equal(
      await evaluate("document.querySelector('.language-inline select').value"),
      "sk",
    );
    assert.deepEqual(failures, []);
    mkdirSync(join(root, "artifacts"), { recursive: true });
    await evaluate(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    writeFileSync(
      join(root, "artifacts", "normal-chat-smoke.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    await fill(".normal-composer textarea", "Unsent draft of the deleted chat");
    await click('[aria-label="Odstrániť konverzáciu"]');
    await click(".conversation-dialog button[type=submit]");
    await waitFor(
      "document.querySelectorAll('.normal-messages .message').length === 0 && document.querySelector('.normal-composer textarea').value === ''",
    );
    await send("A fresh conversation after deletion", 2);
    assert.notEqual(store.normalSnapshot().conversation.id, first);
    assert.equal(store.normalSnapshot(first).conversation, null);
    assert.equal(store.snapshot(course.course.id).course.completed, 1);
    await click(".sidebar-bottom .nav");
    await fill(
      ".settings-section:nth-of-type(2) label:nth-of-type(3) select",
      "light",
    );
    await waitFor("document.documentElement.dataset.theme === 'light'");
    await textButton("Bežný chat");
    await waitFor("!!document.querySelector('.normal-chat-page')");
    await evaluate(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    writeFileSync(
      join(root, "artifacts", "normal-chat-light-smoke.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    console.info(
      "PASS: native Electron chat CRUD, optional attachments, Markdown/math/code, both languages, mode isolation, lesson completion/revisit and SQLite reopen/resume. AI was simulated.",
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    window?.destroy();
    store?.close();
    app.exit(process.exitCode ?? 0);
  });
app.on("quit", () => {
  try {
    rmSync(temp, { recursive: true, force: true });
  } catch {
    /* Windows can hold renderer cache handles until shutdown. */
  }
});
