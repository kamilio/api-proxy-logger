const REDACTED_VALUE = 'api_key_provided';

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'x-api-key',
  'api-key',
]);

const SENSITIVE_BODY_KEYS = new Set([
  'api_key',
  'apikey',
  'authorization',
  'x-api-key',
  'api-key',
]);

export function sanitizeHeaders(headers) {
  const sanitized = {};
  for (const [key, value] of Object.entries(headers || {})) {
    sanitized[key] = isSensitiveHeaderName(key) ? REDACTED_VALUE : value;
  }
  return sanitized;
}

export function sanitizeBody(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBody(item, seen));
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return value;
    seen.add(value);
    const sanitized = {};
    for (const [key, nested] of Object.entries(value)) {
      if (isSensitiveBodyKey(key)) {
        sanitized[key] = REDACTED_VALUE;
      } else {
        sanitized[key] = sanitizeBody(nested, seen);
      }
    }
    return sanitized;
  }
  return value;
}

export function sanitizeUrl(urlValue) {
  if (!urlValue || typeof urlValue !== 'string') return urlValue;
  try {
    const base = urlValue.startsWith('http') ? undefined : 'http://proxy.local';
    const url = new URL(urlValue, base);
    for (const key of url.searchParams.keys()) {
      if (isSensitiveBodyKey(key)) {
        url.searchParams.set(key, REDACTED_VALUE);
      }
    }
    return base ? `${url.pathname}${url.search}${url.hash}` : url.toString();
  } catch {
    return urlValue;
  }
}

function isSensitiveHeaderName(key) {
  return SENSITIVE_HEADER_NAMES.has(String(key).toLowerCase());
}

function isSensitiveBodyKey(key) {
  return SENSITIVE_BODY_KEYS.has(String(key).toLowerCase());
}
