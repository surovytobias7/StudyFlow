import { test } from "node:test";
import assert from "node:assert/strict";
import { localizeMessage } from "./localization.js";
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
