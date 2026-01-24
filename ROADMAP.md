# Roadmap

## Agentic Testing

### Background Process Management

`npm start` - starts server in background, writes PID to `$LLM_DEBUGGER_HOME/.pid`, outputs startup message and exits
`npm run stop` - reads PID file, kills process, removes PID file
`npm run restart` - runs stop then start

Implementation:
- PID file location: `$LLM_DEBUGGER_HOME/.pid`
- On start: check if PID file exists and process is running, fail if so
- On stop: read PID, send SIGTERM, wait for exit, remove PID file

### Test Data Folder

- Folder name: `.test-data`
- Added to `.gitignore`
- Usage: `LLM_DEBUGGER_HOME=.test-data npm start`

### API Verification

Existing scripts in `scripts/`:
- `verify-anthropic.js` - makes Anthropic API call through proxy
- `verify-openai.js` - makes OpenAI API call through proxy

Required env vars (in `.env`):
- `POE_API_KEY`
- `PROXY_HOST`
- `PROXY_PORT`

Proxies to `api.poe.com`.

### Playwright Screenshot Tools

`npm run screenshot_index` - captures screenshot of viewer index page, prints the screenshot URL
`npm run screenshot_detail` - captures screenshot of detail view (uses newest log in `.test-data`), prints the screenshot URL

Agent analyzes screenshots to verify UI is correct and well designed.
