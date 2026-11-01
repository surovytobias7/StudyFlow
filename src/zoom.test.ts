import { test } from "node:test";
import assert from "node:assert/strict";
import { nextZoom, validZoom, zoomShortcut } from "./zoom.js";

test("zoom recognizes main keyboard, shifted plus and numpad without capturing typing or AltGr", () => {
  for (const key of ["+", "=", "Add"])
    assert.equal(zoomShortcut({ type: "keyDown", key, control: true }), "in");
  for (const code of ["Equal", "NumpadAdd"])
    assert.equal(
      zoomShortcut({
        type: "keyDown",
        key: "Unidentified",
        code,
        control: true,
      }),
      "in",
    );
  for (const code of ["Minus", "NumpadSubtract"])
    assert.equal(
      zoomShortcut({
        type: "keyDown",
        key: "Unidentified",
        code,
        control: true,
      }),
      "out",
    );
  for (const code of ["Digit0", "Numpad0"])
    assert.equal(
      zoomShortcut({
        type: "keyDown",
        key: "Unidentified",
        code,
        control: true,
      }),
      "reset",
    );
  assert.equal(
    zoomShortcut({ type: "keyDown", key: "-", control: true }),
    "out",
  );
  assert.equal(zoomShortcut({ type: "keyDown", key: "+" }), undefined);
  assert.equal(
    zoomShortcut({ type: "keyDown", key: "+", control: true, alt: true }),
    undefined,
  );
  assert.equal(
    zoomShortcut({ type: "keyUp", key: "+", control: true }),
    undefined,
  );
  assert.equal(
    zoomShortcut({ type: "keyDown", key: "c", control: true }),
    undefined,
  );
});
test("zoom uses bounded stable steps and recovers from invalid saved values", () => {
  assert.equal(nextZoom(1, "in"), 1.1);
  assert.equal(nextZoom(1.1, "out"), 1);
  assert.equal(nextZoom(2, "in"), 2);
  assert.equal(nextZoom(0.65, "out"), 0.65);
  assert.equal(nextZoom(1.5, "reset"), 1);
  for (const value of [undefined, "bad", -1, 0, 3])
    assert.equal(validZoom(value), 1);
  assert.equal(validZoom("1.25"), 1.25);
});
