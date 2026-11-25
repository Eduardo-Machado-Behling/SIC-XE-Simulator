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

export default function languageServer(ctx) {
  describe('assembler language WebSocket', () => {
    it('publishes diagnostics and serves completion requests without a simulator project', async () => {
      const client = await connect(ctx.server.languageUrl);
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

    it('knows the linker directives: completion, hover and single-file diagnostics', async () => {
      const client = await connect(ctx.server.languageUrl);
      try {
        client.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } });
        const initialized = await client.receive();
        for (const name of ['CSECT', 'EXTDEF', 'EXTREF', 'ENTRY'])
          assert.ok(initialized.result.capabilities.experimental.sicxe.directives.includes(name), `${name} is a directive`);
        client.send({ jsonrpc: '2.0', method: 'initialized', params: {} });

        const uri = 'sicxe://api-test/linked.asm';
        client.send({
          jsonrpc: '2.0',
          method: 'textDocument/didOpen',
          params: { textDocument: { uri, languageId: 'sicxe', version: 1,
            text: 'PROG ENTRY 0\n EXTREF X1\n JSUB X1\nENTRY LDA #5\n END\n' } },
        });
        const published = await client.receive();
        const messages = published.params.diagnostics.map((item) => `${item.range.start.line + 1}: ${item.message}`);
        assert.ok(messages.includes('3: X1 is an external reference; use +JSUB X1 (format 4)'), messages.join('\n'));
        assert.ok(messages.includes('4: ENTRY is a directive since stage 4; rename this label'), messages.join('\n'));

        client.send({ jsonrpc: '2.0', id: 2, method: 'textDocument/completion',
          params: { textDocument: { uri }, position: { line: 1, character: 1 } } });
        const completion = await client.receive();
        for (const name of ['CSECT', 'EXTDEF', 'EXTREF', 'ENTRY'])
          assert.ok(completion.result.items.some((item) => item.label === name), `${name} is offered`);

        client.send({ jsonrpc: '2.0', id: 3, method: 'textDocument/hover',
          params: { textDocument: { uri }, position: { line: 1, character: 3 } } });
        const hover = await client.receive();
        assert.match(hover.result.contents.value, /defined in another control section/);

        // Whether NOWHERE exists is the linker's question, asked at Run: no diagnostic here.
        const alone = 'sicxe://api-test/alone.asm';
        client.send({
          jsonrpc: '2.0',
          method: 'textDocument/didOpen',
          params: { textDocument: { uri: alone, languageId: 'sicxe', version: 1,
            text: 'P START 0\n EXTREF NOWHERE\n +JSUB NOWHERE\n END\n' } },
        });
        const quiet = await client.receive();
        assert.equal(quiet.params.uri, alone);
        assert.deepEqual(quiet.params.diagnostics, []);
      } finally {
        client.close();
      }
    });
  });
}
