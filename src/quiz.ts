import { z } from "zod";
import { jsonValue, validationDetails } from "./structured.js";

export const practiceSchema = z
  .object({
    type: z
      .enum(["multiple_choice", "short_answer", "coding", "math"])
      .optional(),
    count: z.number().int().min(1).max(10).optional(),
    difficulty: z.enum(["auto", "easy", "medium", "hard"]).optional(),
  })
  .strict();
export type Practice = z.infer<typeof practiceSchema>;
export function practicePreferences(request: string, custom: Practice = {}) {
  const count = request.match(
    /\b(10|[1-9])\s+(?:[\p{L}_-]+\s+){0,4}(?:questions?|exercises?|MCQs?|ABCD|otáz|otaz|cvičen|cvicen|úloh|uloh)/iu,
  )?.[1];
  const wordCount = /\b(one|jednu|jeden)\b/i.test(request)
    ? 1
    : /\btwo\b/i.test(request)
      ? 2
      : /\bfive\b/i.test(request)
        ? 5
        : 4;
  const requestedChoice =
    /multiple.choice|ABCD|s výberom/iu.test(request) &&
    !/(?:not|no)\s+multiple.choice/iu.test(request);
  const type = requestedChoice
    ? "multiple_choice"
    : /true.?false|pravda.{0,5}nepravda/i.test(request)
      ? "true_false"
      : /coding|programovac.{0,8}(?:úloh|uloh|cvičen|cvicen)|(?:practical|praktick).{0,20}(?:C#|C\+\+|Python)|(?:C#|Python).{0,20}(?:exercise|úloh)/iu.test(
            request,
          ) && !/(?<!not )multiple.choice|ABCD|s výberom/iu.test(request)
        ? "coding"
        : /written|short.answer|písomn|pisomn|short_answer/iu.test(request)
          ? "short_answer"
          : /(?:math|matematick).{0,25}(?:exercise|problem|úloh|príklad)|\bmath\b/iu.test(
                request,
              )
            ? "math"
            : /\bpractical\b/iu.test(request)
              ? "practical"
              : "multiple_choice";
  return {
    count: custom.count ?? (count ? Number(count) : wordCount),
    type: custom.type ?? type,
    difficulty:
      custom.difficulty ??
      (/hard|difficult|nároč|naroc|ťažk|tazk/iu.test(request)
        ? "hard"
        : "auto"),
  };
}

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

// Choice generation omits unused written-answer fields and the duplicate overall
// explanation. Persisted quizzes still use quizSchema, including older banks.
export function choiceGenerationSchema(
  type: "multiple_choice" | "true_false",
  count: number,
  difficulty: "auto" | "easy" | "medium" | "hard",
) {
  const options = type === "multiple_choice" ? 4 : 2;
  return z.object({
    title: z.string().min(1).max(180),
    questions: z
      .array(
        z.object({
          type: z.literal(type),
          prompt: z.string().min(10).max(6000),
          topic: z.string().min(1).max(180),
          difficulty:
            difficulty === "auto"
              ? z.enum(["easy", "medium", "hard"])
              : z.literal(difficulty),
          options: z.array(z.string().min(1).max(2000)).length(options),
          correctOption: z
            .number()
            .int()
            .min(0)
            .max(options - 1),
          optionExplanations: z
            .array(z.string().min(10).max(3000))
            .length(options),
          references: z.array(z.string().max(200)).max(10),
        }),
      )
      .length(count),
  });
}
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
  } catch (error) {
    throw new Error(
      `The tutor returned an invalid quiz. ${validationDetails(error)}`,
    );
  }
}
export function isQuizRequest(text: string) {
  return /\bquiz\b|kvíz|kviz|test (?:my|me)|testuj|otestuj|(?:give|create|generate).{0,40}(?:questions?|exercises?)|(?:daj|vytvor|priprav).{0,40}(?:otáz|otaz|cvičen|cvicen|úloh|uloh)|multiple.choice|true\s*\/\s*false/iu.test(
    text,
  );
}
export function quizScope(text: string): "lesson" | "course" {
  return /entire|whole|cel[úáýéuaye]|všetk|vsetk/iu.test(text)
    ? "course"
    : "lesson";
}
