import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "./database.js";
import { Learning } from "./learning.js";

function setup() {
  const store = new Store(":memory:");
  store.setting("model", "test-model");
  const requests: { instructions: string; input: unknown[] }[] = [];
  const events: unknown[] = [];
  const connection = {
    async refreshModels(): Promise<never> {
      throw new Error("Unexpected model discovery");
    },
    async generate(
      _model: string,
      instructions: string,
      input: unknown[],
      delta: (text: string) => void,
    ) {
      requests.push({ instructions, input });
      delta("Test response");
      return "Test response";
    },
  };
  return {
    store,
    requests,
    events,
    connection,
    learning: new Learning(store, connection, (event) => events.push(event)),
  };
}

test("normal chat works without a course, keeps history, and applies default and override languages on each request", async () => {
  const { store, learning, requests, events } = setup();
  try {
    const id = store.createNormalConversation(null).conversation!.id;
    await learning.normalChat(id, "Explain a vector", []);
    assert.match(requests[0]!.instructions, /Respond in Slovak/);
    assert.equal(store.courses().length, 0);
    store.setting("tutorLanguage", "en");
    await learning.normalChat(id, "Give an example", []);
    assert.match(requests[1]!.instructions, /Respond in English/);
    const history = requests[1]!.input as { role: string; content: unknown }[];
    assert.deepEqual(
      history.map((message) => message.role),
      ["user", "assistant", "user"],
    );
    assert.equal(history[1]!.content, "Test response");
    store.setNormalLanguage(id, "sk");
    await learning.normalChat(id, "More simply", []);
    assert.match(requests[2]!.instructions, /Respond in Slovak/);
    assert.equal(store.normalMessages(id).length, 6);
    assert.deepEqual(events[0], {
      kind: "delta",
      conversationId: id,
      text: "Test response",
    });
  } finally {
    store.close();
  }
});

test("study language overrides preserve active lesson, completion and conversations when switching modes", async () => {
  const { store, learning, requests } = setup();
  try {
    const course = store.create(
      {
        id: randomUUID(),
        name: "English slides",
        kind: "pptx",
        text: "[Slide 1] Classes and objects. [Slide 2] Properties.",
        images: [],
        warning: "",
      },
      {
        title: "OOP",
        lessons: ["Classes", "Properties"].map((title) => ({
          title,
          objective: `Learn ${title}`,
          references: ["Slide 1"],
        })),
      },
    );
    const lesson = course.lessons[0]!;
    store.activate(lesson.id);
    store.setting("language", "en");
    await learning.chat(lesson.id, "Explain this");
    assert.match(requests[0]!.instructions, /Respond in Slovak/);
    const completed = store.complete(lesson.id, randomUUID());
    const chat = store.createNormalConversation("en").conversation!;
    await learning.normalChat(chat.id, "An unrelated question", []);
    assert.equal(store.snapshot(course.course!.id).course!.completed, 1);
    assert.equal(
      store.snapshot(course.course!.id).course!.activeLessonId,
      completed.course!.activeLessonId,
    );
    store.setCourseLanguage(course.course!.id, "en");
    store.activate(lesson.id);
    await learning.chat(lesson.id, "Another example");
    assert.match(requests[2]!.instructions, /Respond in English/);
    assert.match(
      requests[2]!.instructions,
      /Teach ONLY the current lesson: Classes/,
    );
    assert.equal(store.lesson(lesson.id).status, "completed");
    assert.equal(store.messages(lesson.id).length, 4);
    assert.equal(store.normalMessages(chat.id).length, 2);
  } finally {
    store.close();
  }
});

test("normal chat retains interrupted output and saves the question even if model discovery fails", async () => {
  const { store, learning, connection } = setup();
  try {
    const id = store.createNormalConversation(null).conversation!.id;
    connection.generate = async (_model, _instructions, _input, delta) => {
      delta("Partial");
      throw new Error("Interrupted");
    };
    await assert.rejects(
      learning.normalChat(id, "Question", []),
      /Interrupted/,
    );
    assert.equal(store.normalMessages(id)[1]!.status, "interrupted");
    store.setting("model", "");
    await assert.rejects(
      learning.normalChat(id, "Saved offline question", []),
      /Unexpected model discovery/,
    );
    assert.equal(
      store.normalMessages(id).at(-1)!.content,
      "Saved offline question",
    );
  } finally {
    store.close();
  }
});

test("shutdown can wait until a cancelled stream has persisted its partial answer", async () => {
  const { store, learning, connection } = setup();
  try {
    const id = store.createNormalConversation(null).conversation!.id;
    let cancel!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    connection.generate = async (_model, _instructions, _input, delta) => {
      delta("Saved before shutdown");
      started();
      await new Promise<void>((_resolve, reject) => {
        cancel = () => reject(new Error("Cancelled"));
      });
      return "unreachable";
    };
    const response = learning.normalChat(id, "Question", []);
    const rejected = assert.rejects(response, /Cancelled/);
    await ready;
    let settled = false;
    const idle = learning.whenIdle().then(() => {
      settled = true;
    });
    await Promise.resolve();
    assert.equal(settled, false);
    cancel();
    await Promise.all([rejected, idle]);
    assert.equal(store.normalMessages(id)[1]?.content, "Saved before shutdown");
    assert.equal(store.normalMessages(id)[1]?.status, "interrupted");
  } finally {
    store.close();
  }
});

test("subscription-limit errors preserve conversation state and do not retry another provider", async () => {
  const { store, learning, connection } = setup();
  try {
    const id = store.createNormalConversation(null).conversation!.id;
    let calls = 0;
    connection.generate = async () => {
      calls++;
      throw new Error("OpenAI HTTP 429: usage_limit.");
    };
    await assert.rejects(
      learning.normalChat(id, "Keep this question", []),
      /usage_limit/,
    );
    assert.equal(calls, 1);
    assert.equal(store.normalMessages(id)[0]?.content, "Keep this question");
    assert.equal(store.normalMessages(id).length, 1);
    assert.equal(store.courses().length, 0);
    assert.equal(store.normalSnapshot().conversation?.id, id);
  } finally {
    store.close();
  }
});
