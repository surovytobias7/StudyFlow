import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./database.js";
import { Learning } from "./learning.js";
import {
  parseQuiz,
  isQuizRequest,
  practicePreferences,
  choiceGenerationSchema,
  type QuizData,
} from "./quiz.js";

export function fixtureQuiz(): QuizData {
  return {
    title: "OOP understanding",
    questions: [
      {
        type: "multiple_choice",
        prompt: "Which statement correctly describes an object?",
        topic: "Objects",
        difficulty: "easy",
        options: [
          "An instance of a class",
          "The source file containing a class",
          "A class declaration itself",
          "A namespace grouping types",
        ],
        correctOption: 0,
        explanation:
          "An object is a concrete instance of a class with its own state.",
        optionExplanations: [
          "An instance is an object.",
          "A file stores source text, not a runtime instance.",
          "A class defines the type; an object is an instance.",
          "A namespace organizes names, not instances.",
        ],
        sampleAnswer: "",
        rubric: "",
        references: ["Slide 1"],
      },
      {
        type: "multiple_choice",
        prompt:
          "Two instances of a class always share all instance field values.",
        topic: "Instance state",
        difficulty: "medium",
        options: [
          "All values are shared",
          "Each object has its own instance state",
          "Fields exist only in source files",
          "Only strings are separate",
        ],
        correctOption: 1,
        explanation:
          "Each instance owns its instance state; static fields are a different concept.",
        optionExplanations: [
          "Instance fields belong to individual objects.",
          "Correct: instance state is separate.",
          "Fields have runtime state.",
          "All instance field types are per instance.",
        ],
        sampleAnswer: "",
        rubric: "",
        references: ["Slide 1"],
      },
    ],
  };
}
function setup(store = new Store(":memory:")) {
  store.setting("model", "fixture-model");
  const course = store.create(
    {
      id: randomUUID(),
      name: "OOP.pptx",
      kind: "pptx",
      text: "[Slide 1]\nClasses and objects have instance state.\n[Slide 2]\nConstructors initialize objects.",
      images: [],
      warning: "",
    },
    {
      title: "OOP",
      lessons: [
        {
          title: "Classes and objects",
          objective: "Understand object state",
          references: ["Slide 1"],
        },
        {
          title: "Constructors",
          objective: "Initialize state",
          references: ["Slide 2"],
        },
      ],
    },
  );
  const requests: { instructions: string; input: unknown[] }[] = [];
  const connection = {
    async refreshModels(): Promise<never> {
      throw new Error("Unexpected discovery");
    },
    async generate(_m: string, instructions: string, input: unknown[]) {
      requests.push({ instructions, input });
      return JSON.stringify(fixtureQuiz());
    },
  };
  return {
    store,
    course,
    requests,
    connection,
    learning: new Learning(store, connection, () => {}),
  };
}
test("quiz schema rejects ambiguous structural answers and never treats ordinary explanations as quiz requests", () => {
  assert.equal(parseQuiz(JSON.stringify(fixtureQuiz())).questions.length, 2);
  const invalid = fixtureQuiz();
  invalid.questions[0]!.options[1] = invalid.questions[0]!.options[0]!;
  assert.throws(() => parseQuiz(JSON.stringify(invalid)), /invalid quiz/);
  const wrong = fixtureQuiz();
  wrong.questions[0]!.correctOption = 4;
  assert.throws(() => parseQuiz(JSON.stringify(wrong)), /invalid quiz/);
  assert.equal(isQuizRequest("Give me 5 questions about this lesson"), true);
  assert.equal(isQuizRequest("Vytvor 5 otázok k celej prezentácii"), true);
  assert.equal(isQuizRequest("Explain this example more simply"), false);
});
test("quizzes generate once, hide answer keys, grade shuffled choices locally and preserve progress after disk reopen", async () => {
  const dir = mkdtempSync(join(tmpdir(), "studyflow-quiz-")),
    file = join(dir, "test.sqlite");
  const context = setup(new Store(file));
  let { store } = context;
  try {
    const lesson = context.course.lessons[0]!.id,
      target = { lessonId: lesson, scope: "lesson" as const };
    store.activate(lesson);
    store.addMessage(lesson, "assistant", "Saved explanation");
    const before = store.snapshot();
    const quiz = await context.learning.generateQuiz(
      target,
      "Give me two questions.",
    );
    assert.equal(context.requests.length, 1);
    assert.match(
      context.requests[0]!.instructions,
      /internally solve every question/,
    );
    assert.match(context.requests[0]!.instructions, /Slovak/);
    assert.match(
      JSON.stringify(context.requests[0]!.input),
      /Saved explanation/,
    );
    assert.doesNotMatch(
      JSON.stringify(context.requests[0]!.input),
      /Constructors initialize/,
    );
    assert.doesNotMatch(
      JSON.stringify(quiz),
      /correctOption|optionExplanations|sampleAnswer|rubric|An instance is an object/,
    );
    assert.throws(
      () => context.learning.quizzes.next(quiz.id, 0),
      /Submit your answer/,
    );
    const bank = JSON.parse(
      store.db.prepare("SELECT payload FROM Quizzes WHERE id=?").get(quiz.id)!
        .payload as string,
    ) as QuizData;
    const incorrect = bank.questions[0]!.options.indexOf(
      "The source file containing a class",
    );
    const wrong = await context.learning.answerQuiz(
      quiz.id,
      0,
      String(incorrect),
    );
    assert.equal(wrong.feedback!.correct, false);
    assert.equal(
      wrong.feedback!.correctOption,
      bank.questions[0]!.correctOption,
    );
    assert.match(wrong.feedback!.explanation, /file stores source/);
    await context.learning.answerQuiz(
      quiz.id,
      0,
      String(bank.questions[0]!.correctOption),
    );
    assert.equal(context.learning.quizzes.view(quiz.id).answered, 1);
    context.learning.quizzes.next(quiz.id, 0);
    assert.equal(context.learning.quizzes.next(quiz.id, 0).position, 1);
    await context.learning.answerQuiz(
      quiz.id,
      1,
      String(bank.questions[1]!.correctOption),
    );
    const results = context.learning.quizzes.next(quiz.id, 1);
    assert.equal(results.complete, true);
    assert.equal(results.correct, 1);
    assert.equal(
      results.results!.filter((r) => !r.correct)[0]!.topic,
      "Objects",
    );
    assert.equal(
      context.requests.length,
      1,
      "Choice grading must not make AI requests",
    );
    assert.deepEqual(store.snapshot().lessons, before.lessons);
    assert.equal(store.messages(lesson).length, 1);
    store.close();
    store = new Store(file);
    const resumed = new Learning(store, context.connection, () => {});
    assert.equal(resumed.quizzes.view(quiz.id).correct, 1);
    assert.equal(resumed.quizzes.list(target)[0]!.complete, true);
    assert.deepEqual(store.snapshot().lessons, before.lessons);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("whole-course and normal-document quizzes use the correct scope; written code/math/practical answers get rubric feedback without execution", async () => {
  const { store, learning, connection, requests, course } = setup();
  try {
    const whole = await learning.generateQuiz(
      { lessonId: course.lessons[0]!.id, scope: "course" },
      "Give two questions on the whole presentation",
    );
    assert.match(JSON.stringify(requests[0]!.input), /Constructors initialize/);
    assert.equal(whole.scope, "course");
    const chat = store.createNormalConversation("en").conversation!.id;
    await learning.generateQuiz(
      { conversationId: chat, scope: "chat" },
      "Give two questions",
      [
        {
          name: "notes.txt",
          kind: "txt",
          text: "Objects have instance state.",
          images: [],
        },
      ],
    );
    assert.match(requests.at(-1)!.instructions, /English/);
    assert.equal(store.courses().length, 1);
    for (const type of [
      "short_answer",
      "coding",
      "math",
      "practical",
    ] as const) {
      const data: QuizData = {
        title: "Written practice",
        questions: [
          {
            type,
            prompt: "Explain how this answer follows from the problem.",
            topic: type,
            difficulty: "medium",
            options: [],
            correctOption: null,
            explanation: "A verified explanation with a sound solution.",
            optionExplanations: [],
            sampleAnswer: "A complete sample answer",
            rubric: "Explain the reasoning and reach the supported result",
            references: [],
          },
        ],
      };
      connection.generate = async (_m, instructions, input) => {
        requests.push({ instructions, input });
        return instructions.startsWith("Evaluate")
          ? JSON.stringify({
              correct: false,
              feedback:
                "Check the second step; the sign was reversed. Try deriving it again.",
            })
          : JSON.stringify(data);
      };
      const quiz = await learning.generateQuiz(
        { lessonId: course.lessons[0]!.id, scope: "lesson" },
        `Give one ${type} exercise`,
      );
      assert.doesNotMatch(JSON.stringify(quiz), /complete sample answer/);
      const answer = await learning.answerQuiz(
        quiz.id,
        0,
        "My attempted reasoning",
      );
      assert.equal(answer.feedback!.correct, false);
      assert.match(requests.at(-1)!.instructions, /never claim execution/);
      assert.match(JSON.stringify(requests.at(-1)!.input), /grading|rubric/);
    }
    assert.equal(store.snapshot().course!.completed, 0);
  } finally {
    store.close();
  }
});
test("version-two upgrade retains existing exercise records and attempts", () => {
  const dir = mkdtempSync(join(tmpdir(), "studyflow-quiz-upgrade-")),
    file = join(dir, "test.sqlite");
  let { store, course } = setup(new Store(file));
  try {
    const id = store.exercise(
      course.lessons[0]!.id,
      "Existing free-form exercise",
    );
    store.attempt(id, "My answer", "Existing feedback");
    store.db.exec("DROP TABLE Quizzes; PRAGMA user_version=2;");
    store.close();
    store = new Store(file);
    assert.equal(
      (
        store.db.prepare("PRAGMA user_version").get() as {
          user_version: number;
        }
      ).user_version,
      3,
    );
    assert.equal(
      store.db.prepare("SELECT count(*) AS n FROM Exercises").get()!.n,
      1,
    );
    assert.equal(
      store.db.prepare("SELECT feedback FROM ExerciseAttempts").get()!.feedback,
      "Existing feedback",
    );
    assert.equal(store.snapshot().lessons.length, 2);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("practice defaults to four ABCD questions and only explicit requests change format", () => {
  assert.deepEqual(practicePreferences(""), {
    count: 4,
    type: "multiple_choice",
    difficulty: "auto",
  });
  assert.equal(
    practicePreferences("Test my understanding of generic C# code").type,
    "multiple_choice",
  );
  assert.equal(
    practicePreferences("Daj mi 5 náročných ABCD otázok o kóde").count,
    5,
  );
  assert.equal(
    practicePreferences("Daj mi 5 náročných ABCD otázok o kóde").type,
    "multiple_choice",
  );
  assert.equal(
    practicePreferences("Give me a practical C# exercise").type,
    "coding",
  );
  assert.deepEqual(
    practicePreferences(
      "Give me 5 difficult multiple-choice questions about math",
    ),
    { count: 5, type: "multiple_choice", difficulty: "hard" },
  );
  assert.equal(
    practicePreferences("Give me written questions").type,
    "short_answer",
  );
  assert.equal(
    practicePreferences("", { type: "math", count: 2 }).type,
    "math",
  );
});

test("malformed JSON, wrong answer encoding and missing questions recover once without silently dropping data", async () => {
  for (const broken of [
    "not JSON",
    JSON.stringify({
      ...fixtureQuiz(),
      questions: [{ ...fixtureQuiz().questions[0], correctOption: "B" }],
    }),
    JSON.stringify({ title: "Broken", questions: [] }),
  ]) {
    const { store, learning, connection, course } = setup();
    try {
      let calls = 0;
      connection.generate = async (_m, instructions, input) => {
        calls++;
        if (calls === 1) return broken;
        if (calls === 2)
          assert.match(JSON.stringify(input), /Repair the complete response/);
        return JSON.stringify(fixtureQuiz());
      };
      const quiz = await learning.generateQuiz(
        { lessonId: course.lessons[0]!.id, scope: "lesson" },
        "Give two questions",
      );
      assert.equal(calls, 2); // original + one repair, no redundant audit
      assert.equal(quiz.total, 2);
      assert.equal(store.snapshot().course!.completed, 0);
    } finally {
      store.close();
    }
  }
});

test("unrecoverable quizzes and usage limits do not save partial banks or retry paid requests", async () => {
  const { store, learning, connection, course } = setup();
  try {
    let calls = 0;
    connection.generate = async () => {
      calls++;
      return "{}";
    };
    await assert.rejects(
      learning.generateQuiz(
        { lessonId: course.lessons[0]!.id, scope: "lesson" },
        "",
      ),
      /after automatic recovery/,
    );
    assert.equal(calls, 2);
    assert.equal(
      store.db.prepare("SELECT count(*) AS n FROM Quizzes").get()!.n,
      0,
    );
    calls = 0;
    connection.generate = async () => {
      calls++;
      throw new Error("OpenAI HTTP 429");
    };
    await assert.rejects(
      learning.generateQuiz(
        { lessonId: course.lessons[0]!.id, scope: "lesson" },
        "",
      ),
      /429/,
    );
    assert.equal(calls, 1);
  } finally {
    store.close();
  }
});

test("compact ABCD generation enforces shape, balances answer slots and preserves paired feedback", async () => {
  const { store, learning, connection, course } = setup();
  const compact = {
    title: "Four concepts",
    questions: Array.from({ length: 4 }, (_, i) => ({
      type: "multiple_choice" as const,
      prompt: `Which outcome follows in scenario ${i + 1}?`,
      topic: `Concept ${i + 1}`,
      difficulty: "medium" as const,
      options: [
        "Correct outcome",
        "Misunderstanding one",
        "Misunderstanding two",
        "Misunderstanding three",
      ],
      correctOption: 0,
      optionExplanations: [
        "The correct outcome follows from the stated rule.",
        "The first misunderstanding reverses the rule.",
        "The second misunderstanding ignores the condition.",
        "The third misunderstanding applies an unrelated rule.",
      ],
      references: ["Slide 1"],
    })),
  };
  try {
    let calls = 0;
    connection.generate = async (_m, _instructions, _input) => {
      calls++;
      return JSON.stringify(compact);
    };
    const schema = choiceGenerationSchema("multiple_choice", 4, "auto");
    assert.throws(() =>
      schema.parse({ ...compact, questions: compact.questions.slice(0, 3) }),
    );
    assert.throws(() =>
      schema.parse({
        ...compact,
        questions: compact.questions.map((q) => ({
          ...q,
          options: q.options.slice(0, 3),
        })),
      }),
    );
    const view = await learning.generateQuiz(
      { lessonId: course.lessons[0]!.id, scope: "lesson" },
      "",
    );
    assert.equal(calls, 1);
    const bank = JSON.parse(
      store.db.prepare("SELECT payload FROM Quizzes WHERE id=?").get(view.id)!
        .payload as string,
    ) as QuizData;
    assert.deepEqual(
      [...bank.questions.map((q) => q.correctOption)].sort(),
      [0, 1, 2, 3],
    );
    for (const q of bank.questions) {
      assert.equal(q.options[q.correctOption!], "Correct outcome");
      for (let i = 0; i < 4; i++) {
        const original = compact.questions[0]!.options.indexOf(q.options[i]!);
        assert.equal(
          q.optionExplanations[i],
          compact.questions[0]!.optionExplanations[original],
        );
      }
    }
    const correct = await learning.answerQuiz(
      view.id,
      0,
      String(bank.questions[0]!.correctOption),
    );
    assert.equal(correct.feedback!.correct, true);
    assert.equal(
      correct.feedback!.explanation,
      compact.questions[0]!.optionExplanations[0],
    );
    assert.equal(store.snapshot().course!.completed, 0);
  } finally {
    store.close();
  }
});

test("quiz streaming reports progress without exposing unvalidated questions or answer keys", async () => {
  const { store, connection, course } = setup();
  const events: unknown[] = [];
  const learning = new Learning(store, connection, (event) =>
    events.push(event),
  );
  // The production interface accepts a delta callback; this fixture deliberately
  // emits JSON across token boundaries, including the private answer key.
  const streaming = connection as {
    generate: (...args: any[]) => Promise<string>;
  };
  streaming.generate = async (_m, _i, _input, delta, options) => {
    assert.equal(options.webSearch, undefined);
    const text = JSON.stringify(fixtureQuiz());
    for (let i = 0; i < text.length; i += 17) delta(text.slice(i, i + 17));
    return text;
  };
  try {
    await learning.generateQuiz(
      { lessonId: course.lessons[0]!.id, scope: "lesson" },
      "Give two questions",
    );
    assert.ok(
      events.some(
        (e) => (e as { text: string }).text === "Writing question 1/2",
      ),
    );
    assert.ok(
      events.some(
        (e) => (e as { text: string }).text === "Writing question 2/2",
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(events),
      /correctOption|An instance|Which statement/,
    );
  } finally {
    store.close();
  }
});

test("large lesson practice bounds source/history and stays scoped to the lesson", async () => {
  const { store, learning, requests, course } = setup();
  try {
    store.db
      .prepare("UPDATE SourceMaterials SET text=? WHERE courseId=?")
      .run(
        "[Slide 1]\n" +
          "Relevant object state details. ".repeat(4000) +
          "\n[Slide 2]\nUNRELATED_CONSTRUCTORS",
        course.course!.id,
      );
    store.addMessage(
      course.lessons[0]!.id,
      "assistant",
      "Lesson explanation ".repeat(3000),
    );
    await learning.generateQuiz(
      { lessonId: course.lessons[0]!.id, scope: "lesson" },
      "Give two questions",
    );
    const input = JSON.stringify(requests[0]!.input);
    assert.ok(input.length < 32000);
    assert.doesNotMatch(input, /UNRELATED_CONSTRUCTORS/);
    assert.match(input, /Selected excerpts/);
  } finally {
    store.close();
  }
});

test("quiz context honors a named older document and preserves the original lesson explanation", async () => {
  const { store, learning, requests, course } = setup();
  try {
    const chat = store.createNormalConversation("en").conversation!.id;
    for (let i = 0; i < 10; i++)
      store.addNormalMessage(chat, "user", "Read", [
        {
          name: i ? `notes-${i}.txt` : "important-original.pdf",
          kind: "txt",
          text: i ? `OTHER_DOCUMENT_${i}` : "SPECIFIC_ORIGINAL_DOCUMENT",
          images: [],
        },
      ]);
    await learning.generateQuiz(
      { conversationId: chat, scope: "chat" },
      "Give two questions about important-original.pdf",
    );
    assert.match(
      JSON.stringify(requests.at(-1)!.input),
      /SPECIFIC_ORIGINAL_DOCUMENT/,
    );
    const lesson = course.lessons[0]!.id;
    store.addMessage(
      lesson,
      "assistant",
      "INITIAL_LESSON_CONTEXT: instances have independent state.",
    );
    for (let i = 0; i < 20; i++)
      store.addMessage(
        lesson,
        i % 2 ? "assistant" : "user",
        `More discussion ${i}: ` + "detail ".repeat(150),
      );
    await learning.generateQuiz(
      { lessonId: lesson, scope: "lesson" },
      "Give two questions",
    );
    const input = JSON.stringify(requests.at(-1)!.input);
    assert.match(input, /INITIAL_LESSON_CONTEXT/);
    assert.match(input, /More discussion 19/);
    assert.ok(input.length < 15000);
  } finally {
    store.close();
  }
});
