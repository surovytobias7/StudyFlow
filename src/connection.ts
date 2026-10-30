import { app, safeStorage, shell, net } from 'electron';
import { createServer, type Server } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';
import { API, AUTH, authorization, validateCallback, responseBody, consumeResponse } from './protocol.js';

type Registration = {
  clientId: string; subject: string; email: string;
  accessToken?: string; refreshToken?: string; idToken?: string;
  scopes: string[]; expiresAt: number;
};
type State = { hostId: string; registration?: Registration };

export class Connection {
  private state!: State;
  private busy = false;
  private models: { slug: string; display_name: string }[] = [];
  private verified = false;
  private listener?: Server;
  private cancelLogin?: () => void;
  private abort?: AbortController;
  constructor(private emit: (kind: string, text: string) => void) {}

  private get file() { return join(app.getPath('userData'), 'account.credentials'); }

  async init() {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential protection is unavailable. Credentials will not be saved in plaintext.');
    try {
      this.state = JSON.parse(safeStorage.decryptString(await readFile(this.file)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Protected account storage could not be read. No existing credentials were overwritten.');
      this.state = { hostId: `urn:uuid:${randomUUID()}` };
      await this.save();
    }
  }

  private async save() {
    await mkdir(app.getPath('userData'), { recursive: true });
    await writeFile(`${this.file}.tmp`, safeStorage.encryptString(JSON.stringify(this.state)), { mode: 0o600 });
    await rename(`${this.file}.tmp`, this.file);
  }

  status() {
    const r = this.state.registration;
    return { connected: !!r?.accessToken, planEnabled: !!r?.scopes.includes('chatgpt.tokens.use.direct'),
      account: r?.email || '', busy: this.busy, models: this.models, verified: this.verified };
  }

  private async exclusive<T>(work: () => Promise<T>) {
    if (this.busy) throw new Error('An operation is already running.');
    this.busy = true;
    this.abort = new AbortController();
    try { return await work(); }
    finally { this.busy = false; this.abort = undefined; }
  }

  private async request(url: string, init?: RequestInit) {
    const signal = AbortSignal.any([AbortSignal.timeout(45_000), ...(this.abort ? [this.abort.signal] : [])]);
    return net.fetch(url, { ...init, signal, redirect: 'error' });
  }

  private async json(response: Response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Never expose token response bodies or arbitrary server text to renderer/logs.
      const code = typeof data.error === 'string' ? data.error : data.error?.code;
      const safeCode = typeof code === 'string' ? code.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 100) : 'request_failed';
      throw new Error(`OpenAI HTTP ${response.status}: ${safeCode}. Request ID: ${response.headers.get('x-request-id') ?? 'unavailable'}.`);
    }
    return data;
  }

  async login() {
    return this.exclusive(async () => {
      const old = this.state.registration;
      const server = createServer();
      this.listener = server;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Could not start local OAuth callback.');
        const pending = authorization(this.state.hostId, `http://127.0.0.1:${address.port}/auth/callback`, old?.clientId);
        const callback = new Promise<ReturnType<typeof validateCallback>>((resolve, reject) => {
          this.cancelLogin = () => reject(new Error('Sign-in cancelled.'));
          timer = setTimeout(() => reject(new Error('Sign-in timed out after five minutes. Please try again.')), 300_000);
          server.on('request', (req, res) => {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            const url = new URL(req.url ?? '/', pending.redirect);
            if (req.method !== 'GET' || url.pathname !== '/auth/callback') { res.writeHead(404).end('Not found'); return; }
            // Ignore unsolicited requests without cancelling a valid pending attempt.
            if (url.searchParams.get('state') !== pending.state) { res.writeHead(400).end('Invalid state'); return; }
            try {
              const result = validateCallback(url, pending);
              res.end('Authorization received. Return to StudyFlow to see the verification result.');
              resolve(result);
            } catch (error) {
              res.writeHead(400).end('Authorization could not complete. Return to StudyFlow.');
              reject(error);
            }
          });
        });
        // Attach rejection handling before opening the browser.
        const opened = shell.openExternal(pending.url.toString());
        this.emit('status', 'Finish sign-in and authorize ChatGPT plan usage in your system browser.');
        const [result] = await Promise.all([callback, opened]);
        server.close();
        const tokens = await this.json(await this.request(`${AUTH}/api/accounts/oauth/token`, {
          method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', client_id: result.clientId,
            code: result.code, code_verifier: pending.verifier, redirect_uri: pending.redirect, resource: API }),
        }));
        if (typeof tokens.id_token !== 'string') throw new Error('No identity token returned.');
        const keys = await this.json(await this.request(`${AUTH}/.well-known/jwks.json`)) as JSONWebKeySet;
        const { payload } = await jwtVerify(tokens.id_token, createLocalJWKSet(keys), {
          issuer: AUTH, audience: result.clientId, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'nonce'],
        });
        if (payload.nonce !== pending.nonce || !payload.sub) throw new Error('Identity validation failed.');
        if (old && old.subject !== payload.sub) throw new Error('Signed-in identity differs from the saved account.');
        const credentials = this.validateTokens(tokens);
        this.state.registration = { clientId: result.clientId, subject: payload.sub,
          email: typeof payload.email === 'string' ? payload.email : 'ChatGPT account',
          idToken: tokens.id_token, ...credentials };
        await this.save();
        this.verified = false;
        this.models = [];
        if (!this.status().planEnabled) throw new Error('Signed in, but ChatGPT plan usage was not granted. Inference is disabled.');
        await this.loadModels();
        this.emit('status', 'Account verified. Select a model and run the live lesson test.');
        return this.status();
      } finally {
        if (timer) clearTimeout(timer);
        server.close();
        this.listener = undefined;
        this.cancelLogin = undefined;
      }
    });
  }

  private validateTokens(tokens: Record<string, unknown>, previousScopes?: string[]) {
    if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string'
      || tokens.token_type !== 'Bearer' || typeof tokens.expires_in !== 'number' || tokens.expires_in <= 0) {
      throw new Error('OpenAI returned an incomplete token set.');
    }
    const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/) : previousScopes ?? [];
    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
      scopes, expiresAt: Date.now() + tokens.expires_in * 1000 };
  }

  private async accessToken() {
    const r = this.state.registration;
    if (!r?.accessToken || !r.refreshToken) throw new Error('Connect your ChatGPT account first.');
    if (!r.scopes.includes('chatgpt.tokens.use.direct') || !r.scopes.includes('resource.invoke')) {
      throw new Error('ChatGPT plan usage is not authorized.');
    }
    if (r.expiresAt - Date.now() < 60_000) {
      // All public network operations are serialized by exclusive(), including refresh.
      const response = await this.request(`${AUTH}/api/accounts/oauth/token`, {
        method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id: r.clientId,
          refresh_token: r.refreshToken, resource: API }),
      });
      const data = await response.clone().json().catch(() => ({}));
      const code = typeof data.error === 'string' ? data.error : data.error?.code;
      if (['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused'].includes(code)) {
        await this.clearTokens();
        throw new Error('Session expired or revoked. Please sign in again.');
      }
      const tokens = await this.json(response);
      Object.assign(r, this.validateTokens(tokens, r.scopes));
      await this.save();
      if (!r.scopes.includes('chatgpt.tokens.use.direct')) throw new Error('ChatGPT plan permission is no longer granted.');
    }
    return r.accessToken!;
  }

  private async loadModels() {
    const token = await this.accessToken();
    const data = await this.json(await this.request(`${API}/models`, { headers: { Authorization: `Bearer ${token}` } }));
    if (!Array.isArray(data.models)) throw new Error('Unexpected ChatGPT model catalog response.');
    this.models = data.models.filter((m: Record<string, unknown>) => m.visibility === 'list'
      && typeof m.slug === 'string' && typeof m.display_name === 'string')
      .map((m: { slug: string; display_name: string }) => ({ slug: m.slug, display_name: m.display_name }));
    if (!this.models.length) throw new Error('No selectable models are available for this account.');
  }

  async refreshModels() { return this.exclusive(async () => { await this.loadModels(); return this.status(); }); }

  async generate(model: string, instructions: string, input: unknown[], delta: (text: string) => void) {
    return this.exclusive(async () => {
      if (!this.models.length) await this.loadModels();
      if (!this.models.some(m => m.slug === model)) throw new Error('Select an available model in Settings.');
      const token = await this.accessToken();
      const response = await this.request(`${API}/responses`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ model, instructions, input, store: false, stream: true }),
      });
      if (!response.ok) await this.json(response);
      return consumeResponse(response, delta);
    });
  }

  async test(model: unknown) {
    return this.exclusive(async () => {
      if (typeof model !== 'string' || !this.models.some(m => m.slug === model)) throw new Error('Select an available account model.');
      this.verified = false;
      const token = await this.accessToken();
      const response = await this.request(`${API}/responses`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(responseBody(model)),
      });
      if (!response.ok) await this.json(response);
      const diagnostic = {
        status: response.status,
        contentType: response.headers.get('content-type'),
        requestId: response.headers.get('x-request-id'),
        hasBody: !!response.body,
      };
      await writeFile(join(app.getPath('userData'), 'poc-response-diagnostic.json'), JSON.stringify(diagnostic, null, 2));
      const text = await consumeResponse(response, value => this.emit('delta', value));
      this.verified = true;
      const evidence = { verifiedAt: new Date().toISOString(), model, endpoint: `${API}/responses`,
        store: false, stream: true, terminalEvent: 'response.completed', text };
      await writeFile(join(app.getPath('userData'), 'poc-verification.json'), JSON.stringify(evidence, null, 2));
      this.emit('status', 'Verified: a real ChatGPT plan response reached response.completed.');
      return this.status();
    });
  }

  private async clearTokens() {
    const r = this.state.registration;
    if (r) { delete r.accessToken; delete r.refreshToken; delete r.idToken; r.scopes = []; r.expiresAt = 0; }
    this.models = [];
    this.verified = false;
    await this.save();
  }

  async disconnect() {
    return this.exclusive(async () => {
      const r = this.state.registration;
      let revoked = !r?.refreshToken;
      try {
        if (r?.refreshToken) {
          const discovery = await this.json(await this.request(`${AUTH}/.well-known/openid-configuration`));
          const url = new URL(discovery.revocation_endpoint);
          if (url.origin !== AUTH) throw new Error('Untrusted revocation endpoint.');
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const result = await this.request(url.toString(), { method: 'POST', body: new URLSearchParams({
                token: r.refreshToken, token_type_hint: 'refresh_token', client_id: r.clientId,
              }) });
              revoked = result.status === 200;
              if (revoked || result.status < 500) break;
            } catch { /* One bounded retry, then local sign-out. */ }
            if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 750));
          }
        }
      } catch { /* Always clear local credentials even if remote revocation fails. */ }
      await this.clearTokens();
      this.emit('status', revoked ? 'Disconnected. Local tokens cleared.'
        : 'Local tokens cleared. Remote revocation was not confirmed; disconnect StudyFlow in ChatGPT Settings → Apps.');
      return this.status();
    });
  }

  cancel() { this.abort?.abort(); this.cancelLogin?.(); this.listener?.close(); }
}
