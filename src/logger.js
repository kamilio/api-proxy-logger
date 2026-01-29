import { mkdir, writeFile, readdir, readFile, unlink } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import yaml from 'js-yaml';
import { sanitizeBody, sanitizeHeaders, sanitizeUrl } from './redact.js';
import { filterLogs } from './viewer-filters.js';
import { loadConfig } from './config.js';

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

async function getAllLogFiles(outputDir) {
  const files = [];
  try {
    const rootEntries = await readdir(outputDir, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile() && entry.name.endsWith('.yaml')) {
        files.push({ path: join(outputDir, entry.name), name: entry.name });
      } else if (entry.isDirectory()) {
        try {
          const subFiles = await readdir(join(outputDir, entry.name));
          for (const subFile of subFiles) {
            if (subFile.endsWith('.yaml')) {
              files.push({ path: join(outputDir, entry.name, subFile), name: subFile });
            }
          }
        } catch {
          // Ignore errors reading subdirectories
        }
      }
    }
  } catch {
    // Directory doesn't exist yet
  }
  return files;
}

async function rotateLogsIfNeeded(outputDir) {
  const config = loadConfig();
  const maxLogs = config.max_logs;
  if (!maxLogs || maxLogs <= 0) return;

  const files = await getAllLogFiles(outputDir);
  if (files.length <= maxLogs) return;

  // Sort by filename (which contains timestamp) - oldest first
  files.sort((a, b) => a.name.localeCompare(b.name));

  const toDelete = files.slice(0, files.length - maxLogs);
  for (const file of toDelete) {
    try {
      await unlink(file.path);
      console.log(`  Rotated: ${file.name}`);
    } catch {
      // Ignore deletion errors
    }
  }
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

  await rotateLogsIfNeeded(outputDir);

  return filepath;
}

export async function getRecentLogs(outputDir, limitOrOptions = 20, provider = null) {
  let limit = 20;
  let offset = 0;
  let providerFilter = null;
  let baseUrls = null;
  let methods = null;
  let aliases = null;
  let aliasHostMap = null;

  if (typeof limitOrOptions === 'object' && limitOrOptions !== null) {
    limit = Number.isFinite(limitOrOptions.limit) ? limitOrOptions.limit : 20;
    offset = Number.isFinite(limitOrOptions.offset) ? limitOrOptions.offset : 0;
    providerFilter = limitOrOptions.provider || null;
    baseUrls = limitOrOptions.baseUrls || null;
    methods = limitOrOptions.methods || null;
    aliases = limitOrOptions.aliases || null;
    aliasHostMap = limitOrOptions.aliasHostMap || null;
  } else {
    limit = limitOrOptions;
    providerFilter = provider;
  }

  try {
    const directories = [];
    if (providerFilter) {
      if (providerFilter === 'unknown') {
        directories.push({ dir: outputDir, provider: null });
      } else {
        directories.push({ dir: join(outputDir, providerFilter), provider: providerFilter });
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

    const filteredLogs = filterLogs(logs.filter(Boolean), {
      baseUrls,
      methods,
      aliases,
      aliasHostMap,
    });
    const sorted = filteredLogs.sort((a, b) => {
      const aTime = Date.parse(a.timestamp || '') || 0;
      const bTime = Date.parse(b.timestamp || '') || 0;
      return bTime - aTime;
    });
    const total = sorted.length;
    const paginated = sorted.slice(offset, offset + limit);
    return { logs: paginated, total };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
