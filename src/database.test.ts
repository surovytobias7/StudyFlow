import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
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
test("manual completion and reversal work out of order without opening lessons and survive restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "studyflow-manual-"));
  const file = join(directory, "manual.sqlite");
  let store = new Store(file);
  try {
    const created = store.create(material, plan);
    const courseId = created.course!.id;
    const [one, two, three] = created.lessons;
    store.activate(one!.id);
    store.addMessage(one!.id, "assistant", "Keep this conversation");
    let snapshot = store.mark(three!.id, "completed");
    assert.equal(snapshot.course?.completed, 1);
    assert.equal(
      snapshot.courses.find((course) => course.id === courseId)?.completed,
      1,
    );
    assert.equal(snapshot.lessons[2]?.status, "completed");
    assert.equal(snapshot.course?.activeLessonId, one!.id);
    assert.equal(store.messages(three!.id).length, 0);
    assert.equal(store.mark(three!.id, "completed").course?.completed, 1);
    assert.equal(store.mark(two!.id, "completed").course?.completed, 2);
    assert.equal(store.mark(three!.id, "not_started").course?.completed, 1);
    store.close();
    store = new Store(file);
    snapshot = store.snapshot();
    assert.equal(snapshot.course?.completed, 1);
    assert.equal(snapshot.lessons[1]?.status, "completed");
    assert.equal(snapshot.lessons[2]?.status, "not_started");
    assert.equal(snapshot.course?.activeLessonId, one!.id);
    assert.equal(snapshot.messages[0]?.content, "Keep this conversation");
    assert.equal(snapshot.sources[0]?.id, material.id);
    assert.equal(store.materials(courseId)[0]?.text, material.text);
    assert.equal(snapshot.lessons.length, 3);
    assert.equal(
      (
        store.db.prepare("SELECT count(*) AS n FROM LessonProgress").get() as {
          n: number;
        }
      ).n,
      3,
    );
    assert.equal(
      (
        store.db
          .prepare("SELECT count(*) AS n FROM CompletionEvents")
          .get() as { n: number }
      ).n,
      0,
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true });
  }
});
test("manual draft completion is retained when starting, renaming or reordering the learning path", () => {
  const store = new Store(":memory:");
  try {
    const created = store.create(material, plan);
    const courseId = created.course!.id;
    store.mark(created.lessons[2]!.id, "completed");
    const unchanged = store.editPlan(courseId, plan);
    assert.equal(unchanged.lessons[2]?.id, created.lessons[2]?.id);
    assert.equal(unchanged.course?.completed, 1);
    const edited = store.editPlan(courseId, {
      ...plan,
      lessons: [
        { ...plan.lessons[2]!, title: "Renamed inheritance" },
        plan.lessons[0]!,
        plan.lessons[1]!,
      ],
    });
    assert.equal(edited.lessons[0]?.status, "completed");
    assert.equal(edited.course?.completed, 1);
    assert.equal(store.messages(edited.lessons[0]!.id).length, 0);
    assert.equal(edited.course?.activeLessonId, null);
    store.activate(edited.lessons[1]!.id);
    assert.equal(store.snapshot().course?.completed, 1);
  } finally {
    store.close();
  }
});
test("whole-path completion is atomic, idempotent, reversible and persisted without losing history", () => {
  const directory = mkdtempSync(join(tmpdir(), "studyflow-path-"));
  const file = join(directory, "path.sqlite");
  let store = new Store(file);
  try {
    const initial = store.create(material, plan);
    const courseId = initial.course!.id;
    const [one, two, three] = initial.lessons;
    store.activate(one!.id);
    store.addMessage(one!.id, "assistant", "Existing explanation");
    store.mark(two!.id, "completed");
    store.mark(three!.id, "needs_review");
    const before = store.snapshot(courseId);
    const other = store.create({ ...material, id: randomUUID() }, plan);
    const operationId = randomUUID();
    let snapshot = store.completePath(courseId, operationId);
    assert.equal(snapshot.course?.completed, 3);
    assert.equal(snapshot.course?.activeLessonId, null);
    assert.ok(snapshot.lessons.every((l) => l.status === "completed"));
    assert.equal(snapshot.courses.find((c) => c.id === courseId)?.completed, 3);
    assert.equal(store.snapshot(other.course!.id).course?.completed, 0);
    assert.equal(store.messages(three!.id).length, 0);
    assert.equal(store.messages(one!.id)[0]?.content, "Existing explanation");
    assert.deepEqual(
      store.completePath(courseId, operationId).lessons,
      snapshot.lessons,
    );
    store.completePath(courseId, randomUUID()); // already complete: retain original undo
    store.close();
    store = new Store(file);
    assert.equal(store.snapshot(courseId).course?.completed, 3);
    snapshot = store.reopenPath(courseId, operationId);
    assert.deepEqual(snapshot.lessons, before.lessons);
    assert.equal(
      snapshot.course?.activeLessonId,
      before.course?.activeLessonId,
    );
    assert.equal(snapshot.course?.started, before.course?.started);
    assert.deepEqual(snapshot.sources, before.sources);
    assert.deepEqual(snapshot.messages, before.messages);
    assert.deepEqual(
      store.reopenPath(courseId, operationId).lessons,
      before.lessons,
    );
    assert.deepEqual(
      store.completePath(courseId, operationId).lessons,
      before.lessons,
    );
    store.completePath(courseId, randomUUID());
    snapshot = store.reopenPath(courseId);
    assert.deepEqual(snapshot.lessons, before.lessons);
    assert.equal(snapshot.course?.activeLessonId, one!.id);
    assert.equal(
      store.db.prepare("SELECT count(*) AS n FROM LessonProgress").get()!.n,
      6,
    );
    store.close();
    store = new Store(file);
    assert.deepEqual(store.snapshot(courseId).lessons, before.lessons);
  } finally {
    store.close();
    rmSync(directory, { recursive: true });
  }
});

test("path undo restores drafts, reopening naturally completed paths preserves other completed lessons", () => {
  const store = new Store(":memory:");
  try {
    const initial = store.create(material, plan);
    const courseId = initial.course!.id;
    const operationId = randomUUID();
    store.completePath(courseId, operationId);
    let snapshot = store.reopenPath(courseId, operationId);
    assert.equal(snapshot.course?.started, 0);
    assert.equal(snapshot.course?.activeLessonId, null);
    assert.deepEqual(snapshot.lessons, initial.lessons);
    for (const lesson of initial.lessons) store.mark(lesson.id, "completed");
    snapshot = store.reopenPath(courseId);
    assert.equal(snapshot.course?.completed, 2);
    assert.equal(snapshot.course?.activeLessonId, initial.lessons[0]!.id);
    assert.equal(snapshot.course?.started, 1);
    assert.equal(snapshot.lessons[1]!.status, "completed");
    assert.throws(
      () => store.completePath(randomUUID(), randomUUID()),
      /Course not found/,
    );
    assert.equal(store.snapshot(courseId).course?.completed, 2);
    store.completePath(courseId, randomUUID());
    store.mark(initial.lessons[1]!.id, "needs_review");
    assert.equal(store.reopenPath(courseId).lessons[1]!.status, "needs_review");
  } finally {
    store.close();
  }
});

test("failed whole-path updates roll back all statuses and undo metadata", () => {
  const store = new Store(":memory:");
  try {
    const before = store.create(material, plan);
    store.db
      .exec(`CREATE TRIGGER reject_completion BEFORE UPDATE ON LessonProgress
      WHEN old.lessonId='${before.lessons[1]!.id}' BEGIN SELECT RAISE(ABORT,'test failure'); END;`);
    assert.throws(
      () => store.completePath(before.course!.id, randomUUID()),
      /test failure/,
    );
    assert.deepEqual(store.snapshot().lessons, before.lessons);
    assert.equal(
      store.settings()[`pathCompletion:${before.course!.id}`],
      undefined,
    );
  } finally {
    store.close();
  }
});

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

test("independent normal conversations persist, rename, delete, attach, and override response language", () => {
  const directory = mkdtempSync(join(tmpdir(), "studyflow-chat-"));
  const file = join(directory, "study.sqlite");
  let store = new Store(file);
  try {
    store.setting("tutorLanguage", "sk");
    const first = store.createNormalConversation(null).conversation!;
    const second = store.createNormalConversation("en").conversation!;
    const attachment = {
      name: "lecture.pdf",
      kind: "pdf",
      text: "[Page 1] Vectors and matrices",
      images: [],
    };
    store.addNormalMessage(first.id, "user", "Explain vectors", [attachment]);
    store.addNormalMessage(
      first.id,
      "assistant",
      "A vector has magnitude and direction.",
    );
    let snapshot = store.normalSnapshot(first.id);
    assert.equal(snapshot.conversation?.aiLanguage, null);
    assert.equal(snapshot.settings.tutorLanguage, "sk");
    assert.deepEqual(snapshot.messages[0]?.attachments, [attachment]);
    snapshot = store.normalSnapshot(second.id);
    assert.equal(snapshot.conversation?.aiLanguage, "en");
    assert.equal(snapshot.messages.length, 0);
    store.renameNormalConversation(first.id, "Vectors for calculus");
    store.setNormalLanguage(first.id, "en");
    store.setting("activeMode", "normal");
    store.close();
    store = new Store(file);
    snapshot = store.normalSnapshot();
    assert.equal(snapshot.settings.activeMode, "normal");
    assert.equal(snapshot.conversation?.id, second.id);
    snapshot = store.selectNormalConversation(first.id);
    assert.equal(snapshot.conversation?.title, "Vectors for calculus");
    assert.equal(snapshot.conversation?.aiLanguage, "en");
    assert.equal(snapshot.messages.length, 2);
    snapshot = store.deleteNormalConversation(first.id);
    assert.equal(snapshot.conversation?.id, second.id);
    assert.equal(snapshot.messages.length, 0);
    const course = store.create(material, plan);
    assert.equal(course.course?.aiLanguage, null);
    assert.equal(store.courseLanguage(course.course!.id), null);
    assert.equal(
      store.setCourseLanguage(course.course!.id, "en").course?.aiLanguage,
      "en",
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true });
  }
});

test("version-one databases migrate without losing lessons or messages", () => {
  const directory = mkdtempSync(join(tmpdir(), "studyflow-v1-"));
  const file = join(directory, "legacy.sqlite");
  const legacy = new DatabaseSync(file);
  const courseId = randomUUID(),
    pathId = randomUUID(),
    lessonId = randomUUID(),
    conversationId = randomUUID();
  legacy.exec(`CREATE TABLE Courses(id TEXT PRIMARY KEY,title TEXT NOT NULL,activeLessonId TEXT,createdAt TEXT NOT NULL,started INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE SourceMaterials(id TEXT PRIMARY KEY,courseId TEXT NOT NULL REFERENCES Courses(id) ON DELETE CASCADE,name TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,images TEXT NOT NULL,warning TEXT NOT NULL);
    CREATE TABLE LearningPaths(id TEXT PRIMARY KEY,courseId TEXT UNIQUE NOT NULL REFERENCES Courses(id) ON DELETE CASCADE);
    CREATE TABLE Lessons(id TEXT PRIMARY KEY,courseId TEXT NOT NULL REFERENCES Courses(id) ON DELETE CASCADE,pathId TEXT NOT NULL REFERENCES LearningPaths(id),position INTEGER NOT NULL,title TEXT NOT NULL,objective TEXT NOT NULL,refs TEXT NOT NULL,UNIQUE(courseId,position));
    CREATE TABLE LessonProgress(lessonId TEXT PRIMARY KEY REFERENCES Lessons(id) ON DELETE CASCADE,status TEXT NOT NULL CHECK(status IN ('not_started','in_progress','completed','needs_review')));
    CREATE TABLE Conversations(id TEXT PRIMARY KEY,lessonId TEXT UNIQUE NOT NULL REFERENCES Lessons(id) ON DELETE CASCADE);
    CREATE TABLE Messages(id TEXT PRIMARY KEY,conversationId TEXT NOT NULL REFERENCES Conversations(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('user','assistant')),content TEXT NOT NULL,status TEXT NOT NULL,createdAt TEXT NOT NULL);
    CREATE TABLE Exercises(id TEXT PRIMARY KEY,lessonId TEXT NOT NULL REFERENCES Lessons(id),prompt TEXT NOT NULL,createdAt TEXT NOT NULL);
    CREATE TABLE ExerciseAttempts(id TEXT PRIMARY KEY,exerciseId TEXT NOT NULL REFERENCES Exercises(id),answer TEXT NOT NULL,feedback TEXT NOT NULL,createdAt TEXT NOT NULL);
    CREATE TABLE Settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE CompletionEvents(id TEXT PRIMARY KEY,lessonId TEXT NOT NULL,previousStatus TEXT NOT NULL,previousActive TEXT,nextActive TEXT,undone INTEGER NOT NULL DEFAULT 0);
    INSERT INTO Settings VALUES('language','en'),('tutorLanguage','sk'),('theme','dark'),('model','');
    PRAGMA user_version=1;`);
  legacy
    .prepare("INSERT INTO Courses VALUES(?,?,?,?,?)")
    .run(courseId, "Legacy OOP", lessonId, "2026-01-01", 1);
  legacy.prepare("INSERT INTO LearningPaths VALUES(?,?)").run(pathId, courseId);
  legacy
    .prepare("INSERT INTO Lessons VALUES(?,?,?,?,?,?,?)")
    .run(
      lessonId,
      courseId,
      pathId,
      0,
      "Classes",
      "Learn classes",
      '["Slide 1"]',
    );
  legacy
    .prepare("INSERT INTO LessonProgress VALUES(?,?)")
    .run(lessonId, "in_progress");
  legacy
    .prepare("INSERT INTO Conversations VALUES(?,?)")
    .run(conversationId, lessonId);
  legacy
    .prepare("INSERT INTO Messages VALUES(?,?,?,?,?,?)")
    .run(
      randomUUID(),
      conversationId,
      "assistant",
      "Existing study history",
      "complete",
      "2026-01-02",
    );
  legacy
    .prepare("INSERT INTO Settings VALUES(?,?)")
    .run("activeCourse", courseId);
  legacy.close();
  const store = new Store(file);
  try {
    assert.equal(
      (
        store.db.prepare("PRAGMA user_version").get() as {
          user_version: number;
        }
      ).user_version,
      2,
    );
    const snapshot = store.snapshot();
    assert.equal(snapshot.course?.title, "Legacy OOP");
    assert.equal(snapshot.lessons[0]?.title, "Classes");
    assert.equal(snapshot.messages[0]?.content, "Existing study history");
    assert.equal(store.courseLanguage(courseId), null);
    assert.equal(store.settings().activeMode, "study");
  } finally {
    store.close();
    rmSync(directory, { recursive: true });
  }
});
