import { z } from "zod";

export const lessonDraft = z.object({
  title: z.string().min(1).max(180),
  objective: z.string().min(1).max(2000),
  references: z.array(z.string().max(200)).max(500),
});
export const planSchema = z.object({
  title: z.string().min(1).max(180),
  lessons: z.array(lessonDraft).min(1).max(80),
});
export type Plan = z.infer<typeof planSchema>;
export type Lesson = z.infer<typeof lessonDraft> & {
  id: string;
  courseId: string;
  position: number;
  status: "not_started" | "in_progress" | "completed" | "needs_review";
};
export type Message = {
  id: string;
  lessonId: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "interrupted";
  createdAt: string;
};
export type NormalAttachment = {
  name: string;
  kind: string;
  text: string;
  images: { label: string; url: string }[];
  warning?: string;
};
export type NormalMessage = Omit<Message, "lessonId"> & {
  conversationId: string;
  attachments: NormalAttachment[];
};
export type NormalConversation = {
  id: string;
  title: string;
  aiLanguage: "en" | "sk" | null;
  createdAt: string;
  updatedAt: string;
  preview: string;
  messageCount: number;
};
export type NormalSnapshot = {
  conversations: NormalConversation[];
  conversation: NormalConversation | null;
  messages: NormalMessage[];
  settings: Record<string, string>;
};
export type Course = {
  id: string;
  title: string;
  activeLessonId: string | null;
  createdAt: string;
  started: number;
  total: number;
  completed: number;
  aiLanguage?: "en" | "sk" | null;
};
export type Material = {
  id: string;
  name: string;
  kind: string;
  text: string;
  images: { label: string; url: string }[];
  warning: string;
};
export type Snapshot = {
  courses: Course[];
  course: Course | null;
  lessons: Lesson[];
  messages: Message[];
  sources: { id: string; name: string; warning: string }[];
  settings: Record<string, string>;
  normalConversations?: NormalConversation[];
};
export const settingsSchema = z.object({
  language: z.enum(["en", "sk"]),
  tutorLanguage: z.enum(["en", "sk"]),
  theme: z.enum(["dark", "light"]),
  model: z.string().max(200),
});
export const languageOverride = z.enum(["en", "sk"]).nullable();
export const attachmentSchema = z
  .object({
    name: z.string().min(1).max(240),
    kind: z.string().min(1).max(20),
    text: z.string().max(600_000),
    warning: z.string().max(2000).optional(),
    images: z
      .array(
        z.object({
          label: z.string().max(240),
          url: z
            .string()
            .max(14_000_000)
            .regex(
              /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
            ),
        }),
      )
      .max(8),
  })
  .strict();
export const attachmentsSchema = z
  .array(attachmentSchema)
  .max(8)
  .refine(
    (items) =>
      items.reduce((sum, item) => sum + item.text.length, 0) <= 1_200_000,
    "Attachments are too large to send together. Remove some images or attach a smaller file.",
  )
  .refine(
    (items) =>
      items.reduce(
        (sum, item) =>
          sum + item.images.reduce((n, image) => n + image.url.length, 0),
        0,
      ) <= 24_000_000,
    "Attachments are too large to send together. Remove some images or attach a smaller file.",
  );
export const uuid = z.string().uuid();

export function parsePlan(text: string): Plan {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return planSchema.parse(JSON.parse(cleaned));
  } catch {
    throw new Error(
      "The tutor returned an invalid learning path. Please try generating it again.",
    );
  }
}
