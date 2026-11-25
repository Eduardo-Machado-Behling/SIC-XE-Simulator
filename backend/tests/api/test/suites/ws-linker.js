// The linker on the simulator WebSocket. `load [@<hex>] %<path> [%<path> ...]` assembles each
// file, links them (the ENTRY file first) and loads the program at the address, reporting a
// MacrosExpanded event per file and one ProgramLinked event before memory is written.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sessionWithProject } from '../support/fixtures.js';
import { openSimulator } from './ws-macros.js';

// RSUB at 0, INICIO +JSUB at 3 (field at 4), HALT at 7; SUBB is placed after it, at 8.
const MAIN = [
  'PROG    ENTRY 0',
  '        EXTREF SUBB',
  '        RSUB',
  'INICIO +JSUB SUBB',
  '        HALT',
  '        END INICIO',
  '',
].join('\n');
const SUB = 'SUBB    START 0\n        RSUB\n        END\n';
const BROKEN = 'PROG    ENTRY 0\n        EXTREF NOWHERE\n       +JSUB NOWHERE\n        END\n';
const PLAIN = 'PLAIN   START 0\n        LDA #5\n        HALT\n        END PLAIN\n';

const eventsOf = (response) => response.result?.events ?? response.error?.events ?? [];

/** A new SIC-XE project holding `files`, loaded on a fresh connection. The caller closes it. */
async function openProject(ctx, files) {
  const { sessionId, projectId } = await sessionWithProject(ctx.api, { name: 'Linker', architecture: 'SIC-XE', files });
  const client = await openSimulator(ctx.server.wsUrl);
  const project = await client.command(`load $${sessionId}/${projectId}`);
  assert.ok(project.result, `load $ failed: ${JSON.stringify(project.error)}`);
  return client;
}

function lastPreview(events) {
  const fetched = events.filter((event) => event.type === 'InstructionFetched' && event.preview);
  return fetched.at(-1);
}

export default function wsLinker(ctx) {
  describe('linking several files over the simulator WebSocket', () => {
    it('links two files and loads them at 1000', async () => {
      const client = await openProject(ctx, { 'main.asm': MAIN, 'sub.asm': SUB });
      try {
        const response = await client.command('load @1000 %main.asm %sub.asm');
        assert.ok(response.result, `load failed: ${JSON.stringify(response.error)}`);
        const events = eventsOf(response);
        const types = events.map((event) => event.type);
        const linked = types.indexOf('ProgramLinked');
        assert.ok(linked > 0, 'one ProgramLinked event');
        const macros = events.filter((event) => event.type === 'MacrosExpanded');
        assert.deepEqual(macros.map((event) => event.details.source), ['main.asm', 'sub.asm']);
        assert.ok(types.lastIndexOf('MacrosExpanded') < linked, 'every MacrosExpanded comes before ProgramLinked');
        assert.ok(types.indexOf('MemoryWrite') > linked, 'memory is written after linking');
        assert.equal(events[linked].details.loadAddress, 0x1000);
        // PC starts at INICIO, and the +JSUB field holds SUBB's loaded address, 0x1008.
        const preview = lastPreview(events);
        assert.equal(preview.address, 0x1003);
        assert.deepEqual(preview.value, [0x4b, 0x10, 0x10, 0x08]);
        assert.equal(preview.source_file, 'main.asm');
      } finally {
        client.close();
      }
    });

    it('keeps a single path as today, plus ProgramLinked', async () => {
      const client = await openProject(ctx, { 'main.asm': PLAIN });
      try {
        const response = await client.command('load %main.asm');
        assert.ok(response.result, `load failed: ${JSON.stringify(response.error)}`);
        const types = eventsOf(response).map((event) => event.type);
        const linked = types.indexOf('ProgramLinked');
        assert.ok(types.indexOf('MacrosExpanded') >= 0 && types.indexOf('MacrosExpanded') < linked);
        assert.ok(linked < types.indexOf('ProgramAssembled'));
        assert.equal(types.at(-1), 'InstructionFetched');
        assert.equal(lastPreview(eventsOf(response)).address, 0);
      } finally {
        client.close();
      }
    });

    it('loads a path with spaces', async () => {
      const client = await openProject(ctx, { 'my file.asm': PLAIN });
      try {
        const response = await client.command('load %my file.asm');
        assert.ok(response.result, `load failed: ${JSON.stringify(response.error)}`);
      } finally {
        client.close();
      }
    });

    it('reports link errors with their file, a bad address and a repeated path', async () => {
      const client = await openProject(ctx, { 'main.asm': BROKEN, 'sub.asm': SUB });
      try {
        const broken = await client.command('load %main.asm %sub.asm');
        assert.ok(broken.error, 'the link must fail');
        assert.match(broken.error.detail, /main\.asm:3/);
        assert.match(broken.error.detail, /undefined external symbol NOWHERE/);
        assert.ok(eventsOf(broken).some((event) => event.type === 'ProgramLinked'), 'what was built is still sent');

        const far = await client.command('load @FFFFFFF %sub.asm');
        assert.ok(far.error);
        assert.match(far.error.detail, /out of range/);

        const twice = await client.command('load %sub.asm %sub.asm');
        assert.ok(twice.error);
        assert.match(twice.error.detail, /listed twice/);
      } finally {
        client.close();
      }
    });

    it('names the file of each fetched instruction', async () => {
      const client = await openProject(ctx, { 'main.asm': MAIN, 'sub.asm': SUB });
      try {
        const loaded = await client.command('load @1000 %main.asm %sub.asm');
        assert.ok(loaded.result, `load failed: ${JSON.stringify(loaded.error)}`);
        const step = await client.command('step');
        assert.ok(step.result, `step failed: ${JSON.stringify(step.error)}`);
        const preview = lastPreview(step.result);
        assert.equal(preview.address, 0x1008);
        assert.equal(preview.source_file, 'sub.asm');
        assert.equal(preview.source_line, 2);
      } finally {
        client.close();
      }
    });
  });
}
