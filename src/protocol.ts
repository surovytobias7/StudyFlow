import { createHash, randomBytes } from "node:crypto";

export const AUTH = "https://auth.openai.com";
export const API = "https://api.openai.com/v1";
export const SCOPES =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export type SearchEvidence = { calls: number; citations: number };
export type StreamOptions = {
  requireSearch?: boolean;
  evidence?: (result: SearchEvidence) => void;
};

export function citedText(text: string, annotations: unknown[]) {
  const sources: { url: string; title: string }[] = [];
  const edits: { start: number; end: number; label: string }[] = [];
  for (const value of annotations) {
    if (!value || typeof value !== "object") continue;
    const a = value as Record<string, unknown>;
    if (a.type !== "url_citation" || typeof a.url !== "string") continue;
    let url: URL;
    try {
      url = new URL(a.url);
    } catch {
      continue;
    }
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      continue;
    const href = url.href.replace(/[()<>]/g, (c) => encodeURIComponent(c));
    let index = sources.findIndex((s) => s.url === href);
    if (index < 0) {
      index = sources.length;
      sources.push({
        url: href,
        title: String(a.title || url.hostname)
          .replace(/[\[\]<>\r\n\\]/g, " ")
          .slice(0, 240),
      });
    }
    if (Number.isInteger(a.start_index) && Number.isInteger(a.end_index)) {
      const start = Number(a.start_index),
        end = Number(a.end_index);
      if (start >= 0 && end >= start && end <= text.length) {
        const span = text.slice(start, end);
        const marker =
          /^\s*(?:\(?\[[^\]]+\]\(https?:\/\/[^)]+\)\)?|cite[\s\S]*?|\[cite\])\s*$/u.test(
            span,
          );
        edits.push({
          start,
          end,
          label: `${marker ? "" : span} [${index + 1}](${href})`,
        });
      }
    }
  }
  let boundary = text.length;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    if (edit.end > boundary) continue;
    text = text.slice(0, edit.start) + edit.label + text.slice(edit.end);
    boundary = edit.start;
  }
  if (sources.length)
    text +=
      "\n\n---\n**Web**\n" +
      sources.map((s, i) => `\n${i + 1}. [${s.title}](${s.url})`).join("");
  return { text, count: sources.length };
}
export const randomSecret = () => randomBytes(32).toString("base64url");

export function authorization(
  host: string,
  redirect: string,
  clientId?: string,
) {
  const state = randomSecret();
  const nonce = randomSecret();
  const verifier = randomSecret();
  const url = new URL(`${AUTH}/api/accounts/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId ?? "dynamic_agent_client",
    ...(clientId ? {} : { agent_name_hint: "StudyFlow" }),
    ext_agent_host_id: host,
    response_type: "code",
    redirect_uri: redirect,
    scope: SCOPES,
    resource: API,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  }).toString();
  return { state, nonce, verifier, url, redirect, clientId };
}

export function validateCallback(
  url: URL,
  pending: ReturnType<typeof authorization>,
) {
  if (url.searchParams.get("state") !== pending.state)
    throw new Error("OAuth state mismatch. Start sign-in again.");
  if (url.searchParams.has("error"))
    throw new Error(
      "Sign-in was declined or could not finish. Start sign-in again.",
    );
  const clientId = url.searchParams.get("client_id") ?? pending.clientId;
  if (!clientId || clientId === "dynamic_agent_client")
    throw new Error("Registration did not return an issued client ID.");
  if (pending.clientId && clientId !== pending.clientId)
    throw new Error(
      "Returned registration does not match the selected account.",
    );
  const code = url.searchParams.get("code");
  if (!code || code.length > 8192)
    throw new Error("Authorization code missing or invalid.");
  return { code, clientId };
}

export function responseBody(model: string) {
  return {
    model,
    store: false,
    stream: true,
    instructions:
      "You are StudyFlow, a patient tutor. Explain only the requested lesson in at most three short sentences. Do not move to other lessons.",
    input: [
      {
        role: "user",
        content:
          "Lesson 1: Classes and objects in C#. Explain the difference with one tiny example. Do not explain inheritance or other lessons.",
      },
    ],
  };
}

export async function consumeResponse(
  response: Response,
  delta: (text: string) => void,
  options: StreamOptions = {},
) {
  if (!response.ok) throw new Error(`Inference HTTP ${response.status}.`);
  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (!response.body || (contentType && contentType !== "text/event-stream")) {
    await response.body?.cancel();
    throw new Error(
      `Expected a streaming response. HTTP ${response.status}; content type: ${contentType ?? "missing"}; body: ${response.body ? "present" : "missing"}.`,
    );
  }
  // Some network paths omit Content-Type. The SSE parser and required terminal
  // event still validate the actual protocol; a missing header alone is not failure.
  return consumeStream(response.body, delta, options);
}

export async function consumeStream(
  body: ReadableStream<Uint8Array>,
  delta: (text: string) => void,
  options: StreamOptions = {},
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  let output = "";
  let searchCalls = 0;
  let finalText: string | undefined;
  let citationCount = 0;
  const streamedItems = new Map<number, any>();
  try {
    while (true) {
      const next = await reader.read();
      buffer += decoder.decode(next.value, { stream: !next.done });
      // Normalise CRLF only once a full line is present (a chunk may end in CR).
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        const event = JSON.parse(data);
        if (event.type === "response.output_item.done" && event.item)
          streamedItems.set(
            event.output_index ?? streamedItems.size,
            event.item,
          );
        if (
          event.type === "response.output_text.delta" &&
          typeof event.delta === "string"
        ) {
          output += event.delta;
          delta(event.delta);
        }
        if (
          ["error", "response.failed", "response.incomplete"].includes(
            event.type,
          )
        ) {
          const code =
            event.response?.error?.code ??
            event.error?.code ??
            event.code ??
            event.type;
          throw new Error(
            `Inference stopped: ${String(code)
              .replace(/[^a-zA-Z0-9_.-]/g, "")
              .slice(0, 120)}. No alternate billing was used.`,
          );
        }
        if (event.type === "response.web_search_call.completed") searchCalls++;
        if (event.type === "response.completed") {
          completed = true;
          // Subscription-sharing streams can omit output from the terminal envelope.
          const terminal = Array.isArray(event.response?.output)
            ? event.response.output
            : [];
          const items = terminal.length
            ? terminal
            : [...streamedItems.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([, item]) => item);
          searchCalls = Math.max(
            searchCalls,
            items.filter(
              (item: any) =>
                item.type === "web_search_call" && item.status === "completed",
            ).length,
          );
          const texts = items
            .filter((item: any) => item.type === "message")
            .flatMap((item: any) => item.content ?? [])
            .filter(
              (part: any) =>
                part.type === "output_text" && typeof part.text === "string",
            );
          if (texts.length) {
            finalText = texts
              .map((part: any) => {
                const cited = citedText(
                  part.text,
                  searchCalls ? (part.annotations ?? []) : [],
                );
                citationCount += cited.count;
                return cited.text;
              })
              .join("\n\n");
          }
        }
      }
      if (next.done) break;
      if (buffer.length > 2_000_000)
        throw new Error("Stream event exceeds the safety limit.");
    }
    if (!completed)
      throw new Error(
        "Stream ended without response.completed; integration is not verified.",
      );
    if (!output.trim())
      throw new Error(
        "Response completed without a text explanation; integration is not verified.",
      );
    options.evidence?.({ calls: searchCalls, citations: citationCount });
    if (options.requireSearch && !searchCalls)
      throw new Error(
        "The model did not perform the requested web search. No search results were verified.",
      );
    return finalText ?? output;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
