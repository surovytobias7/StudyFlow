import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { importMaterial } from "./materials.js";

test("file validation rejects invalid images, PDFs, empty and unsupported files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "studyflow-files-"));
  try {
    for (const [name, body, expected] of [
      ["bad.png", "not an image", /signature/],
      ["bad.pdf", "not a PDF", /valid PDF/],
      ["empty.txt", "", /non-empty/],
      ["bad.exe", "executable", /Supported files/],
    ] as const) {
      const path = join(directory, name);
      await writeFile(path, body);
      await assert.rejects(
        importMaterial(path, join(directory, "materials")),
        expected,
      );
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});
test("PPTX numeric slide ordering and references survive extraction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "studyflow-slides-"));
  try {
    const path = join(directory, "oop.pptx");
    await writeFile(
      path,
      zipSync({
        "ppt/slides/slide10.xml": strToU8(
          "<p:sld><a:t>Inheritance</a:t></p:sld>",
        ),
        "ppt/slides/slide2.xml": strToU8(
          "<p:sld><a:t>Properties</a:t></p:sld>",
        ),
        "ppt/slides/slide1.xml": strToU8(
          "<p:sld><a:t>Classes and objects</a:t></p:sld>",
        ),
      }),
    );
    const material = await importMaterial(path, join(directory, "materials"));
    assert.match(material.text, /\[Slide 1\]\nClasses and objects/);
    assert.ok(
      material.text.indexOf("Properties") <
        material.text.indexOf("Inheritance"),
    );
    assert.match(material.warning, /not rendered/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
test("PPTX uses presentation relationships when slides were reordered", async () => {
  const directory = await mkdtemp(join(tmpdir(), "studyflow-order-"));
  try {
    const path = join(directory, "reordered.pptx");
    await writeFile(
      path,
      zipSync({
        "ppt/presentation.xml": strToU8(
          '<p:presentation><p:sldIdLst><p:sldId r:id="rId2"/><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>',
        ),
        "ppt/_rels/presentation.xml.rels": strToU8(
          '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
        ),
        "ppt/slides/slide1.xml": strToU8(
          "<p:sld><a:t>Second concept in actual order</a:t></p:sld>",
        ),
        "ppt/slides/slide2.xml": strToU8(
          "<p:sld><a:t>First concept in actual order</a:t></p:sld>",
        ),
      }),
    );
    const material = await importMaterial(path, join(directory, "materials"));
    assert.match(material.text, /\[Slide 1\]\nFirst concept/);
    assert.match(material.text, /\[Slide 2\]\nSecond concept/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
