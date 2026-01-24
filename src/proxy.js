import { logRequest } from './logger.js';

const EXCLUDED_REQUEST_HEADERS = [
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
];

const EXCLUDED_RESPONSE_HEADERS = [
  'content-encoding',
  'transfer-encoding',
  'connection',
];

function filterHeaders(headers, excluded) {
  const filtered = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!excluded.includes(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return filtered;
}

function parseBody(body) {
  if (!body || body.length === 0) return null;
  try {
    return JSON.parse(body.toString());
  } catch {
    return body.toString();
  }
}

export async function createProxyHandler(req, res, config) {
  const targetUrl = config.targetUrl;
  const headers = filterHeaders(req.headers, EXCLUDED_REQUEST_HEADERS);
  const proxyHeaders =
    config.proxyHeaders && typeof config.proxyHeaders === 'object' ? config.proxyHeaders : {};
  const outgoingHeaders = { ...headers, ...proxyHeaders };
  const method = req.method;
  const body = req.body && req.body.length > 0 ? req.body : undefined;

  const startTime = Date.now();

  const fetchOptions = {
    method,
    headers: outgoingHeaders,
  };

  if (body && !['GET', 'HEAD'].includes(method)) {
    fetchOptions.body = body;
  }

  const response = await fetch(targetUrl, fetchOptions);
  const responseBody = await response.arrayBuffer();
  const responseHeaders = filterHeaders(
    Object.fromEntries(response.headers.entries()),
    EXCLUDED_RESPONSE_HEADERS
  );

  // Log the request/response
  await logRequest(config.outputDir, {
    provider: config.provider,
    method,
    url: targetUrl,
    requestHeaders: outgoingHeaders,
    requestBody: parseBody(body),
    status: response.status,
    responseHeaders: Object.fromEntries(response.headers.entries()),
    responseBody: parseBody(Buffer.from(responseBody)),
    isStreaming: false,
    duration: Date.now() - startTime,
  });

  // Send response
  res.status(response.status);
  for (const [key, value] of Object.entries(responseHeaders)) {
    res.set(key, value);
  }
  res.send(Buffer.from(responseBody));
}

export async function createStreamingProxyHandler(req, res, config) {
  const targetUrl = config.targetUrl;
  const headers = filterHeaders(req.headers, EXCLUDED_REQUEST_HEADERS);
  const proxyHeaders =
    config.proxyHeaders && typeof config.proxyHeaders === 'object' ? config.proxyHeaders : {};
  const outgoingHeaders = { ...headers, ...proxyHeaders };
  const method = req.method;
  const body = req.body && req.body.length > 0 ? req.body : undefined;

  const startTime = Date.now();

  const fetchOptions = {
    method,
    headers: outgoingHeaders,
  };

  if (body && !['GET', 'HEAD'].includes(method)) {
    fetchOptions.body = body;
  }

  const response = await fetch(targetUrl, fetchOptions);
  const responseHeaders = filterHeaders(
    Object.fromEntries(response.headers.entries()),
    EXCLUDED_RESPONSE_HEADERS
  );

  // Set response headers
  res.status(response.status);
  for (const [key, value] of Object.entries(responseHeaders)) {
    res.set(key, value);
  }

  // Collect chunks for logging while streaming to client
  const chunks = [];

  if (response.body) {
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
      res.end();

      // Log after stream completes
      const fullResponse = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      await logRequest(config.outputDir, {
        provider: config.provider,
        method,
        url: targetUrl,
        requestHeaders: outgoingHeaders,
        requestBody: parseBody(body),
        status: response.status,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        responseBody: parseStreamingBody(fullResponse),
        isStreaming: true,
        duration: Date.now() - startTime,
      });
    }
  } else {
    res.end();
  }
}

function parseStreamingBody(buffer) {
  const text = buffer.toString();
  const lines = text.split('\n').filter((line) => line.trim());

  const events = [];
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') {
        events.push({ done: true });
      } else {
        try {
          events.push(JSON.parse(data));
        } catch {
          events.push({ raw: data });
        }
      }
    }
  }

  return events.length > 0 ? events : text;
}
