import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import yaml from 'js-yaml';
import { sanitizeBody, sanitizeHeaders, sanitizeUrl } from './redact.js';

function generateFilename() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    '_',
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
    '_',
    pad(now.getUTCMilliseconds(), 3),
    String(Math.random()).slice(2, 5),
    '.yaml',
  ].join('');
}

function getProviderDir(outputDir, provider) {
  if (!provider) return outputDir;
  return join(outputDir, provider);
}

export async function logRequest(outputDir, data) {
  const providerDir = getProviderDir(outputDir, data.provider);
  await mkdir(providerDir, { recursive: true });

  const sanitizedRequestHeaders = sanitizeHeaders(data.requestHeaders || {});
  const sanitizedResponseHeaders = sanitizeHeaders(data.responseHeaders || {});
  const sanitizedRequestBody = sanitizeBody(data.requestBody);
  const sanitizedResponseBody = sanitizeBody(data.responseBody);
  const sanitizedUrl = sanitizeUrl(data.url);

  const logEntry = {
    timestamp: new Date().toISOString(),
    provider: data.provider || null,
    duration_ms: data.duration,
    request: {
      method: data.method,
      url: sanitizedUrl,
      headers: sanitizedRequestHeaders,
      body: sanitizedRequestBody,
    },
    response: {
      status: data.status,
      headers: sanitizedResponseHeaders,
      body: sanitizedResponseBody,
      is_streaming: data.isStreaming,
    },
  };

  const filename = generateFilename();
  const filepath = join(providerDir, filename);
  const content = yaml.dump(logEntry, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });

  await writeFile(filepath, content, 'utf-8');
  console.log(`  Logged: ${data.method} ${sanitizedUrl} -> ${data.status} (${data.duration}ms)`);

  return filepath;
}

export async function getRecentLogs(outputDir, limit = 20, provider = null) {
  try {
    const directories = [];
    if (provider) {
      if (provider === 'unknown') {
        directories.push({ dir: outputDir, provider: null });
      } else {
        directories.push({ dir: join(outputDir, provider), provider });
      }
    } else {
      const rootEntries = await readdir(outputDir, { withFileTypes: true });
      directories.push({ dir: outputDir, provider: null });
      for (const entry of rootEntries) {
        if (entry.isDirectory()) {
          directories.push({ dir: join(outputDir, entry.name), provider: entry.name });
        }
      }
    }

    const fileEntries = [];
    for (const { dir, provider } of directories) {
      try {
        const files = await readdir(dir);
        for (const filename of files) {
          if (filename.endsWith('.yaml')) {
            fileEntries.push({ path: join(dir, filename), provider });
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    const logs = await Promise.all(
      fileEntries.map(async (entry) => {
        const content = await readFile(entry.path, 'utf-8');
        const log = yaml.load(content);
        if (log && !log.provider && entry.provider) {
          log.provider = entry.provider;
        }
        if (log && !log.provider) {
          log.provider = 'unknown';
        }
        if (log) {
          log._source_path = relative(process.cwd(), entry.path);
          log._viewer_provider = log.provider || 'unknown';
          log._viewer_file = basename(entry.path);
        }
        return log;
      })
    );

    return logs
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = Date.parse(a.timestamp || '') || 0;
        const bTime = Date.parse(b.timestamp || '') || 0;
        return bTime - aTime;
      })
      .slice(0, limit);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
