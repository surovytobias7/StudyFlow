import { app } from "electron";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import type { Connection } from "./connection.js";
import type { SearchEvidence } from "./protocol.js";
import { searchOptions, researchInstructions } from "./search.js";

// Uses only the existing encrypted ChatGPT registration; never prints credentials.
export async function searchAcceptance(connection: Connection) {
  const directory = join(
    app.getPath("userData"),
    "acceptance",
    `web-${Date.now()}`,
  );
  await mkdir(directory, { recursive: true });
  const result: Record<string, unknown> = {
    testedAt: new Date().toISOString(),
    endpoint: "https://api.openai.com/v1/responses",
    tool: "web_search",
    store: false,
    stream: true,
  };
  try {
    const status = await connection.refreshModels();
    assert.ok(status.models[0], "No account models available");
    const model = status.models[0].slug;
    result.model = model;
    let evidence: SearchEvidence | undefined;
    const question =
      "What is the current stable Python version and release date today? Cross-check official python.org/downloads against an independently maintained source, explain any conflict, and cite both. Keep the answer concise.";
    const text = await connection.generate(
      model,
      researchInstructions +
        " Answer in English concisely. This verification needs at least two independent sources.",
      [
        {
          role: "user",
          content: question,
        },
      ],
      () => {},
      {
        ...searchOptions(question, false),
        evidence: (value) => {
          evidence = value;
        },
      },
    );
    result.evidence = evidence;
    result.text = text;
    assert.ok(evidence && evidence.calls > 0, "No completed web_search_call");
    assert.ok(
      evidence.citations > 0,
      "No official URL citation annotations returned",
    );
    assert.match(text, /\]\(https?:\/\//);
    assert.ok(
      evidence.citations >= 2,
      "Verification did not return multiple cited sources",
    );
    result.passed = true;
    console.info(
      "PASS: automatic official web_search without toggle, cross-source verification and URL citations",
      model,
      JSON.stringify(evidence),
    );
  } catch (error) {
    result.passed = false;
    result.error = (error as Error).message;
    throw error;
  } finally {
    await writeFile(
      join(directory, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.info("Web search evidence:", join(directory, "result.json"));
  }
}
