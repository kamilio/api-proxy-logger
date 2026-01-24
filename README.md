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

View logged requests at `http://localhost:8000/viewer`

## Routes

| Route | Description |
|-------|-------------|
| `/*` | Forwards requests to target API |
| `/viewer` | Web UI to inspect logged requests |

## Configuration

Config lives at `~/.llm-debugger/config.yaml` and logs at `~/.llm-debugger/logs`. Override the base directory with:

- `LLM_DEBUGGER_HOME` - Base directory

## License

MIT
