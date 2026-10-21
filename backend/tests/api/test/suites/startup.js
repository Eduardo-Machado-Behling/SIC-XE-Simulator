// The api must own its port: httplib's default listen socket sets
// SO_REUSEPORT, which let a second api bind the same port and receive part of
// the connections, so in-memory sessions randomly answered 404. A second api
// now fails to start, and the test harness only talks to the api it started.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PATHS, newSession } from '../support/fixtures.js';
import { expectStatus } from '../support/http.js';
import { spawnApi, startServer } from '../support/server.js';

export default function startup(ctx) {
  describe('port ownership', () => {
    it('a second api on the same port exits with an error instead of sharing it', async () => {
      const second = spawnApi({ port: ctx.server.port });
      const result = await Promise.race([
        second.exited,
        new Promise((r) => setTimeout(() => r(null), 5000)),
      ]);
      if (result === null) {
        second.child.kill('SIGKILL');
        await second.exited;
        assert.fail(`a second api kept running on port ${ctx.server.port}:\n${second.output()}`);
      }
      assert.notEqual(result.code, 0, `second api exited with code 0:\n${second.output()}`);
      assert.match(second.output(), /Failed to bind/);

      const sessionId = await newSession(ctx.api);
      expectStatus(await ctx.api.op('GET', PATHS.session, { sessionId }), 200);
    });

    it('the harness refuses a port served by another api instead of using it', async () => {
      await assert.rejects(startServer({ port: ctx.server.port }), /Failed to bind|exited before listening/);
    });
  });
}
