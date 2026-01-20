# LLM Debugger

Quick start:
- `npx llm-debugger --help`
- `npx llm-debugger init` (copies default `config.yaml` into `~/.llm_debugger`)
- `npx llm-debugger --target https://api.openai.com`

Proxy routes are driven by the `--target` command line argument.

Responses are saved under the logs directory by default (e.g.
`~/.llm_debugger/logs/responses.yaml`). Override paths with `LLM_DEBUGGER_HOME`,
`CONFIG_PATH`, `RESPONSES_PATH`, and `LOG_OUTPUT_DIR` when needed.

Routes:
- Proxy: `http://localhost:8000/proxy/*`
- Viewer: `http://localhost:8000/viewer` (inspect logs, copy requests, save mock responses)
- Mock API: `http://localhost:8000/api/<shape>/*` (replay responses by message)

Proxy examples:
```
http://localhost:8000/proxy/v1/chat/completions
http://localhost:8000/proxy/v1/messages
```

Mock API URLs:
```
http://localhost:8000/api/openai/v1/chat/completions
http://localhost:8000/api/anthropic/v1/messages
http://localhost:8000/api/gemini/v1beta/models/*/generateContent
http://localhost:8000/api/gemini/v1beta/models/*/streamGenerateContent
```

Features:
- Target routing + per-target logs
- Streaming support
- Echo mode: send message `echo` to any mock shape to see your request (API keys redacted)
