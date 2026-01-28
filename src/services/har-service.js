import { sanitizeHeaders, sanitizeBody, sanitizeUrl } from '../redact.js';

const HAR_VERSION = '1.2';
const CREATOR_NAME = 'llm-debugger';
const CREATOR_VERSION = '1.0.0';

/**
 * Convert a log entry to HAR format with API keys obfuscated.
 * @param {object} log - The log entry from storage
 * @returns {object} HAR formatted object
 */
export function logToHar(log) {
  const entry = createHarEntry(log);
  return {
    log: {
      version: HAR_VERSION,
      creator: {
        name: CREATOR_NAME,
        version: CREATOR_VERSION,
      },
      entries: [entry],
    },
  };
}

/**
 * Convert multiple log entries to a single HAR file.
 * @param {object[]} logs - Array of log entries
 * @returns {object} HAR formatted object with all entries
 */
export function logsToHar(logs) {
  const entries = logs.map(createHarEntry);
  return {
    log: {
      version: HAR_VERSION,
      creator: {
        name: CREATOR_NAME,
        version: CREATOR_VERSION,
      },
      entries,
    },
  };
}

function createHarEntry(log) {
  const request = buildHarRequest(log.request);
  const response = buildHarResponse(log.response);
  const durationMs = log.duration_ms || 0;

  return {
    startedDateTime: log.timestamp || new Date().toISOString(),
    time: durationMs,
    request,
    response,
    cache: {},
    timings: {
      send: -1,
      wait: durationMs,
      receive: -1,
    },
  };
}

function buildHarRequest(req) {
  if (!req) {
    return {
      method: 'GET',
      url: '',
      httpVersion: 'HTTP/1.1',
      headers: [],
      queryString: [],
      cookies: [],
      headersSize: -1,
      bodySize: -1,
    };
  }

  const sanitizedUrl = sanitizeUrl(req.url || '');
  const sanitizedHeaders = sanitizeHeaders(req.headers);
  const sanitizedBody = sanitizeBody(req.body);

  const headers = objectToNameValuePairs(sanitizedHeaders);
  const queryString = extractQueryString(sanitizedUrl);
  const postData = buildPostData(sanitizedBody, sanitizedHeaders);
  const cookies = parseCookiesFromHeaders(sanitizedHeaders);

  return {
    method: req.method || 'GET',
    url: sanitizedUrl,
    httpVersion: 'HTTP/1.1',
    headers,
    queryString,
    cookies,
    headersSize: -1,
    bodySize: postData ? postData.text.length : -1,
    ...(postData && { postData }),
  };
}

function buildHarResponse(res) {
  if (!res) {
    return {
      status: 0,
      statusText: '',
      httpVersion: 'HTTP/1.1',
      headers: [],
      cookies: [],
      content: {
        size: -1,
        mimeType: 'application/octet-stream',
        text: '',
      },
      redirectURL: '',
      headersSize: -1,
      bodySize: -1,
    };
  }

  const sanitizedHeaders = sanitizeHeaders(res.headers);
  const sanitizedBody = sanitizeBody(res.body);

  const headers = objectToNameValuePairs(sanitizedHeaders);
  const content = buildContent(sanitizedBody, sanitizedHeaders);
  const cookies = parseSetCookiesFromHeaders(sanitizedHeaders);
  const redirectURL = extractRedirectURL(sanitizedHeaders);

  return {
    status: res.status || 0,
    statusText: getStatusText(res.status),
    httpVersion: 'HTTP/1.1',
    headers,
    cookies,
    content,
    redirectURL,
    headersSize: -1,
    bodySize: content.size,
  };
}

function objectToNameValuePairs(obj) {
  if (!obj || typeof obj !== 'object') {
    return [];
  }
  return Object.entries(obj).map(([name, value]) => ({
    name,
    value: String(value),
  }));
}

function extractQueryString(url) {
  if (!url) return [];
  try {
    const parsed = new URL(url, 'http://placeholder');
    return Array.from(parsed.searchParams.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  } catch {
    return [];
  }
}

function buildPostData(body, headers) {
  if (body === undefined || body === null) {
    return null;
  }

  const contentType = findContentType(headers) || 'application/json';
  const text = typeof body === 'string' ? body : JSON.stringify(body);

  return {
    mimeType: contentType,
    text,
  };
}

function buildContent(body, headers) {
  const mimeType = findContentType(headers) || 'application/json';

  if (body === undefined || body === null) {
    return {
      size: 0,
      mimeType,
      text: '',
    };
  }

  const text = typeof body === 'string' ? body : JSON.stringify(body);

  return {
    size: text.length,
    mimeType,
    text,
  };
}

function findContentType(headers) {
  if (!headers || typeof headers !== 'object') {
    return null;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'content-type') {
      return String(value).split(';')[0].trim();
    }
  }
  return null;
}

function getStatusText(status) {
  const statusTexts = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return statusTexts[status] || '';
}

function parseCookiesFromHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return [];
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'cookie') {
      return parseCookieHeader(String(value));
    }
  }
  return [];
}

function parseCookieHeader(cookieStr) {
  if (!cookieStr) return [];
  return cookieStr.split(';').map((pair) => {
    const [name, ...rest] = pair.trim().split('=');
    return {
      name: name || '',
      value: rest.join('=') || '',
    };
  }).filter((c) => c.name);
}

function parseSetCookiesFromHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return [];
  }
  const cookies = [];
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'set-cookie') {
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) {
        const cookie = parseSetCookieValue(String(v));
        if (cookie) cookies.push(cookie);
      }
    }
  }
  return cookies;
}

function parseSetCookieValue(setCookieStr) {
  if (!setCookieStr) return null;
  const parts = setCookieStr.split(';').map((p) => p.trim());
  if (parts.length === 0) return null;

  const [nameValue, ...attributes] = parts;
  const [name, ...rest] = nameValue.split('=');
  if (!name) return null;

  const cookie = {
    name,
    value: rest.join('=') || '',
  };

  for (const attr of attributes) {
    const [attrName, ...attrRest] = attr.split('=');
    const attrLower = (attrName || '').toLowerCase();
    const attrValue = attrRest.join('=');

    if (attrLower === 'path') cookie.path = attrValue;
    else if (attrLower === 'domain') cookie.domain = attrValue;
    else if (attrLower === 'expires') cookie.expires = attrValue;
    else if (attrLower === 'httponly') cookie.httpOnly = true;
    else if (attrLower === 'secure') cookie.secure = true;
  }

  return cookie;
}

function extractRedirectURL(headers) {
  if (!headers || typeof headers !== 'object') {
    return '';
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'location') {
      return String(value);
    }
  }
  return '';
}
