import { readFile, mkdir, copyFile, stat } from "node:fs/promises";
import { extname, basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type { Material } from "./domain.js";

const LIMIT = 30 * 1024 * 1024;
export async function importMaterial(
  path: string,
  directory: string,
): Promise<Material> {
  const size = (await stat(path)).size;
  if (size > LIMIT || size === 0)
    throw new Error("Choose a non-empty file smaller than 30 MB.");
  const ext = extname(path).toLowerCase();
  if (
    ![
      ".pdf",
      ".pptx",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".txt",
      ".md",
    ].includes(ext)
  )
    throw new Error(
      "Supported files: PDF, PPTX, PNG, JPG, WebP, TXT and Markdown.",
    );
  const bytes = await readFile(path);
  const id = randomUUID();
  const material: Material = {
    id,
    name: basename(path),
    kind: ext.slice(1),
    text: "",
    images: [],
    warning: "",
  };
  if (ext === ".pdf") {
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
      throw new Error("This file is not a valid PDF.");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    });
    const doc = await task.promise;
    try {
      if (doc.numPages > 500)
        throw new Error(
          "Please split PDFs longer than 500 pages into smaller documents.",
        );
      for (let page = 1; page <= doc.numPages; page++) {
        const content = await (await doc.getPage(page)).getTextContent();
        material.text +=
          `\n[Page ${page}]\n` +
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ") +
          "\n";
      }
    } finally {
      await task.destroy();
    }
    material.warning =
      "PDF text extracted with page references. Diagrams and scanned pages are not interpreted; import screenshots for visual explanations.";
    if (material.text.replace(/\[Page \d+\]/g, "").trim().length < 20)
      throw new Error(
        "This PDF contains little or no selectable text. Import screenshots of its pages instead.",
      );
  } else if (ext === ".pptx") {
    let expanded = 0;
    const archive = unzipSync(new Uint8Array(bytes), {
      filter(file) {
        expanded += file.originalSize;
        if (expanded > 150 * 1024 * 1024)
          throw new Error(
            "Presentation expands beyond the 150 MB safety limit.",
          );
        return /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml|media\/[^/]+\.(png|jpe?g|webp))$/i.test(
          file.name,
        );
      },
    });
    let slides = Object.keys(archive)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort(
        (a, b) =>
          Number(a.match(/slide(\d+)/)?.[1]) -
          Number(b.match(/slide(\d+)/)?.[1]),
      );
    if (
      archive["ppt/presentation.xml"] &&
      archive["ppt/_rels/presentation.xml.rels"]
    ) {
      const indexParser = new XMLParser({
        ignoreAttributes: false,
        processEntities: false,
      });
      const index = indexParser.parse(
        new TextDecoder().decode(archive["ppt/presentation.xml"]),
      );
      const rels = indexParser.parse(
        new TextDecoder().decode(archive["ppt/_rels/presentation.xml.rels"]),
      );
      const list = <T>(value: T | T[] | undefined): T[] =>
        value ? (Array.isArray(value) ? value : [value]) : [];
      const mapping = new Map(
        list<Record<string, string>>(rels.Relationships?.Relationship).map(
          (rel) => [rel["@_Id"], rel["@_Target"]],
        ),
      );
      const order = list<Record<string, string>>(
        index["p:presentation"]?.["p:sldIdLst"]?.["p:sldId"],
      ).map((slide) => {
        const target = mapping.get(slide["@_r:id"]);
        return target?.startsWith("/") ? target.slice(1) : `ppt/${target}`;
      });
      if (order.length && order.every((name) => archive[name])) slides = order;
      else
        throw new Error(
          "The presentation slide order could not be resolved safely.",
        );
    }
    if (!slides.length || slides.length > 500)
      throw new Error("Presentation must contain between 1 and 500 slides.");
    const parser = new XMLParser({
      ignoreAttributes: true,
      processEntities: false,
    });
    function texts(node: unknown): string[] {
      if (!node || typeof node !== "object") return [];
      if (Array.isArray(node)) return node.flatMap(texts);
      return Object.entries(node).flatMap(([key, value]) =>
        key === "a:t" ? [String(value)] : texts(value),
      );
    }
    for (const [index, slide] of slides.entries())
      material.text += `\n[Slide ${index + 1}]\n${texts(parser.parse(new TextDecoder().decode(archive[slide]))).join("\n")}\n`;
    material.warning =
      "Slide text is kept in slide order. Embedded images are included separately; slide layout and charts are not rendered. Import screenshots for diagrams that need exact visual context.";
    for (const name of Object.keys(archive)
      .filter((name) => name.startsWith("ppt/media/"))
      .slice(0, 12)) {
      const data = archive[name]!;
      if (data.length > 3 * 1024 * 1024) continue;
      const mime = /\.png$/i.test(name)
        ? "image/png"
        : /\.webp$/i.test(name)
          ? "image/webp"
          : "image/jpeg";
      material.images.push({
        label: `Embedded image ${basename(name)} (slide attribution unavailable)`,
        url: `data:${mime};base64,${Buffer.from(data).toString("base64")}`,
      });
    }
  } else if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    const png = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp =
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP";
    if (!png && !jpeg && !webp) throw new Error("Image signature is invalid.");
    if (size > 10 * 1024 * 1024)
      throw new Error("Please use an image smaller than 10 MB.");
    const mime = png ? "image/png" : jpeg ? "image/jpeg" : "image/webp";
    material.images.push({
      label: "[Image 1]",
      url: `data:${mime};base64,${bytes.toString("base64")}`,
    });
    material.text =
      "[Image 1] Uploaded educational image; analyze its visible content.";
  } else
    material.text = `[Source: ${material.name}]\n${bytes.toString("utf8")}`;
  if (material.text.length > 600_000)
    throw new Error(
      "This document is too large. Split it into smaller study sections.",
    );
  if (material.text.trim().length < 20 && !material.images.length)
    throw new Error("No usable learning content was found.");
  await mkdir(directory, { recursive: true });
  await copyFile(path, join(directory, `${id}${ext}`));
  return material;
}
