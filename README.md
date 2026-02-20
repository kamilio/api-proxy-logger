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

## Configuration

Config lives at `~/.llm-debugger/config.yaml` and logs at `~/.llm-debugger/logs`. Override the base directory with:

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

### Config Commands

```bash
npx llm-debugger@latest config show              # Display current config
npx llm-debugger@latest config edit              # Open config in editor
npx llm-debugger@latest config add-alias <name> <url>    # Add an alias
npx llm-debugger@latest config remove-alias <name>       # Remove an alias
npx llm-debugger@latest config set-default-alias <name>  # Set default alias for root requests
npx llm-debugger@latest config set <key> <value>         # Set a config value (enabled, max_logs)
```

## License

MIT
