import { z } from "zod";
import type { Connection } from "./connection.js";

export function jsonValue(text: string): unknown {
  return JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
}

// Diagnostics contain field paths, never private source text or credentials.
export function validationDetails(error: unknown): string {
  if (error instanceof z.ZodError)
    return error.issues
      .slice(0, 12)
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
  if (error instanceof SyntaxError)
    return "Invalid JSON syntax. Escape newlines, quotes and backslashes inside JSON strings.";
  return error instanceof Error
    ? error.message.slice(0, 1600)
    : "Invalid structure";
}

export async function structured<T>(args: {
  connection: Pick<Connection, "generate">;
  model: string;
  name: string;
  schema: z.ZodType<T>;
  instructions: string;
  input: unknown[];
  validate?: (value: T) => void;
  recovering?: () => void;
  error: string;
}) {
  const { connection, model, schema, name } = args;
  const format = z.toJSONSchema(schema);
  delete format.$schema;
  let input = args.input;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Network/auth/usage/cancellation errors propagate; they are never format retries.
    const text = await connection.generate(
      model,
      args.instructions,
      input,
      () => {},
      {
        jsonSchema: { name, schema: format },
      },
    );
    try {
      const value = schema.parse(jsonValue(text));
      args.validate?.(value);
      return value;
    } catch (error) {
      const details = validationDetails(error);
      console.warn(`${name} validation attempt ${attempt + 1}: ${details}`);
      if (attempt) throw new Error(args.error);
      args.recovering?.();
      input = [
        ...args.input,
        { role: "assistant", content: text },
        {
          role: "user",
          content: `Repair the complete response. Validation errors: ${details}. Preserve sound content, correct every error and return the entire valid JSON. Do not omit questions/concepts, invent fallback content, or include analysis.`,
        },
      ];
    }
  }
  throw new Error(args.error);
}
