// Differential checks: the server must accept exactly the values the OpenAPI
// schemas accept (as judged by a JSON Schema 2020-12 validator), so the
// implementation cannot drift from the documented FilePath / uuid / enum rules.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PATHS, newSession, projectInput, sessionWithProject, uuid } from '../support/fixtures.js';
import { expectStatus } from '../support/http.js';
import { ajvFormats, spec, validateSchema } from '../support/spec.js';

const FILE_PATHS = [
  'main.asm',
  'src/main.asm',
  'a',
  '.',
  '..',
  '../escape.asm',
  'a/',
  'a//b',
  ' leading-space',
  'C:\\win\\path.asm',
  '\\backslash',
  'ç/ñ/测试.asm',
  '🚀.asm',
  'tab\tinside',
  'nul\u0000inside',
  '\n',
  'line\nbreak',
  'trailing\n',
  'cr\rinside',
  'x\u2028y',
  '\u2028',
  '',
  '/',
  '/main.asm',
  '//double',
];

const UUIDS = [
  uuid(),
  uuid().toUpperCase(),
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '550e8400e29b41d4a716446655440000',
  '550e8400-e29b-41d4-a716-44665544000',
  '550e8400-e29b-41d4-a716-4466554400000',
  '550e8400-e29b-41d4-a716-44665544000g',
  '{550e8400-e29b-41d4-a716-446655440000}',
  ' 550e8400-e29b-41d4-a716-446655440000',
  'project-1',
];

const show = (s) => JSON.stringify(s);

export default function contract(ctx) {
  describe('FilePath is enforced exactly as the schema defines it', () => {
    it('the candidate list exercises both valid and invalid paths', () => {
      const verdicts = FILE_PATHS.map((p) => validateSchema('FilePath', p).ok);
      assert.ok(verdicts.includes(true) && verdicts.includes(false));
    });

    it('PUT .../files accepts a path iff the FilePath schema does', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      for (const path of FILE_PATHS) {
        const valid = validateSchema('FilePath', path).ok;
        const res = await ctx.api.op('PUT', PATHS.files, { sessionId, projectId }, { json: { path, content: 'x' } });
        expectStatus(res, valid ? 204 : 400);
        if (valid) {
          const get = await ctx.api.op('GET', PATHS.project, { sessionId, projectId });
          assert.equal(get.json.files[path], 'x', `file ${show(path)} was not stored under its exact path`);
        }
      }
    });

    it('PUT project accepts a files key iff the FilePath schema does', async () => {
      const sessionId = await newSession(ctx.api);
      for (const path of FILE_PATHS) {
        const valid = validateSchema('FilePath', path).ok;
        const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId: uuid() }, {
          json: projectInput({ files: { [path]: 'x' } }),
        });
        assert.equal(res.status, valid ? 201 : 400, `files key ${show(path)}: ${res.text}`);
      }
    });

    it('DELETE .../files?path= rejects exactly the paths the schema rejects', async () => {
      const { sessionId, projectId } = await sessionWithProject(ctx.api);
      for (const path of FILE_PATHS) {
        const valid = validateSchema('FilePath', path).ok;
        const res = await ctx.api.op('DELETE', PATHS.files, { sessionId, projectId }, { query: { path } });
        // Valid paths that do not exist are 404 file-not-found, invalid ones 400.
        assert.equal(res.status, valid ? 404 : 400, `path ${show(path)}: ${res.text}`);
      }
    });
  });

  describe('project IDs follow format: uuid', () => {
    it('PUT project accepts a path projectId iff it is a UUID', async () => {
      const sessionId = await newSession(ctx.api);
      for (const projectId of UUIDS) {
        const valid = ajvFormats.uuid.test
          ? ajvFormats.uuid.test(projectId)
          : ajvFormats.uuid(projectId);
        const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId }, { json: projectInput() });
        assert.equal(res.status, valid ? 201 : 400, `projectId ${show(projectId)}: ${res.text}`);
        if (valid) assert.equal(res.json.id, projectId);
      }
    });

    it('PUT projects (sync) accepts an item id iff it is a UUID', async () => {
      const sessionId = await newSession(ctx.api);
      for (const id of UUIDS) {
        const valid = validateSchema('ProjectSyncItem', { id, ...projectInput() }).ok;
        const res = await ctx.api.op('PUT', PATHS.projects, { sessionId }, { json: [{ id, ...projectInput() }] });
        assert.equal(res.status, valid ? 200 : 400, `id ${show(id)}: ${res.text}`);
      }
    });
  });

  describe('architecture follows the Architecture enum', () => {
    it('accepts exactly the enum values', async () => {
      const sessionId = await newSession(ctx.api);
      const candidates = [...spec.components.schemas.Architecture.enum, 'sic', 'sic-xe', 'SICXE', 'SIC_XE', 'SIC-XE ', ''];
      for (const architecture of candidates) {
        const valid = validateSchema('Architecture', architecture).ok;
        const res = await ctx.api.op('PUT', PATHS.project, { sessionId, projectId: uuid() }, {
          json: projectInput({ architecture }),
        });
        assert.equal(res.status, valid ? 201 : 400, `architecture ${show(architecture)}: ${res.text}`);
      }
    });
  });
}
