import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';

const OBFUSCATE_HEADERS = ['authorization', 'x-api-key', 'api-key'];

function obfuscateValue(value) {
  if (!value || typeof value !== 'string') return value;
  if (value.length <= 10) return '***';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function obfuscateHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (OBFUSCATE_HEADERS.includes(key.toLowerCase())) {
      result[key] = obfuscateValue(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

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

export async function logRequest(outputDir, data) {
  await mkdir(outputDir, { recursive: true });

  const logEntry = {
    timestamp: new Date().toISOString(),
    duration_ms: data.duration,
    request: {
      method: data.method,
      url: data.url,
      headers: obfuscateHeaders(data.requestHeaders),
      body: data.requestBody,
    },
    response: {
      status: data.status,
      headers: data.responseHeaders,
      body: data.responseBody,
      is_streaming: data.isStreaming,
    },
  };

  const filename = generateFilename();
  const filepath = join(outputDir, filename);
  const content = yaml.dump(logEntry, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });

  await writeFile(filepath, content, 'utf-8');
  console.log(`  Logged: ${data.method} ${data.url} -> ${data.status} (${data.duration}ms)`);

  return filepath;
}

export async function getRecentLogs(outputDir, limit = 20) {
  try {
    const files = await readdir(outputDir);
    const yamlFiles = files
      .filter((f) => f.endsWith('.yaml'))
      .sort()
      .reverse()
      .slice(0, limit);

    const logs = await Promise.all(
      yamlFiles.map(async (filename) => {
        const content = await readFile(join(outputDir, filename), 'utf-8');
        return yaml.load(content);
      })
    );

    return logs;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
