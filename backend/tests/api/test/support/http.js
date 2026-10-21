// Small HTTP client for the API tests. Calls made through `op()` target a
// documented path template and are always checked against the OpenAPI
// document (status documented, schema valid, no undocumented fields).

import assert from 'node:assert/strict';

import { checkResponse } from './spec.js';

export function fillTemplate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in params)) throw new Error(`missing path parameter ${name} for ${template}`);
    return encodeURIComponent(params[name]);
  });
}

export function createClient(baseUrl) {
  async function raw(method, urlPath, { json, body, headers = {}, query } = {}) {
    let url = `${baseUrl}${urlPath}`;
    if (query) {
      const qs = new URLSearchParams(query).toString();
      if (qs) url += `?${qs}`;
    }
    const init = { method, headers: { ...headers } };
    if (json !== undefined) {
      init.body = JSON.stringify(json);
    } else if (body !== undefined) {
      init.body = body;
    }
    if (init.body !== undefined && !Object.keys(init.headers).some((h) => h.toLowerCase() === 'content-type')) {
      init.headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed;
    try {
      parsed = text.length ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    return { status: response.status, headers: response.headers, text, json: parsed, method, url };
  }

  /** Calls a documented operation and asserts the response conforms to the spec. */
  async function op(method, template, params = {}, options = {}) {
    const res = await raw(method, fillTemplate(template, params), options);
    const problems = checkResponse(method, template, res);
    assert.deepEqual(
      problems,
      [],
      `${method} ${res.url} -> ${res.status} does not conform to the OpenAPI document:\n  ${problems.join('\n  ')}`,
    );
    return res;
  }

  return { raw, op, baseUrl };
}

export function expectStatus(res, status) {
  assert.equal(
    res.status,
    status,
    `${res.method} ${res.url}: expected ${status}, got ${res.status} ${res.text.slice(0, 300)}`,
  );
}

/** Asserts an Error problem object with the given HTTP status and `type`. */
export function expectError(res, status, type) {
  expectStatus(res, status);
  assert.ok(res.json && typeof res.json === 'object', `expected a JSON error body, got ${res.text}`);
  assert.equal(res.json.status, status, 'Error.status must equal the HTTP status');
  assert.equal(typeof res.json.title, 'string');
  assert.ok(res.json.title.length > 0, 'Error.title must not be empty');
  if (type !== undefined) assert.equal(res.json.type, type, `unexpected Error.type in ${res.text}`);
  if ('detail' in res.json) assert.equal(typeof res.json.detail, 'string');
}
