---
$schema: https://poe-platform.github.io/poe-code/schemas/plans/pipeline.schema.json
kind: pipeline
version: 1

tasks:
  - id: config-cache-keys
    title: Add cache and snapshot_dir config keys
    prompt: |
      Add two new config keys to the llm-debugger project so they can be
      set persistently via `llm-debugger config set <key> <value>`.

      Edit src/config.js: add `cache: false` and `snapshot_dir: null` to the
      DEFAULT_CONFIG object. Both keep working when missing from the YAML
      file (existing merging logic in loadConfig handles this).

      Edit src/config-aliases.js: extend ALLOWED_CONFIG_KEYS to include
      'cache' and 'snapshot_dir'. The existing parseValue() already coerces
      'true'/'false' strings to booleans for `cache`, and stores
      `snapshot_dir` as a raw string. Empty string or 'null' becomes null
      (default <cwd>/.snapshots resolution happens elsewhere).

      Acceptance:
      - `llm-debugger config set cache true` writes `cache: true` to the
        YAML config and prints success.
      - `llm-debugger config set snapshot_dir /tmp/snaps` stores the path.
      - `llm-debugger config set cache yes` errors? No — parseValue passes
        through unrecognised strings, so document this is intentional;
        only true/false coerce.
      - Loading a config without these keys still works (defaults applied).
    status:
      implement: done
      test: done
      commit: done

  - id: snapshot-module
    title: Create src/snapshot.js with key/path/IO helpers
    prompt: |
      Create a new module src/snapshot.js that owns snapshot key
      generation, filesystem path building, and load/save/list/delete
      operations. Modeled on the snapshot machinery in
      ../poe-code/tests/helpers/snapshot-{client,store,config}.ts but
      rewritten for plain JS and HTTP requests (not LLM clients).

      Exports:
        export function generateSnapshotKey({ method, url, body });
        export function sanitizeForFs(value);
        export function extractModelFromBody(body);
        export function buildSnapshotPath(snapshotDir, { url, model, key });
        export function resolveSnapshotDir(config);
        export async function loadSnapshot(snapshotPath);
        export async function saveSnapshot(snapshotPath, entry);
        export async function listSnapshots(snapshotDir);
        export async function deleteSnapshot(snapshotPath);

      Behaviour:
      - generateSnapshotKey: stable-stringify {method, url, body} (parsing
        body as JSON when possible so key order doesn't affect hash; raw
        UTF-8 text otherwise), sha256, slice(0,12) hex.
      - sanitizeForFs: lowercase, replace anything not [a-z0-9-] with '-',
        collapse runs of '-' to one.
      - extractModelFromBody: if body is a JSON object with `model` string,
        return sanitizeForFs(body.model); otherwise 'default'.
      - buildSnapshotPath: <dir>/sanitizeForFs(url.host + url.pathname)/
        <sanitized model>/<key>.json. URL is parsed via new URL().
      - resolveSnapshotDir(config): config.snapshot_dir or
        path.join(process.cwd(), '.snapshots').
      - loadSnapshot: returns null on ENOENT, parsed JSON on success,
        rethrows other errors.
      - saveSnapshot: mkdir -p the parent, write JSON.stringify(entry,
        null, 2).
      - listSnapshots: walk <dir>/*/*/*.json, return summary objects
        ({key, host, path, model, status, recordedAt, promptPreview}).
      - deleteSnapshot: unlink, return true; ENOENT returns false; other
        errors rethrow.

      No new npm dependencies (use node:crypto, node:fs/promises, node:path).

      Add tests/snapshot.test.js using node:test that covers each export.
      Use a temp directory under os.tmpdir() per test.
    status:
      implement: done
      test: done
      refactor: done
      commit: done

  - id: header-overrides-parser
    title: Add resolveOverrides(req) for llm-debugger-* headers
    prompt: |
      Add header parsing for two new request headers that override proxy
      behaviour per request:
        - llm-debugger-url: <full http/https URL> — replaces the upstream
          target completely (alias paths and --target are ignored when
          present).
        - llm-debugger-cache: 'true' | 'false' (case-insensitive) — flips
          the snapshot cache on or off for this request.

      Both headers are stripped before forwarding upstream and never
      written into snapshots.

      In src/server.js add:
        export function resolveOverrides(req)
      Returns: { urlOverride: string | null, cacheOverride: boolean | null,
                 cleanedHeaders: Record<string, string> }
      Throws: { status: 400, body: { error, message } } when
      llm-debugger-url is present but not a valid http/https URL.

      Implementation notes:
      - Express lowercases header names; read req.headers['llm-debugger-url']
        and req.headers['llm-debugger-cache'].
      - cleanedHeaders is a shallow copy of req.headers minus those two
        keys (case-insensitive removal).
      - URL validation: new URL(value); reject if protocol is not 'http:'
        or 'https:'.
      - Cache string: trim + toLowerCase; 'true' → true, 'false' → false,
        anything else → null (use default later).

      Do NOT yet wire it into the request flow — that ships in a follow-up
      task. Just export it and unit-test it.

      Add tests/server-overrides.test.js (node:test):
      - Strips both headers from cleanedHeaders.
      - Returns { urlOverride: null, cacheOverride: null } when neither
        header is present.
      - Parses cache 'true'/'false'/'TRUE'/'False' correctly; other
        strings → null.
      - Valid URL is returned as-is.
      - Invalid URL throws { status: 400, ... }.
      - Non-http(s) URL (e.g. file://) throws.
    status:
      implement: done
      test: done
      commit: done

  - id: wire-url-override
    title: Apply llm-debugger-url override in server.js
    prompt: |
      Wire the URL header override into the proxy request flow.

      In src/server.js, inside handleProxy (the request handler that calls
      createProxyHandler / createStreamingProxyHandler):

      1. Call resolveOverrides(req) early. Catch the 400-shaped throw and
         respond res.status(400).json(body).
      2. Replace `req.headers` references downstream with
         overrides.cleanedHeaders so llm-debugger-* headers are not
         forwarded upstream. (proxy.js's filterHeaders already strips
         hop-by-hop headers; this adds the new exclusions.)
      3. If overrides.urlOverride is set:
         - Parse it via new URL().
         - Skip parseAliasPath / __proxy__ resolution; treat the request
           path (including query) as relative to the override URL.
         - Set provider label to 'header-override'.
         - proxyHeaders = null.
         - targetBaseUrl = overrides.urlOverride.
         - Use the existing buildTargetUrl(baseUrl, path) helper to
           assemble the final targetUrl.
      4. Pass overrides.cleanedHeaders to the proxy handlers via
         req.headers replacement OR by adding a new field to proxyConfig
         that proxy.js reads.

      Approach: simplest is to mutate req.headers to overrides.cleanedHeaders
      before the proxy handler runs, since proxy.js already builds outgoing
      headers from req.headers via filterHeaders.

      Acceptance:
      - curl with `llm-debugger-url: https://api.openai.com` to
        http://localhost:8000/v1/chat/completions hits api.openai.com
        regardless of --target or alias config.
      - The two llm-debugger-* headers are NOT in the upstream request.
      - Invalid URL header → HTTP 400 JSON response.

      Do NOT touch caching yet — that's a separate task.

      Tests: extend tests/server-overrides.test.js or add a new
      tests/server-url-override.test.js that boots the server against a
      fake upstream (use node's http.createServer) and verifies the
      override behaviour.
    status:
      implement: done
      test: done
      commit: done

  - id: wire-cache-into-proxy
    title: Cache hit short-circuit and record-on-miss in proxy.js
    prompt: |
      Add snapshot cache support to both proxy handlers in src/proxy.js,
      using the helpers from src/snapshot.js.

      Inputs (from server.js wiring): proxyConfig now includes
        cacheEnabled: boolean   // resolved as headerOverride ?? config.cache ?? false
        snapshotDir: string     // resolved via resolveSnapshotDir(config)

      Behaviour additions:
      - At the top of createProxyHandler and createStreamingProxyHandler,
        if proxyConfig.cacheEnabled is true:
        a. Compute key = generateSnapshotKey({ method, url: targetUrl, body })
        b. model = extractModelFromBody(parsedBody)
        c. snapshotPath = buildSnapshotPath(snapshotDir, {url: targetUrl, model, key})
        d. cached = await loadSnapshot(snapshotPath)
        e. If cached: respond from snapshot (status, headers minus
           content-length/transfer-encoding/connection/content-encoding,
           body), then call logRequest with cacheKey: key, cacheHit: true.
           For streaming snapshots (cached.response.is_streaming), the
           body is replayed as one chunk. Return early.
      - After successful upstream fetch (and after the streaming response
        is fully buffered for the streaming case), call saveSnapshot with
        a SnapshotEntry shaped:
          {
            key,
            request: { method, url, headers: <sanitized request headers
                       minus llm-debugger-*, hop-by-hop, and credentials
                       via existing sanitizeHeaders>, body: parsedBody },
            response: { status, headers: <filtered response headers>,
                        body: parsed JSON body OR text OR (for binary)
                        body_base64 + is_binary: true,
                        is_streaming: <bool> },
            metadata: { recordedAt: new Date().toISOString(),
                        model, host: url.host, path: url.pathname,
                        status }
          }
        Then logRequest with cacheKey: key, cacheHit: false.
      - When cacheEnabled is false: no change to today's behaviour. Do not
        add cache_* fields to the log.
      - Streaming + cache miss: do not write the snapshot if the upstream
        stream errored partway; only write on clean completion.
      - Sanitize request headers before storing in snapshot using the
        existing sanitizeHeaders from src/redact.js (so authorization /
        x-api-key are redacted).

      Add tests/proxy-cache.test.js (node:test) that boots the server
      against a fake upstream:
      - Cache off, header off → upstream called, no snapshot.
      - Cache on (config), no header → upstream called once; snapshot
        file appears under <tmp>/.snapshots/<host-path>/<model>/<key>.json;
        second identical request served from snapshot, upstream not hit.
      - Cache on (config), llm-debugger-cache: false → upstream always.
      - Cache off (config), llm-debugger-cache: true → snapshot recorded.
      - JSON-streaming request (body has stream:true) cached and replayed
        as one chunk; response.is_streaming preserved in snapshot.
      - llm-debugger-url redirects to a different fake upstream;
        snapshot key reflects the override URL.
    status:
      implement: done
      test: done
      refactor: done
      commit: done

  - id: logger-cache-fields
    title: Persist cache_key and cache_hit in log entries
    prompt: |
      Extend src/logger.js so that logRequest persists two new optional
      fields when caching is active:
        cache_key: <12-hex-string>
        cache_hit: true | false

      Edit logRequest(outputDir, data) to read data.cacheKey and
      data.cacheHit. When either is defined, include both in the YAML
      logEntry under top-level keys cache_key and cache_hit. When both
      are undefined, do not write either field (so existing log files
      remain backward-compatible and existing tests don't change).

      No other logger changes. Rotation, pinning, sanitization all
      continue to work.

      Tests: add a case to tests/logger.test.js (or create one if absent)
      that verifies:
      - logRequest with cacheKey + cacheHit produces a YAML file
        containing those fields under cache_key/cache_hit.
      - logRequest without those fields produces a YAML file that does
        NOT contain those keys.
    status:
      implement: done
      test: done
      commit: done

  - id: snapshot-viewer-routes
    title: Snapshot browser at /__viewer__/snapshots
    prompt: |
      Add a snapshot browser to the viewer at /__viewer__/snapshots, with
      a list page and a per-snapshot detail page, plus delete.

      Files to create:
      - src/controllers/snapshot-controller.js exporting
          createSnapshotController(config)
        which returns { index, detail, delete } Express handlers.
        - index: render src/templates/viewer-snapshots.ejs with
          { groups } where groups is an array of
          { hostPath, models: [{ name, snapshots: [SnapshotSummary] }] }
          built from listSnapshots(resolveSnapshotDir(loadConfig())).
        - detail: render src/templates/viewer-snapshot-detail.ejs with
          the parsed SnapshotEntry. Path params: :host, :model, :key.
          File is loaded from <snapshotDir>/<host>/<model>/<key>.json.
        - delete: deleteSnapshot(<that path>); 404 if missing; 204 on
          success.
      - src/templates/viewer-snapshots.ejs — grouped tree (host+path →
        model → snapshot rows showing key, method, status, recordedAt,
        prompt preview). Reuse the CSS variables and base layout from
        src/templates/viewer.ejs (link-buttons style for [Open],
        delete via overflow menu).
      - src/templates/viewer-snapshot-detail.ejs — header band with key/
        host/model/recordedAt/status/method/path and a [Delete] button;
        body shows request and response side-by-side as preformatted
        JSON. For is_binary responses, show "binary, N bytes" instead of
        the body.

      Wire the routes in src/routes/viewer.js (BEFORE the catch-all
      `router.all('*', ...)`):
        const snapshotController = createSnapshotController(config);
        router.get('/snapshots', snapshotController.index);
        router.get('/snapshots/:host/:model/:key',
                   snapshotController.detail);
        router.delete('/snapshots/:host/:model/:key',
                      snapshotController.delete);

      Use the existing pattern from src/controllers/viewer-controller.js
      for ejs rendering (renderFile or whatever the codebase uses).

      Tests: tests/viewer-snapshots.test.js — boot a server, write a
      sample snapshot to a temp snapshot_dir, assert the index lists it,
      the detail renders request/response, DELETE removes it.

      Acceptance:
      - Visiting /__viewer__/snapshots when no snapshots exist shows an
        empty state.
      - With one snapshot, the index groups by host+path → model and
        shows the prompt preview.
      - Detail page renders request and response as JSON blocks.
      - Delete button removes the file and returns the user to the
        index.
    status:
      implement: done
      test: done
      refactor: done
      commit: done

  - id: log-detail-snapshot-link
    title: Show snapshot link in log detail
    prompt: |
      Update src/templates/viewer-detail.ejs (the per-log detail page)
      so that when the log entry has a `cache_key` field, a row appears:

        SNAPSHOT  <cache_key>  (<cache hit | recorded>)  [Open snapshot]

      The "Open snapshot" link goes to
        /__viewer__/snapshots/<host>/<model>/<cache_key>
      where host and model are derived from the log entry's
      `request.url` (parse via URL) and `request.body.model` (fallback
      'default'). Sanitize host+path and model the same way the
      snapshot module does — easiest is to reuse sanitizeForFs from
      src/snapshot.js by passing them via the controller.

      Update src/controllers/viewer-controller.js so the detail handler
      computes `snapshotHref` (string | null) and `snapshotState`
      ('hit' | 'recorded' | null) and passes them to the template, so
      the EJS doesn't need URL/parse logic.

      When `cache_key` is absent from the log YAML, render nothing.

      No new tests required — covered by manual screenshot QA.
      Verify: `npm run screenshot_detail` for a log that has cache_key
      shows the snapshot row; the link is clickable and resolves.
    status:
      implement: done
      commit: done

  - id: docs-readme
    title: Document headers and snapshot cache in README
    prompt: |
      Update README.md with two new sections.

      Under "Routes" add:

      ### Per-request overrides

      Two headers let you override proxy behavior for a single request
      without restarting:

      | Header                            | Effect                                              |
      | --------------------------------- | --------------------------------------------------- |
      | `llm-debugger-url: <url>`         | Override the upstream target URL (full URL only)    |
      | `llm-debugger-cache: true\|false` | Force snapshot cache on or off for this request     |

      Both headers are stripped before forwarding and never written into
      snapshots.

      Example:

      ```bash
      curl http://localhost:8000/v1/chat/completions \
        -H 'Authorization: Bearer sk-xxx' \
        -H 'llm-debugger-url: https://api.openai.com' \
        -H 'Content-Type: application/json' \
        -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'
      ```

      Under "Configuration" add:

      ### Snapshot cache

      When the cache is on, the proxy records each upstream response to
      a JSON file under `<cwd>/.snapshots/` and replays it on a
      subsequent matching request. The cache key is
      `sha256(method + url + body)` truncated to 12 hex chars.

      Snapshots are organised as
      `<snapshot_dir>/<sanitized-host-and-path>/<model>/<hash>.json`.
      Model falls back to `default` when the request has no `model`
      field.

      Toggle defaults via config:

      ```bash
      llm-debugger config set cache true
      llm-debugger config set snapshot_dir /path/to/snapshots
      ```

      Override per request with the `llm-debugger-cache` header.
      Browse snapshots in the viewer at
      `http://localhost:8000/__viewer__/snapshots`.

      Keep the existing README structure. Use semantic-release commit
      style for the doc commit (e.g. `docs: document header overrides
      and snapshot cache`).
    status:
      implement: done
      commit: done
---

# Header-based request overrides + snapshot cache

Per-request overrides delivered as headers (`llm-debugger-url`,
`llm-debugger-cache`) plus a poe-code-style snapshot cache, default-off
but flippable via `llm-debugger config set cache true`. Snapshots live
under `<cwd>/.snapshots/<sanitized-host-and-path>/<model>/<hash>.json`.
Viewer gains a `/__viewer__/snapshots` browser; log detail links into
its snapshot when caching is active.

## Acceptance criteria

- `llm-debugger-url` header sends the request to a different upstream
  for that request only; both override headers are stripped before
  forwarding.
- `llm-debugger-cache: true` (or `cache: true` in config) records a
  snapshot on first call and replays it on the second; `false`
  bypasses the cache.
- Streaming responses are buffered and replayed as one chunk; the
  `is_streaming` flag is preserved in the snapshot and log.
- Snapshot files are organised by host+path → model and contain
  `request`, `response`, `metadata` blocks. Credentials are redacted
  by reusing `sanitizeHeaders`.
- `/__viewer__/snapshots` lists snapshots; the detail page shows
  request + response and a working delete button. Log detail pages
  link to the matching snapshot when `cache_key` is present.
- README documents the headers, the config keys, and the viewer URL.

## Build order

The task ids are listed in the order they should run; later tasks
depend on the modules and config keys earlier ones add. The
`wire-cache-into-proxy` task assumes `snapshot-module`, `config-cache-keys`,
and `header-overrides-parser` are already merged.
