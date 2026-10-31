import { test } from "node:test";
import assert from "node:assert/strict";
import { localizeMessage } from "./localization.js";
test("plan-limit notices explain recovery in both languages and retain diagnostics", () => {
  assert.match(
    localizeMessage("OpenAI HTTP 429: usage_limit.", "sk"),
    /limit používania ChatGPT/,
  );
  assert.match(
    localizeMessage("OpenAI HTTP 429: usage_limit.", "en"),
    /Try again later/,
  );
  assert.match(
    localizeMessage("Inference stopped: usage_limit.", "sk"),
    /usage_limit/,
  );
});
test("application notices and import warnings translate independently of content language", () => {
  assert.equal(
    localizeMessage("Analyzing material 2/5", "sk"),
    "Analyzujem materiál 2/5",
  );
  assert.equal(
    localizeMessage("Analyzing material 2/5", "en"),
    "Analyzing material 2/5",
  );
  assert.equal(
    localizeMessage("Connect your ChatGPT account first.", "sk"),
    "Najprv pripoj svoj účet ChatGPT.",
  );
  assert.match(
    localizeMessage(
      "Only the supplied text is analyzed; no original audio or video was watched.",
      "sk",
    ),
    /iba dodaný text/,
  );
  assert.match(
    localizeMessage(
      "Inference stopped: usage_limit. No alternate billing was used.",
      "sk",
    ),
    /usage_limit/,
  );
  assert.equal(
    localizeMessage("Unexpected provider detail", "sk"),
    "Unexpected provider detail",
  );
});
