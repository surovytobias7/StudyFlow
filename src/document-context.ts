import { z } from "zod";
import type { Material, NormalAttachment } from "./domain.js";

// Conversation resources outlive the rolling message window. Keep the existing
// recency order, but make an explicitly named older document available as well.
export function selectDocuments<T extends { name: string }>(
  documents: T[],
  request: string,
) {
  const question = request.toLocaleLowerCase();
  return documents
    .map((file, index) => ({
      file,
      index,
      named: question.includes(file.name.toLocaleLowerCase()) ? 1 : 0,
    }))
    .sort((a, b) => b.named - a.named || b.index - a.index)
    .slice(0, 8)
    .sort((a, b) => a.index - b.index);
}

export function lessonHistory<T extends { role: string; status: string }>(
  messages: T[],
  limit = 30,
): T[] {
  const complete = messages.filter((message) => message.status === "complete");
  const initial = complete.find((message) => message.role === "assistant");
  const recent = complete.slice(-limit);
  return initial && !recent.includes(initial)
    ? [initial, ...recent.slice(1)]
    : recent;
}

export function lessonDiscussion(
  messages: { role: string; status: string; content: string }[],
  budget = 12000,
) {
  const history = lessonHistory(messages, 12);
  const text = history
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  if (text.length <= budget) return text;
  if (history[0]?.role !== "assistant") return text.slice(-budget);
  const initial = `assistant: ${history[0].content}`.slice(
    0,
    Math.floor(budget / 2),
  );
  const divider = "\n[Recent follow-up discussion]\n";
  const recent = history
    .slice(1)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  return (
    initial +
    divider +
    recent.slice(-Math.max(0, budget - initial.length - divider.length))
  );
}

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
  const parts: { part: string; index: number; score: number; label: string }[] =
    [];
  for (const unit of text.split(/(?=\[(?:Page|Slide) \d+\])/)) {
    const label = unit.match(/^\[(?:Page|Slide) \d+\]/)?.[0] ?? "";
    const body = label ? unit.slice(label.length).trimStart() : unit;
    for (let offset = 0; offset < body.length; offset += 3500) {
      const chunk = body.slice(offset, offset + 3500);
      const lower = chunk.toLocaleLowerCase();
      parts.push({
        part: (label ? `${label}\n` : "") + chunk,
        label,
        index: parts.length,
        score: terms.reduce(
          (score, term) => score + (lower.includes(term) ? 1 : 0),
          0,
        ),
      });
    }
  }
  const notice =
    "\n[Selected excerpts only; the full document is saved locally. Ask for a specific page, slide or topic for more detail.]";
  const separator = "\n[…]\n";
  let remaining = Math.max(0, budget - notice.length);
  const selected: { part: string; index: number }[] = [];
  for (const part of parts.sort(
    (a, b) => b.score - a.score || a.index - b.index,
  )) {
    const available = remaining - (selected.length ? separator.length : 0);
    if (available <= part.label.length + 24) break;
    const excerpt = part.part.slice(0, available);
    selected.push({ part: excerpt, index: part.index });
    remaining -= excerpt.length + (selected.length > 1 ? separator.length : 0);
  }
  return (
    selected
      .sort((a, b) => a.index - b.index)
      .map((part) => part.part)
      .join(separator) + notice
  ).slice(0, budget);
}
