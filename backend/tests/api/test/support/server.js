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

async function findFreePort(host) {
  const [from, to] = portRange();
  for (let port = from; port <= to; port += 1) {
    if (await isPortFree(port, host)) return port;
  }
  throw new Error(`no free port in ${from}-${to}`);
}

function canConnect(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

export async function startServer({ env = {}, timeoutMs = 15000 } = {}) {
  const bin = process.env.API_BIN ?? DEFAULT_API_BIN;
  if (!existsSync(bin)) {
    throw new Error(
      `api binary not found at ${bin}. Build the backend first ` +
        '(cmake -S backend -B backend/build && cmake --build backend/build) or set API_BIN.',
    );
  }

  const host = '127.0.0.1';
  const port = await findFreePort(host);

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

  let exited = null;
  const exitPromise = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      exited = { code, signal };
      resolve(exited);
    });
  });

  const deadline = Date.now() + timeoutMs;
  while (!(await canConnect(port, host))) {
    if (exited) {
      throw new Error(
        `api exited before listening (code=${exited.code}, signal=${exited.signal}):\n${output}`,
      );
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`api did not listen on ${host}:${port} within ${timeoutMs}ms:\n${output}`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  return {
    port,
    baseUrl: `http://${host}:${port}`,
    wsUrl: `ws://${host}:${port}/ws`,
    output: () => output,
    isRunning: () => exited === null,
    async stop() {
      if (exited) return exited;
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      const result = await exitPromise;
      clearTimeout(timer);
      return result;
    },
  };
}
