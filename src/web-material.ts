import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { getCACertificates } from "node:tls";
import { randomUUID } from "node:crypto";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { XMLParser } from "fast-xml-parser";
import type { Material } from "./domain.js";

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a !== undefined &&
      b !== undefined &&
      a > 0 &&
      a < 224 &&
      a !== 10 &&
      a !== 127 &&
      !(a === 169 && b === 254) &&
      !(a === 172 && b >= 16 && b <= 31) &&
      !(a === 192 && [0, 168].includes(b)) &&
      !(a === 100 && b >= 64 && b <= 127) &&
      !(a === 198 && [18, 19, 51].includes(b)) &&
      !(a === 203 && b === 0)
    );
  }
  // Conservatively allow globally routable IPv6 unicast only, excluding docs.
  return (
    isIP(address) === 6 &&
    /^[23]/i.test(address) &&
    !address.toLowerCase().startsWith("2001:db8:")
  );
}
async function publicText(url: URL, redirects = 0): Promise<string> {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error(
      "Use a public HTTPS URL without embedded credentials or a custom port.",
    );
  if (redirects > 4) throw new Error("Too many website redirects.");
  const addresses = await lookup(url.hostname, { all: true });
  const address = addresses[0];
  if (!address || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("Local and private network URLs cannot be imported.");
  // Pin the validated DNS answer for this request to prevent DNS rebinding.
  return new Promise<string>((resolve, reject) => {
    const req = request(
      url,
      {
        ca: [...getCACertificates("default"), ...getCACertificates("system")],
        headers: {
          "User-Agent": "StudyFlow/0.1 (personal educational reading)",
          Accept: "text/html,application/xml,text/plain",
        },
        lookup: (_host, _options, callback) =>
          callback(null, [
            { address: address.address, family: address.family },
          ]),
        timeout: 20_000,
      },
      (response) => {
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode ?? 0) &&
          response.headers.location
        ) {
          response.resume();
          publicText(
            new URL(response.headers.location, url),
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(
              `Website returned HTTP ${response.statusCode}. Paste the relevant text instead.`,
            ),
          );
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 5_000_000)
            req.destroy(new Error("Webpage exceeds the 5 MB import limit."));
          else chunks.push(chunk);
        });
        response.on("end", () =>
          resolve(Buffer.concat(chunks).toString("utf8")),
        );
        response.on("error", reject);
      },
    );
    req.on("timeout", () =>
      req.destroy(
        new Error(
          "Website request timed out. Paste the relevant text instead.",
        ),
      ),
    );
    req.on("error", reject);
    req.end();
  });
}
export async function importUrl(raw: string): Promise<Material> {
  const url = new URL(raw);
  const youtube = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
  ].includes(url.hostname);
  if (youtube) {
    const id =
      url.hostname === "youtu.be"
        ? url.pathname.slice(1)
        : (url.searchParams.get("v") ?? "");
    if (!/^[\w-]{11}$/.test(id))
      throw new Error(
        "Use a YouTube watch link or paste the transcript below.",
      );
    const xml = await publicText(
      new URL(`https://www.youtube.com/api/timedtext?type=list&v=${id}`),
    );
    const parser = new XMLParser({
      ignoreAttributes: false,
      processEntities: false,
    });
    const parsed = parser.parse(xml);
    const tracks = parsed.transcript_list?.track;
    const track = Array.isArray(tracks) ? tracks[0] : tracks;
    if (!track?.["@_lang_code"])
      throw new Error(
        "No publicly accessible captions were available. Paste a transcript below. StudyFlow has not watched the video.",
      );
    const params = new URLSearchParams({
      v: id,
      lang: String(track["@_lang_code"]),
      name: String(track["@_name"] ?? ""),
    });
    const captions = parser.parse(
      await publicText(
        new URL(`https://www.youtube.com/api/timedtext?${params}`),
      ),
    );
    const items = captions.transcript?.text;
    const text = (Array.isArray(items) ? items : items ? [items] : [])
      .map(
        (item: Record<string, string>) =>
          `[${item["@_start"]}s] ${item["#text"] ?? ""}`,
      )
      .join("\n");
    if (text.length < 20)
      throw new Error(
        "Captions could not be read. Paste a transcript below; the video itself was not analyzed.",
      );
    return {
      id: randomUUID(),
      name: `YouTube ${id}`,
      kind: "youtube",
      text: `[Transcript: ${url}]\n${text}`,
      images: [],
      warning:
        "Only publicly accessible captions were analyzed. No audio or video was processed.",
    };
  }
  const html = await publicText(url);
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document).parse();
  if (!article?.textContent || article.textContent.trim().length < 80)
    throw new Error(
      "No readable educational text was found. Paste the relevant text below.",
    );
  return {
    id: randomUUID(),
    name: (article.title || url.hostname).slice(0, 180),
    kind: "webpage",
    text: `[Source: ${url}]\n${article.textContent.slice(0, 600000)}`,
    images: [],
    warning:
      "Readable webpage text only. Interactive content and diagrams are not captured.",
  };
}
