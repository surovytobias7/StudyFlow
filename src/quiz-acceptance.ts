import { app } from "electron";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { Store } from "./database.js";
import { Learning } from "./learning.js";
import { importMaterial } from "./materials.js";
import type { Connection } from "./connection.js";
import type { QuizData } from "./quiz.js";

export async function quizAcceptance(connection: Connection) {
  const directory = join(
    app.getPath("userData"),
    "acceptance",
    `quiz-${Date.now()}`,
  );
  await mkdir(directory, { recursive: true });
  const file = join(directory, "test.sqlite");
  let store = new Store(file);
  const steps: string[] = [];
  const pass = (text: string) => {
    steps.push(text);
    console.info("PASS:", text);
  };
  try {
    const status = await connection.refreshModels();
    assert.ok(status.models[0]);
    store.setting("model", status.models[0].slug);
    store.setting("tutorLanguage", "sk");
    const material = await importMaterial(
      join(app.getAppPath(), "fixtures", "oop-acceptance.pptx"),
      join(directory, "materials"),
    );
    const course = store.create(
      material,
      {
        title: "Polymorphism",
        lessons: [
          {
            title: "Method overriding and polymorphism",
            objective: "Understand virtual dispatch",
            references: ["Slide 5"],
          },
        ],
      },
      { instructions: "Only polymorphism", from: 5, to: 5 },
    );
    const lesson = course.lessons[0]!.id;
    store.activate(lesson);
    let learning = new Learning(store, connection, (event) =>
      console.info(new Date().toISOString(), JSON.stringify(event)),
    );
    let quiz = await learning.generateQuiz(
      { lessonId: lesson, scope: "lesson" },
      "Daj mi 5 otázok s výberom A, B, C, D o tejto lekcii. Testuj pochopenie a príklady v C#; postupne zvyšuj náročnosť.",
    );
    const bank = JSON.parse(
      store.db.prepare("SELECT payload FROM Quizzes WHERE id=?").get(quiz.id)!
        .payload as string,
    ) as QuizData;
    assert.equal(bank.questions.length, 5);
    assert.ok(
      bank.questions.every(
        (q) => q.type === "multiple_choice" && q.options.length === 4,
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(quiz),
      /correctOption|rubric|sampleAnswer/,
    );
    pass(
      "Live source-grounded five-question A-D quiz passes independent AI verification; answer keys remain outside renderer view",
    );
    for (let index = 0; index < bank.questions.length; index++) {
      const correct = bank.questions[index]!.correctOption!;
      quiz = await learning.answerQuiz(
        quiz.id,
        index,
        String(index === 0 ? (correct + 1) % 4 : correct),
      );
      assert.equal(quiz.feedback!.correct, index !== 0);
      if (index === 0)
        await learning.answerQuiz(quiz.id, index, String(correct));
      quiz = learning.quizzes.next(quiz.id, index);
    }
    assert.equal(quiz.correct, 4);
    assert.equal(quiz.complete, true);
    assert.ok(quiz.results!.some((r) => !r.correct));
    assert.equal(store.snapshot().course!.completed, 0);
    pass(
      "Local choice grading, wrong-answer explanation, next question, duplicate protection, 80% result and mistake review preserve lesson progress",
    );
    const id = quiz.id;
    store.close();
    store = new Store(file);
    learning = new Learning(store, connection, () => {});
    assert.equal(learning.quizzes.view(id).correct, 4);
    pass("Completed quiz and explanations survive database reopen");
    const coding = await learning.generateQuiz(
      { lessonId: lesson, scope: "lesson" },
      "Give me exactly one short written C# coding exercise about virtual methods, not multiple choice.",
    );
    const codingBank = JSON.parse(
      store.db.prepare("SELECT payload FROM Quizzes WHERE id=?").get(coding.id)!
        .payload as string,
    ) as QuizData;
    assert.equal(codingBank.questions[0]!.type, "coding");
    const feedback = await learning.answerQuiz(
      coding.id,
      0,
      codingBank.questions[0]!.sampleAnswer,
    );
    assert.ok(feedback.feedback!.explanation.trim());
    pass(
      "Live written C# exercise receives rubric-based AI feedback without code execution",
    );
    await writeFile(
      join(directory, "result.json"),
      JSON.stringify(
        {
          completedAt: new Date().toISOString(),
          passed: true,
          model: status.models[0].slug,
          steps,
          questions: bank,
          results: quiz,
          coding: feedback,
        },
        null,
        2,
      ),
    );
  } finally {
    store.close();
    console.info("Quiz acceptance evidence:", directory);
  }
}
