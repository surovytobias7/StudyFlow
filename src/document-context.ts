import { z } from "zod";
import type { Material, NormalAttachment } from "./domain.js";

export const studyScopeSchema = z
  .object({
    instructions: z.string().trim().max(4000).default(""),
    from: z.number().int().min(1).max(10000).optional(),
    to: z.number().int().min(1).max(10000).optional(),
  })
  .refine(
    (s) => (!s.from && !s.to) || (!!s.from && !!s.to && s.from <= s.to),
    "Enter a valid page or slide range.",
  );
export type StudyScope = z.infer<typeof studyScopeSchema>;

export function requestedRange(question: string) {
  const match = question.match(
    /(?:pages?|slides?|stran(?:a|u|y|ách|ach)?|sn[ií]mk(?:a|u|y|ach|ách)?|slid(?:e|y|ov)?)\s*(\d+)(?:\s*(?:[-–—]|to|až|az)\s*(\d+))?/iu,
  );
  if (!match) return;
  return { from: Number(match[1]), to: Number(match[2] ?? match[1]) };
}
export function scopedMaterial(
  material: Material,
  scope: StudyScope,
): Material {
  const range = scope.from
    ? { from: scope.from, to: scope.to! }
    : requestedRange(scope.instructions);
  if (!range) return material;
  const selected = material.text
    .split(/(?=\[(?:Page|Slide) \d+\])/)
    .filter((section) => {
      const n = Number(section.match(/^\[(?:Page|Slide) (\d+)\]/)?.[1]);
      return n >= range.from && n <= range.to;
    });
  if (!selected.length || range.from > range.to)
    throw new Error(
      "The requested pages or slides were not found in this document.",
    );
  // PPTX images have no reliable slide attribution; exclude unrelated visuals.
  return { ...material, text: selected.join("\n"), images: [] };
}
export function documentExcerpt(
  attachment: NormalAttachment,
  question: string,
  budget: number,
) {
  const range = requestedRange(question);
  let text = attachment.text;
  if (range) {
    const parts = text.split(/(?=\[(?:Page|Slide) \d+\])/).filter((part) => {
      const n = Number(part.match(/^\[(?:Page|Slide) (\d+)\]/)?.[1]);
      return n >= range.from && n <= range.to;
    });
    text = parts.length
      ? parts.join("\n")
      : "Requested page/slide references are unavailable in this document. Do not invent them.";
  }
  if (text.length <= budget) return text;
  const terms = question.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  const parts = text.match(/[\s\S]{1,3500}/g) ?? [];
  const ranked = parts.map((part, index) => ({
    part,
    index,
    score: terms.reduce(
      (n, t) => n + (part.toLocaleLowerCase().includes(t) ? 1 : 0),
      0,
    ),
  }));
  const selected = ranked
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, Math.floor(budget / 3500)))
    .sort((a, b) => a.index - b.index);
  return (
    selected
      .map((p) => p.part)
      .join("\n[…]\n")
      .slice(0, budget) +
    "\n[Selected excerpts only; the full document is saved locally. Ask for a specific page, slide or topic for more detail.]"
  );
}
