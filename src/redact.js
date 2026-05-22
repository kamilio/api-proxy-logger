const REDACTED_VALUE = 'api_key_provided';

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cf-aig-authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-goog-api-key',
  'api-key',
]);

const SENSITIVE_BODY_KEYS = new Set([
  'api_key',
  'apikey',
  'apiKey',
  'authorization',
  'x-api-key',
  'x-goog-api-key',
  'api-key',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'id_token',
  'idToken',
  'token',
  'secret',
  'client_secret',
  'clientSecret',
  'password',
  'credential',
  'credentials',
]);

export function sanitizeHeaders(headers) {
  const sanitized = {};
  for (const [key, value] of Object.entries(headers || {})) {
    sanitized[key] = isSensitiveHeaderName(key) ? REDACTED_VALUE : sanitizeSecretValue(value);
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
  return sanitizeSecretValue(value);
}

export function sanitizeUrl(urlValue) {
  if (!urlValue || typeof urlValue !== 'string') return urlValue;
  try {
    const base = urlValue.startsWith('http') ? undefined : 'http://proxy.local';
    const url = new URL(urlValue, base);
    for (const key of url.searchParams.keys()) {
      if (isSensitiveBodyKey(key)) {
        url.searchParams.set(key, REDACTED_VALUE);
      } else {
        url.searchParams.set(key, sanitizeSecretValue(url.searchParams.get(key)));
      }
    }
    const sanitized = base ? `${url.pathname}${url.search}${url.hash}` : url.toString();
    return sanitizeSecretValue(sanitized);
  } catch {
    return sanitizeSecretValue(urlValue);
  }
}

function isSensitiveHeaderName(key) {
  const lowerKey = String(key).toLowerCase();
  return SENSITIVE_HEADER_NAMES.has(lowerKey) || isSensitiveKey(lowerKey);
}

function isSensitiveBodyKey(key) {
  const lowerKey = String(key).toLowerCase();
  return SENSITIVE_BODY_KEYS.has(lowerKey) || isSensitiveKey(lowerKey);
}

function isSensitiveKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    normalized.endsWith('apikey') ||
    normalized.endsWith('authorization') ||
    normalized.endsWith('accesstoken') ||
    normalized.endsWith('refreshtoken') ||
    normalized.endsWith('idtoken') ||
    normalized.endsWith('clientsecret') ||
    normalized.endsWith('password') ||
    normalized.endsWith('credential') ||
    normalized.endsWith('credentials') ||
    normalized === 'token' ||
    normalized.endsWith('token') ||
    normalized === 'secret' ||
    normalized.endsWith('secret')
  );
}

function sanitizeSecretValue(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED_VALUE}`)
    .replace(/\bcfut_[A-Za-z0-9._-]{12,}\b/g, REDACTED_VALUE)
    .replace(/\bsk-[A-Za-z0-9._-]{12,}\b/g, REDACTED_VALUE)
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, REDACTED_VALUE);
}
