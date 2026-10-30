import { z } from 'zod';

export const lessonDraft = z.object({ title: z.string().min(1).max(180), objective: z.string().min(1).max(2000), references: z.array(z.string().max(200)).max(40) });
export const planSchema = z.object({ title: z.string().min(1).max(180), lessons: z.array(lessonDraft).min(1).max(80) });
export type Plan = z.infer<typeof planSchema>;
export type Lesson = z.infer<typeof lessonDraft> & { id: string; courseId: string; position: number; status: 'not_started' | 'in_progress' | 'completed' | 'needs_review' };
export type Message = { id: string; lessonId: string; role: 'user' | 'assistant'; content: string; status: 'complete' | 'interrupted'; createdAt: string };
export type Course = { id: string; title: string; activeLessonId: string | null; createdAt: string; started: number; total: number; completed: number };
export type Material = { id: string; name: string; kind: string; text: string; images: { label: string; url: string }[]; warning: string };
export type Snapshot = { courses: Course[]; course: Course | null; lessons: Lesson[]; messages: Message[]; sources: { id: string; name: string; warning: string }[]; settings: Record<string, string> };
export const settingsSchema = z.object({ language: z.enum(['en', 'sk']), tutorLanguage: z.enum(['en', 'sk']), theme: z.enum(['dark', 'light']), model: z.string().max(200) });
export const uuid = z.string().uuid();

export function parsePlan(text: string): Plan {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return planSchema.parse(JSON.parse(cleaned)); }
  catch { throw new Error('The tutor returned an invalid learning path. Please try generating it again.'); }
}
