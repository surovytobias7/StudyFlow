import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorization,
  validateCallback,
  responseBody,
  consumeStream,
  consumeResponse,
  SCOPES,
} from "./protocol.js";

const pending = () =>
  authorization("urn:uuid:host", "http://127.0.0.1:12345/auth/callback");
const callback = (state: string, client = "oaiapp_test") =>
  new URL(
    `http://127.0.0.1:12345/auth/callback?code=test&state=${state}&client_id=${client}`,
  );
function stream(text: string, chunkSize = 7) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize)
        controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  });
}
const event = (value: unknown) => `data: ${JSON.stringify(value)}\r\n\r\n`;

test("new registration requests explicit plan scopes and fresh PKCE/state/nonce", () => {
  const a = pending(),
    b = pending();
  assert.equal(a.url.origin, "https://auth.openai.com");
  assert.equal(a.url.searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(a.url.searchParams.get("scope"), SCOPES);
  assert.equal(a.url.searchParams.get("agent_name_hint"), "StudyFlow");
  assert.equal(a.url.searchParams.get("code_challenge_method"), "S256");
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.nonce, b.nonce);
  assert.notEqual(a.verifier, b.verifier);
  assert.equal(a.verifier.length, 43);
});
test("callback rejects forged state, missing issued ID, declined consent and mismatched registration", () => {
  const a = pending();
  assert.throws(() => validateCallback(callback("wrong"), a), /state/);
  assert.throws(
    () => validateCallback(callback(a.state, "dynamic_agent_client"), a),
    /issued/,
  );
  const denied = callback(a.state);
  denied.searchParams.set("error", "access_denied");
  assert.throws(() => validateCallback(denied, a), /declined/);
  const returning = authorization("host", a.redirect, "oaiapp_saved");
  assert.equal(returning.url.searchParams.has("agent_name_hint"), false);
  assert.throws(
    () => validateCallback(callback(returning.state), returning),
    /match/,
  );
});
test("returning sign-in can omit client ID and retains original registration", () => {
  const a = authorization(
    "host",
    "http://127.0.0.1:12345/auth/callback",
    "oaiapp_saved",
  );
  const url = callback(a.state);
  url.searchParams.delete("client_id");
  assert.equal(validateCallback(url, a).clientId, "oaiapp_saved");
});
test("response contract has only supported fields and explicit input history", () => {
  const body = responseBody("account-model");
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.ok(Array.isArray(body.input));
  assert.deepEqual(Object.keys(body).sort(), [
    "input",
    "instructions",
    "model",
    "store",
    "stream",
  ]);
  assert.match(body.instructions, /only the requested lesson/);
});
test("SSE handles split UTF-8, CRLF and a completed event", async () => {
  const deltas: string[] = [];
  const text =
    event({ type: "response.output_text.delta", delta: "Trieda → objekt" }) +
    event({ type: "response.completed" });
  assert.equal(
    await consumeStream(stream(text, 1), (value) => deltas.push(value)),
    "Trieda → objekt",
  );
  assert.equal(deltas.join(""), "Trieda → objekt");
});
test("partial text without terminal completion is not a success", async () => {
  await assert.rejects(
    consumeStream(
      stream(event({ type: "response.output_text.delta", delta: "Partial" })),
      () => {},
    ),
    /without response.completed/,
  );
});
test("usage-limit failures after text arrives fail the verification", async () => {
  await assert.rejects(
    consumeStream(
      stream(
        event({ type: "response.output_text.delta", delta: "Hello" }) +
          event({
            type: "response.failed",
            response: {
              error: { code: "subscription_sharing_usage_limit_exceeded" },
            },
          }),
      ),
      () => {},
    ),
    /subscription_sharing_usage_limit_exceeded/,
  );
});
test("incomplete and empty responses are not accepted", async () => {
  await assert.rejects(
    consumeStream(stream(event({ type: "response.incomplete" })), () => {}),
    /incomplete/,
  );
  await assert.rejects(
    consumeStream(stream(event({ type: "response.completed" })), () => {}),
    /without a text/,
  );
});

test("valid SSE without a Content-Type header still requires completed text", async () => {
  const response = new Response(
    stream(
      event({
        type: "response.output_text.delta",
        delta: "A class is a blueprint.",
      }) + event({ type: "response.completed" }),
    ),
  );
  assert.equal(response.headers.get("content-type"), null);
  assert.equal(
    await consumeResponse(response, () => {}),
    "A class is a blueprint.",
  );
});
test("missing Content-Type does not permit JSON or truncated streams to pass", async () => {
  await assert.rejects(
    consumeResponse(new Response(stream('{"ok":true}')), () => {}),
    /without response.completed/,
  );
  await assert.rejects(
    consumeResponse(
      new Response(
        stream(event({ type: "response.output_text.delta", delta: "Partial" })),
      ),
      () => {},
    ),
    /without response.completed/,
  );
});
test("explicit non-SSE content type is rejected", async () => {
  await assert.rejects(
    consumeResponse(
      new Response("{}", { headers: { "Content-Type": "application/json" } }),
      () => {},
    ),
    /Expected a streaming response/,
  );
});
