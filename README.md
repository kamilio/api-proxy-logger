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

| Route | Description |
|-------|-------------|
| `/*` | Forwards requests to target API |
| `/__proxy__/<alias>/*` | Forwards requests to configured alias |
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

## Aliases

Configure aliases to proxy to multiple APIs without restarting. When aliases are configured, `--target` becomes optional.

```bash
# Add aliases for common LLM providers
npx llm-debugger@latest config add-alias openai https://api.openai.com
npx llm-debugger@latest config add-alias anthropic https://api.anthropic.com
npx llm-debugger@latest config add-alias openrouter https://openrouter.ai/api
npx llm-debugger@latest config add-alias poe https://api.poe.com

# Start without --target (aliases only)
npx llm-debugger@latest

# Start with an alias as the default target
npx llm-debugger@latest --target openai

# Persist a default alias for root requests
npx llm-debugger@latest config set-default-alias openai
npx llm-debugger@latest
```

Then use the alias path:

```bash
# OpenAI via alias
curl http://localhost:8000/__proxy__/openai/v1/chat/completions

# Anthropic via alias
curl http://localhost:8000/__proxy__/anthropic/v1/messages

# OpenRouter via alias
curl http://localhost:8000/__proxy__/openrouter/v1/chat/completions

# Poe via alias
curl http://localhost:8000/__proxy__/poe/v1/chat/completions
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

With aliases:

```js
const proxy = await startProxy({
  aliases: {
    openai:    { url: 'https://api.openai.com',    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } },
    anthropic: { url: 'https://api.anthropic.com', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY } },
  },
  defaultAlias: 'openai',
  cache: true,
});

// proxy.url + '/__proxy__/anthropic/v1/messages' routes to Anthropic
```

### Options

| Option           | Default                       | Description                                                       |
| ---------------- | ----------------------------- | ----------------------------------------------------------------- |
| `target`         | —                             | Upstream URL, or an alias name from `aliases`.                    |
| `aliases`        | `{}`                          | Map of `{ name: { url, headers } }` for multi-upstream routing.   |
| `defaultAlias`   | `null`                        | Alias to use for root-path requests when `target` isn't set.      |
| `host`           | `localhost`                   | Bind host.                                                        |
| `port`           | `8000-8100`                   | Single port or range; first free port wins.                       |
| `cache`          | `false`                       | Enable snapshot replay cache.                                     |
| `snapshotDir`    | `<cwd>/.snapshots`            | Where snapshots are stored.                                       |
| `ignoreRoutes`   | `[]`                          | Glob patterns for paths to skip (no proxy, no log).               |
| `hideFromViewer` | `[]`                          | Glob patterns for paths to log but hide from the viewer UI.       |
| `enabled`        | `true`                        | Toggle request logging (proxy still works when off).              |
| `maxLogs`        | `100`                         | Log retention before rotation; `0` disables rotation.             |
| `logsDir`        | `<cwd>/.llm-debugger/logs`    | Where logs are written.                                           |
| `cwd`            | `process.cwd()`               | Used as the base for `logsDir` and `snapshotDir` defaults.        |

At least one of `target`, `aliases`, or `defaultAlias` must resolve to a routable upstream — otherwise `startProxy` throws.

### Return value

```ts
{
  url: string;          // e.g. "http://localhost:8000"
  port: number;
  host: string;
  configPath: string;   // resolved config file path
  server: http.Server;  // raw Node server, for advanced use
  stop: () => Promise<void>;
}
```

## Configuration

When running via the CLI, config lives at `~/.llm-debugger/config.yaml` and logs at `~/.llm-debugger/logs`. Override the base directory with:

- `LLM_DEBUGGER_HOME` - Base directory

### Environment Variables

Define env vars in your config and reference them in alias headers with `${VAR_NAME}`:

```yaml
env:
  OPENAI_API_KEY: sk-xxx
  ANTHROPIC_API_KEY: sk-ant-xxx

aliases:
  openai:
    url: "https://api.openai.com"
    headers:
      Authorization: "Bearer ${OPENAI_API_KEY}"
  anthropic:
    url: "https://api.anthropic.com"
    headers:
      x-api-key: "${ANTHROPIC_API_KEY}"
```

Env vars defined in `env` are loaded at startup with lowest precedence — real environment variables and `.env` files take priority.

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
npx llm-debugger@latest config add-alias <name> <url>    # Add an alias
npx llm-debugger@latest config remove-alias <name>       # Remove an alias
npx llm-debugger@latest config set-default-alias <name>  # Set default alias for root requests
npx llm-debugger@latest config set <key> <value>         # Set enabled, default_alias, max_logs, cache, snapshot_dir
```

Only `true` and `false` strings are coerced to booleans; other strings such as `yes` are stored unchanged.

## License

MIT
