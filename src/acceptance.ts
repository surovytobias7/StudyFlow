import { app } from "electron";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { Store } from "./database.js";
import { Learning } from "./learning.js";
import { importMaterial } from "./materials.js";
import { Connection } from "./connection.js";

export async function acceptance(connection: Connection) {
  const directory = join(
    app.getPath("userData"),
    "acceptance",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  await mkdir(directory, { recursive: true });
  const file = join(directory, "acceptance.sqlite");
  let store = new Store(file);
  const steps: string[] = [];
  const pass = (text: string) => {
    steps.push(text);
    console.info(`PASS: ${text}`);
  };
  try {
    const status = await connection.refreshModels();
    assert.ok(status.models[0]);
    store.setting("model", status.models[0].slug);
    store.setting("tutorLanguage", "en");
    pass("Saved authenticated account and dynamic model discovery");
    const material = await importMaterial(
      join(process.cwd(), "fixtures/oop-acceptance.pptx"),
      join(directory, "materials"),
    );
    assert.match(material.text, /Classes and objects/);
    const learning = new Learning(store, connection, () => {});
    let snapshot = await learning.plan(material);
    assert.ok(snapshot.lessons.length >= 2);
    pass(
      `PPTX import and real AI learning path (${snapshot.lessons.length} lessons)`,
    );
    const courseId = snapshot.course!.id;
    const first = snapshot.lessons[0]!.id;
    store.activate(first);
    snapshot = await learning.chat(first, "");
    assert.ok(
      snapshot.messages.some(
        (m) => m.role === "assistant" && m.status === "complete",
      ),
    );
    pass("Lesson 1 explanation completed");
    snapshot = await learning.chat(
      first,
      "What is the difference between a class and an object?",
    );
    assert.equal(snapshot.course?.activeLessonId, first);
    snapshot = await learning.chat(
      first,
      "Give me a practical C# example for this concept.",
    );
    assert.equal(snapshot.course?.activeLessonId, first);
    const history = store.messages(first);
    assert.equal(history.length, 5);
    pass("Follow-up and example stay in Lesson 1 with persistent history");
    const operationId = randomUUID();
    snapshot = store.complete(first, operationId);
    assert.equal(snapshot.course?.completed, 1);
    const second = snapshot.course!.activeLessonId!;
    assert.notEqual(second, first);
    assert.equal(snapshot.messages.length, 0);
    store.complete(first, operationId);
    snapshot = await learning.chat(second, "");
    assert.equal(snapshot.messages.length, 1);
    pass(
      "Idempotent completion updates progress and opens a fresh Lesson 2 explanation",
    );
    snapshot = store.activate(first);
    assert.equal(snapshot.messages.length, 5);
    assert.equal(
      snapshot.lessons.find((l) => l.id === first)?.status,
      "completed",
    );
    store.activate(second);
    store.close();
    store = new Store(file);
    snapshot = store.snapshot();
    assert.equal(snapshot.course?.id, courseId);
    assert.equal(snapshot.course?.activeLessonId, second);
    assert.equal(snapshot.course?.completed, 1);
    assert.equal(store.messages(first).length, 5);
    assert.equal(snapshot.messages.length, 1);
    pass(
      "Revisit preserves history and completion; database reopen restores active Lesson 2",
    );
    await writeFile(
      join(directory, "result.json"),
      JSON.stringify(
        {
          completedAt: new Date().toISOString(),
          steps,
          model: status.models[0].slug,
          courseId,
        },
        null,
        2,
      ),
    );
    console.info(`Acceptance evidence: ${directory}`);
  } finally {
    store.close();
  }
}
