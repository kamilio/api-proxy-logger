import os
import yaml
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LOGS_DIR = Path("logs")


def obfuscate_headers(headers: dict[str, str]) -> dict[str, str]:
    """Obfuscate sensitive headers like Authorization."""
    result = {}
    for key, value in headers.items():
        if key.lower() == "authorization":
            if len(value) > 10:
                result[key] = value[:6] + "..." + value[-4:]
            else:
                result[key] = "***"
        else:
            result[key] = value
    return result


def log_request_response(
    method: str,
    url: str,
    request_headers: dict[str, str],
    request_body: Any,
    response_status: int,
    response_headers: dict[str, str],
    response_body: Any,
    is_streaming: bool = False,
) -> str:
    """Log a request/response pair to a YAML file."""
    LOGS_DIR.mkdir(exist_ok=True)

    now = datetime.now(timezone.utc)
    timestamp = now.isoformat()
    filename = f"{now.strftime('%Y%m%d_%H%M%S_%f')}.yaml"
    filepath = LOGS_DIR / filename

    entry = {
        "timestamp": timestamp,
        "request": {
            "method": method,
            "url": url,
            "headers": obfuscate_headers(request_headers),
            "body": request_body,
        },
        "response": {
            "status": response_status,
            "headers": dict(response_headers),
            "body": response_body,
            "is_streaming": is_streaming,
        },
    }

    with open(filepath, "w") as f:
        yaml.dump(entry, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    return str(filepath)


def get_recent_logs(limit: int = 20) -> list[dict]:
    """Get the most recent log entries."""
    LOGS_DIR.mkdir(exist_ok=True)

    files = sorted(LOGS_DIR.glob("*.yaml"), reverse=True)[:limit]
    logs = []

    for filepath in files:
        with open(filepath) as f:
            try:
                data = yaml.safe_load(f)
                data["_filename"] = filepath.name
                logs.append(data)
            except yaml.YAMLError:
                continue

    return logs
