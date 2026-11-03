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
  let responseNumber = 0;
  let corruptNext = false;
  const realGenerate = connection.generate.bind(connection);
  const observed = {
    refreshModels: () => connection.refreshModels(),
    generate: async (...args: Parameters<Connection["generate"]>) => {
      const text = await realGenerate(...args);
      await writeFile(
        join(directory, `response-${++responseNumber}.txt`),
        text,
      );
      if (corruptNext) {
        corruptNext = false;
        return text.slice(0, -30);
      }
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
    let learning = new Learning(store, observed, (event) => {
      if ((event as { kind: string }).kind !== "delta")
        console.info(new Date().toISOString(), JSON.stringify(event));
    });
    if (process.argv.includes("--custom-only")) {
      const target = { lessonId: lesson, scope: "lesson" as const };
      const custom = await learning.generateQuiz(
        target,
        "Give me 2 hard multiple-choice questions about polymorphism.",
      );
      assert.equal(custom.total, 2);
      assert.equal(custom.question!.difficulty, "hard");
      const coding = await learning.generateQuiz(target, "", [], {
        type: "coding",
        count: 1,
      });
      const bank = JSON.parse(
        store.db
          .prepare("SELECT payload FROM Quizzes WHERE id=?")
          .get(coding.id)!.payload as string,
      ) as QuizData;
      const feedback = await learning.answerQuiz(
        coding.id,
        0,
        bank.questions[0]!.sampleAnswer,
      );
      assert.ok(feedback.feedback!.explanation.trim());
      await writeFile(
        join(directory, "result.json"),
        JSON.stringify(
          { passed: true, model: status.models[0].slug, custom, feedback },
          null,
          2,
        ),
      );
      pass(
        "Custom natural-language count/type/difficulty and structured written grading through real OAuth Responses",
      );
      return;
    }
    await learning.chat(lesson, "");
    let quiz = await learning.generateQuiz(
      { lessonId: lesson, scope: "lesson" },
      "",
    );
    const bank = JSON.parse(
      store.db.prepare("SELECT payload FROM Quizzes WHERE id=?").get(quiz.id)!
        .payload as string,
    ) as QuizData;
    assert.equal(bank.questions.length, 4);
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
      "Default practice generates four verified ABCD questions without instructions; keys stay hidden",
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
    assert.equal(quiz.correct, 3);
    assert.equal(quiz.complete, true);
    assert.ok(quiz.results!.some((r) => !r.correct));
    assert.equal(store.snapshot().course!.completed, 0);
    pass(
      "All four questions, feedback, duplicate protection, 75% score and mistake review preserve lesson progress",
    );
    const id = quiz.id;
    store.close();
    store = new Store(file);
    learning = new Learning(store, observed, () => {});
    assert.equal(learning.quizzes.view(id).correct, 3);
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
    const subjectBanks: QuizData[] = [];
    for (const subject of [
      {
        title: "Derivative and tangent",
        text: "[Page 1]\nThe derivative f'(a)=lim(h→0)(f(a+h)-f(a))/h measures local rate of change. For f(x)=x², f'(x)=2x. A tangent at a has equation y=f(a)+f'(a)(x-a). A secant uses a finite interval; the derivative is its limiting slope. Differentiability implies continuity, but continuity does not imply differentiability (for example |x| at zero).",
      },
      {
        title: "Risk management",
        text: "[Page 1]\nRisk is uncertainty affecting objectives. Probability and impact guide prioritization. Avoidance removes the risky activity; mitigation reduces probability or impact; transfer reallocates financial consequences but does not eliminate accountability; acceptance retains risk with a contingency. Residual risk remains after treatment. Review risks as conditions change.",
      },
    ]) {
      const snapshot = store.create(
        {
          id: crypto.randomUUID(),
          name: subject.title + ".txt",
          kind: "txt",
          text: subject.text,
          images: [],
          warning: "",
        },
        {
          title: subject.title,
          lessons: [
            {
              title: subject.title,
              objective: subject.text,
              references: ["Page 1"],
            },
          ],
        },
      );
      const target = {
        lessonId: snapshot.lessons[0]!.id,
        scope: "lesson" as const,
      };
      if (subject.title.startsWith("Derivative")) corruptNext = true;
      const generated = await learning.generateQuiz(target, "");
      assert.equal(generated.total, 4);
      assert.equal(generated.question!.type, "multiple_choice");
      subjectBanks.push(
        JSON.parse(
          store.db
            .prepare("SELECT payload FROM Quizzes WHERE id=?")
            .get(generated.id)!.payload as string,
        ),
      );
      pass(
        `Default four ABCD questions: ${subject.title}${subject.title.startsWith("Derivative") ? "; real AI repaired an intentionally truncated real response" : ""}`,
      );
      if (subject.title.startsWith("Derivative")) {
        const math = await learning.generateQuiz(target, "", [], {
          type: "math",
          count: 1,
        });
        assert.equal(math.question!.type, "math");
        const written = await learning.generateQuiz(target, "", [], {
          type: "short_answer",
          count: 1,
        });
        assert.equal(written.question!.type, "short_answer");
        pass("Explicit mathematics and written-answer selections honored");
      } else {
        const custom = await learning.generateQuiz(
          target,
          "Give me 2 hard multiple-choice questions about residual risk.",
        );
        assert.equal(custom.total, 2);
        assert.equal(custom.question!.difficulty, "hard");
        pass("Custom concept, count and difficulty honored");
      }
    }
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
          subjectBanks,
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
