// The macro processor on the assembler language WebSocket. A limit that stops the
// processing leaves a partial MASMAPRG.ASM, which the language server must not assemble:
// DOBRA V+V builds a ~262 KB LDA #1+1+... line whose expression overflowed the
// assembler's stack and took the whole api process down.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const DOBRA = 'PROG START 0\nMCDEFN\nDOBRA V\nLDA #V\nDOBRA V+V\nMCEND\nDOBRA 1\nEND PROG\n';

const TIMEOUT_MS = 10000;

// A JSON-RPC client whose receive() fails when the connection closes or nothing arrives in
// time, so a server that dies shows up as a failure instead of a hang.
export function connect(url) {
  const socket = new WebSocket(url);
  const queue = [];
  const waiters = [];
  let closed = null;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(message);
    else queue.push(message);
  });
  socket.addEventListener('close', (event) => {
    closed = new Error(`the language connection closed (code ${event.code})`);
    for (const waiter of waiters.splice(0)) waiter.reject(closed);
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve({
      send(message) {
        socket.send(JSON.stringify(message));
      },
      receive() {
        if (queue.length) return Promise.resolve(queue.shift());
        if (closed) return Promise.reject(closed);
        return new Promise((resolve, reject) => {
          const waiter = {
            resolve: (message) => { clearTimeout(timer); resolve(message); },
            reject: (error) => { clearTimeout(timer); reject(error); },
          };
          const timer = setTimeout(() => {
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(new Error(`no language message within ${TIMEOUT_MS}ms`));
          }, TIMEOUT_MS);
          waiters.push(waiter);
        });
      },
      close() {
        socket.close();
      },
    }), { once: true });
    socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)), { once: true });
  });
}

export default function languageMacros(ctx) {
  describe('macro processor on the assembler language WebSocket', () => {
    it('a stopped expansion publishes the byte limit and the server keeps answering', async () => {
      const client = await connect(ctx.server.languageUrl);
      try {
        client.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } });
        assert.equal((await client.receive()).id, 1);
        client.send({ jsonrpc: '2.0', method: 'initialized', params: {} });

        const uri = 'sicxe://api-test/dobra.asm';
        client.send({
          jsonrpc: '2.0',
          method: 'textDocument/didOpen',
          params: { textDocument: { uri, languageId: 'sicxe', version: 1, text: DOBRA } },
        });
        const published = await client.receive();
        assert.equal(published.method, 'textDocument/publishDiagnostics');
        assert.equal(published.params.uri, uri);
        assert.deepEqual(published.params.diagnostics, [{
          range: { start: { line: 6, character: 0 }, end: { line: 6, character: 5 } },
          severity: 1,
          source: 'SIC/XE macro processor',
          message: 'Macro output too long (limit 1048576 bytes)',
        }]);

        // One more request on the same document: the server is still there, and with the
        // partial output not assembled, PROG is no known symbol.
        client.send({
          jsonrpc: '2.0',
          id: 2,
          method: 'textDocument/hover',
          params: { textDocument: { uri }, position: { line: 7, character: 5 } },
        });
        const hover = await client.receive();
        assert.equal(hover.id, 2);
        assert.equal(hover.result, null);
      } finally {
        client.close();
      }
      assert.ok(ctx.server.isRunning(), `api exited; output:\n${ctx.server.output().slice(-4000)}`);
    });
  });
}
