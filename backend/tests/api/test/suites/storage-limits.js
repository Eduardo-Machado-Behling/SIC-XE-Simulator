// Session storage is bounded: a per-session byte budget (413 when a write
// would exceed it), a total byte budget and a session count (least recently
// used sessions are evicted), and an idle timeout. Evicted or expired
// sessions answer 404 session-not-found, which the spec's SessionNotFound
// response describes ("it expired or the server restarted").
//
// Each describe block starts its own server with small limits so the main
// server's limits stay at their defaults.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { PATHS, newSession, uuid } from '../support/fixtures.js';
import { createClient, expectError, expectStatus } from '../support/http.js';
import { startServer } from '../support/server.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const content = (bytes) => 'x'.repeat(bytes);
const input = (files = {}, name = 'Limits') => ({ name, architecture: 'SIC-XE', files });

function withServer(env) {
  const s = { api: null, server: null };
  before(async () => {
    s.server = await startServer({ env });
    s.api = createClient(s.server.baseUrl);
  });
  after(async () => {
    if (s.server) {
      assert.ok(s.server.isRunning(), `api exited; output:\n${s.server.output().slice(-4000)}`);
      await s.server.stop();
    }
  });
  return s;
}

function expectBudgetError(res) {
  expectError(res, 413, 'payload-too-large');
  assert.match(res.json.detail ?? '', /session storage limit/, res.text);
}

export default function storageLimits() {
  describe('per-session storage budget (MAX_SESSION_BYTES)', () => {
    const s = withServer({ MAX_SESSION_BYTES: '65536' });

    it('rejects a project that would exceed the budget with 413 and changes nothing', async () => {
      const sessionId = await newSession(s.api);
      const first = uuid();
      expectStatus(await s.api.op('PUT', PATHS.project, { sessionId, projectId: first }, { json: input({ 'main.asm': content(40000) }) }), 201);

      const second = uuid();
      const res = await s.api.op('PUT', PATHS.project, { sessionId, projectId: second }, { json: input({ 'main.asm': content(40000) }) });
      expectBudgetError(res);
      expectError(await s.api.op('GET', PATHS.project, { sessionId, projectId: second }), 404, 'project-not-found');
      const list = await s.api.op('GET', PATHS.projects, { sessionId });
      assert.deepEqual(list.json.map((p) => p.id), [first]);
    });

    it('counts replacements, not additions: overwriting within the budget works', async () => {
      const sessionId = await newSession(s.api);
      const projectId = uuid();
      expectStatus(await s.api.op('PUT', PATHS.project, { sessionId, projectId }, { json: input({ 'main.asm': content(40000) }) }), 201);

      expectBudgetError(await s.api.op('PUT', PATHS.files, { sessionId, projectId }, { json: { path: 'more.asm', content: content(30000) } }));
      const unchanged = await s.api.op('GET', PATHS.project, { sessionId, projectId });
      assert.deepEqual(Object.keys(unchanged.json.files), ['main.asm']);

      expectStatus(await s.api.op('PUT', PATHS.files, { sessionId, projectId }, { json: { path: 'main.asm', content: content(50000) } }), 204);
      expectStatus(await s.api.op('PUT', PATHS.project, { sessionId, projectId }, { json: input({ 'main.asm': content(60000) }) }), 200);
      const replaced = await s.api.op('GET', PATHS.project, { sessionId, projectId });
      assert.equal(replaced.json.files['main.asm'].length, 60000);
    });

    it('rejects a sync over the budget with 413 and keeps the previous project set', async () => {
      const sessionId = await newSession(s.api);
      const kept = uuid();
      expectStatus(await s.api.op('PUT', PATHS.project, { sessionId, projectId: kept }, { json: input({ 'main.asm': 'x' }) }), 201);
      const before = (await s.api.op('GET', PATHS.projects, { sessionId })).json;

      const tooBig = [
        { id: uuid(), ...input({ 'a.asm': content(40000) }) },
        { id: uuid(), ...input({ 'b.asm': content(40000) }) },
      ];
      expectBudgetError(await s.api.op('PUT', PATHS.projects, { sessionId }, { json: tooBig }));
      assert.deepEqual((await s.api.op('GET', PATHS.projects, { sessionId })).json, before);

      const fits = [{ id: uuid(), ...input({ 'a.asm': content(20000) }) }];
      const res = await s.api.op('PUT', PATHS.projects, { sessionId }, { json: fits });
      expectStatus(res, 200);
      assert.deepEqual(res.json.map((p) => p.id), [fits[0].id]);
    });

    it('bounds the number of projects and files, not only their bytes', async () => {
      const sessionId = await newSession(s.api);
      const many = Array.from({ length: 300 }, (_, i) => ({ id: uuid(), ...input({}, `p${i}`) }));
      expectBudgetError(await s.api.op('PUT', PATHS.projects, { sessionId }, { json: many }));

      const some = many.slice(0, 50);
      expectStatus(await s.api.op('PUT', PATHS.projects, { sessionId }, { json: some }), 200);

      const files = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`f${i}`, '']));
      expectBudgetError(await s.api.op('PUT', PATHS.project, { sessionId, projectId: uuid() }, { json: input(files) }));
    });

    it('deleting a project frees its share of the budget', async () => {
      const sessionId = await newSession(s.api);
      const first = uuid();
      expectStatus(await s.api.op('PUT', PATHS.project, { sessionId, projectId: first }, { json: input({ 'main.asm': content(40000) }) }), 201);
      expectBudgetError(await s.api.op('PUT', PATHS.project, { sessionId, projectId: uuid() }, { json: input({ 'main.asm': content(40000) }) }));

      expectStatus(await s.api.op('DELETE', PATHS.project, { sessionId, projectId: first }), 204);
      expectStatus(await s.api.op('PUT', PATHS.project, { sessionId, projectId: uuid() }, { json: input({ 'main.asm': content(40000) }) }), 201);
    });
  });

  describe('session count limit (MAX_SESSIONS)', () => {
    const s = withServer({ MAX_SESSIONS: '3' });

    it('evicts the least recently used session when a new one is created', async () => {
      const a = await newSession(s.api);
      const b = await newSession(s.api);
      const c = await newSession(s.api);
      expectStatus(await s.api.op('GET', PATHS.session, { sessionId: a }), 200); // a is now newer than b

      const d = await newSession(s.api);
      expectError(await s.api.op('GET', PATHS.session, { sessionId: b }), 404, 'session-not-found');
      for (const sessionId of [a, c, d]) expectStatus(await s.api.op('GET', PATHS.session, { sessionId }), 200);
    });
  });

  describe('total storage limit (MAX_TOTAL_BYTES)', () => {
    const s = withServer({ MAX_SESSION_BYTES: '65536', MAX_TOTAL_BYTES: '131072' });

    it('evicts least recently used sessions, never the writer, to stay under the limit', async () => {
      const owners = [];
      for (let i = 0; i < 3; i += 1) {
        const sessionId = await newSession(s.api);
        const projectId = uuid();
        const res = await s.api.op('PUT', PATHS.project, { sessionId, projectId }, { json: input({ 'main.asm': content(50000) }) });
        expectStatus(res, 201);
        owners.push({ sessionId, projectId });
      }
      const [oldest, middle, newest] = owners;
      expectError(await s.api.op('GET', PATHS.session, { sessionId: oldest.sessionId }), 404, 'session-not-found');
      for (const { sessionId, projectId } of [middle, newest]) {
        const res = await s.api.op('GET', PATHS.project, { sessionId, projectId });
        expectStatus(res, 200);
        assert.equal(res.json.files['main.asm'].length, 50000);
      }
    });
  });

  describe('idle session expiry (SESSION_TTL_SECONDS)', () => {
    const s = withServer({ SESSION_TTL_SECONDS: '1' });

    it('an idle session expires and then answers 404 session-not-found', async () => {
      const sessionId = await newSession(s.api);
      expectStatus(await s.api.op('GET', PATHS.session, { sessionId }), 200);
      await sleep(1600);
      expectError(await s.api.op('GET', PATHS.session, { sessionId }), 404, 'session-not-found');
      expectError(await s.api.op('PUT', PATHS.projects, { sessionId }, { json: [] }), 404, 'session-not-found');
    });

    it('any request on a session keeps it alive', async () => {
      const sessionId = await newSession(s.api);
      for (let i = 0; i < 6; i += 1) {
        await sleep(300);
        expectStatus(await s.api.op('GET', PATHS.projects, { sessionId }), 200);
      }
      expectStatus(await s.api.op('GET', PATHS.session, { sessionId }), 200);
    });
  });
}
