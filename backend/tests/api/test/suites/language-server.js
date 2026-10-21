import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function connect(url) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('This integration suite requires the Node.js WebSocket client (Node 22 or newer).');
  }
  const socket = new WebSocket(url);
  const queue = [];
  const waiters = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else queue.push(message);
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve({
      send(message) {
        socket.send(JSON.stringify(message));
      },
      receive() {
        if (queue.length) return Promise.resolve(queue.shift());
        return new Promise((done) => waiters.push(done));
      },
      close() {
        socket.close();
      },
    }), { once: true });
    socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)), { once: true });
  });
}

export default function languageServer({ server }) {
  describe('assembler language WebSocket', () => {
    it('publishes diagnostics and serves completion requests without a simulator project', async () => {
      const client = await connect(server.languageUrl);
      try {
        client.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } });
        const initialized = await client.receive();
        assert.equal(initialized.id, 1);
        assert.equal(initialized.result.capabilities.textDocumentSync.change, 1);
        assert.ok(initialized.result.capabilities.experimental.sicxe.instructions.includes('LDA'));
        client.send({ jsonrpc: '2.0', method: 'initialized', params: {} });

        const uri = 'sicxe://api-test/main.asm';
        client.send({
          jsonrpc: '2.0',
          method: 'textDocument/didOpen',
          params: { textDocument: {
            uri,
            languageId: 'sicxe',
            version: 1,
            text: 'P START 0\nTARGET WORD 1\n LDA MISSING\n END P\n',
          } },
        });
        const published = await client.receive();
        assert.equal(published.method, 'textDocument/publishDiagnostics');
        assert.equal(published.params.uri, uri);
        assert.equal(published.params.version, 1);
        assert.ok(published.params.diagnostics.some((item) => item.message.includes("Undefined symbol 'MISSING'")));

        client.send({
          jsonrpc: '2.0',
          id: 2,
          method: 'textDocument/completion',
          params: { textDocument: { uri }, position: { line: 2, character: 5 } },
        });
        const completion = await client.receive();
        assert.equal(completion.id, 2);
        assert.ok(completion.result.items.some((item) => item.label === 'TARGET'));
      } finally {
        client.close();
      }
    });
  });
}
