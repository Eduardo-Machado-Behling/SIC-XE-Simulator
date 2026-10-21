// The current frontend still calls these undocumented routes and the /ws
// protocol until issue #41 lands, so they must keep working.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expectStatus } from '../support/http.js';

function wsRequest(url, messages, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const replies = [];
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`timed out waiting for /ws replies, got ${JSON.stringify(replies)}`));
    }, timeoutMs);
    socket.addEventListener('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`websocket error: ${e.message ?? e.type}`));
    });
    socket.addEventListener('open', () => socket.send(JSON.stringify(messages[0])));
    socket.addEventListener('message', (event) => {
      replies.push(JSON.parse(event.data));
      if (replies.length === messages.length) {
        clearTimeout(timer);
        socket.close();
        resolve(replies);
      } else {
        socket.send(JSON.stringify(messages[replies.length]));
      }
    });
  });
}

export default function legacy(ctx) {
  describe('legacy routes (deprecated, kept for the current frontend)', () => {
    it('GET /heartbeat still answers', async () => {
      const res = await ctx.api.raw('GET', '/heartbeat');
      expectStatus(res, 200);
      assert.equal(res.json.language, 'C++');
    });

    it('GET /simulator/archs still lists the architecture libraries', async () => {
      const res = await ctx.api.raw('GET', '/simulator/archs');
      expectStatus(res, 200);
      assert.ok(res.json.archs.includes('sic-xe'));
    });

    it('GET /projects still lists the global (non-session) projects', async () => {
      const res = await ctx.api.raw('GET', '/projects');
      expectStatus(res, 200);
      assert.ok(Array.isArray(res.json));
      assert.ok(res.json.some((p) => p.id === '0'), 'the built-in demo project is listed');
    });

    it('PUT /simulator/project/file still answers with its legacy shape', async () => {
      const res = await ctx.api.raw('PUT', '/simulator/project/file', {
        json: { filePath: 'main.asm', content: '' },
      });
      expectStatus(res, 200);
      assert.equal(typeof res.json.message, 'string');
    });

    it('/ws: load $0, step, reset and clear answer with the documented envelopes', async () => {
      const replies = await wsRequest(ctx.server.wsUrl, [
        { id: 1, type: 'command', payload: 'load $0' },
        { id: 2, type: 'command', payload: 'step' },
        { id: 3, type: 'command', payload: 'reset' },
        { id: 4, type: 'command', payload: 'clear' },
      ]);
      assert.deepEqual(replies.map((r) => r.id), [1, 2, 3, 4]);
      const [load, step, reset, clear] = replies;
      assert.equal(load.result.project.id, '0');
      assert.equal(typeof load.result.arch, 'object');
      // backend/docs/websocket-protocol.md: step answers the events themselves,
      // reset and clear an event batch {from, to, events}.
      assert.ok(Array.isArray(step.result), JSON.stringify(step));
      for (const batch of [reset, clear]) {
        assert.ok(Array.isArray(batch.result?.events), JSON.stringify(batch));
        assert.ok(Number.isInteger(batch.result.from) && Number.isInteger(batch.result.to), JSON.stringify(batch));
      }
      assert.ok(clear.result.events.some((e) => e.type === 'ProgramCleared'), JSON.stringify(clear));
    });
  });
}
