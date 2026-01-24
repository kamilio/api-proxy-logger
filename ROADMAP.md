# Roadmap

## Config cli `config edit`

Add cli command to edit config

Use $EDITOR env var, fallback to `open` (macOS) / `xdg-open` (Linux). If neither works, print the config path.

## Config cli `config show`

Print current config to stdout (read-only)

## Port discovery

`--port 8000` uses fixed port (fail if occupied)
`--port 8000-8010` uses range (auto-discover first available)
Default is range 8000-8010

When default port is taken, try next, until you find empty.

Make sure to only discover ports when occupied, not when for some reason it fails.

If all ports in the range are occupied, error out with a message listing the attempted range.

## Proxy aliases in config

Alias proxy

`localhost/__proxy__/<alias>`

```yaml
aliases:
    poe:
        url: "https://api.poe.com"
    openrouter:
        url: "https://openrouter.ai"
        headers:
            Authorization: "Bearer ${OPENROUTER_KEY}"
```

Headers support environment variable interpolation via `${VAR}` syntax.

Default is

```yaml
# <comment explaining the config schema>
aliases: {}
```

The stdout output when running should include all aliases

## cli config add-alias <alias> <url>

## cli config remove-alias <alias>

## viewer - filter by base URL

The viewer should have ability to filter by base URL
The filter must be persisted in URL as query params
There's a badge with baseurl, clicking it would activate filter

Supports multiple filters: `?baseUrl=api.poe.com,openrouter.ai`
Supports method filter: `?method=POST` or `?method=GET,POST`

## Simplify path configuration

Use only `LLM_DEBUGGER_HOME` as the single path configuration env var (default: `~/.llm-debugger`).

Derived paths:

- Config: `$LLM_DEBUGGER_HOME/config.yaml`
- Logs: `$LLM_DEBUGGER_HOME/logs/`

Remove `LOG_OUTPUT_DIR` and `CONFIG_PATH` from documentation. Keep them as undocumented advanced overrides only.

Update README to reflect this change.

## Remove `/proxy` redirect routes

Remove the legacy `/proxy` and `/proxy/*` redirect routes from `server.js`. These were a workaround that's no longer needed - the catch-all handler proxies everything directly.

## Rename `/viewer` to `/__viewer__`

Rename the viewer route from `/viewer` to `/__viewer__` to avoid conflicts with proxied APIs that might have their own `/viewer` endpoint.
