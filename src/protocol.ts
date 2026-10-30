import { createHash, randomBytes } from 'node:crypto';

export const AUTH = 'https://auth.openai.com';
export const API = 'https://api.openai.com/v1';
export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const randomSecret = () => randomBytes(32).toString('base64url');

export function authorization(host: string, redirect: string, clientId?: string) {
  const state = randomSecret();
  const nonce = randomSecret();
  const verifier = randomSecret();
  const url = new URL(`${AUTH}/api/accounts/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId ?? 'dynamic_agent_client',
    ...(clientId ? {} : { agent_name_hint: 'StudyFlow' }),
    ext_agent_host_id: host, response_type: 'code', redirect_uri: redirect,
    scope: SCOPES, resource: API, state, nonce, code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString();
  return { state, nonce, verifier, url, redirect, clientId };
}

export function validateCallback(url: URL, pending: ReturnType<typeof authorization>) {
  if (url.searchParams.get('state') !== pending.state) throw new Error('OAuth state mismatch. Start sign-in again.');
  if (url.searchParams.has('error')) throw new Error('Sign-in was declined or could not finish. Start sign-in again.');
  const clientId = url.searchParams.get('client_id') ?? pending.clientId;
  if (!clientId || clientId === 'dynamic_agent_client') throw new Error('Registration did not return an issued client ID.');
  if (pending.clientId && clientId !== pending.clientId) throw new Error('Returned registration does not match the selected account.');
  const code = url.searchParams.get('code');
  if (!code || code.length > 8192) throw new Error('Authorization code missing or invalid.');
  return { code, clientId };
}

export function responseBody(model: string) {
  return {
    model, store: false, stream: true,
    instructions: 'You are StudyFlow, a patient tutor. Explain only the requested lesson in at most three short sentences. Do not move to other lessons.',
    input: [{ role: 'user', content: 'Lesson 1: Classes and objects in C#. Explain the difference with one tiny example. Do not explain inheritance or other lessons.' }],
  };
}

export async function consumeResponse(response: Response, delta: (text: string) => void) {
  if (!response.ok) throw new Error(`Inference HTTP ${response.status}.`);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (!response.body || (contentType && contentType !== 'text/event-stream')) {
    await response.body?.cancel();
    throw new Error(`Expected a streaming response. HTTP ${response.status}; content type: ${contentType ?? 'missing'}; body: ${response.body ? 'present' : 'missing'}.`);
  }
  // Some network paths omit Content-Type. The SSE parser and required terminal
  // event still validate the actual protocol; a missing header alone is not failure.
  return consumeStream(response.body, delta);
}

export async function consumeStream(body: ReadableStream<Uint8Array>, delta: (text: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  let output = '';
  try {
    while (true) {
      const next = await reader.read();
      buffer += decoder.decode(next.value, { stream: !next.done });
      // Normalise CRLF only once a full line is present (a chunk may end in CR).
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = block.split(/\r?\n/).filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') continue;
        const event = JSON.parse(data);
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          output += event.delta;
          delta(event.delta);
        }
        if (['error', 'response.failed', 'response.incomplete'].includes(event.type)) {
          const code = event.response?.error?.code ?? event.error?.code ?? event.code ?? event.type;
          throw new Error(`Inference stopped: ${String(code).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 120)}. No alternate billing was used.`);
        }
        if (event.type === 'response.completed') completed = true;
      }
      if (next.done) break;
      if (buffer.length > 2_000_000) throw new Error('Stream event exceeds the safety limit.');
    }
    if (!completed) throw new Error('Stream ended without response.completed; integration is not verified.');
    if (!output.trim()) throw new Error('Response completed without a text explanation; integration is not verified.');
    return output;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
