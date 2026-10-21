// API-level tests for the SIC/XE simulator backend.
//
// Starts the real `api` binary on a free local port and checks every
// operation of api_spec/openapi.yaml: behaviour, status codes, and that each
// response conforms to the documented schema. The final test fails if any
// documented (method, path, status) — other than 500 — was never exercised.
//
// Run from the repository root:  npm --prefix backend/tests/api test

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { TEST_MAX_BODY_BYTES } from './support/fixtures.js';
import { createClient } from './support/http.js';
import { startServer } from './support/server.js';
import { documentedOperations, uncoveredResponses } from './support/spec.js';

import contract from './suites/contract.js';
import errorsAndLimits from './suites/errors-limits.js';
import fileOperations from './suites/files.js';
import healthAndArchitectures from './suites/health-architectures.js';
import isolationAndConcurrency from './suites/isolation-concurrency.js';
import legacy from './suites/legacy.js';
import projects from './suites/projects.js';
import sessions from './suites/sessions.js';
import startup from './suites/startup.js';
import storageLimits from './suites/storage-limits.js';
import sync from './suites/sync.js';

const ctx = { server: null, api: null };

before(async () => {
  ctx.server = await startServer({ env: { MAX_BODY_BYTES: String(TEST_MAX_BODY_BYTES) } });
  ctx.api = createClient(ctx.server.baseUrl);
});

after(async () => {
  if (ctx.server) await ctx.server.stop();
});

describe('OpenAPI document', () => {
  it('documents the operations listed in issue #40', () => {
    const ops = documentedOperations().map((o) => `${o.method} ${o.path}`).sort();
    assert.deepEqual(ops, [
      'DELETE /sessions/{sessionId}/projects/{projectId}',
      'DELETE /sessions/{sessionId}/projects/{projectId}/files',
      'GET /health',
      'GET /sessions/{sessionId}',
      'GET /sessions/{sessionId}/projects',
      'GET /sessions/{sessionId}/projects/{projectId}',
      'GET /simulator/architectures',
      'POST /sessions',
      'PUT /sessions/{sessionId}/projects',
      'PUT /sessions/{sessionId}/projects/{projectId}',
      'PUT /sessions/{sessionId}/projects/{projectId}/files',
    ]);
  });
});

healthAndArchitectures(ctx);
sessions(ctx);
projects(ctx);
fileOperations(ctx);
sync(ctx);
isolationAndConcurrency(ctx);
errorsAndLimits(ctx);
contract(ctx);
legacy(ctx);
startup(ctx);
storageLimits();

describe('coverage of the OpenAPI document', () => {
  it('every documented response except 500 was exercised and validated', () => {
    assert.deepEqual(uncoveredResponses(), [], 'documented responses never produced by the suite');
  });

  it('the server is still running (no crash during the suite)', () => {
    assert.ok(ctx.server.isRunning(), `api exited; output:\n${ctx.server.output().slice(-4000)}`);
  });
});
