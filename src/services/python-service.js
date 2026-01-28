import { sanitizeHeaders, sanitizeBody, sanitizeUrl } from '../redact.js';

/**
 * Convert a log entry to Python requests code.
 * @param {object} log - The log entry from storage
 * @returns {string} Python code
 */
export function logToPython(log) {
  const request = log?.request || {};
  const method = (request.method || 'get').toLowerCase();
  const url = sanitizeUrl(request.url || '');
  const headers = sanitizeHeaders(request.headers);
  const body = sanitizeBody(request.body);

  let needsEnv = false;
  const authKey = Object.keys(headers).find((key) => key.toLowerCase() === 'authorization');
  if (authKey && typeof headers[authKey] === 'string') {
    const authValue = headers[authKey];
    if (authValue === 'api_key_provided' || authValue.includes('api_key_provided')) {
      headers[authKey] = { __python_raw__: "f'Bearer {api_key}'" };
      needsEnv = true;
    }
  }

  const headersLiteral = indentMultiline(toPythonLiteral(headers), 4);
  const bodyLiteral = body !== undefined && body !== null
    ? indentMultiline(toPythonLiteral(body), 4)
    : null;

  const lines = [
    needsEnv ? 'import os' : null,
    'import json',
    'import requests',
    '',
    needsEnv ? "api_key = os.environ.get('API_KEY')" : null,
    needsEnv ? 'if not api_key:' : null,
    needsEnv ? "    raise SystemExit('Set API_KEY environment variable before running.')" : null,
    needsEnv ? '' : null,
    `response = requests.${method}(`,
    `    '${url}',`,
    `    headers=${headersLiteral},`,
    bodyLiteral ? `    json=${bodyLiteral},` : null,
    ')',
    '',
    "print(f'Status: {response.status_code} {response.reason}')",
    "print('Response headers:')",
    'for key, value in response.headers.items():',
    "    print(f'  {key}: {value}')",
    '',
    'try:',
    '    data = response.json()',
    "    print('Response JSON:')",
    '    print(json.dumps(data, indent=2))',
    'except ValueError:',
    "    print('Response text:')",
    '    print(response.text)',
  ].filter((line) => line !== null);

  return lines.join('\n');
}

function toPythonLiteral(value) {
  if (value === null) return 'None';
  if (value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return formatPythonString(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => toPythonLiteral(item));
    if (items.join(', ').length < 60) {
      return `[${items.join(', ')}]`;
    }
    return `[\n${items.map((item) => `    ${item},`).join('\n')}\n]`;
  }
  if (typeof value === 'object') {
    if (value.__python_raw__) {
      return value.__python_raw__;
    }
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const pairs = entries.map(([k, v]) => `${formatPythonString(k)}: ${toPythonLiteral(v)}`);
    if (pairs.join(', ').length < 60) {
      return `{${pairs.join(', ')}}`;
    }
    return `{\n${pairs.map((pair) => `    ${pair},`).join('\n')}\n}`;
  }
  return String(value);
}

function formatPythonString(str) {
  const escaped = str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `'${escaped}'`;
}

function indentMultiline(str, spaces) {
  const indent = ' '.repeat(spaces);
  const lines = str.split('\n');
  if (lines.length <= 1) return str;
  return lines.map((line, i) => (i === 0 ? line : indent + line)).join('\n');
}
