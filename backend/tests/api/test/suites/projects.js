import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DATA_ASM,
  MAIN_ASM,
  PATHS,
  newSession,
  projectInput,
  sessionWithProject,
  uuid,
} from '../support/fixtures.js';
import { expectError, expectStatus } from '../support/http.js';

const sameInstantOrLater = (later, earlier) =>
  assert.ok(Date.parse(later) >= Date.parse(earlier), `${later} should not be before ${earlier}`);

export default function projects(ctx) {
  describe('PUT /sessions/{sessionId}/projects/{projectId}', () => {
    it('creates a project with the client-generated ID and returns 201 + Project', async () => {
      const sessionId = await newSession(ctx.api);
      const projectId = uuid();
      const input = projectInput();
      const before = Date.now();
      const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId }, { json: input });
      expectStatus(res, 201);
      const { updatedAt, ...rest } = res.json;
      assert.deepEqual(rest, { id: projectId, ...input });
      assert.ok(Date.parse(updatedAt) >= before - 1000, `updatedAt ${updatedAt} is too old`);
      assert.ok(Date.parse(updatedAt) <= Date.now() + 1000, `updatedAt ${updatedAt} is in the future`);
    });

    it('replaces an existing project entirely and returns 200', async () => {
      const { sessionId, projectId, project } = await sessionWithProject(ctx.api);
      const replacement = { name: 'Renamed', architecture: 'SIC', files: { 'other.asm': 'X' } };
      const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId }, { json: replacement });
      expectStatus(res, 200);
      const { updatedAt, ...rest } = res.json;
      assert.deepEqual(rest, { id: projectId, ...replacement });
      sameInstantOrLater(updatedAt, project.updatedAt);

      const get = await ctx.api.op('GET', PATHS.project, { sessionId, projectId });
      assert.deepEqual(get.json, res.json, 'old files must be gone after a replace');
    });

    it('is idempotent: repeating the same PUT keeps returning 200 with the same content', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      for (let i = 0; i < 2; i += 1) {
        const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId }, { json: projectInput() });
        expectStatus(res, 200);
        const { updatedAt, ...rest } = res.json;
        assert.deepEqual(rest, { id: projectId, ...projectInput() });
      }
    });

    it('accepts an empty files object', async () => {
      const sessionId = await newSession(ctx.api);
      const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId: uuid() }, {
        json: projectInput({ files: {} }),
      });
      expectStatus(res, 201);
      assert.deepEqual(res.json.files, {});
    });

    it('accepts both architectures of the Architecture enum', async () => {
      const sessionId = await newSession(ctx.api);
      for (const architecture of ['SIC', 'SIC-XE']) {
        const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId: uuid() }, {
          json: projectInput({ architecture }),
        });
        expectStatus(res, 201);
        assert.equal(res.json.architecture, architecture);
      }
    });

    it('ignores undocumented input fields and never echoes them', async () => {
      const sessionId = await newSession(ctx.api);
      const projectId = uuid();
      const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId }, {
        json: { ...projectInput(), id: uuid(), updatedAt: '2000-01-01T00:00:00Z', extra: true },
      });
      expectStatus(res, 201);
      assert.equal(res.json.id, projectId, 'the path parameter is the project ID');
      assert.notEqual(res.json.updatedAt, '2000-01-01T00:00:00Z', 'updatedAt is read-only');
    });

    it('keeps file contents byte-for-byte (unicode, CRLF, empty, large)', async () => {
      const sessionId = await newSession(ctx.api);
      const projectId = uuid();
      const files = {
        'unicode.asm': '. comentário — 测试 🚀\n',
        'crlf.asm': 'A\r\nB\r\n',
        'empty.asm': '',
        'big.asm': 'LDA VALUE\n'.repeat(5000),
        'nul.asm': 'a\u0000b',
      };
      const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId }, { json: projectInput({ files }) });
      expectStatus(res, 201);
      const get = await ctx.api.op('GET', PATHS.project, { sessionId, projectId });
      assert.deepEqual(get.json.files, files);
    });

    describe('validation failures return 400 invalid-request and change nothing', () => {
      const invalidBodies = {
        'body is not JSON': { body: '{"name": ' },
        'body is empty': { body: '' },
        'body is a JSON array': { json: [] },
        'body is a JSON string': { json: 'project' },
        'body is null': { json: null },
        'name is missing': { json: { architecture: 'SIC-XE', files: {} } },
        'name is empty': { json: projectInput({ name: '' }) },
        'name is not a string': { json: projectInput({ name: 42 }) },
        'architecture is missing': { json: { name: 'A', files: {} } },
        'architecture is not in the enum (lowercase legacy id)': { json: projectInput({ architecture: 'sic-xe' }) },
        'architecture is not in the enum': { json: projectInput({ architecture: 'x86' }) },
        'architecture is not a string': { json: projectInput({ architecture: 1 }) },
        'files is missing': { json: { name: 'A', architecture: 'SIC' } },
        'files is an array': { json: projectInput({ files: ['main.asm'] }) },
        'files is null': { json: projectInput({ files: null }) },
        'a file content is not a string': { json: projectInput({ files: { 'main.asm': 1 } }) },
        'a file content is null': { json: projectInput({ files: { 'main.asm': null } }) },
        'a file path starts with /': { json: projectInput({ files: { '/main.asm': MAIN_ASM } }) },
        'a file path is empty': { json: projectInput({ files: { '': MAIN_ASM } }) },
      };
      for (const [label, options] of Object.entries(invalidBodies)) {
        it(label, async () => {
          const sessionId = await newSession(ctx.api);
          const projectId = uuid();
          const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId }, options);
          expectError(res, 400, 'invalid-request');
          assert.equal(typeof res.json.detail, 'string', 'a 400 explains what is wrong in detail');
          const get = await ctx.api.op('GET', PATHS.project, { sessionId, projectId });
          expectError(get, 404, 'project-not-found');
        });
      }

      it('a rejected replace keeps the previous project', async () => {
        const { sessionId, projectId, project } = await sessionWithProject(ctx.api);
        const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId }, {
          json: projectInput({ name: 'New', files: { '/abs.asm': '' } }),
        });
        expectError(res, 400, 'invalid-request');
        const get = await ctx.api.op('GET', PATHS.project, { sessionId, projectId });
        assert.deepEqual(get.json, project);
      });

      it('the project ID in the path is not a UUID', async () => {
        const sessionId = await newSession(ctx.api);
        const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId: 'my-project' }, {
          json: projectInput(),
        });
        expectError(res, 400, 'invalid-request');
      });
    });
  });

  describe('GET /sessions/{sessionId}/projects/{projectId}', () => {
    it('returns 200 with the project and all of its files', async () => {
      const { sessionId, projectId, project } = await sessionWithProject(ctx.api);
      const res = await ctx.api.op('GET', PATHS.project, { sessionId, projectId });
      expectStatus(res, 200);
      assert.deepEqual(res.json, project);
      assert.deepEqual(res.json.files, { 'main.asm': MAIN_ASM, 'data.asm': DATA_ASM });
    });

    it('returns 404 project-not-found for an unknown project', async () => {
      const sessionId = await newSession(ctx.api);
      const res = await ctx.api.op('GET', PATHS.project, { sessionId, projectId: uuid() });
      expectError(res, 404, 'project-not-found');
    });

    it('returns 404 project-not-found for a malformed project ID', async () => {
      const sessionId = await newSession(ctx.api);
      const res = await ctx.api.op('GET', PATHS.project, { sessionId, projectId: 'not-a-uuid' });
      expectError(res, 404, 'project-not-found');
    });
  });

  describe('GET /sessions/{sessionId}/projects', () => {
    it('returns 200 [] for a new session', async () => {
      const sessionId = await newSession(ctx.api);
      const res = await ctx.api.op('GET', PATHS.projects, { sessionId });
      expectStatus(res, 200);
      assert.deepEqual(res.json, []);
    });

    it('returns a ProjectSummary (no files) for every project', async () => {
      const sessionId = await newSession(ctx.api);
      const created = [];
      for (const name of ['One', 'Two', 'Three']) {
        const projectId = uuid();
        const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId }, { json: projectInput({ name }) });
        created.push(res.json);
      }
      const res = await ctx.api.op('GET', PATHS.projects, { sessionId });
      expectStatus(res, 200);
      const byId = (a, b) => a.id.localeCompare(b.id);
      const expected = created.map(({ files, ...summary }) => summary).sort(byId);
      assert.deepEqual([...res.json].sort(byId), expected);
    });
  });

  describe('DELETE /sessions/{sessionId}/projects/{projectId}', () => {
    it('returns 204 with no body and removes the project', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      const res = await ctx.api.op('DELETE', PATHS.project, { sessionId, projectId });
      expectStatus(res, 204);
      const get = await ctx.api.op('GET', PATHS.project, { sessionId, projectId });
      expectError(get, 404, 'project-not-found');
      const list = await ctx.api.op('GET', PATHS.projects, { sessionId });
      assert.deepEqual(list.json, []);
    });

    it('returns 404 project-not-found for an unknown or already deleted project', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      expectStatus(await ctx.api.op('DELETE', PATHS.project, { sessionId, projectId }), 204);
      const again = await ctx.api.op('DELETE', PATHS.project, { sessionId, projectId });
      expectError(again, 404, 'project-not-found');
      const unknown = await ctx.api.op('DELETE', PATHS.project, { sessionId, projectId: uuid() });
      expectError(unknown, 404, 'project-not-found');
    });

    it('a deleted project can be created again with the same ID (201)', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      expectStatus(await ctx.api.op('DELETE', PATHS.project, { sessionId, projectId }), 204);
      const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId }, { json: projectInput() });
      expectStatus(res, 201);
    });
  });
}
