import { randomUUID } from 'node:crypto';

import { expectStatus } from './http.js';

export const PATHS = {
  health: '/health',
  architectures: '/simulator/architectures',
  sessions: '/sessions',
  session: '/sessions/{sessionId}',
  projects: '/sessions/{sessionId}/projects',
  project: '/sessions/{sessionId}/projects/{projectId}',
  files: '/sessions/{sessionId}/projects/{projectId}/files',
};

// The test server is started with this body limit so 413 is cheap to trigger.
export const TEST_MAX_BODY_BYTES = 256 * 1024;

export const uuid = () => randomUUID();

export const MAIN_ASM = 'MAIN    START   1000\n        LDA     VALUE\n        STA     RESULT\n        END     MAIN\n';
export const DATA_ASM = 'VALUE   WORD    10\nRESULT  RESW    1\n';

export function projectInput(overrides = {}) {
  return {
    name: 'Hello World',
    architecture: 'SIC-XE',
    files: { 'main.asm': MAIN_ASM, 'data.asm': DATA_ASM },
    ...overrides,
  };
}

export async function newSession(api) {
  const res = await api.op('POST', PATHS.sessions);
  expectStatus(res, 201);
  return res.json.sessionId;
}

/** Creates a session plus one project in it; returns their ids and the project. */
export async function sessionWithProject(api, input = projectInput()) {
  const sessionId = await newSession(api);
  const projectId = uuid();
  const res = await api.op('PUT', PATHS.project, { sessionId, projectId }, { json: input });
  expectStatus(res, 201);
  return { sessionId, projectId, project: res.json };
}

/** A JSON text of exactly `size` bytes that is a valid body apart from its size. */
export function paddedJson(size, build) {
  const probe = JSON.stringify(build(''));
  const pad = size - Buffer.byteLength(probe);
  if (pad < 0) throw new Error('size too small for the payload skeleton');
  const text = JSON.stringify(build('x'.repeat(pad)));
  if (Buffer.byteLength(text) !== size) throw new Error('padding miscalculated');
  return text;
}
