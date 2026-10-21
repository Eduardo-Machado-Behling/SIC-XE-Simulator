// The /ws 'clear' command zero-fills the simulator memory and answers
// {"id","result":[{"type":"MemoryCleared"}]}; registers (PC included) are
// left alone. Every 'load %<file>' batch starts with the same event, so a
// client that applies the batch in order drops the previous program's bytes.
//
// This suite starts its own server, so "no project loaded" really means it.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createClient, expectStatus } from '../support/http.js';
import { startServer } from '../support/server.js';

// Opens /ws and sends one command at a time, resolving with its reply.
async function openWs(url, timeoutMs = 10000) {
  const socket = new WebSocket(url);
  const waiting = new Map();
  let nextId = 0;
  socket.addEventListener('message', (event) => {
    const reply = JSON.parse(event.data);
    waiting.get(reply.id)?.(reply);
    waiting.delete(reply.id);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', (e) => reject(new Error(`websocket error: ${e.message ?? e.type}`)), { once: true });
  });
  return {
    send(payload) {
      const id = `c${(nextId += 1)}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(new Error(`no reply to ${JSON.stringify(payload)} within ${timeoutMs}ms`));
        }, timeoutMs);
        waiting.set(id, (reply) => {
          clearTimeout(timer);
          resolve(reply);
        });
        socket.send(JSON.stringify({ id, type: 'command', payload }));
      });
    },
    close: () => socket.close(),
  };
}

// Assembled by hand (Beck, format 3 with immediate operand: n=0 i=1, so the
// first byte is LDA's opcode 00 + 1, then xbpe=0 and disp in 12 bits). This
// assembler reads START's operand as decimal unless it has a 0x prefix.
//   1000  010005  FIRST LDA #5
//   1003  010007        LDA #7
const PROGRAM = 'PROG    START   0x1000\nFIRST   LDA     #5\n        LDA     #7\n        END     FIRST\n';
const PROGRAM_BYTES = [0x01, 0x00, 0x05, 0x01, 0x00, 0x07];

const MEMORY_CLEARED = { type: 'MemoryCleared' };

export default function clearMemory() {
  describe('/ws clear (memory only)', () => {
    let server;
    let api;
    let ws;

    before(async () => {
      server = await startServer();
      api = createClient(server.baseUrl);
      ws = await openWs(server.wsUrl);
    });

    after(async () => {
      ws?.close();
      if (server) {
        assert.ok(server.isRunning(), `api exited; output:\n${server.output().slice(-4000)}`);
        await server.stop();
      }
    });

    async function result(payload) {
      const reply = await ws.send(payload);
      assert.ok(!('error' in reply), `${payload} failed: ${JSON.stringify(reply)}`);
      return reply.result;
    }

    async function loadProgram() {
      const put = await api.raw('PUT', '/simulator/project/file', {
        json: { filePath: 'main.asm', content: PROGRAM },
      });
      expectStatus(put, 200);
      return result('load %main.asm');
    }

    it('answers [MemoryCleared] even before a project is loaded', async () => {
      const reply = await ws.send('clear');
      assert.deepEqual(reply, { id: 'c1', result: [MEMORY_CLEARED] });
    });

    it('a load batch starts with MemoryCleared, before the program is written', async () => {
      await result('load $0');
      const events = await loadProgram();

      assert.deepEqual(events[0], MEMORY_CLEARED);
      const write = events.find((e) => e.type === 'MemoryWrite');
      assert.equal(write?.address, 0x1000, JSON.stringify(events));
      assert.deepEqual(write.value, PROGRAM_BYTES);
      assert.equal(events.filter((e) => e.type === 'MemoryCleared').length, 1);
    });

    it('after a clear, step fetches zeros where the program was and the registers are untouched', async () => {
      await loadProgram();

      const first = await result('step');
      assert.deepEqual(
        first.find((e) => e.type === 'InstructionFetched'),
        { type: 'InstructionFetched', address: 0x1000, value: [0x01, 0x00, 0x05, 0x01] },
      );

      // Only the event: no register is written, no memory is serialised.
      assert.deepEqual(await result('clear'), [MEMORY_CLEARED]);

      // PC still points after LDA #5, and the memory there is zero now.
      const second = await result('step');
      assert.deepEqual(
        second.find((e) => e.type === 'InstructionFetched'),
        { type: 'InstructionFetched', address: 0x1003, value: [0, 0, 0, 0] },
      );
      // 00000000 is LDA 0 in SIC format: it loads the (zero) word at 0 into A,
      // which still held the 5 of the first step.
      const a = second.find((e) => e.type === 'RegisterWrite' && e.name === 'A');
      assert.deepEqual(a, { type: 'RegisterWrite', name: 'A', value: [0, 0, 0], old_value: [0, 0, 5] });
    });

    it('loading again after a clear writes the program back', async () => {
      await result('clear');
      const events = await loadProgram();
      assert.deepEqual(events[0], MEMORY_CLEARED);

      const step = await result('step');
      assert.deepEqual(
        step.find((e) => e.type === 'InstructionFetched'),
        { type: 'InstructionFetched', address: 0x1000, value: [0x01, 0x00, 0x05, 0x01] },
      );
    });

    it('the server keeps answering after the clears', async () => {
      assert.deepEqual(await result('clear'), [MEMORY_CLEARED]);
      expectStatus(await api.raw('GET', '/health'), 200);
      assert.ok(server.isRunning());
    });
  });
}
