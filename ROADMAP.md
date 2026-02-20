# Roadmap

## Compare

Compare up to 5 logs side-by-side.

### Flow

1. Click "Compare" button on index page → enters selection mode
2. Checkboxes appear on each log card
3. Select 2-5 logs (max 5)
4. "Compare Selected" button appears → navigates to compare page with selected log IDs

### Compare Page

- Route: `GET /__viewer__/compare?logs=provider/file1,provider/file2,provider/file3`
- Layout: Each log in its own column, horizontal scroll if needed
- Sections (same as detail view): headers, request body, response body
- Vertical alignment: all section headers start at same height across columns (use CSS grid rows or flexbox with align-items)

### Features

- **Diff highlighting**: Use a diff library (e.g., diff, jsdiff) to highlight differences between logs. Color-code added/removed/changed content.
- **Auto-collapse identical sections**: Sections that are identical across all logs are collapsed by default. Click to expand.
- **Timeline header**: Small visualization showing when each request happened and relative durations.
- **Export as markdown**: Copy comparison summary (with diffs) to clipboard.

### Screenshot Task

- Script: `npm run screenshot_compare`
- Takes last 3 logs by timestamp
- Throws exception if fewer than 3 logs exist (so we can create test data)
- Saves to screenshots directory

---

## Pinned Logs

Pin important logs to protect them from log rotation and quickly filter to them.

### Features

- **Pin/Unpin**: Click "..." menu on any log card → select "Pin" or "Unpin"
- **Pin indicator**: Pinned logs show a 📌 icon in the index view
- **Pinned filter**: Click "Pinned" button to show only pinned logs
- **Rotation protection**: Pinned logs are never deleted by log rotation
- **Storage**: Pinned log IDs stored in `~/.llm-debugger/pinned.yaml`

### API

- `POST /__viewer__/:provider/:filename/pin` — pin a log
- `DELETE /__viewer__/:provider/:filename/pin` — unpin a log
- `GET /__viewer__/:provider/:filename/pin` — check pin status

---

## Log Rotation

Automatically delete oldest logs when the total exceeds a configured limit.

### Config

- `max_logs: 100` (default) — set to `0` for unlimited
- Configurable via UI (Settings → Max Logs) or CLI (`llm-debugger config set max_logs 50`)
- Pinned logs are excluded from rotation

---

## Backlog (DO NOT IMPLEMENT)
