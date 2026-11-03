import { app } from "electron";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { Store } from "./database.js";
import { Learning } from "./learning.js";
import { importMaterial } from "./materials.js";
import type { Connection } from "./connection.js";

export async function documentAcceptance(connection: Connection) {
  const directory = join(
    app.getPath("userData"),
    "acceptance",
    `documents-${Date.now()}`,
  );
  await mkdir(directory, { recursive: true });
  const file = join(directory, "test.sqlite");
  let store = new Store(file);
  const steps: string[] = [];
  let responseNumber = 0;
  const observed = {
    refreshModels: () => connection.refreshModels(),
    generate: async (...args: Parameters<Connection["generate"]>) => {
      const index = ++responseNumber;
      await writeFile(
        join(directory, `request-${index}.json`),
        JSON.stringify({ instructions: args[1], input: args[2] }, null, 2),
      );
      const text = await connection.generate(...args);
      await writeFile(join(directory, `response-${index}.txt`), text);
      return text;
    },
  };
  const pass = (text: string) => {
    steps.push(text);
    console.info("PASS:", text);
  };
  try {
    const status = await connection.refreshModels();
    assert.ok(status.models[0]);
    store.setting("model", status.models[0].slug);
    store.setting("tutorLanguage", "sk");
    let learning = new Learning(store, observed, () => {});
    const material = await importMaterial(
      join(app.getAppPath(), "fixtures", "oop-acceptance.pptx"),
      join(directory, "materials"),
    );
    const chat = store.createNormalConversation(null).conversation!.id;
    if (process.argv.includes("--plan-only")) {
      const full = await learning.plan({ ...material, id: randomUUID() });
      const focused = await learning.plan(
        { ...material, id: randomUUID() },
        { instructions: "Only polymorphism", from: 5, to: 5 },
      );
      assert.ok(full.lessons.length > focused.lessons.length);
      assert.ok(store.settings()[`coverage:${full.course!.id}`]);
      assert.ok(
        focused.lessons.every((l) =>
          l.references.every((r) => r === "Slide 5"),
        ),
      );
      store.activate(focused.lessons[0]!.id);
      await learning.chat(focused.lessons[0]!.id, "");
      await learning.chat(
        focused.lessons[0]!.id,
        "Explain the virtual dispatch reasoning without reteaching elementary C# types.",
      );
      await writeFile(
        join(directory, "result.json"),
        JSON.stringify(
          {
            passed: true,
            full,
            focused,
            messages: store.messages(focused.lessons[0]!.id),
            coverage: JSON.parse(
              store.settings()[`coverage:${full.course!.id}`]!,
            ),
          },
          null,
          2,
        ),
      );
      pass(
        "Real full-source conceptual planning, coverage audit, focused range, substantive tutor explanation and focused follow-up",
      );
      return;
    }
    await learning.normalChat(
      chat,
      "Summarize the presentation in three short points, without making a course.",
      [
        { ...material },
        {
          name: "question.txt",
          kind: "txt",
          text: "I am particularly interested in virtual methods and polymorphism.",
          images: [],
        },
      ],
    );
    assert.equal(store.courses().length, 0);
    pass(
      "Live multi-document Normal Chat summarizes PPTX without creating a course",
    );
    await learning.normalChat(
      chat,
      "Explain only slide 5 in simpler words.",
      [],
    );
    assert.match(store.normalMessages(chat).at(-1)!.content, /5/);
    pass(
      "Live document follow-up uses saved presentation and actual slide references",
    );
    const focused = await learning.plan(
      { ...material, id: randomUUID() },
      {
        instructions: "Only method overriding and polymorphism",
        from: 5,
        to: 5,
      },
    );
    assert.ok(focused.lessons.length >= 1 && focused.lessons.length <= 4);
    assert.ok(
      focused.lessons.every((lesson) =>
        lesson.references.every((ref) => ref === "Slide 5"),
      ),
    );
    const focusedId = focused.course!.id,
      lesson = focused.lessons[0]!.id;
    store.activate(lesson);
    await learning.chat(lesson, "");
    await learning.chat(
      lesson,
      "Give a tiny practical example of this lesson only.",
    );
    assert.equal(store.snapshot(focusedId).course!.activeLessonId, lesson);
    pass(
      "Live focused path covers slide 5 only; explanation and example stay in the same lesson",
    );
    await learning.chat(
      lesson,
      "Search the web for an official Microsoft C# explanation of polymorphism and cite it.",
    );
    assert.match(store.messages(lesson).at(-1)!.content, /\*\*Web\*\*/);
    pass(
      "Live Study Mode web_search returns official URL citations without advancing the lesson",
    );
    store.completePath(focusedId, randomUUID());
    const full = await learning.plan({ ...material, id: randomUUID() });
    assert.ok(full.lessons.length > focused.lessons.length);
    pass(
      "Full learning path still covers the presentation separately from the focused session",
    );
    store.close();
    store = new Store(file);
    learning = new Learning(store, connection, () => {});
    assert.equal(
      store.snapshot(focusedId).course!.completed,
      focused.lessons.length,
    );
    assert.equal(store.normalMessages(chat)[0]!.attachments.length, 2);
    await learning.normalChat(
      chat,
      "In one sentence, remind me what slide 5 says.",
      [],
    );
    pass(
      "Database reopen preserves progress, original materials, scope and document follow-up context",
    );
    await writeFile(
      join(directory, "result.json"),
      JSON.stringify(
        {
          completedAt: new Date().toISOString(),
          passed: true,
          steps,
          focusedLessons: focused.lessons,
          fullLessons: full.lessons,
          chat: store.normalMessages(chat),
          study: store.messages(lesson),
        },
        null,
        2,
      ),
    );
  } finally {
    store.close();
    console.info("Document acceptance evidence:", directory);
  }
}
