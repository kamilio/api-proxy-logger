import { buildLogPath, logRequest } from './logger.js';
import {
  extractModelFromBody,
  generateSnapshotKey,
  loadSnapshot,
  saveSnapshot,
} from './snapshot.js';
import { sanitizeHeaders } from './redact.js';

const EXCLUDED_REQUEST_HEADERS = [
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'upgrade',
];

const EXCLUDED_RESPONSE_HEADERS = [
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'connection',
];

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);

function filterHeaders(headers, excluded) {
  const filtered = {};
  for (const [key, value] of Object.entries(headers || {})) {
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

async function logProxyRequest(config, data) {
  if (config.loggingEnabled === false) return;
  await logRequest(config.outputDir, data);
}

function createProxyRequest(req, config) {
  const method = req.method;
  const targetUrl = config.targetUrl;
  const body = req.body && req.body.length > 0 ? req.body : undefined;
  const parsedBody = parseBody(body);
  const requestHeaders = filterHeaders(req.headers, EXCLUDED_REQUEST_HEADERS);
  const proxyHeaders =
    config.proxyHeaders && typeof config.proxyHeaders === 'object' ? config.proxyHeaders : {};
  const outgoingHeaders = { ...requestHeaders, ...proxyHeaders };
  const snapshot = createSnapshotContext(config, { method, targetUrl, body, parsedBody });

  return {
    method,
    targetUrl,
    body,
    parsedBody,
    outgoingHeaders,
    snapshot,
    recordingPrefix: config.recordingPrefix,
    startedAt: Date.now(),
  };
}

function createFetchOptions({ method, outgoingHeaders, body }) {
  const options = {
    method,
    headers: outgoingHeaders,
  };

  if (body && !METHODS_WITHOUT_BODY.has(method)) {
    options.body = body;
  }

  return options;
}

function createSnapshotContext(config, { method, targetUrl, body, parsedBody }) {
  if (config.cacheEnabled !== true) return null;

  const key = generateSnapshotKey({ method, url: targetUrl, body });
  const model = extractModelFromBody(parsedBody);
  const snapshotPath = buildLogPath(config.outputDir, {
    method,
    url: targetUrl,
    body: parsedBody ?? body,
    prefix: config.recordingPrefix,
  });
  const url = new URL(targetUrl);

  return { key, model, snapshotPath, url };
}

async function tryRespondFromSnapshot(res, config, request) {
  if (!request.snapshot) return false;

  const cached = await loadSnapshot(request.snapshot.snapshotPath);
  if (!cached) return false;

  const response = cached.response || {};
  const responseHeaders = filterResponseHeaders(response.headers || {});

  sendResponse(res, response.status || 200, responseHeaders, snapshotResponseBody(response));
  await logProxyRequest(config, {
    provider: config.provider,
    method: request.method,
    url: request.targetUrl,
    requestHeaders: request.outgoingHeaders,
    requestBody: request.parsedBody,
    status: response.status || 200,
    responseHeaders,
    responseBody: response.body ?? response.body_base64 ?? null,
    responseBodyBase64: response.body_base64,
    isBinary: response.is_binary === true,
    isStreaming: response.is_streaming === true,
    recordingPrefix: request.recordingPrefix,
    duration: elapsedMs(request),
  });

  return true;
}

function snapshotResponseBody(response) {
  if (response.is_binary && typeof response.body_base64 === 'string') {
    return Buffer.from(response.body_base64, 'base64');
  }
  if (response.body === null || response.body === undefined) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(response.body)) {
    return response.body;
  }
  if (typeof response.body === 'string') {
    return Buffer.from(response.body);
  }
  return Buffer.from(JSON.stringify(response.body));
}

async function saveSnapshotEntry(request, upstream, responseBody, isStreaming) {
  if (!request.snapshot) return;

  await saveSnapshot(request.snapshot.snapshotPath, {
    request: {
      method: request.method,
      url: request.targetUrl,
      headers: sanitizeHeaders(filterSnapshotRequestHeaders(request.outgoingHeaders)),
      body: request.parsedBody,
    },
    response: {
      status: upstream.status,
      headers: upstream.filteredHeaders,
      ...createSnapshotResponse(upstream.filteredHeaders, responseBody, isStreaming),
      is_streaming: isStreaming,
    },
  });
}

function createSnapshotResponse(headers, buffer, isStreaming) {
  if (isStreaming) {
    return { body: buffer.toString() };
  }

  const contentType = getHeaderValue(headers, 'content-type');
  const text = buffer.toString();
  if (isJsonContentType(contentType)) {
    try {
      return { body: JSON.parse(text) };
    } catch {
      return { body: text };
    }
  }

  if (isTextContentType(contentType)) {
    return { body: text };
  }

  return {
    body_base64: buffer.toString('base64'),
    is_binary: true,
  };
}

function filterSnapshotRequestHeaders(headers) {
  const filtered = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith('llm-debugger-')) continue;
    if (EXCLUDED_REQUEST_HEADERS.includes(normalized)) continue;
    filtered[key] = value;
  }
  return filtered;
}

function getHeaderValue(headers, headerName) {
  const normalizedHeaderName = headerName.toLowerCase();
  const entry = Object.entries(headers || {}).find(
    ([key]) => key.toLowerCase() === normalizedHeaderName
  );
  return entry?.[1] || '';
}

function isJsonContentType(contentType) {
  return String(contentType).toLowerCase().includes('json');
}

function isTextContentType(contentType) {
  const normalized = String(contentType).toLowerCase();
  return (
    normalized.startsWith('text/') ||
    normalized.includes('event-stream') ||
    normalized.includes('xml') ||
    normalized.includes('html') ||
    normalized.includes('javascript') ||
    normalized.includes('x-www-form-urlencoded')
  );
}

function createUpstreamResponse(response) {
  const headers = Object.fromEntries(response.headers.entries());
  return {
    status: response.status,
    headers,
    filteredHeaders: filterResponseHeaders(headers),
  };
}

function filterResponseHeaders(headers) {
  return filterHeaders(headers, EXCLUDED_RESPONSE_HEADERS);
}

async function logCacheMiss(config, request, upstream, responseBody, { isStreaming }) {
  const cacheResponse = createSnapshotResponse(upstream.filteredHeaders, responseBody, isStreaming);
  await logProxyRequest(config, {
    provider: config.provider,
    method: request.method,
    url: request.targetUrl,
    requestHeaders: request.outgoingHeaders,
    requestBody: request.parsedBody,
    status: upstream.status,
    responseHeaders: upstream.filteredHeaders,
    responseBody: cacheResponse.body ?? null,
    responseBodyBase64: cacheResponse.body_base64,
    isBinary: cacheResponse.is_binary === true,
    isStreaming,
    recordingPrefix: request.recordingPrefix,
    duration: elapsedMs(request),
  });
}

function sendHeaders(res, status, headers) {
  res.status(status);
  for (const [key, value] of Object.entries(headers)) {
    res.set(key, value);
  }
}

function sendResponse(res, status, headers, body) {
  sendHeaders(res, status, headers);
  res.send(body);
}

function elapsedMs(request) {
  return Date.now() - request.startedAt;
}

export async function createProxyHandler(req, res, config) {
  const request = createProxyRequest(req, config);

  if (await tryRespondFromSnapshot(res, config, request)) {
    return;
  }

  const response = await fetch(request.targetUrl, createFetchOptions(request));
  const upstream = createUpstreamResponse(response);
  const responseBuffer = Buffer.from(await response.arrayBuffer());

  await saveSnapshotEntry(request, upstream, responseBuffer, false);
  await logCacheMiss(config, request, upstream, responseBuffer, { isStreaming: false });

  sendResponse(res, upstream.status, upstream.filteredHeaders, responseBuffer);
}

export async function createStreamingProxyHandler(req, res, config) {
  const request = createProxyRequest(req, config);

  if (await tryRespondFromSnapshot(res, config, request)) {
    return;
  }

  const response = await fetch(request.targetUrl, createFetchOptions(request));
  const upstream = createUpstreamResponse(response);
  const chunks = [];

  sendHeaders(res, upstream.status, upstream.filteredHeaders);

  if (response.body) {
    const reader = response.body.getReader();
    let completed = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          completed = true;
          break;
        }

        chunks.push(value);
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
      try {
        const fullResponse = Buffer.concat(chunks.map((c) => Buffer.from(c)));
        if (completed) {
          await saveSnapshotEntry(request, upstream, fullResponse, true);
          await logCacheMiss(config, request, upstream, fullResponse, { isStreaming: true });
        } else {
          await logProxyRequest(config, {
            provider: config.provider,
            method: request.method,
            url: request.targetUrl,
            requestHeaders: request.outgoingHeaders,
            requestBody: request.parsedBody,
            status: upstream.status,
            responseHeaders: upstream.filteredHeaders,
            responseBody: parseStreamingBody(fullResponse),
            isStreaming: true,
            recordingPrefix: request.recordingPrefix,
            duration: elapsedMs(request),
          });
        }
      } finally {
        res.end();
      }
    }
  } else {
    const emptyResponse = Buffer.alloc(0);
    await saveSnapshotEntry(request, upstream, emptyResponse, true);
    await logCacheMiss(config, request, upstream, emptyResponse, { isStreaming: true });
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
