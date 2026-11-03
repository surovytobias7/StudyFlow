import { test } from "node:test";
import assert from "node:assert/strict";
import { mathMarkdown } from "./markdown.js";

test("real model LaTeX delimiters render as math without changing code or existing dollar notation", () => {
  assert.equal(mathMarkdown("Slope \\(f'(2)=4\\)."), "Slope $f'(2)=4$.");
  assert.equal(mathMarkdown("\\[y=-2x-1\\]"), "\n$$\ny=-2x-1\n$$\n");
  const code =
    '```csharp\nvar formula = @"\\(x\\)";\n```\n`\\(code\\)` and $x^2$';
  assert.equal(mathMarkdown(code), code);
});
