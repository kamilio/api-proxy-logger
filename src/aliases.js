const ALIAS_PREFIX = '/__proxy__/';

function interpolateEnv(value, env) {
  if (typeof value !== 'string') {
    return String(value);
  }
  return value.replace(/\$\{([^}]+)\}/g, (match, name) => {
    if (!env || env[name] === undefined) {
      return '';
    }
    return String(env[name]);
  });
}

function normalizeHeaders(headers, env) {
  if (!headers || typeof headers !== 'object') {
    return {};
  }
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    normalized[String(key).toLowerCase()] = interpolateEnv(value, env);
  }
  return normalized;
}

export function resolveAliasConfig(aliases, aliasName, env = process.env) {
  if (!aliases || typeof aliases !== 'object') return null;
  const entry = aliases[aliasName];
  if (!entry || typeof entry !== 'object') return null;
  if (!entry.url) return null;
  try {
    // Validate URL.
    new URL(String(entry.url));
  } catch {
    return null;
  }
  return {
    url: String(entry.url),
    headers: normalizeHeaders(entry.headers, env),
  };
}

export function parseAliasPath(pathname) {
  if (!pathname || typeof pathname !== 'string') return null;
  if (!pathname.startsWith(ALIAS_PREFIX)) return null;
  const remainder = pathname.slice(ALIAS_PREFIX.length);
  if (!remainder) return null;
  const [alias, ...rest] = remainder.split('/');
  if (!alias) return null;
  const suffix = rest.join('/');
  return {
    alias,
    path: suffix ? `/${suffix}` : '/',
  };
}
