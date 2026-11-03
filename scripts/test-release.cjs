// Test the installed production binary with real IPC, native pickers and ChatGPT.
// A temporary profile protects study data; only encrypted credential refreshes sync back.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "artifacts", "release-verification");
const executable = path.resolve(
  process.argv[2] ||
    path.join(
      process.env.LOCALAPPDATA,
      "Programs",
      "StudyFlow",
      "StudyFlow.exe",
    ),
);
const originalCredentials = path.join(
  process.env.APPDATA,
  "StudyFlow",
  "account.credentials",
);
const steps = [];
let temp, profile, before, child, client;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function pass(message) {
  steps.push(message);
  console.log("PASS: " + message);
}
async function port() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const number = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return number;
}
class CDP {
  constructor(socket) {
    this.socket = socket;
    this.next = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const response = JSON.parse(event.data);
      if (response.id) {
        const item = this.pending.get(response.id);
        if (item) {
          this.pending.delete(response.id);
          clearTimeout(item.timer);
          response.error
            ? item.reject(new Error(JSON.stringify(response.error)))
            : item.resolve(response.result);
        }
      }
    });
    socket.addEventListener("close", () => {
      for (const item of this.pending.values()) {
        clearTimeout(item.timer);
        item.reject(new Error("Production app disconnected"));
      }
      this.pending.clear();
    });
  }
  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("CDP timeout: " + method));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.request("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text,
      );
    return result.result.value;
  }
}
async function waitFor(expression, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await client.evaluate(expression)) return;
    const error = await client.evaluate(
      "document.querySelector('.error-banner')?.innerText || ''",
    );
    if (error) throw new Error(error);
    await delay(100);
  }
  throw new Error(
    "Production UI timeout: " +
      expression +
      "\n" +
      (await client.evaluate("document.body.innerText")),
  );
}
async function command(action, value) {
  const result = await client.evaluate(
    `window.studyflow.command(${JSON.stringify(action)},${JSON.stringify(value)})`,
  );
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
async function click(selector, index = 0) {
  const target = `document.querySelectorAll(${JSON.stringify(selector)})[${index}]`;
  await waitFor(`!!(${target}) && !(${target}).disabled`);
  await client.evaluate(`(${target}).click()`);
}
async function textButton(label) {
  const target = `[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(label)}&&!button.disabled)`;
  await waitFor(`!!(${target})`);
  await client.evaluate(`(${target}).click()`);
}
async function fill(selector, value) {
  await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
  await client.evaluate(
    `(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
  );
}
async function pick(file) {
  await new Promise((resolve, reject) => {
    const picker = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(root, "scripts", "select-file.ps1"),
        "-FilePath",
        file,
        "-ApplicationId",
        String(child.pid),
      ],
      { windowsHide: true },
    );
    let output = "";
    picker.stderr.on("data", (part) => (output += part));
    picker.on("error", reject);
    picker.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Native file picker: " + output)),
    );
  });
}
async function start() {
  const number = await port();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  child = spawn(
    executable,
    [
      "--user-data-dir=" + profile,
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=" + number,
    ],
    { env, cwd: temp, stdio: "ignore", windowsHide: false },
  );
  child.on("error", (error) => console.error(error.message));
  let target;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error("Packaged app exited with " + child.exitCode);
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${number}/json/list`)
      ).json();
      target = targets.find(
        (target) => target.type === "page" && target.url.startsWith("file:"),
      );
      if (target) break;
    } catch {}
    await delay(100);
  }
  if (!target) throw new Error("Production renderer did not start");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  client = new CDP(socket);
  await waitFor(
    "!!window.studyflow && !!document.querySelector('.mode-switch')",
  );
  return command("status");
}
async function close() {
  if (!child || child.exitCode !== null) return;
  await client.evaluate("window.close()").catch(() => {});
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && child.exitCode === null) await delay(100);
  if (child.exitCode === null)
    throw new Error("Production application did not close gracefully");
  client = null;
}
async function screenshot(name) {
  const shot = await client.request("Page.captureScreenshot", {
    format: "png",
  });
  await fs.writeFile(path.join(output, name), Buffer.from(shot.data, "base64"));
}
async function createPdf(file) {
  const content =
    "BT /F1 16 Tf 60 740 Td (Classes and objects are foundations of object-oriented programming.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let data = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(data));
    data += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const offset = Buffer.byteLength(data);
  data +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  await fs.writeFile(file, data);
}
async function main() {
  await fs.mkdir(output, { recursive: true });
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-release-"));
  profile = path.join(temp, "profile");
  await fs.mkdir(profile);
  if (process.argv.includes("--local-update")) {
    // Real installed binary and IPC, isolated local fixture, no credentials or AI.
    const { pathToFileURL } = require("node:url");
    const { randomUUID } = require("node:crypto");
    const { Store } = await import(
      pathToFileURL(path.join(root, "dist", "database.js")).href
    );
    const store = new Store(path.join(profile, "studyflow.sqlite"));
    const normal = store.createNormalConversation("sk");
    store.addNormalMessage(
      normal.conversation.id,
      "user",
      "Preserve my question",
    );
    store.addNormalMessage(normal.conversation.id, "assistant", "Saved answer");
    const study = store.create(
      {
        id: randomUUID(),
        name: "Saved notes",
        kind: "txt",
        text: "Classes, properties and inheritance.",
        images: [],
        warning: "",
      },
      {
        title: "Installed release verification",
        lessons: ["Classes", "Properties", "Inheritance"].map((title) => ({
          title,
          objective: title,
          references: ["Slide 1"],
        })),
      },
    );
    store.activate(study.lessons[0].id);
    store.addMessage(
      study.lessons[0].id,
      "assistant",
      "# Saved explanation\n\nA class describes objects.\n\n```csharp\nclass Student { }\n```\n\n$x^2+1$",
    );
    store.mark(study.lessons[2].id, "completed");
    store.setting("activeMode", "study");
    store.close();
    await start();
    await waitFor("!!document.querySelector('.lesson-heading')");
    pass(
      "Installed production EXE starts with no development servers and restores SQLite lessons/history",
    );
    assert.equal(
      await client.evaluate(
        "document.querySelector('.lesson-language').getBoundingClientRect().height < 50",
      ),
      true,
    );
    assert.equal(
      await client.evaluate(
        "document.querySelector('.lesson-heading').getBoundingClientRect().y === document.querySelector('.topbar').getBoundingClientRect().bottom",
      ),
      true,
    );
    await click(".lesson-status-action", 1);
    await waitFor(
      "document.querySelector('.path-progress strong').textContent==='67%'",
    );
    assert.equal(
      (await command("snapshot")).course.activeLessonId,
      study.lessons[0].id,
    );
    await click(".lesson-status-action", 1);
    await waitFor(
      "document.querySelector('.path-progress strong').textContent==='33%'",
    );
    pass(
      "New manual lesson completion and reversal run through the packaged main-process IPC",
    );
    await click(".path-menu summary");
    await textButton("Mark Learning Path as Completed");
    await textButton("Cancel");
    assert.equal((await command("snapshot")).course.completed, 1);
    await click(".path-menu summary");
    await textButton("Mark Learning Path as Completed");
    await textButton("Complete entire path");
    await waitFor(
      "document.querySelector('.path-progress strong').textContent==='100%'",
    );
    await screenshot("installed-path-complete.png");
    await command("zoom", "in");
    await command("zoom", "in");
    await close();
    await start();
    await waitFor(
      "document.querySelector('.zoom-reset')?.textContent==='120%'",
    );
    await command("zoom", "reset");
    pass("Zoom preference survives full installed application restart");
    await waitFor(
      "document.querySelector('.path-progress strong')?.textContent==='100%'",
    );
    await click(".path-menu summary");
    await textButton("Reopen Learning Path");
    await waitFor(
      "document.querySelector('.path-progress strong').textContent==='33%'",
    );
    const restored = await command("snapshot");
    assert.equal(
      restored.messages[0].content.includes("Saved explanation"),
      true,
    );
    assert.deepEqual(
      restored.lessons.map((l) => l.status),
      ["in_progress", "not_started", "completed"],
    );
    pass(
      "Whole-path confirmation/cancel/completion, full process restart, 100% persistence and reopening work in installed EXE",
    );
    await screenshot("installed-study-layout.png");
    await textButton("Overview");
    await waitFor("document.querySelectorAll('.course-card').length===1");
    assert.equal((await command("snapshot")).courses[0].completed, 1);
    await textButton("Normal chat");
    await waitFor(
      "document.querySelectorAll('.normal-messages .message').length===2",
    );
    assert.equal(
      (await command("normalSnapshot")).conversation.aiLanguage,
      "sk",
    );
    pass(
      "Dashboard progress, normal-chat history and response-language preference remain intact",
    );
    await close();
    await fs.writeFile(
      path.join(output, "local-update-result.json"),
      JSON.stringify(
        {
          completedAt: new Date().toISOString(),
          executable,
          liveAI: false,
          steps,
        },
        null,
        2,
      ),
    );
    return;
  }
  before = await fs.readFile(originalCredentials);
  // Windows safeStorage also relies on Chromium's DPAPI-protected profile key.
  await fs.copyFile(
    path.join(path.dirname(originalCredentials), "Local State"),
    path.join(profile, "Local State"),
  );
  await fs.writeFile(path.join(profile, "account.credentials"), before, {
    mode: 0o600,
  });
  const pdf = path.join(temp, "lesson.pdf");
  await createPdf(pdf);
  const invalidPdf = path.join(temp, "invalid.pdf");
  await fs.writeFile(invalidPdf, "This is not a PDF.");
  const status = await start();
  assert.equal(
    status.connected,
    true,
    "Saved ChatGPT session must restore: " +
      (status.error || "no saved registration"),
  );
  pass(
    "Installed EXE starts from an unrelated working directory without npm, a development server or external backend; saved ChatGPT session restores",
  );
  if (process.argv.includes("--picker-only")) {
    await textButton("Normal chat");
    await textButton("Attach");
    await pick(pdf);
    await waitFor("!!document.querySelector('.attachment-list')");
    pass("Native picker and packaged PDF import");
    await close();
    return;
  }
  await textButton("Normal chat");
  await fill(
    ".normal-composer textarea",
    "Explain a class and an object in two short sentences.",
  );
  await click(".normal-composer button[type=submit]");
  await waitFor(
    "document.querySelectorAll('.normal-messages .message').length===2&&!document.querySelector('.normal-messages .spin')",
  );
  let normal = await command("normalSnapshot");
  const normalId = normal.conversation.id;
  assert.equal(normal.messages[1].status, "complete");
  assert.equal((await command("snapshot")).courses.length, 0);
  const responses = [normal.messages[1].content];
  pass("Normal Chat returns a real streamed response without a file or course");
  await fill(".language-inline select", "en");
  await fill(
    ".normal-composer textarea",
    "Give one very short concrete example.",
  );
  await click(".normal-composer button[type=submit]");
  await waitFor(
    "document.querySelectorAll('.normal-messages .message').length===4&&!document.querySelector('.normal-messages .spin')",
  );
  normal = await command("normalSnapshot");
  assert.equal(normal.conversation.aiLanguage, "en");
  responses.push(normal.messages[3].content);
  pass(
    "Response language switches to English and a real follow-up succeeds with saved history",
  );
  await textButton("Attach");
  await pick(invalidPdf);
  await waitFor(
    "document.querySelector('.error-banner')?.textContent.includes('valid PDF')",
  );
  await click(".error-banner button");
  pass(
    "Invalid file import reports an error and the application remains usable",
  );
  await textButton("Attach");
  await pick(pdf);
  await waitFor("!!document.querySelector('.attachment-list')");
  await click('[aria-label="Remove attachment"]');
  pass(
    "Packaged PDF importer reads a valid PDF selected through the native Windows file picker",
  );
  await textButton("Study mode");
  await click(".new-button");
  await click(".upload-zone");
  await pick(path.join(root, "fixtures", "oop-acceptance.pptx"));
  await waitFor(
    "document.querySelectorAll('.plan-editor li').length>=2",
    420000,
  );
  let study = await command("snapshot");
  const courseId = study.course.id;
  const first = study.lessons[0].id;
  assert.ok(study.sources.length);
  pass(
    `Native PowerPoint import generates a real structured path with ${study.lessons.length} lessons`,
  );
  await fill(".lesson-language select", "sk");
  await textButton("Start learning");
  await waitFor(
    "document.querySelectorAll('.messages .message').length===1&&!document.querySelector('.messages .spin')",
  );
  study = await command("snapshot");
  assert.equal(study.course.activeLessonId, first);
  responses.push(study.messages[0].content);
  pass(
    "Start learning opens the first lesson with its own real tutor explanation",
  );
  await fill(
    ".composer textarea",
    "Give a small practical example of this lesson only.",
  );
  await click(".composer button[type=submit]");
  await waitFor(
    "document.querySelectorAll('.messages .message').length===3&&!document.querySelector('.messages .spin')",
  );
  assert.equal((await command("snapshot")).course.activeLessonId, first);
  pass("Follow-up example stays within the current lesson");
  await textButton("Try an exercise");
  await waitFor(
    "document.querySelectorAll('.quiz-option').length===4&&!document.querySelector('.quiz-loading')",
    240000,
  );
  assert.equal(
    await client.evaluate("document.querySelector('.quiz-submit').disabled"),
    true,
  );
  await click(".quiz-option", 0);
  await click(".quiz-submit");
  await waitFor(
    "!!document.querySelector('.quiz-feedback')&&!document.querySelector('.quiz-loading')",
  );
  assert.equal((await command("snapshot")).course.completed, 0);
  await screenshot("live-interactive-quiz.png");
  await click('[aria-label="Close quiz"]');
  pass(
    "Optional interactive A-D exercise is independently checked, submitted and explained without completing the lesson",
  );
  await click(".next-button");
  await waitFor(
    `document.querySelector('.path-progress strong')?.textContent===${JSON.stringify(Math.round(100 / study.course.total) + "%")}`,
  );
  pass("Progress bar updates immediately after completion");
  await waitFor(
    "document.querySelectorAll('.messages .message').length===1&&!document.querySelector('.messages .spin')",
  );
  study = await command("snapshot");
  assert.equal(study.course.completed, 1);
  assert.notEqual(study.course.activeLessonId, first);
  const second = study.course.activeLessonId;
  assert.equal(study.messages[0].role, "assistant");
  assert.equal(study.lessons[0].status, "completed");
  await screenshot("study-mode.png");
  pass(
    "One-click completion saves progress and opens a fresh next-lesson conversation with a real explanation",
  );
  await click(".lesson-open", 0);
  await waitFor(
    "document.querySelectorAll('.messages .message').length===3&&!document.querySelector('.messages .spin')",
  );
  assert.equal((await command("snapshot")).lessons[0].status, "completed");
  await click(".lesson-open", 1);
  await waitFor(
    "document.querySelectorAll('.messages .message').length===1&&!document.querySelector('.messages .spin')",
  );
  pass("Previous lesson conversation and completion remain accessible");
  await textButton("Normal chat");
  await waitFor(
    "document.querySelectorAll('.normal-messages .message').length===4",
  );
  assert.equal((await command("normalSnapshot")).conversation.id, normalId);
  await textButton("Study mode");
  await waitFor("!!document.querySelector('.lesson-heading')");
  await close();
  const reopened = await start();
  assert.equal(reopened.connected, true);
  await waitFor("!!document.querySelector('.lesson-heading')");
  study = await command("snapshot");
  assert.equal(study.course.id, courseId);
  assert.equal(study.course.activeLessonId, second);
  assert.equal(study.course.completed, 1);
  assert.equal(study.messages.length, 1);
  assert.ok(
    (await fs.readdir(path.join(profile, "materials"))).some((file) =>
      file.endsWith(".pptx"),
    ),
  );
  pass(
    "Full application close/relaunch restores the active lesson, progress, source document and ChatGPT session",
  );
  await textButton("Normal chat");
  await waitFor(
    "document.querySelectorAll('.normal-messages .message').length===4",
  );
  normal = await command("normalSnapshot");
  assert.equal(normal.conversation.id, normalId);
  assert.equal(normal.conversation.aiLanguage, "en");
  pass(
    "Previous normal conversation and its language preference survive relaunch",
  );
  await click(".sidebar-bottom .nav");
  await fill(
    ".settings-section:nth-of-type(2) label:nth-of-type(1) select",
    "sk",
  );
  await waitFor("document.documentElement.lang==='sk'");
  await textButton("Bežný chat");
  await waitFor("!!document.querySelector('.normal-chat-page')");
  await screenshot("normal-chat.png");
  await textButton("Prehľad");
  await waitFor("document.querySelectorAll('.course-card').length===1");
  pass(
    "Slovak interface switching, dashboard and navigation work in the installed production app",
  );
  await textButton("Bežný chat");
  await click(".new-button");
  await textButton("Priložiť");
  await pick(pdf);
  await fill(
    ".normal-composer textarea",
    "Summarize page 1 of the attached PDF in two short sentences.",
  );
  await click(".normal-composer button[type=submit]");
  await waitFor(
    "document.querySelectorAll('.normal-messages .message').length===2&&!document.querySelector('.normal-messages .spin')",
  );
  const documentChat = (await command("normalSnapshot")).conversation.id;
  await fill(
    ".normal-composer textarea",
    "Explain that document more simply. Do not create a course.",
  );
  await click(".normal-composer button[type=submit]");
  await waitFor(
    "document.querySelectorAll('.normal-messages .message').length===4&&!document.querySelector('.normal-messages .spin')",
  );
  assert.equal((await command("snapshot")).courses.length, 1);
  await fill(
    ".normal-composer textarea",
    "Search the web for the current stable Python version at python.org/downloads and cite the official source.",
  );
  await click(".normal-composer button[type=submit]");
  await waitFor(
    "document.querySelectorAll('.normal-messages .message').length===6&&!document.querySelector('.normal-messages .spin')",
  );
  assert.match(
    (await command("normalSnapshot")).messages.at(-1).content,
    /\*\*Web\*\*/,
  );
  await waitFor(
    "!!document.querySelector('.normal-messages a.source-link[href^=\"https://\"]')",
  );
  await screenshot("live-document-web-chat.png");
  pass(
    "Packaged PDF chat, saved-document follow-up and actual web_search with clickable official citations",
  );
  await textButton("Študijný režim");
  await click(".new-button");
  await fill("#study-focus", "Teach only method overriding and polymorphism");
  await click(".study-scope summary");
  await fill(".scope-range label:nth-of-type(1) input", "5");
  await fill(".scope-range label:nth-of-type(2) input", "5");
  await click(".upload-zone");
  await pick(path.join(root, "fixtures", "oop-acceptance.pptx"));
  await waitFor(
    "document.querySelectorAll('.plan-editor li').length>=1",
    420000,
  );
  const focused = await command("snapshot");
  assert.ok(
    focused.lessons.every((lesson) =>
      lesson.references.every((ref) => ref === "Slide 5"),
    ),
  );
  await textButton("Začať štúdium");
  await waitFor(
    "document.querySelectorAll('.messages .message').length===1&&!document.querySelector('.messages .spin')",
  );
  await fill(
    ".composer textarea",
    "Give one small example of this lesson only.",
  );
  await click(".composer button[type=submit]");
  await waitFor(
    "document.querySelectorAll('.messages .message').length===3&&!document.querySelector('.messages .spin')",
  );
  assert.equal(
    (await command("snapshot")).course.activeLessonId,
    focused.lessons[0].id,
  );
  await screenshot("live-focused-learning.png");
  await close();
  await start();
  await waitFor("document.querySelectorAll('.messages .message').length===3");
  assert.equal((await command("snapshot")).course.id, focused.course.id);
  assert.ok((await command("snapshot")).settings[`scope:${focused.course.id}`]);
  await command("normalSelect", documentChat);
  // Exercise UI mode switching. Renderer navigation/reload is deliberately blocked.
  await textButton("Bežný chat");
  await waitFor(
    "document.querySelectorAll('.normal-messages .message').length===6",
  );
  assert.equal(
    (await command("normalSnapshot")).messages[0].attachments.length,
    1,
  );
  pass(
    "Packaged focused slide range, lesson follow-up, full-process restart and retained document/citation history",
  );
  await close();
  await fs.writeFile(
    path.join(output, "result.json"),
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        executable,
        liveAI: true,
        steps,
        responses,
      },
      null,
      2,
    ),
  );
  console.log("Release verification evidence: " + output);
}
main()
  .catch(async (error) => {
    console.error(error.stack || error);
    if (client) await screenshot("failure.png").catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    if (child && child.exitCode === null && client)
      await close().catch(() => {});
    if (child && child.exitCode === null) {
      child.kill();
      await delay(500);
    }
    if (before && profile) {
      try {
        const updated = await fs.readFile(
          path.join(profile, "account.credentials"),
        );
        const current = await fs.readFile(originalCredentials);
        if (!updated.equals(before) && current.equals(before)) {
          await fs.writeFile(
            originalCredentials + ".release-check.tmp",
            updated,
            { mode: 0o600 },
          );
          await fs.rename(
            originalCredentials + ".release-check.tmp",
            originalCredentials,
          );
        }
      } catch (error) {
        console.error("Credential refresh synchronization: " + error.message);
        process.exitCode = 1;
      }
    }
    if (temp)
      await fs.rm(temp, { recursive: true, force: true }).catch(() => {});
  });
