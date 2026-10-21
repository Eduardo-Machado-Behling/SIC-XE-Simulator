import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PATHS, TEST_MAX_BODY_BYTES, newSession, paddedJson, projectInput, sessionWithProject, uuid } from '../support/fixtures.js';
import { expectError, expectStatus } from '../support/http.js';
import { validateSchema } from '../support/spec.js';

export default function errorsAndLimits(ctx) {
  describe('413 Payload Too Large', () => {
    const limit = TEST_MAX_BODY_BYTES;

    it('PUT project: a body of exactly the limit is accepted', async () => {
      const sessionId = await newSession(ctx.api);
      const body = paddedJson(limit, (pad) => projectInput({ files: { 'main.asm': pad } }));
      const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId: uuid() }, { body });
      expectStatus(res, 201);
    });

    it('PUT project: a body one byte over the limit returns 413', async () => {
      const sessionId = await newSession(ctx.api);
      const projectId = uuid();
      const body = paddedJson(limit + 1, (pad) => projectInput({ files: { 'main.asm': pad } }));
      const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId }, { body });
      expectError(res, 413, 'payload-too-large');
      expectError(await ctx.api.op('GET', PATHS.project, { sessionId, projectId }), 404, 'project-not-found');
    });

    it('PUT projects (sync): an oversized body returns 413', async () => {
      const sessionId = await newSession(ctx.api);
      const body = paddedJson(limit + 1, (pad) => [{ id: uuid(), ...projectInput({ files: { 'main.asm': pad } }) }]);
      const res = await ctx.api.op('PUT', PATHS.projects, { sessionId }, { body });
      expectError(res, 413, 'payload-too-large');
      assert.deepEqual((await ctx.api.op('GET', PATHS.projects, { sessionId })).json, []);
    });

    it('PUT file: an oversized body returns 413', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      const body = paddedJson(limit + 1, (pad) => ({ path: 'big.asm', content: pad }));
      const res = await ctx.api.op('PUT', PATHS.files, { sessionId, projectId }, { body });
      expectError(res, 413, 'payload-too-large');
    });

    it('the server keeps serving after rejecting oversized bodies', async () => {
      expectStatus(await ctx.api.op('GET', PATHS.health), 200);
    });
  });

  describe('Error responses outside the documented paths', () => {
    it('an unknown route returns a 404 problem object', async () => {
      const res = await ctx.api.raw('GET', '/definitely/not/here');
      expectStatus(res, 404);
      const { ok, errors } = validateSchema('Error', res.json);
      assert.ok(ok, `not an Error object: ${res.text} ${JSON.stringify(errors)}`);
      assert.equal(res.json.status, 404);
      assert.match(res.headers.get('content-type') ?? '', /^application\/json/);
    });

    function expectRouteNotFound(res) {
      expectError(res, 404, 'not-found');
      const { ok, errors } = validateSchema('Error', res.json);
      assert.ok(ok, `not an Error object: ${res.text} ${JSON.stringify(errors)}`);
    }

    it('an encoded "/" in a path segment does not reach another operation', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      for (const slash of ['%2F', '%2f']) {
        expectRouteNotFound(await ctx.api.raw('GET', `/sessions/${sessionId}${slash}projects`));
        expectRouteNotFound(
          await ctx.api.raw('DELETE', `/sessions/${sessionId}${slash}projects${slash}${projectId}`),
        );
      }
      expectStatus(await ctx.api.op('GET', PATHS.project, { sessionId, projectId }), 200);
    });

    it('a trailing "/" does not reach the documented operation', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      expectRouteNotFound(await ctx.api.raw('GET', `/sessions/${sessionId}/`));
      expectRouteNotFound(await ctx.api.raw('GET', `/sessions/${sessionId}/projects/`));
      expectRouteNotFound(await ctx.api.raw('GET', '/health/'));

      const created = uuid();
      expectRouteNotFound(
        await ctx.api.raw('PUT', `/sessions/${sessionId}/projects/${created}/`, { json: projectInput() }),
      );
      expectError(await ctx.api.op('GET', PATHS.project, { sessionId, projectId: created }), 404, 'project-not-found');
      expectRouteNotFound(await ctx.api.raw('DELETE', `/sessions/${sessionId}/projects/${projectId}/`));
      expectStatus(await ctx.api.op('GET', PATHS.project, { sessionId, projectId }), 200);
    });

    it('an encoded "/" in the query string is still accepted (file paths)', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      const put = await ctx.api.op('PUT', PATHS.files, { sessionId, projectId }, { json: { path: 'src/a.asm', content: '' } });
      expectStatus(put, 204);
      const del = await ctx.api.raw('DELETE', `/sessions/${sessionId}/projects/${projectId}/files?path=src%2Fa.asm`);
      expectStatus(del, 204);
    });

    it('CORS preflight is still answered with 204 and the allowed methods', async () => {
      const res = await ctx.api.raw('OPTIONS', '/sessions');
      expectStatus(res, 204);
      const methods = res.headers.get('access-control-allow-methods') ?? '';
      for (const m of ['GET', 'POST', 'PUT', 'DELETE']) assert.ok(methods.includes(m), `${m} missing in ${methods}`);
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
    });

    it('CORS headers are present on API responses', async () => {
      const res = await ctx.api.raw('GET', '/health');
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
    });
  });
}
