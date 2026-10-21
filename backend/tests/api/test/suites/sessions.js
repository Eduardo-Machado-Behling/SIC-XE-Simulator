import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PATHS, newSession, projectInput, runConcurrently, uuid } from '../support/fixtures.js';
import { expectError, expectStatus } from '../support/http.js';

export default function sessions(ctx) {
  describe('POST /sessions', () => {
    it('returns 201 with a server-issued UUID', async () => {
      const res = await ctx.api.op('POST', PATHS.sessions);
      expectStatus(res, 201);
      assert.deepEqual(Object.keys(res.json), ['sessionId']);
    });

    it('issues a different session ID on every call', async () => {
      const ids = await runConcurrently(50, 8, () => newSession(ctx.api));
      assert.equal(new Set(ids).size, ids.length);
    });
  });

  describe('GET /sessions/{sessionId}', () => {
    it('returns 200 and echoes a known session', async () => {
      const sessionId = await newSession(ctx.api);
      const res = await ctx.api.op('GET', PATHS.session, { sessionId });
      expectStatus(res, 200);
      assert.deepEqual(res.json, { sessionId });
    });

    it('returns 404 session-not-found for an unknown UUID', async () => {
      const res = await ctx.api.op('GET', PATHS.session, { sessionId: uuid() });
      expectError(res, 404, 'session-not-found');
    });

    it('returns 404 session-not-found for a malformed session ID', async () => {
      const res = await ctx.api.op('GET', PATHS.session, { sessionId: 'not-a-uuid' });
      expectError(res, 404, 'session-not-found');
    });

    it('does not accept a client-chosen session ID (sessions are only issued by POST)', async () => {
      const sessionId = uuid();
      const put = await ctx.api.op('PUT', PATHS.projects, { sessionId }, { json: [] });
      expectError(put, 404, 'session-not-found');
      const get = await ctx.api.op('GET', PATHS.session, { sessionId });
      expectError(get, 404, 'session-not-found');
    });
  });

  describe('every session-scoped operation on an unknown session', () => {
    const sessionId = uuid();
    const projectId = uuid();
    const cases = [
      ['GET', PATHS.projects, {}],
      ['PUT', PATHS.projects, { json: [] }],
      ['GET', PATHS.project, {}],
      ['PUT', PATHS.project, { json: projectInput() }],
      ['DELETE', PATHS.project, {}],
      ['PUT', PATHS.files, { json: { path: 'main.asm', content: '' } }],
      ['DELETE', PATHS.files, { query: { path: 'main.asm' } }],
    ];
    for (const [method, template, options] of cases) {
      it(`${method} ${template} returns 404 session-not-found`, async () => {
        const res = await ctx.api.op(method, template, { sessionId, projectId }, options);
        expectError(res, 404, 'session-not-found');
      });
    }
  });
}
