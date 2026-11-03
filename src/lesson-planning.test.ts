import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "./database.js";
import { Learning } from "./learning.js";
import { analysisChunks } from "./lesson-planning.js";
import type { GenerationOptions } from "./search.js";

test("whole-source inventory precedes global grouping; recurring topics cross transport boundaries and coverage persists", async () => {
  const source = `[Slide 1]\nGenerics ${"a".repeat(17000)}\n[Slide 2]\nManagement ${"b".repeat(17000)}\n[Slide 3]\nGeneric constraints ${"c".repeat(17000)}`;
  assert.equal(analysisChunks(source).join(""), source);
  assert.equal(analysisChunks(source).length, 2);
  const store = new Store(":memory:");
  const requests: {
    instructions: string;
    input: unknown[];
    options?: GenerationOptions;
  }[] = [];
  const plan = {
    title: "Mixed university topics",
    lessons: [
      {
        title: "Generics",
        objective: "T, reuse and constraints",
        references: ["Slide 1", "Slide 3"],
        conceptIds: ["1.1", "2.1"],
      },
      {
        title: "Management",
        objective: "Organizational decisions",
        references: ["Slide 2"],
        conceptIds: ["1.2"],
      },
    ],
  };
  const connection = {
    async refreshModels(): Promise<never> {
      throw new Error("Unexpected discovery");
    },
    async generate(
      _m: string,
      instructions: string,
      input: unknown[],
      _delta: unknown,
      options?: GenerationOptions,
    ) {
      requests.push({ instructions, input, options });
      if (options?.jsonSchema?.name === "source_inventory")
        return JSON.stringify({
          topics: JSON.stringify(input).includes("[Slide 1]")
            ? [
                {
                  concept: "Generics",
                  details: "T is a type parameter",
                  references: ["Slide 1"],
                },
                {
                  concept: "Management",
                  details: "Organizational decisions",
                  references: ["Slide 2"],
                },
              ]
            : [
                {
                  concept: "Constraints",
                  details: "Generic constraints bound valid type arguments",
                  references: ["Slide 3"],
                },
              ],
        });
      return JSON.stringify(plan);
    },
  };
  try {
    store.setting("model", "fixture");
    const learning = new Learning(store, connection, () => {});
    const result = await learning.plan({
      id: randomUUID(),
      name: "mixed.pptx",
      kind: "pptx",
      text: source,
      images: [],
      warning: "",
    });
    assert.equal(requests.length, 4); // two extraction requests, one global plan, one coverage audit
    assert.equal(result.lessons.length, 2);
    assert.deepEqual(result.lessons[0]!.references, ["Slide 1", "Slide 3"]);
    assert.match(requests[2]!.instructions, /Never use fixed page intervals/);
    assert.match(JSON.stringify(requests[2]!.input), /Constraints/);
    assert.ok(store.settings()[`coverage:${result.course!.id}`]);
    assert.equal(result.course!.completed, 0);
    // The same input must never mutate the existing course.
    store.activate(result.lessons[0]!.id);
    store.complete(result.lessons[0]!.id, randomUUID());
    const existing = store.snapshot(result.course!.id);
    plan.lessons[0]!.conceptIds = ["1.1"];
    await assert.rejects(
      learning.plan({
        id: randomUUID(),
        name: "mixed.pptx",
        kind: "pptx",
        text: source,
        images: [],
        warning: "",
      }),
      /could not verify/,
    );
    assert.equal(store.courses().length, 1);
    assert.deepEqual(
      store.snapshot(result.course!.id).lessons,
      existing.lessons,
    );
  } finally {
    store.close();
  }
});
