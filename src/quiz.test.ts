import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./database.js";
import { Learning } from "./learning.js";
import { parseQuiz, isQuizRequest, type QuizData } from "./quiz.js";

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
        type: "true_false",
        prompt:
          "Two instances of a class always share all instance field values.",
        topic: "Instance state",
        difficulty: "medium",
        options: ["True", "False"],
        correctOption: 1,
        explanation:
          "Each instance owns its instance state; static fields are a different concept.",
        optionExplanations: [
          "Instance fields belong to individual objects.",
          "Correct: instance state is separate.",
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
test("quizzes verify generation twice, hide answer keys, grade choices locally, prevent duplicates and preserve progress after disk reopen", async () => {
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
    assert.equal(context.requests.length, 2);
    assert.match(context.requests[1]!.instructions, /Independently audit/);
    assert.match(context.requests[0]!.instructions, /Slovak/);
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
    const wrong = await context.learning.answerQuiz(quiz.id, 0, "1");
    assert.equal(wrong.feedback!.correct, false);
    assert.equal(wrong.feedback!.correctOption, 0);
    assert.match(wrong.feedback!.explanation, /file stores source/);
    await context.learning.answerQuiz(quiz.id, 0, "0");
    assert.equal(context.learning.quizzes.view(quiz.id).answered, 1);
    context.learning.quizzes.next(quiz.id, 0);
    assert.equal(context.learning.quizzes.next(quiz.id, 0).position, 1);
    await context.learning.answerQuiz(quiz.id, 1, "1");
    const results = context.learning.quizzes.next(quiz.id, 1);
    assert.equal(results.complete, true);
    assert.equal(results.correct, 1);
    assert.equal(
      results.results!.filter((r) => !r.correct)[0]!.topic,
      "Objects",
    );
    assert.equal(
      context.requests.length,
      2,
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
      "Quiz the whole presentation",
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
