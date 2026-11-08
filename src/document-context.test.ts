import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scopedMaterial,
  documentExcerpt,
  studyScopeSchema,
  requestedRange,
} from "./document-context.js";
import { Learning } from "./learning.js";
import { Store } from "./database.js";
import { searchOptions, type GenerationOptions } from "./search.js";

const material = () => ({
  id: randomUUID(),
  name: "OOP.pptx",
  kind: "pptx",
  text: "[Slide 1]\nClasses\n[Slide 2]\nPolymorphism and virtual methods\n[Slide 3]\nManagement",
  images: [],
  warning: "",
});
test("focused learning filters explicit and natural-language ranges without renumbering references", () => {
  const source = material();
  assert.equal(
    scopedMaterial(source, { instructions: "", from: 2, to: 2 }).text,
    "[Slide 2]\nPolymorphism and virtual methods\n",
  );
  assert.equal(
    scopedMaterial(source, { instructions: "Teach slides 2–2" }).text.includes(
      "Management",
    ),
    false,
  );
  assert.deepEqual(requestedRange("Vysvetli snímky 15 až 25"), {
    from: 15,
    to: 25,
  });
  assert.throws(
    () => scopedMaterial(source, { instructions: "pages 8–10" }),
    /not found/,
  );
  assert.equal(studyScopeSchema.safeParse({ from: 5, to: 2 }).success, false);
  assert.equal(studyScopeSchema.safeParse({ from: 1 }).success, false);
  const text =
    "[Page 1]\n" +
    "unrelated ".repeat(6000) +
    "\n[Page 12]\nImportant formula E=mc2";
  assert.match(
    documentExcerpt(
      { name: "physics.pdf", kind: "pdf", text, images: [] },
      "Explain page 12",
      4000,
    ),
    /E=mc2/,
  );
  assert.doesNotMatch(
    documentExcerpt(
      { name: "physics.pdf", kind: "pdf", text, images: [] },
      "Explain page 12",
      4000,
    ),
    /unrelated/,
  );
});
test("focused plan and scope persist; tutor receives only selected pages and progress still works", async () => {
  const dir = mkdtempSync(join(tmpdir(), "studyflow-scope-")),
    file = join(dir, "test.sqlite");
  let store = new Store(file);
  const requests: { instructions: string; input: unknown[] }[] = [];
  const connection = {
    async refreshModels(): Promise<never> {
      throw new Error("Unexpected model discovery");
    },
    async generate(_m: string, instructions: string, input: unknown[]) {
      requests.push({ instructions, input });
      if (instructions.startsWith("Analyze ALL"))
        return JSON.stringify({
          topics: [
            {
              concept: "Polymorphism",
              details: "Virtual dispatch",
              references: ["Slide 2"],
            },
          ],
        });
      return instructions.startsWith("Design")
        ? JSON.stringify({
            title: "Focused OOP",
            lessons: [
              {
                title: "Polymorphism",
                objective: "Understand virtual dispatch",
                references: ["Slide 2"],
                conceptIds: ["1.1"],
              },
            ],
          })
        : "Focused explanation";
    },
  };
  try {
    store.setting("model", "fixture");
    const learning = new Learning(store, connection, () => {});
    const snapshot = await learning.plan(material(), {
      instructions: "Only polymorphism",
      from: 2,
      to: 2,
    });
    assert.match(requests[0]!.instructions, /ONLY the requested topics/);
    assert.doesNotMatch(
      JSON.stringify(requests[0]!.input),
      /Management|Classes/,
    );
    const id = snapshot.course!.id,
      lesson = snapshot.lessons[0]!.id;
    assert.match(store.materials(id)[0]!.text, /Management/); // Entire original is retained.
    store.close();
    store = new Store(file);
    const resumed = new Learning(store, connection, () => {});
    store.activate(lesson);
    await resumed.chat(lesson, "");
    await resumed.chat(lesson, "Give an example");
    assert.match(requests.at(-1)!.instructions, /Only polymorphism/);
    assert.doesNotMatch(JSON.stringify(requests.at(-1)!.input), /Management/);
    assert.equal(store.complete(lesson, randomUUID()).course!.completed, 1);
    assert.equal(store.messages(lesson).length, 3);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("old attachments remain usable beyond the rolling chat window, with no course creation", async () => {
  const store = new Store(":memory:");
  let request: unknown[] = [];
  let options: GenerationOptions | undefined;
  const connection = {
    async refreshModels(): Promise<never> {
      throw new Error("Unexpected model discovery");
    },
    async generate(
      _m: string,
      _i: string,
      input: unknown[],
      _d: unknown,
      o?: GenerationOptions,
    ) {
      request = input;
      options = o;
      return "Answer";
    },
  };
  try {
    store.setting("model", "fixture");
    const id = store.createNormalConversation("en").conversation!.id;
    store.addNormalMessage(id, "user", "Read this", [
      {
        name: "notes.pdf",
        kind: "pdf",
        text: "[Page 12]\nFormula abc123",
        images: [],
      },
    ]);
    for (let n = 0; n < 40; n++)
      store.addNormalMessage(
        id,
        n % 2 ? "assistant" : "user",
        `Earlier message ${n}`,
      );
    const learning = new Learning(store, connection, () => {});
    await learning.normalChat(id, "Explain page 12", []);
    assert.match(JSON.stringify(request), /Formula abc123/);
    assert.equal(store.courses().length, 0);
    assert.deepEqual(options, { webSearch: "auto" });
    await learning.normalChat(id, "Search the web for useful sources", []);
    assert.deepEqual(options, { webSearch: "required" });
    assert.equal(
      store.normalMessages(id)[0]!.attachments[0]!.text,
      "[Page 12]\nFormula abc123",
    );
  } finally {
    store.close();
  }
});
test("automatic research offers official tools without forcing a search for stable concepts", () => {
  assert.deepEqual(searchOptions("Explain a class", false), {
    webSearch: "auto",
  });
  assert.deepEqual(
    searchOptions("Find additional explanations of this concept.", false),
    { webSearch: "required" },
  );
  assert.deepEqual(searchOptions("Explain a class", true), {
    webSearch: "auto",
    researchDepth: "deep",
  });
  assert.deepEqual(searchOptions("Nájdi zdroje na internete", false), {
    webSearch: "required",
  });
});

test("ranked excerpts retain the original page label when the relevant passage is deep inside a long page", () => {
  const text =
    "[Page 1]\n" +
    "Introduction. ".repeat(1000) +
    "\n[Page 12]\n" +
    "Background without the requested concept. ".repeat(220) +
    "Polymorphism uses virtual dispatch to select an override at runtime. ".repeat(
      60,
    );
  const excerpt = documentExcerpt(
    { name: "long.pdf", kind: "pdf", text, images: [] },
    "Explain polymorphism and virtual dispatch",
    4000,
  );
  assert.ok(excerpt.length <= 4000);
  const passage = excerpt
    .split("\n[…]\n")
    .find((part) => part.includes("Polymorphism"));
  assert.ok(passage, "The relevant passage must be selected");
  assert.match(passage, /^\[Page 12\]/);
  assert.match(excerpt, /Selected excerpts only/);
});
