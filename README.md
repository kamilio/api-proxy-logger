# llm-debugger

Debug and log LLM API requests with streaming support.

## Install

```bash
npm install -g llm-debugger
```

## Quick Start

```bash
# Initialize config
llm-debugger init

# Start proxy to OpenAI
llm-debugger --target https://api.openai.com

# Start proxy to Anthropic
llm-debugger --target https://api.anthropic.com
```

## Usage

Point your LLM client to the proxy instead of the API directly:

```bash
# Instead of: https://api.openai.com/v1/chat/completions
# Use:        http://localhost:8000/proxy/v1/chat/completions
```

View logged requests at `http://localhost:8000/viewer`

## Routes

| Route | Description |
|-------|-------------|
| `/proxy/*` | Forwards requests to target API |
| `/viewer` | Web UI to inspect logged requests |
| `/api/<shape>/*` | Mock API for replaying saved responses |

## Configuration

Config lives at `~/.llm_debugger/config.yaml`. Override paths with environment variables:

- `LLM_DEBUGGER_HOME` - Base directory
- `LOG_OUTPUT_DIR` - Logs directory
- `CONFIG_PATH` - Config file path

## License

MIT
