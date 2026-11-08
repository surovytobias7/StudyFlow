// Isolated native renderer/SQLite integration test. No real credentials or AI calls.
const { app, BrowserWindow, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { tmpdir } = require("node:os");
const { randomUUID } = require("node:crypto");
const root = join(__dirname, "..");
const temp = mkdtempSync(join(tmpdir(), "studyflow-native-"));
app.setPath("userData", join(temp, "profile"));
let window, store, changeZoom;
let nextResponse, pauseStream;
let quizData;
const load = (file) => import(pathToFileURL(join(root, "dist", file)).href);
const instructions = [];
const generationOptions = [];
const openedLinks = [];
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
      async generate(_model, prompt, _input, delta, options) {
        instructions.push(prompt);
        generationOptions.push(options);
        if (
          prompt.includes("assessment designer") ||
          prompt.startsWith("Independently audit")
        ) {
          const data = JSON.parse(
            quizData ??
              readFileSync(join(root, "fixtures", "quiz.json"), "utf8"),
          );
          const count = prompt.match(/Generate exactly (\d+) questions/)?.[1];
          if (count) data.questions = data.questions.slice(0, Number(count));
          return JSON.stringify(data);
        }
        if (options?.jsonSchema?.name === "source_inventory")
          return JSON.stringify({
            topics: [
              {
                concept: "Polymorphism",
                details: "Virtual methods",
                references: ["Slide 2"],
              },
            ],
          });
        if (prompt.startsWith("Evaluate this student's answer"))
          return JSON.stringify({
            correct: true,
            feedback:
              "The code follows the rubric. This is a review; no code was executed.",
          });
        const response =
          nextResponse ??
          `${prompt.includes("Respond in Slovak") ? "Slovenská odpoveď" : "English answer"}\n\n**Clear explanation**\n\n\`\`\`typescript\nconst answer = 42;\n\`\`\`\n\n\\(x^2 + 1\\)`;
        for (const part of [response.slice(0, 20), response.slice(20)]) {
          delta(part);
          if (pauseStream) await pauseStream;
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
          case "quizList":
            result = learning.quizzes.list(value);
            break;
          case "quizGet":
            result = learning.quizzes.view(value);
            break;
          case "quizGenerate":
            result = await learning.generateQuiz(
              value.target,
              value.request,
              value.attachments,
              value.practice,
            );
            break;
          case "quizAnswer":
            result = await learning.answerQuiz(
              value.id,
              value.index,
              value.answer,
            );
            break;
          case "quizNext":
            result = learning.quizzes.next(value.id, value.index);
            break;
          case "openLink":
            openedLinks.push(value);
            result = true;
            break;
          case "transcript":
            result = await learning.plan(
              learning.transcript(value.title, value.text),
              value.scope,
            );
            break;
          case "zoom":
            result = changeZoom(value);
            break;
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
              value.webSearch,
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
              value.webSearch,
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
    const { installZoom } = await load("zoom.js");
    changeZoom = installZoom(
      window.webContents,
      store.settings().zoomFactor,
      (factor) => store.setting("zoomFactor", String(factor)),
    );
    await window.loadFile(join(root, "dist-ui", "index.html"));
    await textButton("Normal chat");
    await waitFor("!!document.querySelector('.normal-composer textarea')");
    await evaluate(
      "document.querySelector('.normal-composer textarea').focus()",
    );
    for (const [keyCode, modifiers, expected] of [
      ["=", ["control"], 1.1],
      ["+", ["control", "shift"], 1.2],
      ["-", ["control"], 1.1],
      ["0", ["control"], 1],
      ["numadd", ["control"], 1.1],
      ["numsub", ["control"], 1],
    ]) {
      window.webContents.sendInputEvent({
        type: "keyDown",
        keyCode,
        modifiers,
      });
      window.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
      await waitFor(
        `document.querySelector('.zoom-reset').textContent === '${Math.round(expected * 100)}%'`,
      );
      assert.equal(window.webContents.getZoomFactor(), expected);
      assert.equal(Number(store.settings().zoomFactor), expected);
    }
    await click('[aria-label="Zoom in"]');
    await waitFor(
      "document.querySelector('.zoom-reset').textContent === '110%'",
    );
    await window.loadFile(join(root, "dist-ui", "index.html"));
    await waitFor(
      "document.querySelector('.zoom-reset').textContent === '110%'",
    );
    assert.equal(window.webContents.getZoomFactor(), 1.1);
    await click(".zoom-reset");
    await waitFor(
      "document.querySelector('.zoom-reset').textContent === '100%'",
    );
    console.info(
      "PASS: real keyboard zoom in/equal/shift-plus/minus/reset while typing, toolbar, persisted preference and renderer reload",
    );
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
    await click(".web-toggle");
    nextResponse =
      "Document explanation.\n\n**Web**\n\n[Verified fixture source](https://example.org/reference)";
    await click(".normal-composer button[type=submit]");
    await waitFor(
      "document.querySelectorAll('.normal-messages .message').length === 4 && !document.querySelector('.normal-messages .spin')",
    );
    assert.equal(
      store.normalMessages(first)[2].attachments[0].name,
      attachment.name,
    );
    nextResponse = undefined;
    assert.deepEqual(generationOptions.at(-1), {
      webSearch: "auto",
      researchDepth: "deep",
    });
    await waitFor("!!document.querySelector('.conversation-documents')");
    await evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
    writeFileSync(
      join(root, "artifacts", "documents-chat.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    await click(".normal-messages a.source-link");
    await waitFor("!document.querySelector('[role=alert]')");
    assert.equal(openedLinks.at(-1), "https://example.org/reference");
    await click(".web-toggle");
    console.info(
      "PASS: saved document tray, web toggle, real source anchor and external-link IPC (simulated AI)",
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
    // Long history and controlled stream: reading earlier messages must not jump.
    const scrollChat = store.normalSnapshot().conversation.id;
    for (let i = 0; i < 12; i++)
      store.addNormalMessage(
        scrollChat,
        i % 2 ? "assistant" : "user",
        `Saved paragraph ${i}. `.repeat(70),
      );
    await window.loadFile(join(root, "dist-ui", "index.html"));
    await waitFor(
      "document.querySelectorAll('.normal-messages .message').length === 14",
    );
    assert.equal(
      await evaluate(
        "(() => { const el=document.querySelector('.normal-messages'); return el.scrollHeight-el.scrollTop-el.clientHeight < 5; })()",
      ),
      true,
    );
    let resumeStream;
    pauseStream = new Promise((resolve) => {
      resumeStream = resolve;
    });
    nextResponse =
      "Streaming reply.\n\n" + "New paragraph with context.\n\n".repeat(80);
    await fill(".normal-composer textarea", "Continue explaining");
    await click(".normal-composer button[type=submit]");
    await waitFor("!!document.querySelector('.normal-messages .spin')");
    await evaluate("document.querySelector('.normal-messages').scrollTop = 0");
    await waitFor("!!document.querySelector('.latest-message')");
    resumeStream();
    pauseStream = undefined;
    await waitFor(
      "!document.querySelector('.normal-messages .spin') && document.querySelectorAll('.normal-messages .message').length === 16",
    );
    assert.equal(
      await evaluate("document.querySelector('.normal-messages').scrollTop"),
      0,
    );
    await click(".latest-message");
    await waitFor(
      "(() => { const el=document.querySelector('.normal-messages'); return el.scrollHeight-el.scrollTop-el.clientHeight < 5; })()",
    );
    nextResponse = undefined;
    console.info(
      "PASS: saved chat opens at latest message, streaming preserves a reader's earlier scroll position, explicit latest-message action works",
    );
    store.setting("language", "en");
    store.setting("theme", "dark");
    await window.loadFile(join(root, "dist-ui", "index.html"));
    await textButton("Study mode");
    await click(".new-button");
    await fill("#study-focus", "Only polymorphism");
    await click(".study-scope summary");
    await fill(".scope-range input", "2");
    await evaluate(
      "(()=>{const input=document.querySelectorAll('.scope-range input')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2');input.dispatchEvent(new Event('input',{bubbles:true}));})()",
    );
    await fill('.import-page input[maxlength="180"]', "Focused OOP");
    await fill(
      ".import-page > label textarea",
      "[Slide 1]\nClasses and objects\n[Slide 2]\nPolymorphism and virtual methods",
    );
    await evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
    writeFileSync(
      join(root, "artifacts", "focused-learning-form.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    nextResponse = JSON.stringify({
      title: "Focused OOP",
      lessons: [
        {
          title: "Polymorphism",
          objective: "Virtual methods",
          references: ["Slide 2"],
          conceptIds: ["1.1"],
        },
      ],
    });
    await textButton("Build learning path");
    await waitFor("document.querySelectorAll('.plan-editor li').length===1");
    nextResponse = undefined;
    assert.deepEqual(
      JSON.parse(store.settings()[`scope:${store.snapshot().course.id}`]),
      { instructions: "Only polymorphism", from: 2, to: 2 },
    );
    assert.equal(store.courses().length, 2);
    await textButton("Start learning");
    await waitFor(
      "document.querySelectorAll('.messages .message').length===1 && !document.querySelector('.messages .spin')",
    );
    assert.match(instructions.at(-1), /Only polymorphism/);
    assert.equal(
      await evaluate(
        "document.querySelector('.web-toggle').getAttribute('aria-pressed')",
      ),
      "false",
    );
    console.info(
      "PASS: focused learning form, selected range, plan preview, start lesson and independent persisted scope",
    );
    const quizProgress = store.snapshot().course.completed;
    await textButton("Quiz");

    await waitFor(
      "document.querySelectorAll('.quiz-option').length===4 && !document.querySelector('.quiz-loading')",
    );
    assert.equal(
      await evaluate("document.querySelector('.quiz-submit').disabled"),
      true,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.quiz-dialog').textContent.includes('concrete instance')",
      ),
      false,
    );
    await evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
    assert.ok(
      await evaluate(
        "document.querySelector('.quiz-progress').getBoundingClientRect().height >= 4",
      ),
    );
    writeFileSync(
      join(root, "artifacts", "quiz-question.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    for (const [width, height, zoom] of [
      [1920, 1080, 1],
      [2560, 1440, 1],
      [1366, 768, 1],
      [1366, 768, 1.25],
      [1366, 768, 1.5],
    ]) {
      window.setContentSize(width, height);
      window.webContents.setZoomFactor(zoom);
      await evaluate(
        "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
      );
      const bounds = await evaluate(
        "(()=>{const d=document.querySelector('.quiz-dialog'),r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:d.scrollWidth>d.clientWidth+1};})()",
      );
      assert.ok(
        bounds.left >= 0 &&
          bounds.right <= bounds.width + 1 &&
          bounds.top >= 0 &&
          bounds.bottom <= bounds.height + 1 &&
          !bounds.overflow,
        JSON.stringify(bounds),
      );
      if (zoom === 1.5)
        writeFileSync(
          join(root, "artifacts", "quiz-scaled.png"),
          (await window.webContents.capturePage()).toPNG(),
        );
    }
    window.setContentSize(1440, 940);
    window.webContents.setZoomFactor(1);
    await evaluate("document.querySelector('.quiz-option').focus()");
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Down" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Down" });
    await waitFor(
      "document.querySelectorAll('.quiz-option')[1].getAttribute('aria-checked')==='true'",
    );
    const savedQuiz = () =>
      JSON.parse(
        store.db
          .prepare("SELECT payload FROM Quizzes ORDER BY rowid DESC LIMIT 1")
          .get().payload,
      );
    await click(
      ".quiz-option",
      (savedQuiz().questions[0].correctOption + 1) % 4,
    );
    await click(".quiz-submit");
    await waitFor(
      "!!document.querySelector('.quiz-feedback.incorrect') && !document.querySelector('.quiz-loading')",
    );
    await waitFor(
      "document.activeElement === document.querySelector('.quiz-next')",
    );
    await click('[aria-label="Close quiz"]');
    await window.loadFile(join(root, "dist-ui", "index.html"));
    await waitFor("!!document.querySelector('.lesson-heading')");
    await textButton("Quiz");
    await waitFor(
      "!!document.querySelector('.quiz-feedback.incorrect') && !document.querySelector('.quiz-loading')",
    );
    await waitFor(
      "document.activeElement === document.querySelector('.quiz-next')",
    );
    window.webContents.focus();
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
    window.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
    await waitFor(
      "document.querySelectorAll('.quiz-option').length===4 && !document.querySelector('.quiz-feedback')",
    );
    await click(".quiz-option", savedQuiz().questions[1].correctOption);
    await click(".quiz-submit");
    await waitFor(
      "!!document.querySelector('.quiz-feedback.correct') && !document.querySelector('.quiz-loading')",
    );
    await click(".quiz-next");
    for (let index = 2; index < 4; index++) {
      await waitFor(
        "!!document.querySelector('.quiz-submit') && !document.querySelector('.quiz-loading')",
      );
      await click(".quiz-option", savedQuiz().questions[index].correctOption);
      await click(".quiz-submit");
      await waitFor(
        "!!document.querySelector('.quiz-feedback.correct') && !document.querySelector('.quiz-loading')",
      );
      await click(".quiz-next");
    }
    await waitFor(
      "document.querySelector('.quiz-score')?.textContent==='75%' && !document.querySelector('.quiz-loading')",
    );
    await click(".quiz-review.incorrect summary");
    await evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
    writeFileSync(
      join(root, "artifacts", "quiz-results.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    assert.equal(store.snapshot().course.completed, quizProgress);
    const written = JSON.parse(
      readFileSync(join(root, "fixtures", "quiz.json"), "utf8"),
    );
    written.questions = [
      {
        ...written.questions[0],
        type: "coding",
        options: [],
        correctOption: null,
        optionExplanations: [],
        sampleAnswer: "class Student {}",
        rubric: "Define a C# class",
      },
    ];
    quizData = JSON.stringify(written);
    await click(".quiz-customize summary");
    await evaluate(
      "(()=>{const s=document.querySelector('[aria-label=\"Exercise type\"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'coding');s.dispatchEvent(new Event('change',{bubbles:true}));})()",
    );
    await fill("#quiz-request", "Give one coding exercise");
    await textButton("Generate questions");
    await waitFor(
      "!!document.querySelector('.quiz-written textarea') && !document.querySelector('.quiz-loading')",
    );
    await fill(".quiz-written textarea", "class Student {}");
    await click(".quiz-submit");
    await waitFor(
      "!!document.querySelector('.quiz-feedback.correct') && !document.querySelector('.quiz-loading')",
    );
    await click('[aria-label="Close quiz"]');
    quizData = undefined;
    await textButton("Normal chat");
    await fill(
      ".normal-composer textarea",
      "Give me 2 questions about this topic.",
    );
    await click(".normal-composer button[type=submit]");
    await waitFor(
      "document.querySelectorAll('.quiz-option').length===4 && !document.querySelector('.quiz-loading')",
    );
    assert.equal(store.courses().length, 2);
    await click('[aria-label="Close quiz"]');
    console.info(
      "PASS: interactive A-D quiz, hidden answers, wrong/correct feedback, keyboard focus/Enter next, persisted resume, score/mistake review, written code feedback, natural-language Normal Chat quiz and unchanged lesson progress",
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
