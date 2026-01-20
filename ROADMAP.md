# LLM Debugger - Development Roadmap

## Phase 1: Multi-Provider Proxy (Recording)

### URL Structure

```
localhost:8000/proxy/<provider>/*
```

### Implementation Details

#### 1.1 Provider Configuration

Update `config.yaml` to define provider endpoints:

```yaml
providers:
  openai: https://api.openai.com
  anthropic: https://api.anthropic.com
  openrouter: https://openrouter.ai/api
  poe: https://api.poe.com
  gemini: https://generativelanguage.googleapis.com
```

Logs automatically go to `logs/<provider>/` - no need to configure.

#### 1.2 Authentication Strategy

- **Pass-through approach**: Client supplies API keys in request headers
- No server-side key storage needed
- Supports different auth headers per provider:
  - OpenAI: `Authorization: Bearer sk-...`
  - Anthropic: `x-api-key: sk-ant-...`
  - OpenRouter: `Authorization: Bearer sk-or-...`
  - Poe: `Authorization: poe-api-key`

#### 1.3 Required Code Changes

1. **Remove POE hardcoding from `src/cli.js`**
   - Make TARGET_URL dynamic based on provider in URL path
   - Remove POE_API_KEY requirement

2. **Update `src/server.js` routing**
   - Parse provider from URL: `/proxy/:provider/*`
   - Load provider config from YAML
   - Pass target URL to proxy handlers

3. **Enhance `src/logger.js`**
   - Create provider-specific subdirectories
   - Add provider metadata to log files

4. **Update `src/viewer.js`**
   - Show provider in UI
   - Filter logs by provider

## Phase 2: Dummy API (Replaying)

### URL Structure

```
localhost:8000/api/<api_shape>/<endpoint>
```

### Supported API Shapes

#### 2.1 OpenAI-Compatible

- `/api/openai/v1/chat/completions`

#### 2.2 Anthropic Messages API

- `/api/anthropic/v1/messages`

#### 2.3 Google Gemini

- `/api/gemini/v1beta/models/*/generateContent`
- `/api/gemini/v1beta/models/*/streamGenerateContent`

### Response Configuration

#### 2.4 Response Mapping in `config.yaml`

```yaml
mock_responses:
  # Simple message-based mapping
  openai_completions:
    "test prompt": responses/test-completion.yaml
    "hello world": responses/hello-response.yaml
    "explain quantum computing": responses/quantum-response.yaml

  anthropic_messages:
    "test prompt": responses/anthropic-test.yaml
    "analyze this code": responses/code-analysis.yaml
```

Special handling (hardcoded):

- If message is exactly "echo" → return request details
- If no match found → return helpful error with the unmatched message

#### 2.5 Response Files

Uses the existing YAML log format from recorded requests - no new format needed.
Simply copy any logged request file to the `responses/` directory and reference it in config.

### Features

#### 2.6 Request Matching Logic

Simple string matching based on the message content:

1. Extract the user message from the request body
2. Look up the message in the appropriate config section (e.g., `openai_completions`)
3. If found, return the mapped response file
4. If not found, use the fallback response

#### 2.7 Special Modes

- **Echo mode**: Returns request details for debugging
- **Replay mode**: Use existing log files as responses

#### 2.8 Streaming Support

- Detect streaming from request (`stream: true`)
- Convert stored chunks back to SSE format
- Support both JSON lines and SSE data formats

### Implementation Requirements

#### 2.9 New Module Needed

**`src/mock-server.js`**

- Route handler for `/api/*` paths
- Extract message from request body
- Look up response file in config
- Load and return YAML response
- Handle streaming if `is_streaming: true` in response

#### 2.10 Fallback Behavior

When no match is found, return a sensible error response that helps the user understand what happened and recover easily. Include the unmatched message and available options.

## Acceptance Criteria

### Phase 1: Multi-Provider Proxy

- Verify requests to `/proxy/openai/*` are proxied to `https://api.openai.com`
- Verify requests to `/proxy/anthropic/*` are proxied to `https://api.anthropic.com`
- Verify auth headers are passed through unchanged
- Verify logs are created in `logs/<provider>/` directories
- Verify streaming responses work correctly
- Verify viewer shows provider name in UI

### Phase 2: Mock API

- Verify message "test prompt" returns content from configured response file
- Verify message "echo" returns the full request details
- Verify unknown messages return helpful error with the unmatched message
- Verify streaming works when response has `is_streaming: true`
- Verify both OpenAI and Anthropic API shapes work

## Implementation Order

1. Multi-provider proxy - Remove POE hardcoding and support multiple providers
2. Mock API - Simple message-to-response mapping with echo mode
