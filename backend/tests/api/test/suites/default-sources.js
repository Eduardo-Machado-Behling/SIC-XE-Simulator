// The files a new project gets in the frontend, read from the frontend sources
// themselves: main.asm (the syntax tour) and macro.asm (the macro tour). Both
// load through the simulator WebSocket. macro.asm also runs to HALT with the
// values its comments state, and the language server has nothing to report
// in it.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_MACRO_SOURCE } from '../../../../../frontend/src/lib/simulator/defaultMacroSource.ts';
import { DEFAULT_MAIN_SOURCE } from '../../../../../frontend/src/lib/simulator/defaultMainSource.ts';
import { sessionWithProject } from '../support/fixtures.js';
import { connect } from './language-macros.js';
import { checkReport, macrosExpanded, openSimulator } from './ws-macros.js';

const FILES = { 'main.asm': DEFAULT_MAIN_SOURCE, 'macro.asm': DEFAULT_MACRO_SOURCE };

/**
 * Loads a new SIC-XE project holding both default files, then `load %<file>`. Returns the
 * open connection and that response; the caller closes the connection.
 */
async function openDefaultProject(ctx, file) {
  const { sessionId, projectId } = await sessionWithProject(ctx.api, {
    name: 'Default project',
    architecture: 'SIC-XE',
    files: FILES,
  });
  const client = await openSimulator(ctx.server.wsUrl);
  try {
    const project = await client.command(`load $${sessionId}/${projectId}`);
    assert.ok(project.result, `load $ failed: ${JSON.stringify(project.error)}`);
    return { client, response: await client.command(`load %${file}`) };
  } catch (error) {
    client.close();
    throw error;
  }
}

function symbolTable(events) {
  const assembled = events.filter((event) => event.type === 'ProgramAssembled');
  assert.equal(assembled.length, 1, 'one ProgramAssembled event');
  return new Map(assembled[0].details.symbols.map((symbol) => [symbol.name, symbol.value]));
}

export default function defaultSources(ctx) {
  describe('default project files of the frontend', () => {
    it('macro.asm expands, assembles and runs to HALT with N = 10, MAIOR = 10, TRIPLO = 30', async () => {
      const { client, response } = await openDefaultProject(ctx, 'macro.asm');
      try {
        assert.ok(response.result, `load %macro.asm failed: ${JSON.stringify(response.error)}`);
        const details = macrosExpanded(response);
        checkReport(details);
        assert.equal(details.ok, true);
        assert.equal(details.hasMacros, true);
        assert.deepEqual(details.diagnostics, []);
        assert.deepEqual(details.expansions.map((x) => [x.serial, x.macro, x.parent]), [
          [1, 'DOBRA', null], [2, 'SOMA', 1], [3, 'MAXIMO', null], [4, 'ESCALA', null], [5, 'MULTK', null],
        ]);

        // Memory as the MemoryWrite events leave it: the loaded program, then each step.
        const memory = new Map();
        const apply = (events) => events.filter((event) => event.type === 'MemoryWrite').forEach((event) => {
          event.value.forEach((byte, i) => memory.set(event.address + i, byte));
        });
        apply(response.result.events);
        const symbols = symbolTable(response.result.events);

        const executed = [];
        let steps = 0;
        while (!executed.includes('HALT') && steps < 50) {
          const step = await client.command('step');
          assert.ok(step.result, `step failed: ${JSON.stringify(step.error)}`);
          steps += 1;
          apply(step.result);
          step.result.filter((event) => event.type === 'InstructionExecuted')
            .forEach((event) => executed.push(event.instruction?.mnemonic));
        }
        // DOBRA 3, MAXIMO 4 (JGT skips LDA M), MULTK 3, then HALT: 11 steps.
        assert.deepEqual(executed, ['LDA', 'ADD', 'STA', 'LDA', 'COMP', 'JGT', 'STA', 'LDA', 'MUL', 'STA', 'HALT']);
        assert.equal(steps, 11);

        const word = (name) => {
          assert.ok(symbols.has(name), `symbol ${name} in the symbol table`);
          return [0, 1, 2].map((i) => memory.get(symbols.get(name) + i));
        };
        assert.deepEqual(word('N'), [0x00, 0x00, 0x0a], 'N = 0x00000A');
        assert.deepEqual(word('MAIOR'), [0x00, 0x00, 0x0a], 'MAIOR = 0x00000A');
        assert.deepEqual(word('TRIPLO'), [0x00, 0x00, 0x1e], 'TRIPLO = 0x00001E');
      } finally {
        client.close();
      }
    });

    it('macro.asm gets no diagnostics from the language server', async () => {
      const client = await connect(ctx.server.languageUrl);
      try {
        client.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } });
        assert.equal((await client.receive()).id, 1);
        client.send({ jsonrpc: '2.0', method: 'initialized', params: {} });

        const uri = 'sicxe://api-test/macro.asm';
        client.send({
          jsonrpc: '2.0',
          method: 'textDocument/didOpen',
          params: { textDocument: { uri, languageId: 'sicxe', version: 1, text: DEFAULT_MACRO_SOURCE } },
        });
        const published = await client.receive();
        assert.equal(published.method, 'textDocument/publishDiagnostics');
        assert.equal(published.params.uri, uri);
        assert.deepEqual(published.params.diagnostics, []);
      } finally {
        client.close();
      }
    });

    it('main.asm still loads with no error next to macro.asm', async () => {
      const { client, response } = await openDefaultProject(ctx, 'main.asm');
      try {
        assert.ok(response.result, `load %main.asm failed: ${JSON.stringify(response.error)}`);
        const details = macrosExpanded(response);
        assert.equal(details.ok, true);
        assert.equal(details.hasMacros, false);
        assert.equal(details.text, DEFAULT_MAIN_SOURCE);
        assert.ok(symbolTable(response.result.events).has('TABLE'), 'main.asm was assembled');
      } finally {
        client.close();
      }
    });
  });
}
