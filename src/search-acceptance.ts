import { app } from "electron";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import type { Connection } from "./connection.js";
import type { SearchEvidence } from "./protocol.js";

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
    const text = await connection.generate(
      model,
      "Search the live web. Prefer the official Python website. Answer in English in two sentences and cite your source. Do not invent search results.",
      [
        {
          role: "user",
          content:
            "Search the web for the current stable Python release listed on python.org/downloads. Give its version and release date.",
        },
      ],
      () => {},
      {
        webSearch: "required",
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
    result.passed = true;
    console.info(
      "PASS: authenticated official web_search completed with URL citations",
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
