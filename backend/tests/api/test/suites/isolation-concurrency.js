import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PATHS, newSession, projectInput, runConcurrently, sessionWithProject, uuid } from '../support/fixtures.js';
import { expectError, expectStatus } from '../support/http.js';

export default function isolationAndConcurrency(ctx) {
  describe('session isolation', () => {
    it("a session never sees or changes another session's projects", async () => {
      const { sessionId: s1, projectId, project } = await sessionWithProject(ctx.api);
      const s2 = await newSession(ctx.api);

      assert.deepEqual((await ctx.api.op('GET', PATHS.projects, { sessionId: s2 })).json, []);
      expectError(await ctx.api.op('GET', PATHS.project, { sessionId: s2, projectId }), 404, 'project-not-found');
      expectError(await ctx.api.op('DELETE', PATHS.project, { sessionId: s2, projectId }), 404, 'project-not-found');
      expectError(
        await ctx.api.op('PUT', PATHS.files, { sessionId: s2, projectId }, { json: { path: 'main.asm', content: '' } }),
        404,
        'project-not-found',
      );
      expectError(
        await ctx.api.op('DELETE', PATHS.files, { sessionId: s2, projectId }, { query: { path: 'main.asm' } }),
        404,
        'project-not-found',
      );

      // The same client-generated ID is an independent project in another session.
      const other = await ctx.api.op('PUT', PATHS.project, { sessionId: s2, projectId }, {
        json: projectInput({ name: 'Other', files: {} }),
      });
      expectStatus(other, 201);
      expectStatus(await ctx.api.op('DELETE', PATHS.project, { sessionId: s2, projectId }), 204);
      expectStatus(await ctx.api.op('PUT', PATHS.projects, { sessionId: s2 }, { json: [] }), 200);

      const still = await ctx.api.op('GET', PATHS.project, { sessionId: s1, projectId });
      expectStatus(still, 200);
      assert.deepEqual(still.json, project);
    });
  });

  describe('concurrent requests', () => {
    it('parallel file upserts into one project are all kept', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api, projectInput({ files: {} }));
      const count = 300;
      const results = await runConcurrently(count, 16, (i) =>
        ctx.api.op('PUT', PATHS.files, { sessionId, projectId }, { json: { path: `f${i}.asm`, content: `${i}` } }),
      );
      for (const res of results) expectStatus(res, 204);
      const res = await ctx.api.op('GET', PATHS.project, { sessionId, projectId });
      assert.equal(Object.keys(res.json.files).length, count);
      for (let i = 0; i < count; i += 1) assert.equal(res.json.files[`f${i}.asm`], `${i}`);
    });

    it('parallel project upserts, syncs and reads across sessions stay consistent', async () => {
      const sessions = await runConcurrently(8, 8, () => newSession(ctx.api));
      const work = [];
      for (const sessionId of sessions) {
        const ids = Array.from({ length: 10 }, () => uuid());
        work.push(
          (async () => {
            await runConcurrently(ids.length, 2, (i) =>
              ctx.api.op('PUT', PATHS.project, { sessionId, projectId: ids[i] }, {
                json: projectInput({ name: ids[i] }),
              }),
            );
            await runConcurrently(ids.length, 2, (i) =>
              ctx.api.op('GET', PATHS.project, { sessionId, projectId: ids[i] }),
            );
            const keep = ids.slice(0, 5).map((id) => ({ id, ...projectInput({ name: `kept ${id}` }) }));
            await ctx.api.op('PUT', PATHS.projects, { sessionId }, { json: keep });
            const list = await ctx.api.op('GET', PATHS.projects, { sessionId });
            assert.deepEqual(list.json.map((p) => p.id).sort(), ids.slice(0, 5).sort());
          })(),
        );
      }
      await Promise.all(work);
      assert.ok(ctx.server.isRunning(), 'server must survive concurrent load');
    });
  });
}
