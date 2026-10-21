import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PATHS } from '../support/fixtures.js';
import { expectStatus } from '../support/http.js';
import { spec } from '../support/spec.js';

export default function healthAndArchitectures(ctx) {
  describe('GET /health', () => {
    it('returns 200 {"status":"ok"}', async () => {
      const res = await ctx.api.op('GET', PATHS.health);
      expectStatus(res, 200);
      assert.deepEqual(res.json, { status: 'ok' });
    });
  });

  describe('GET /simulator/architectures', () => {
    it('returns the supported architectures as Architecture enum values', async () => {
      const res = await ctx.api.op('GET', PATHS.architectures);
      expectStatus(res, 200);
      assert.ok(Array.isArray(res.json));
      assert.ok(res.json.length > 0, 'at least one architecture library is built');
      const allowed = spec.components.schemas.Architecture.enum;
      for (const arch of res.json) assert.ok(allowed.includes(arch), `${arch} is not in ${allowed}`);
      assert.equal(new Set(res.json).size, res.json.length, 'no duplicates');
    });

    it('lists SIC-XE, which is the architecture library this repository builds', async () => {
      const res = await ctx.api.op('GET', PATHS.architectures);
      assert.ok(res.json.includes('SIC-XE'), `got ${JSON.stringify(res.json)}`);
    });
  });
}
