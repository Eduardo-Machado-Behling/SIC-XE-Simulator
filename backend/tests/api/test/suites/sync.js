import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PATHS, newSession, projectInput, uuid } from '../support/fixtures.js';
import { expectError, expectStatus } from '../support/http.js';

const byId = (a, b) => a.id.localeCompare(b.id);
const summaryOf = ({ id, name, architecture }) => ({ id, name, architecture });
const strip = (list) => list.map(({ updatedAt, ...rest }) => rest).sort(byId);

async function list(api, sessionId) {
  const res = await api.op('GET', PATHS.projects, { sessionId });
  expectStatus(res, 200);
  return res.json;
}

export default function sync(ctx) {
  describe('PUT /sessions/{sessionId}/projects (full sync)', () => {
    it('creates every project of an empty session and returns the resulting summaries', async () => {
      const sessionId = await newSession(ctx.api);
      const items = [
        { id: uuid(), ...projectInput({ name: 'A' }) },
        { id: uuid(), ...projectInput({ name: 'B', architecture: 'SIC', files: {} }) },
      ];
      const res = await ctx.api.op('PUT', PATHS.projects, { sessionId }, { json: items });
      expectStatus(res, 200);
      assert.deepEqual(strip(res.json), items.map(summaryOf).sort(byId));
      assert.deepEqual(strip(await list(ctx.api, sessionId)), strip(res.json));
      for (const item of items) {
        const get = await ctx.api.op('GET', PATHS.project, { sessionId, projectId: item.id });
        expectStatus(get, 200);
        const { updatedAt, ...rest } = get.json;
        assert.deepEqual(rest, item);
      }
    });

    it('deletes missing projects, overwrites existing ones and creates unknown ones', async () => {
      const sessionId = await newSession(ctx.api);
      const a = { id: uuid(), ...projectInput({ name: 'A' }) };
      const b = { id: uuid(), ...projectInput({ name: 'B' }) };
      expectStatus(await ctx.api.op('PUT', PATHS.projects, { sessionId }, { json: [a, b] }), 200);

      const b2 = { id: b.id, name: 'B v2', architecture: 'SIC', files: { 'only.asm': 'X' } };
      const c = { id: uuid(), ...projectInput({ name: 'C' }) };
      const res = await ctx.api.op('PUT', PATHS.projects, { sessionId }, { json: [b2, c] });
      expectStatus(res, 200);
      assert.deepEqual(strip(res.json), [b2, c].map(summaryOf).sort(byId));

      expectError(await ctx.api.op('GET', PATHS.project, { sessionId, projectId: a.id }), 404, 'project-not-found');
      const gotB = await ctx.api.op('GET', PATHS.project, { sessionId, projectId: b.id });
      assert.deepEqual(gotB.json.files, { 'only.asm': 'X' }, 'overwritten projects lose files absent from the sync');
      assert.equal(gotB.json.name, 'B v2');
      expectStatus(await ctx.api.op('GET', PATHS.project, { sessionId, projectId: c.id }), 200);
    });

    it('also replaces projects created through the per-project route', async () => {
      const sessionId = await newSession(ctx.api);
      const loose = uuid();
      expectStatus(await ctx.api.op('PUT', PATHS.project, { sessionId, projectId: loose }, { json: projectInput() }), 201);
      const kept = { id: uuid(), ...projectInput({ name: 'Kept' }) };
      expectStatus(await ctx.api.op('PUT', PATHS.projects, { sessionId }, { json: [kept] }), 200);
      expectError(await ctx.api.op('GET', PATHS.project, { sessionId, projectId: loose }), 404, 'project-not-found');
    });

    it('is idempotent', async () => {
      const sessionId = await newSession(ctx.api);
      const items = [{ id: uuid(), ...projectInput() }, { id: uuid(), ...projectInput({ name: 'Two' }) }];
      const first = await ctx.api.op('PUT', PATHS.projects, { sessionId }, { json: items });
      const second = await ctx.api.op('PUT', PATHS.projects, { sessionId }, { json: items });
      expectStatus(first, 200);
      expectStatus(second, 200);
      assert.deepEqual(strip(second.json), strip(first.json));
      assert.deepEqual(strip(await list(ctx.api, sessionId)), strip(first.json));
    });

    it('an empty list deletes every project', async () => {
      const sessionId = await newSession(ctx.api);
      const items = [{ id: uuid(), ...projectInput() }];
      expectStatus(await ctx.api.op('PUT', PATHS.projects, { sessionId }, { json: items }), 200);
      const res = await ctx.api.op('PUT', PATHS.projects, { sessionId }, { json: [] });
      expectStatus(res, 200);
      assert.deepEqual(res.json, []);
      assert.deepEqual(await list(ctx.api, sessionId), []);
    });

    describe('validation failures return 400 invalid-request and leave the session untouched', () => {
      const good = () => ({ id: uuid(), ...projectInput() });
      const invalidBodies = {
        'body is not JSON': () => ({ body: '[{' }),
        'body is empty': () => ({ body: '' }),
        'body is an object, not an array': () => ({ json: good() }),
        'an item is not an object': () => ({ json: [good(), 'project'] }),
        'an item has no id': () => ({ json: [projectInput()] }),
        'an item id is not a UUID': () => ({ json: [{ ...good(), id: 'project-1' }] }),
        'an item id is not a string': () => ({ json: [{ ...good(), id: 1 }] }),
        'an item has no name': () => {
          const { name, ...item } = good();
          return { json: [item] };
        },
        'an item has an invalid architecture': () => ({ json: [{ ...good(), architecture: 'sic-xe' }] }),
        'an item has no files': () => {
          const { files, ...item } = good();
          return { json: [item] };
        },
        'an item has an invalid file path': () => ({ json: [good(), { ...good(), files: { '/x.asm': '' } }] }),
        'two items share the same id': () => {
          const item = good();
          return { json: [item, { ...item, name: 'Duplicate' }] };
        },
      };
      for (const [label, makeOptions] of Object.entries(invalidBodies)) {
        it(label, async () => {
          const sessionId = await newSession(ctx.api);
          const existing = [{ id: uuid(), ...projectInput({ name: 'Existing' }) }];
          const seeded = await ctx.api.op('PUT', PATHS.projects, { sessionId }, { json: existing });
          expectStatus(seeded, 200);
          const res = await ctx.api.op('PUT', PATHS.projects, { sessionId }, makeOptions());
          expectError(res, 400, 'invalid-request');
          assert.deepEqual(await list(ctx.api, sessionId), seeded.json, 'a rejected sync must not apply partially');
        });
      }
    });
  });
}
