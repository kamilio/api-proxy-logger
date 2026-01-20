import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import yaml from 'js-yaml';
import { sanitizeBody, sanitizeHeaders, sanitizeUrl } from './redact.js';
import { getResponsesPath } from './paths.js';
import { loadResponsesConfig } from './responses-config.js';
import { detectApiShape, extractMessage } from './mock-utils.js';

const EXCLUDED_RESPONSE_HEADERS = [
  'content-encoding',
  'transfer-encoding',
  'connection',
  'content-length',
];

export async function createMockHandler(req, res) {
  const pathname = req.path;
  const body = parseJsonBody(req.body);
  const shape = detectApiShape(pathname);

  if (!shape) {
    res.status(404).json({
      error: 'Unsupported mock route',
      path: pathname,
      supported: [
        '/api/openai/v1/chat/completions',
        '/api/anthropic/v1/messages',
        '/api/gemini/v1beta/models/*/generateContent',
        '/api/gemini/v1beta/models/*/streamGenerateContent',
      ],
    });
    return;
  }

  const message = extractMessage(body, shape.key).trim();
  if (message === 'echo') {
    const sanitizedHeaders = sanitizeHeaders(req.headers);
    const sanitizedBody = sanitizeBody(body);
    res.json({
      mode: 'echo',
      api_shape: shape.key,
      request: {
        method: req.method,
        path: sanitizeUrl(req.originalUrl),
        headers: sanitizedHeaders,
        body: sanitizedBody,
      },
    });
    return;
  }

  const responsesConfig = loadResponsesConfig();
  const mapping = responsesConfig.mock_responses?.[shape.key] || {};
  const responsePath = mapping[message];
  if (!responsePath) {
    res.status(404).json({
      error: 'No mock response found',
      api_shape: shape.key,
      message,
      available_messages: Object.keys(mapping),
    });
    return;
  }

  let responseEntry;
  try {
    responseEntry = await loadResponseFile(responsePath);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load mock response file',
      path: responsePath,
      message: error.message,
    });
    return;
  }

  const response = responseEntry?.response;
  if (!response) {
    res.status(500).json({
      error: 'Invalid response file format',
      path: responsePath,
    });
    return;
  }

  const shouldStream = isStreamingRequest(body) && response.is_streaming === true;
  if (shouldStream) {
    streamResponse(res, response);
    return;
  }

  sendResponse(res, response);
}

function parseJsonBody(body) {
  if (!body || body.length === 0) return {};
  try {
    return JSON.parse(body.toString());
  } catch {
    return {};
  }
}

function isStreamingRequest(body) {
  return Boolean(body && body.stream === true);
}


async function loadResponseFile(responsePath) {
  const baseDir = dirname(getResponsesPath());
  const fullPath = isAbsolute(responsePath)
    ? responsePath
    : resolve(baseDir, responsePath);
  const content = await readFile(fullPath, 'utf-8');
  return yaml.load(content);
}

function sendResponse(res, response) {
  res.status(response.status || 200);
  const headers = filterHeaders(response.headers || {});
  for (const [key, value] of Object.entries(headers)) {
    res.set(key, value);
  }
  if (response.body === undefined) {
    res.end();
    return;
  }
  res.send(response.body);
}

function streamResponse(res, response) {
  res.status(response.status || 200);

  const headers = filterHeaders(response.headers || {});
  if (!hasHeader(headers, 'content-type')) {
    headers['content-type'] = 'text/event-stream';
  }
  if (!hasHeader(headers, 'cache-control')) {
    headers['cache-control'] = 'no-cache';
  }

  for (const [key, value] of Object.entries(headers)) {
    res.set(key, value);
  }

  res.flushHeaders();

  const events = normalizeStreamingEvents(response.body);
  for (const event of events) {
    res.write(`data: ${event}\n\n`);
  }
  res.end();
}

function normalizeStreamingEvents(body) {
  if (Array.isArray(body)) {
    return body.flatMap((event) => normalizeEvent(event));
  }
  if (typeof body === 'string') {
    return body
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => normalizeEvent(line));
  }
  if (body && typeof body === 'object') {
    return [JSON.stringify(body)];
  }
  return [];
}

function normalizeEvent(event) {
  if (!event) return [];
  if (event.done === true) return ['[DONE]'];
  if (typeof event === 'string') {
    const trimmed = event.trim();
    if (trimmed.startsWith('data:')) {
      return [trimmed.replace(/^data:\s*/, '')];
    }
    return [trimmed];
  }
  if (event.raw) {
    return [String(event.raw)];
  }
  return [JSON.stringify(event)];
}

function filterHeaders(headers) {
  const filtered = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!EXCLUDED_RESPONSE_HEADERS.includes(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return filtered;
}

function hasHeader(headers, name) {
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}
