# llm-debugger

Debug and log LLM API requests with streaming support.

## Quick Start

```bash
# Start proxy to OpenAI
npx llm-debugger@latest --target https://api.openai.com

# Start proxy to Anthropic
npx llm-debugger@latest --target https://api.anthropic.com
```

## Usage

Point your LLM client to the proxy instead of the API directly:

```bash
# Instead of: https://api.openai.com/v1/chat/completions
# Use:        http://localhost:8000/v1/chat/completions
```

View logged requests at `http://localhost:8000/__viewer__`

## Routes

| Route         | Description                       |
| ------------- | --------------------------------- |
| `/*`          | Forwards requests to target API   |
| `/__viewer__` | Web UI to inspect logged requests |

### Per-request overrides

Two headers let you override proxy behavior for a single request without restarting:

| Header                            | Effect                                              |
| --------------------------------- | --------------------------------------------------- |
| `llm-debugger-url: <url>`         | Override the upstream target URL (full URL only)    |
| `llm-debugger-cache: true\|false` | Force snapshot cache on or off for this request     |

Both headers are stripped before forwarding and never written into snapshots.

Example:

```bash
curl http://localhost:8000/v1/chat/completions \
  -H 'Authorization: Bearer sk-xxx' \
  -H 'llm-debugger-url: https://api.openai.com' \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'
```

## Programmatic API

Run the proxy from your own scripts. No config file is read or written — pass everything as options.

```js
import { startProxy } from 'llm-debugger';

const proxy = await startProxy({
  target: 'https://api.openai.com',
});

console.log(proxy.url);  // http://localhost:8000

// ...point your client at proxy.url and run your code...

await proxy.stop();
```

### Options

| Option           | Default                    | Description                                                 |
| ---------------- | -------------------------- | ----------------------------------------------------------- |
| `target`         | —                          | Upstream URL.                                               |
| `host`           | `localhost`                | Bind host.                                                  |
| `port`           | `8000-8100`                | Single port or range; first free port wins.                 |
| `cache`          | `false`                    | Enable snapshot replay cache.                               |
| `snapshotDir`    | `<cwd>/.snapshots`         | Where snapshots are stored.                                 |
| `ignoreRoutes`   | `[]`                       | Glob patterns for paths to skip (no proxy, no log).         |
| `hideFromViewer` | `[]`                       | Glob patterns for paths to log but hide from the viewer UI. |
| `enabled`        | `true`                     | Toggle request logging (proxy still works when off).        |
| `maxLogs`        | `100`                      | Log retention before rotation; `0` disables rotation.       |
| `logsDir`        | `<cwd>/.llm-debugger/logs` | Where logs are written.                                     |
| `cwd`            | `process.cwd()`            | Used as the base for `logsDir` and `snapshotDir` defaults.  |

### Return value

```ts
{
  url: string;          // e.g. "http://localhost:8000"
  port: number;
  host: string;
  server: http.Server;  // raw Node server, for advanced use
  stop: () => Promise<void>;
}
```

## Configuration

When running via the CLI, config lives at `~/.llm-debugger/config.yaml` and logs at `~/.llm-debugger/logs`. Override the base directory with:

- `LLM_DEBUGGER_HOME` - Base directory

### Snapshot cache

When the cache is on, the proxy records each upstream response to a JSON file under `<cwd>/.snapshots/` and replays it on a subsequent matching request. The cache key is `sha256(method + url + body)` truncated to 12 hex chars.

Snapshots are organised as `<snapshot_dir>/<sanitized-host-and-path>/<model>/<hash>.json`. Model falls back to `default` when the request has no `model` field.

Toggle defaults via config:

```bash
llm-debugger config set cache true
llm-debugger config set snapshot_dir /path/to/snapshots
```

Override per request with the `llm-debugger-cache` header. Browse snapshots in the viewer at `http://localhost:8000/__viewer__/snapshots`.

### Config Commands

```bash
npx llm-debugger@latest config show              # Display current config
npx llm-debugger@latest config edit              # Open config in editor
npx llm-debugger@latest config set <key> <value> # Set enabled, max_logs, cache, snapshot_dir
```

Only `true` and `false` strings are coerced to booleans; other strings such as `yes` are stored unchanged.

## License

MIT
