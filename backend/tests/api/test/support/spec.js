// Loads api_spec/openapi.yaml and validates real responses against it.
//
// Every response that goes through `checkResponse` is checked for:
//   - the status code being documented for that operation,
//   - the body matching the documented JSON schema (Ajv, JSON Schema 2020-12),
//   - the body not carrying properties the schema does not document,
//   - an empty body when the response documents no content.
// It also records which (method, path, status) triples were exercised so the
// suite can assert that every documented response was covered.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));

export const SPEC_PATH =
  process.env.OPENAPI_SPEC ?? path.resolve(here, '../../../../../api_spec/openapi.yaml');

export const spec = YAML.parse(readFileSync(SPEC_PATH, 'utf8'));

const SPEC_ID = 'openapi.yaml';
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(spec, SPEC_ID);

const escapeToken = (token) =>
  encodeURIComponent(String(token).replace(/~/g, '~0').replace(/\//g, '~1'));
const pointer = (tokens) => `#/${tokens.map(escapeToken).join('/')}`;

function resolveLocal(ref) {
  if (!ref.startsWith('#/')) throw new Error(`only local $refs are supported, got ${ref}`);
  const tokens = ref
    .slice(2)
    .split('/')
    .map((t) => decodeURIComponent(t).replace(/~1/g, '/').replace(/~0/g, '~'));
  let node = spec;
  for (const t of tokens) {
    node = node?.[t];
    if (node === undefined) throw new Error(`unresolvable $ref ${ref}`);
  }
  return { node, tokens };
}

const validators = new Map();
function validatorFor(tokens) {
  const key = pointer(tokens);
  if (!validators.has(key)) validators.set(key, ajv.compile({ $ref: `${SPEC_ID}${key}` }));
  return validators.get(key);
}

/** Validates `value` against the schema at components/schemas/<name>. */
export function validateSchema(name, value) {
  const validate = validatorFor(['components', 'schemas', name]);
  const ok = validate(value);
  return { ok, errors: validate.errors ?? [] };
}

/** Lists every documented operation: [{ method, path, statuses: [...] }]. */
export function documentedOperations() {
  const ops = [];
  for (const [p, item] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      ops.push({ method: method.toUpperCase(), path: p, statuses: Object.keys(op.responses) });
    }
  }
  return ops;
}

function responseObject(method, pathTemplate, status) {
  const item = spec.paths[pathTemplate];
  if (!item) throw new Error(`path ${pathTemplate} is not documented`);
  const op = item[method.toLowerCase()];
  if (!op) throw new Error(`${method} ${pathTemplate} is not documented`);
  let tokens = ['paths', pathTemplate, method.toLowerCase(), 'responses', String(status)];
  let response = op.responses[String(status)];
  if (!response) return null;
  while (response.$ref) {
    const resolved = resolveLocal(response.$ref);
    response = resolved.node;
    tokens = resolved.tokens;
  }
  return { response, tokens };
}

// ---------------------------------------------------------------------------
// "No undocumented fields" check. The spec does not set
// additionalProperties: false, so plain schema validation would accept extra
// wrapper fields; the issue requires that responses carry none.

function deref(schema) {
  let s = schema;
  while (s && s.$ref) s = resolveLocal(s.$ref).node;
  return s ?? {};
}

function flatten(schema) {
  const s = deref(schema);
  const out = {
    properties: { ...(s.properties ?? {}) },
    additionalProperties: s.additionalProperties,
    items: s.items,
  };
  for (const part of s.allOf ?? []) {
    const f = flatten(part);
    Object.assign(out.properties, f.properties);
    out.additionalProperties ??= f.additionalProperties;
    out.items ??= f.items;
  }
  return out;
}

export function undocumentedFields(schema, value, where = '$') {
  const problems = [];
  const s = flatten(schema);
  if (Array.isArray(value)) {
    if (s.items) value.forEach((v, i) => problems.push(...undocumentedFields(s.items, v, `${where}[${i}]`)));
    return problems;
  }
  if (value === null || typeof value !== 'object') return problems;
  const hasProps = Object.keys(s.properties).length > 0;
  for (const [key, v] of Object.entries(value)) {
    if (key in s.properties) {
      problems.push(...undocumentedFields(s.properties[key], v, `${where}.${key}`));
    } else if (s.additionalProperties && typeof s.additionalProperties === 'object') {
      problems.push(...undocumentedFields(s.additionalProperties, v, `${where}.${key}`));
    } else if (hasProps || s.additionalProperties === false) {
      problems.push(`${where}.${key} is not documented`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------

const covered = new Set();
export const coverageKey = (method, p, status) => `${method.toUpperCase()} ${p} ${status}`;

/**
 * Checks a response (from support/http.js) against the documented operation.
 * Returns a list of problems (empty when the response conforms).
 */
export function checkResponse(method, pathTemplate, res) {
  const problems = [];
  const found = responseObject(method, pathTemplate, res.status);
  if (!found) {
    return [`${method} ${pathTemplate} returned undocumented status ${res.status}`];
  }
  covered.add(coverageKey(method, pathTemplate, res.status));

  const { response, tokens } = found;
  const media = response.content?.['application/json'];
  if (!response.content) {
    if (res.text.length !== 0) problems.push(`expected an empty body, got ${JSON.stringify(res.text.slice(0, 200))}`);
    return problems;
  }
  if (!media) return [`response ${res.status} documents no application/json content`];

  const ct = res.headers.get('content-type') ?? '';
  if (!/^application\/json\b/i.test(ct)) problems.push(`content-type is "${ct}", expected application/json`);
  if (res.json === undefined) {
    problems.push(`body is not JSON: ${JSON.stringify(res.text.slice(0, 200))}`);
    return problems;
  }

  const validate = validatorFor([...tokens, 'content', 'application/json', 'schema']);
  if (!validate(res.json)) {
    problems.push(
      `body does not match the schema: ${ajv.errorsText(validate.errors, { separator: '; ' })} ` +
        `body=${JSON.stringify(res.json).slice(0, 300)}`,
    );
  }
  problems.push(...undocumentedFields(media.schema, res.json));

  // RFC 9457: the problem's status member must match the HTTP status.
  if (res.status >= 400 && res.json && typeof res.json === 'object' && res.json.status !== res.status) {
    problems.push(`Error.status ${res.json.status} does not match HTTP status ${res.status}`);
  }
  return problems;
}

/** Documented (method, path, status) triples not yet exercised by the suite. */
export function uncoveredResponses({ skipStatuses = ['500'] } = {}) {
  const missing = [];
  for (const op of documentedOperations()) {
    for (const status of op.statuses) {
      if (skipStatuses.includes(status)) continue;
      const key = coverageKey(op.method, op.path, status);
      if (!covered.has(key)) missing.push(key);
    }
  }
  return missing;
}

export const ajvFormats = ajv.formats;
