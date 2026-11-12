// The macro processor on the simulator WebSocket. `load %<file>` expands
// MCDEFN/MCEND macros before assembling and reports MASMAPRG.ASM, the tables,
// the line map and the trace in a MacrosExpanded event, on success and on
// failure (spec section 5).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { sessionWithProject } from '../support/fixtures.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEMO = readFileSync(path.resolve(here, '../../../../lib/sic-xe/test/data/macro_demo.asm'), 'utf8');

// Figure 4.12 of the slides with SIC/XE operations: a definition of B nested in A.
const FIGURE_4_12 = 'MCDEFN\nA FORMAL1\nLDA FORMAL1\nMCDEFN\nB FORMAL2\nSTA FORMAL2\nMCEND\nMCEND\nA ACTUAL1\nB ACTUAL2\n';

const PLAIN = 'PROG    START 0\n        LDA     VALUE\nVALUE   WORD    10\n        END     PROG\n';

const ERROR_IN_EXPANSION = [
  '        MCDEFN',
  '        CARREGA X',
  '        LDA X',
  '        MCEND',
  'PROG    START 0',
  '        CARREGA NADA',
  '        END PROG',
  '',
].join('\n');

const LINE_KINDS = ['verbatim', 'call', 'label', 'expanded'];
const ACTIONS = ['copy', 'define-start', 'prototype', 'store', 'define-end', 'call', 'read-prototype',
  'expansion-end', 'error'];

export function openSimulator(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const done = pending.get(message.id);
    if (done) {
      pending.delete(message.id);
      done(message);
    }
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve({
      command(payload) {
        const id = nextId;
        nextId += 1;
        return new Promise((done) => {
          pending.set(id, done);
          socket.send(JSON.stringify({ id, type: 'command', payload }));
        });
      },
      close() {
        socket.close();
      },
    }), { once: true });
    socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)), { once: true });
  });
}

/**
 * Loads `source` as main.asm of a new SIC-XE project; returns the open connection and the
 * `load %main.asm` response. The caller closes the connection.
 */
async function openLoaded(ctx, source) {
  const { sessionId, projectId } = await sessionWithProject(ctx.api, {
    name: 'Macros',
    architecture: 'SIC-XE',
    files: { 'main.asm': source },
  });
  const client = await openSimulator(ctx.server.wsUrl);
  try {
    const project = await client.command(`load $${sessionId}/${projectId}`);
    assert.ok(project.result, `load $ failed: ${JSON.stringify(project.error)}`);
    return { client, response: await client.command('load %main.asm') };
  } catch (error) {
    client.close();
    throw error;
  }
}

/** Loads `source` as main.asm of a new SIC-XE project; returns the `load %main.asm` response. */
async function loadSource(ctx, source) {
  const { client, response } = await openLoaded(ctx, source);
  client.close();
  return response;
}

const eventsOf = (response) => response.result?.events ?? response.error?.events ?? [];

export function macrosExpanded(response) {
  const found = eventsOf(response).filter((event) => event.type === 'MacrosExpanded');
  assert.equal(found.length, 1, `expected one MacrosExpanded event in ${JSON.stringify(response).slice(0, 500)}`);
  return found[0].details;
}

const isLine = (value) => Number.isInteger(value) && value >= 1;
const nullOrLine = (value) => value === null || isLine(value);

function hasKeys(object, expected, where) {
  assert.ok(object !== null && typeof object === 'object' && !Array.isArray(object), `${where} is not an object`);
  assert.deepEqual(Object.keys(object).sort(), [...expected].sort(), `${where} keys`);
}

// The MacrosExpanded contract shared with the frontend (spec section 5).
export function checkReport(details) {
  hasKeys(details, ['file', 'ok', 'hasMacros', 'text', 'diagnostics', 'names', 'definitions', 'expansions',
    'lineMap', 'trace'], 'details');
  assert.equal(details.file, 'MASMAPRG.ASM');
  assert.equal(typeof details.ok, 'boolean');
  assert.equal(typeof details.hasMacros, 'boolean');
  assert.equal(typeof details.text, 'string');

  details.diagnostics.forEach((item, i) => {
    hasKeys(item, ['severity', 'line', 'column', 'length', 'message'], `diagnostics[${i}]`);
    assert.ok(['error', 'warning'].includes(item.severity), `diagnostics[${i}].severity`);
    assert.ok([item.line, item.column, item.length].every(Number.isInteger), `diagnostics[${i}] position`);
    assert.equal(typeof item.message, 'string');
  });

  details.names.forEach((item, i) => {
    hasKeys(item, ['name', 'definition', 'line'], `names[${i}]`);
    assert.equal(typeof item.name, 'string');
    assert.ok(Number.isInteger(item.definition) && Number.isInteger(item.line), `names[${i}] numbers`);
  });

  details.definitions.forEach((item, i) => {
    const where = `definitions[${i}]`;
    hasKeys(item, ['index', 'name', 'prototype', 'labelFormal', 'formals', 'active', 'origin', 'body'], where);
    assert.equal(item.index, i);
    assert.equal(typeof item.name, 'string');
    assert.equal(typeof item.prototype, 'string');
    assert.ok(item.labelFormal === null || (typeof item.labelFormal === 'string' && item.labelFormal !== ''),
      `${where}.labelFormal`);
    assert.equal(typeof item.active, 'boolean');
    item.formals.forEach((formal, j) => {
      hasKeys(formal, ['name', 'default'], `${where}.formals[${j}]`);
      assert.equal(typeof formal.name, 'string');
      assert.ok(formal.default === null || typeof formal.default === 'string', `${where}.formals[${j}].default`);
    });
    if (item.origin.kind === 'source') {
      hasKeys(item.origin, ['kind', 'line'], `${where}.origin`);
      assert.ok(isLine(item.origin.line), `${where}.origin.line`);
    } else {
      hasKeys(item.origin, ['kind', 'serial'], `${where}.origin`);
      assert.equal(item.origin.kind, 'expansion');
      assert.ok(isLine(item.origin.serial), `${where}.origin.serial`);
    }
    item.body.forEach((line, j) => {
      hasKeys(line, ['text', 'line'], `${where}.body[${j}]`);
      assert.equal(typeof line.text, 'string');
      assert.ok(item.origin.kind === 'source' ? nullOrLine(line.line) : line.line === null, `${where}.body[${j}].line`);
    });
  });

  details.expansions.forEach((item, i) => {
    const where = `expansions[${i}]`;
    hasKeys(item, ['serial', 'macro', 'definition', 'parent', 'depth', 'callLine', 'callText', 'actuals', 'output'],
      where);
    assert.ok(isLine(item.serial) && nullOrLine(item.parent) && isLine(item.depth) && isLine(item.callLine), where);
    assert.ok(Number.isInteger(item.definition), `${where}.definition`);
    assert.equal(typeof item.macro, 'string');
    assert.equal(typeof item.callText, 'string');
    item.actuals.forEach((actual, j) => {
      hasKeys(actual, ['index', 'formal', 'value'], `${where}.actuals[${j}]`);
      assert.ok(Number.isInteger(actual.index), `${where}.actuals[${j}].index`);
      assert.equal(typeof actual.formal, 'string');
      assert.equal(typeof actual.value, 'string');
    });
    hasKeys(item.output, ['from', 'to'], `${where}.output`);
    assert.ok(Number.isInteger(item.output.from) && Number.isInteger(item.output.to), `${where}.output`);
  });

  details.lineMap.forEach((item, i) => {
    hasKeys(item, ['output', 'source', 'kind', 'serial'], `lineMap[${i}]`);
    assert.equal(item.output, i + 1);
    assert.ok(nullOrLine(item.source) && nullOrLine(item.serial), `lineMap[${i}] numbers`);
    assert.ok(LINE_KINDS.includes(item.kind), `lineMap[${i}].kind ${item.kind}`);
  });

  hasKeys(details.trace, ['truncated', 'steps'], 'trace');
  assert.equal(typeof details.trace.truncated, 'boolean');
  details.trace.steps.forEach((item, i) => {
    const where = `trace.steps[${i}]`;
    hasKeys(item, ['step', 'read', 'd', 'e', 'depth', 'text', 'action', 'target'], where);
    assert.equal(item.step, i + 1);
    assert.ok(Number.isInteger(item.d) && Number.isInteger(item.depth), `${where} counters`);
    assert.equal(typeof item.e, 'boolean', `${where}.e must be a JSON boolean`);
    assert.equal(typeof item.text, 'string');
    if (item.read.from === 'source') {
      hasKeys(item.read, ['from', 'line'], `${where}.read`);
      assert.ok(isLine(item.read.line), `${where}.read.line`);
    } else {
      hasKeys(item.read, ['from', 'serial', 'bodyLine'], `${where}.read`);
      assert.equal(item.read.from, 'expansion');
      assert.ok(isLine(item.read.serial) && isLine(item.read.bodyLine), `${where}.read`);
    }
    assert.ok(ACTIONS.includes(item.action), `${where}.action ${item.action}`);
    const { action, target } = item;
    if (action === 'copy') {
      hasKeys(target, ['output'], `${where}.target`);
      assert.ok(isLine(target.output), `${where}.target.output`);
    } else if (action === 'call') {
      hasKeys(target, ['serial'], `${where}.target`);
      assert.ok(isLine(target.serial), `${where}.target.serial`);
    } else if (['store', 'prototype', 'define-end'].includes(action)) {
      // Null when the line never entered a definition; definition 0 is a real one.
      if (target !== null) {
        hasKeys(target, ['definition', 'bodyLine'], `${where}.target`);
        assert.ok(Number.isInteger(target.definition) && target.definition >= 0, `${where}.target.definition`);
        assert.ok(isLine(target.bodyLine), `${where}.target.bodyLine`);
      }
    } else {
      assert.equal(target, null, `${where}.target`);
    }
  });
}

export default function wsMacros(ctx) {
  describe('macro processor on the simulator WebSocket', () => {
    it('expands macros before assembling and reports them in MacrosExpanded', async () => {
      const response = await loadSource(ctx, DEMO);
      assert.ok(response.result, `load % failed: ${JSON.stringify(response.error)}`);
      const details = macrosExpanded(response);
      checkReport(details);
      assert.equal(details.ok, true);
      assert.equal(details.hasMacros, true);
      assert.ok(details.text.includes('FIM003'), 'MASMAPRG.ASM has the third MAXIMO label');
      assert.ok(!details.text.includes('MCDEFN'), 'definitions are not in MASMAPRG.ASM');
      assert.equal(details.expansions.length, 5);

      const types = response.result.events.map((event) => event.type);
      assert.ok(types.indexOf('ProgramAssembled') > types.indexOf('MacrosExpanded'),
        `MacrosExpanded must come before ProgramAssembled: ${types.join(', ')}`);
      assert.ok(types.includes('ProgramCleared') && types.includes('MacrosExpanded'),
        `both events are sent: ${types.join(', ')}`);
      assert.ok(types.indexOf('MacrosExpanded') > types.indexOf('ProgramCleared'), 'after the clear');
    });

    it('runs the demo program to HALT with the values of spec 7', async () => {
      const { client, response } = await openLoaded(ctx, DEMO);
      try {
        assert.ok(response.result, `load % failed: ${JSON.stringify(response.error)}`);
        // Memory as the MemoryWrite events leave it: the loaded program, then each step.
        const memory = new Map();
        const apply = (events) => events.filter((event) => event.type === 'MemoryWrite').forEach((event) => {
          event.value.forEach((byte, i) => memory.set(event.address + i, byte));
        });
        apply(response.result.events);

        const executed = [];
        while (!executed.includes('HALT') && executed.length < 50) {
          const step = await client.command('step');
          assert.ok(step.result, `step failed: ${JSON.stringify(step.error)}`);
          apply(step.result);
          step.result.filter((event) => event.type === 'InstructionExecuted')
            .forEach((event) => executed.push(event.instruction?.mnemonic));
        }
        // DOBRA 3, MAXIMO 4 (JGT skips LDA M), MULTK 3, then HALT: the 11th.
        assert.deepEqual(executed, ['LDA', 'ADD', 'STA', 'LDA', 'COMP', 'JGT', 'STA', 'LDA', 'MUL', 'STA', 'HALT']);

        const word = (address) => [0, 1, 2].map((i) => memory.get(address + i));
        assert.deepEqual(word(0x22), [0x00, 0x00, 0x0a], 'N = 10 at 0x22');
        assert.deepEqual(word(0x28), [0x00, 0x00, 0x0a], 'MAIOR = 10 at 0x28');
        assert.deepEqual(word(0x2b), [0x00, 0x00, 0x1e], 'TRIPLO = 30 at 0x2B');
      } finally {
        client.close();
      }
    });

    it('keeps source_line on MASMAPRG.ASM, the text that was assembled', async () => {
      const response = await loadSource(ctx, DEMO);
      const details = macrosExpanded(response);
      const fetched = response.result.events.filter((event) => event.type === 'InstructionFetched').at(-1);
      assert.ok(fetched && isLine(fetched.source_line), 'the preview fetch carries a source line');

      // The entry point INICIO is the first line of DOBRA's nested SOMA expansion.
      const output = details.text.split('\n');
      assert.match(output[fetched.source_line - 1], /^INICIO\s+LDA\s+N\b/);
      const origin = details.lineMap[fetched.source_line - 1];
      assert.equal(origin.kind, 'expanded');
      assert.equal(origin.source, DEMO.split('\n').findIndex((line) => line.startsWith('INICIO')) + 1);
    });

    it('reports a macro error in error.detail and still sends MacrosExpanded', async () => {
      const response = await loadSource(ctx, '        MCEND\n');
      assert.ok(response.error, 'load % must fail');
      assert.match(response.error.detail, /^1:9: error: MCEND without MCDEFN$/m);
      const details = macrosExpanded(response);
      checkReport(details);
      assert.equal(details.ok, false);
      assert.deepEqual(details.diagnostics, [
        { severity: 'error', line: 1, column: 9, length: 5, message: 'MCEND without MCDEFN' },
      ]);
      assert.ok(!response.error.events.some((event) => event.type === 'ProgramAssembled'), 'nothing was assembled');
    });

    it('maps an assembler error inside an expansion back to the call', async () => {
      const response = await loadSource(ctx, ERROR_IN_EXPANSION);
      assert.ok(response.error, 'load % must fail');
      assert.match(response.error.detail,
        /^6:9: error: In expansion of CARREGA \(#001, MASMAPRG\.ASM:3\): Undefined symbol 'NADA'$/m);
      const details = macrosExpanded(response);
      checkReport(details);
      assert.equal(details.ok, true);
      assert.ok(!response.error.events.some((event) => event.type === 'ProgramAssembled'), 'nothing was assembled');
    });

    it('reports a source without macros unchanged', async () => {
      const response = await loadSource(ctx, PLAIN);
      assert.ok(response.result, `load % failed: ${JSON.stringify(response.error)}`);
      const details = macrosExpanded(response);
      checkReport(details);
      assert.equal(details.hasMacros, false);
      assert.equal(details.text, PLAIN);
      // Identity, including the empty segment after the final newline.
      assert.deepEqual(details.lineMap.map((item) => [item.source, item.kind, item.serial]),
        [1, 2, 3, 4, 5].map((line) => [line, 'verbatim', null]));
    });

    it('does not run the macro processor on a hexadecimal dump', async () => {
      const response = await loadSource(ctx, '; hex dump\n00 01 02\n');
      assert.ok(response.result, `load % failed: ${JSON.stringify(response.error)}`);
      assert.ok(!response.result.events.some((event) => event.type === 'MacrosExpanded'));
    });

    it('serializes the Figure 4.12 trace, tables and targets', async () => {
      const details = macrosExpanded(await loadSource(ctx, FIGURE_4_12));
      checkReport(details);
      assert.equal(details.hasMacros, true);
      assert.equal(details.trace.truncated, false);
      const { steps } = details.trace;
      assert.equal(steps.length, 20);

      const source = (line) => ({ from: 'source', line });
      const expansion = (serial, bodyLine) => ({ from: 'expansion', serial, bodyLine });
      assert.deepEqual(steps.map((s) => s.read), [
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(source),
        ...[1, 2, 3, 4, 5, 6, 7].map((line) => expansion(1, line)),
        source(10),
        ...[1, 2, 3].map((line) => expansion(2, line)),
      ]);
      assert.deepEqual(steps.map((s) => s.d), [0, 1, 1, 1, 2, 2, 2, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
      assert.deepEqual(steps.map((s) => s.e), steps.map((_, i) => !(i < 9 || i === 16)));
      assert.deepEqual(steps.map((s) => s.depth), steps.map((_, i) => (i < 9 || i === 16 ? 0 : 1)));

      const definition = (index, bodyLine) => ({ definition: index, bodyLine });
      assert.deepEqual(steps.map((s) => [s.action, s.target]), [
        ['define-start', null], ['prototype', definition(0, 1)], ['store', definition(0, 2)],
        ['store', definition(0, 3)], ['store', definition(0, 4)], ['store', definition(0, 5)],
        ['store', definition(0, 6)], ['define-end', definition(0, 7)], ['call', { serial: 1 }],
        ['read-prototype', null], ['copy', { output: 2 }], ['define-start', null],
        ['prototype', definition(1, 1)], ['store', definition(1, 2)], ['define-end', definition(1, 3)],
        ['expansion-end', null], ['call', { serial: 2 }], ['read-prototype', null],
        ['copy', { output: 4 }], ['expansion-end', null],
      ]);
      assert.equal(steps[10].text, 'LDA ACTUAL1');

      const [a, b] = details.definitions;
      assert.equal(details.definitions.length, 2);
      assert.deepEqual(a.origin, { kind: 'source', line: 1 });
      assert.deepEqual(a.body.map((line) => line.line), [2, 3, 4, 5, 6, 7, 8]);
      assert.equal(a.labelFormal, null);
      assert.deepEqual(a.formals, [{ name: 'FORMAL1', default: null }]);
      assert.deepEqual(b.origin, { kind: 'expansion', serial: 1 });
      assert.deepEqual(b.body, [
        { text: 'B FORMAL2', line: null }, { text: 'STA #1', line: null }, { text: 'MCEND', line: null },
      ]);
      assert.deepEqual(details.names, [
        { name: 'A', definition: 0, line: 2 }, { name: 'B', definition: 1, line: 0 },
      ]);
      assert.deepEqual(details.expansions.map((x) => [x.serial, x.macro, x.parent, x.depth, x.callLine, x.output]), [
        [1, 'A', null, 1, 9, { from: 1, to: 2 }], [2, 'B', null, 1, 10, { from: 3, to: 4 }],
      ]);
      assert.deepEqual(details.expansions[0].actuals, [{ index: 1, formal: 'FORMAL1', value: 'ACTUAL1' }]);
    });
  });
}
