import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAIN_ASM, PATHS, newSession, sessionWithProject, uuid } from '../support/fixtures.js';
import { expectError, expectStatus } from '../support/http.js';

async function files(api, sessionId, projectId) {
  const res = await api.op('GET', PATHS.project, { sessionId, projectId });
  expectStatus(res, 200);
  return res.json.files;
}

export default function fileOperations(ctx) {
  describe('PUT /sessions/{sessionId}/projects/{projectId}/files', () => {
    it('creates a new file and returns 204 with no body', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      const res = await ctx.api.op('PUT', PATHS.files, { sessionId, projectId }, {
        json: { path: 'src/io.asm', content: 'RD INPUT\n' },
      });
      expectStatus(res, 204);
      const current = await files(ctx.api, sessionId, projectId);
      assert.equal(current['src/io.asm'], 'RD INPUT\n');
      assert.equal(current['main.asm'], MAIN_ASM, 'other files are untouched');
    });

    it('overwrites an existing file (last write wins)', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      for (const content of ['first', 'second', '']) {
        const res = await ctx.api.op('PUT', PATHS.files, { sessionId, projectId }, {
          json: { path: 'main.asm', content },
        });
        expectStatus(res, 204);
        assert.equal((await files(ctx.api, sessionId, projectId))['main.asm'], content);
      }
    });

    it('bumps the project updatedAt', async () => {
      const { sessionId, projectId, project } = await sessionWithProject(ctx.api);
      await new Promise((r) => setTimeout(r, 20));
      expectStatus(await ctx.api.op('PUT', PATHS.files, { sessionId, projectId }, {
        json: { path: 'main.asm', content: 'changed' },
      }), 204);
      const res = await ctx.api.op('GET', PATHS.project, { sessionId, projectId });
      assert.ok(Date.parse(res.json.updatedAt) > Date.parse(project.updatedAt));
    });

    it('returns 404 project-not-found for an unknown project', async () => {
      const sessionId = await newSession(ctx.api);
      const res = await ctx.api.op('PUT', PATHS.files, { sessionId, projectId: uuid() }, {
        json: { path: 'main.asm', content: '' },
      });
      expectError(res, 404, 'project-not-found');
    });

    describe('validation failures return 400 invalid-request and change nothing', () => {
      const invalidBodies = {
        'body is not JSON': { body: 'path=main.asm' },
        'body is empty': { body: '' },
        'body is an array': { json: [{ path: 'main.asm', content: '' }] },
        'path is missing': { json: { content: 'x' } },
        'path is empty': { json: { path: '', content: 'x' } },
        'path starts with /': { json: { path: '/main.asm', content: 'x' } },
        'path is not a string': { json: { path: 7, content: 'x' } },
        'content is missing': { json: { path: 'main.asm' } },
        'content is null': { json: { path: 'main.asm', content: null } },
        'content is not a string': { json: { path: 'main.asm', content: ['x'] } },
      };
      for (const [label, options] of Object.entries(invalidBodies)) {
        it(label, async () => {
          const { sessionId, projectId, project } = await sessionWithProject(ctx.api);
          const res = await ctx.api.op('PUT', PATHS.files, { sessionId, projectId }, options);
          expectError(res, 400, 'invalid-request');
          assert.deepEqual(await files(ctx.api, sessionId, projectId), project.files);
        });
      }

      it('the project ID in the path is not a UUID', async () => {
        const sessionId = await newSession(ctx.api);
        const res = await ctx.api.op('PUT', PATHS.files, { sessionId, projectId: 'nope' }, {
          json: { path: 'main.asm', content: '' },
        });
        expectError(res, 400, 'invalid-request');
      });
    });
  });

  describe('DELETE /sessions/{sessionId}/projects/{projectId}/files', () => {
    it('deletes the file and returns 204 with no body', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      const res = await ctx.api.op('DELETE', PATHS.files, { sessionId, projectId }, { query: { path: 'data.asm' } });
      expectStatus(res, 204);
      assert.deepEqual(Object.keys(await files(ctx.api, sessionId, projectId)), ['main.asm']);
    });

    it('handles nested paths and characters that need URL encoding', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      const path = 'src/my file+ção & 100%.asm';
      expectStatus(await ctx.api.op('PUT', PATHS.files, { sessionId, projectId }, { json: { path, content: 'x' } }), 204);
      assert.equal((await files(ctx.api, sessionId, projectId))[path], 'x');
      const res = await ctx.api.op('DELETE', PATHS.files, { sessionId, projectId }, { query: { path } });
      expectStatus(res, 204);
      assert.ok(!(path in (await files(ctx.api, sessionId, projectId))));
    });

    it('returns 404 file-not-found for a file that does not exist', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      const res = await ctx.api.op('DELETE', PATHS.files, { sessionId, projectId }, { query: { path: 'nope.asm' } });
      expectError(res, 404, 'file-not-found');
    });

    it('returns 404 file-not-found when deleting the same file twice', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      expectStatus(await ctx.api.op('DELETE', PATHS.files, { sessionId, projectId }, { query: { path: 'main.asm' } }), 204);
      const res = await ctx.api.op('DELETE', PATHS.files, { sessionId, projectId }, { query: { path: 'main.asm' } });
      expectError(res, 404, 'file-not-found');
    });

    it('returns 404 project-not-found for an unknown project', async () => {
      const sessionId = await newSession(ctx.api);
      const res = await ctx.api.op('DELETE', PATHS.files, { sessionId, projectId: uuid() }, { query: { path: 'main.asm' } });
      expectError(res, 404, 'project-not-found');
    });

    const invalidQueries = {
      'path query parameter is missing': undefined,
      'path is empty': { path: '' },
      'path starts with /': { path: '/main.asm' },
    };
    for (const [label, query] of Object.entries(invalidQueries)) {
      it(`returns 400 invalid-request when the ${label}`, async () => {
        const { sessionId, projectId, project } = await sessionWithProject(ctx.api);
        const res = await ctx.api.op('DELETE', PATHS.files, { sessionId, projectId }, { query });
        expectError(res, 400, 'invalid-request');
        assert.deepEqual(await files(ctx.api, sessionId, projectId), project.files);
      });
    }
  });
}
