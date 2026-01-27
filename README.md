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
llm-debugger config add-alias openai https://api.openai.com
llm-debugger config add-alias anthropic https://api.anthropic.com
llm-debugger config add-alias openrouter https://openrouter.ai/api
llm-debugger config add-alias poe https://api.poe.com

# Start without --target (aliases only)
llm-debugger

# Start with an alias as the default target
llm-debugger --target openai

# Persist a default alias for root requests
llm-debugger config set-default-alias openai
llm-debugger
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

### Config Commands

```bash
llm-debugger config show              # Display current config
llm-debugger config edit              # Open config in editor
llm-debugger config add-alias <name> <url>    # Add an alias
llm-debugger config remove-alias <name>       # Remove an alias
llm-debugger config set-default-alias <name>  # Set default alias for root requests
```

## License

MIT
