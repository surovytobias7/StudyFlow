import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "./database.js";
import { parsePlan, type Material, type Plan } from "./domain.js";

const material: Material = {
  id: randomUUID(),
  name: "OOP.pptx",
  kind: "pptx",
  text: "Classes, objects, properties and inheritance.",
  images: [],
  warning: "",
};
const plan: Plan = {
  title: "OOP",
  lessons: ["Classes and objects", "Properties", "Inheritance"].map(
    (title) => ({
      title,
      objective: `Learn ${title}`,
      references: ["Slide 1"],
    }),
  ),
};
test("plans validate lesson boundaries, ordering and reject malformed results", () => {
  assert.equal(parsePlan(JSON.stringify(plan)).lessons[1]?.title, "Properties");
  assert.throws(() => parsePlan('{"title":"Bad","lessons":[]}'), /invalid/);
  assert.throws(() => parsePlan("not JSON"), /invalid/);
});
test("completion, duplicate events, navigation, undo and independent chats survive restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "studyflow-db-"));
  const file = join(directory, "test.sqlite");
  let store = new Store(file);
  try {
    const created = store.create(material, plan);
    const courseId = created.course!.id;
    const [one, two, three] = created.lessons;
    assert.ok(one && two && three);
    store.activate(one.id);
    store.addMessage(one.id, "assistant", "A class is a blueprint.");
    store.addMessage(one.id, "user", "Can you give an example?");
    const operation = randomUUID();
    let snapshot = store.complete(one.id, operation);
    assert.equal(snapshot.course?.completed, 1);
    assert.equal(snapshot.course?.activeLessonId, two.id);
    assert.equal(snapshot.messages.length, 0);
    snapshot = store.complete(one.id, operation);
    assert.equal(snapshot.course?.completed, 1);
    assert.throws(
      () => store.complete(one.id, randomUUID()),
      /active lesson changed/,
    );
    store.addMessage(two.id, "assistant", "Properties expose state.");
    snapshot = store.activate(one.id);
    assert.equal(snapshot.lessons[0]?.status, "completed");
    assert.equal(snapshot.messages.length, 2);
    store.activate(two.id);
    store.close();
    store = new Store(file);
    snapshot = store.snapshot();
    assert.equal(snapshot.course?.activeLessonId, two.id);
    assert.equal(snapshot.messages[0]?.content, "Properties expose state.");
    assert.equal(store.messages(one.id).length, 2);
    snapshot = store.undo(operation);
    assert.equal(snapshot.course?.completed, 0);
    assert.equal(snapshot.course?.activeLessonId, one.id);
    assert.equal(store.undo(operation).course?.completed, 0);
    store.complete(one.id, randomUUID());
    store.complete(two.id, randomUUID());
    snapshot = store.complete(three.id, randomUUID());
    assert.equal(snapshot.course?.completed, 3);
    assert.equal(snapshot.course?.activeLessonId, null);
    store.activate(one.id);
    assert.equal(store.snapshot().course?.completed, 3);
    store.mark(one.id, "in_progress");
    assert.equal(store.snapshot().course?.completed, 2);
    assert.throws(() => store.editPlan(courseId, plan), /unstarted/);
  } finally {
    store.close();
    rmSync(directory, { recursive: true });
  }
});
test("draft edits replace ordering before learning without phantom progress", () => {
  const store = new Store(":memory:");
  try {
    const created = store.create(material, plan);
    const next = store.editPlan(created.course!.id, {
      ...plan,
      lessons: [plan.lessons[2]!, plan.lessons[0]!],
    });
    assert.equal(next.lessons[0]?.title, "Inheritance");
    assert.equal(next.course?.total, 2);
    assert.equal(next.course?.completed, 0);
  } finally {
    store.close();
  }
});
