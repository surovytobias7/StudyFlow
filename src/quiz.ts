import { z } from "zod";

export const quizTargetSchema = z.union([
  z
    .object({
      lessonId: z.string().uuid(),
      scope: z.enum(["lesson", "course"]).default("lesson"),
    })
    .strict(),
  z
    .object({
      conversationId: z.string().uuid(),
      scope: z.literal("chat").default("chat"),
    })
    .strict(),
]);
export type QuizTarget = z.infer<typeof quizTargetSchema>;
export const questionSchema = z
  .object({
    type: z.enum([
      "multiple_choice",
      "true_false",
      "short_answer",
      "coding",
      "math",
      "practical",
    ]),
    prompt: z.string().min(10).max(6000),
    topic: z.string().min(1).max(180),
    difficulty: z.enum(["easy", "medium", "hard"]),
    options: z.array(z.string().min(1).max(2000)).max(4),
    correctOption: z.number().int().min(0).max(3).nullable(),
    explanation: z.string().min(10).max(6000),
    optionExplanations: z.array(z.string().min(1).max(3000)).max(4),
    sampleAnswer: z.string().max(6000),
    rubric: z.string().max(4000),
    references: z.array(z.string().max(200)).max(10),
  })
  .superRefine((q, ctx) => {
    const choice = q.type === "multiple_choice" || q.type === "true_false";
    const count = q.type === "true_false" ? 2 : 4;
    if (
      choice &&
      (q.options.length !== count ||
        q.correctOption === null ||
        q.correctOption >= count ||
        q.optionExplanations.length !== count ||
        new Set(q.options.map((s) => s.trim().toLowerCase())).size !== count)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Choice questions need distinct options, one valid answer and an explanation for every option.",
      });
    if (
      !choice &&
      (q.options.length ||
        q.correctOption !== null ||
        !q.sampleAnswer.trim() ||
        !q.rubric.trim())
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Written exercises need an answer and grading rubric, without choice options.",
      });
  });
export const quizSchema = z
  .object({
    title: z.string().min(1).max(180),
    questions: z.array(questionSchema).min(1).max(10),
  })
  .refine(
    (q) =>
      new Set(q.questions.map((x) => x.prompt.trim().toLowerCase())).size ===
      q.questions.length,
    "Quiz questions must be distinct.",
  );
export type QuizData = z.infer<typeof quizSchema>;
export type QuizAnswer = {
  index: number;
  answer: string;
  correct: boolean;
  feedback: string;
  createdAt: string;
};
export type QuizView = {
  id: string;
  title: string;
  scope: QuizTarget["scope"];
  total: number;
  position: number;
  answered: number;
  correct: number;
  complete: boolean;
  question?: Pick<
    QuizData["questions"][number],
    "type" | "prompt" | "topic" | "difficulty" | "options" | "references"
  >;
  feedback?: {
    correct: boolean;
    explanation: string;
    answer: string;
    correctOption: number | null;
  };
  results?: {
    prompt: string;
    topic: string;
    answer: string;
    correct: boolean;
    explanation: string;
    correctAnswer: string;
  }[];
};
export type QuizSummary = {
  id: string;
  title: string;
  answered: number;
  total: number;
  complete: boolean;
};
export function parseQuiz(text: string): QuizData {
  try {
    const quiz = quizSchema.parse(
      JSON.parse(
        text
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, ""),
      ),
    );
    const order = { easy: 0, medium: 1, hard: 2 };
    quiz.questions.sort((a, b) => order[a.difficulty] - order[b.difficulty]);
    return quiz;
  } catch {
    throw new Error("The tutor returned an invalid quiz. Please try again.");
  }
}
export function isQuizRequest(text: string) {
  return /\bquiz\b|kvíz|kviz|test (?:my|me)|testuj|otestuj|(?:give|create|generate).{0,40}(?:questions|exercises)|(?:daj|vytvor|priprav).{0,40}(?:otáz|otaz|cvičen|cvicen)|multiple.choice|true\s*\/\s*false/iu.test(
    text,
  );
}
export function quizScope(text: string): "lesson" | "course" {
  return /entire|whole|cel[úáýéuaye]|všetk|vsetk/iu.test(text)
    ? "course"
    : "lesson";
}
