// Starts and stops the real `api` binary for the API tests.
//
// Environment overrides:
//   API_BIN         path to the api executable (default: backend/bin/api[.exe])
//   API_TEST_PORTS  port range to pick a free port from (default: 18440-18449)

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../../..');

export const DEFAULT_API_BIN = path.join(
  backendDir,
  'bin',
  process.platform === 'win32' ? 'api.exe' : 'api',
);

function portRange() {
  const raw = process.env.API_TEST_PORTS ?? '18440-18449';
  const match = /^(\d+)-(\d+)$/.exec(raw.trim());
  if (!match) throw new Error(`API_TEST_PORTS must look like 18440-18449, got "${raw}"`);
  return [Number(match[1]), Number(match[2])];
}

function isPortFree(port, host) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

/** Spawns the api on `port` (no readiness wait). */
export function spawnApi({ port, env = {}, host = '127.0.0.1' }) {
  const bin = process.env.API_BIN ?? DEFAULT_API_BIN;
  if (!existsSync(bin)) {
    throw new Error(
      `api binary not found at ${bin}. Build the backend first ` +
        '(cmake -S backend -B backend/build && cmake --build backend/build) or set API_BIN.',
    );
  }
  let output = '';
  const child = spawn(bin, [], {
    env: { ...process.env, ...env, PORT: String(port), HOST: host },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const keep = (chunk) => {
    output += chunk.toString();
    if (output.length > 200_000) output = output.slice(-100_000);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  let exitInfo = null;
  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      exitInfo = { code, signal };
      resolve(exitInfo);
    });
  });
  return { child, exited, output: () => output, exitInfo: () => exitInfo };
}

// The api prints this once it owns the port (it binds exclusively), so seeing
// it from our own child proves we are not talking to another server.
const LISTENING = /^Listening on \S+:(\d+)$/m;
const BIND_FAILED = /Failed to bind/;

async function waitUntilListening({ port, exited, output, exitInfo }, deadline) {
  for (;;) {
    const match = LISTENING.exec(output());
    if (match && Number(match[1]) === port) return 'listening';
    if (exitInfo()) return BIND_FAILED.test(output()) ? 'bind-failed' : 'exited';
    if (Date.now() > deadline) return 'timeout';
    await Promise.race([exited, new Promise((r) => setTimeout(r, 25))]);
  }
}

/**
 * Starts the api on a free port of the test range (or exactly on `port`).
 * Another process can take a port between the free-port probe and the api's
 * bind; the api then fails to bind and the next port is tried.
 */
export async function startServer({ env = {}, timeoutMs = 15000, port: fixedPort } = {}) {
  const host = '127.0.0.1';
  const deadline = Date.now() + timeoutMs;
  const [from, to] = fixedPort ? [fixedPort, fixedPort] : portRange();

  let port;
  let api;
  for (let candidate = from; candidate <= to && !api; candidate += 1) {
    if (!fixedPort && !(await isPortFree(candidate, host))) continue;

    const spawned = spawnApi({ port: candidate, env, host });
    const state = await waitUntilListening({ port: candidate, ...spawned }, deadline);
    if (state === 'listening') {
      port = candidate;
      api = spawned;
    } else if (state === 'bind-failed' && !fixedPort) {
      continue;
    } else {
      if (state === 'timeout') spawned.child.kill('SIGKILL');
      const why = state === 'timeout' ? `did not listen within ${timeoutMs}ms` : 'exited before listening';
      const info = spawned.exitInfo();
      throw new Error(
        `api on ${host}:${candidate} ${why}` +
          (info ? ` (code=${info.code}, signal=${info.signal})` : '') +
          `:\n${spawned.output()}`,
      );
    }
  }
  if (!api) throw new Error(`no port in ${from}-${to} could be bound`);

  const { child, exited: exitPromise, output, exitInfo } = api;
  return {
    port,
    baseUrl: `http://${host}:${port}`,
    wsUrl: `ws://${host}:${port}/ws`,
    languageUrl: `ws://${host}:${port}/language`,
    output,
    isRunning: () => exitInfo() === null,
    async stop() {
      if (exitInfo()) return exitInfo();
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      const result = await exitPromise;
      clearTimeout(timer);
      return result;
    },
  };
}
