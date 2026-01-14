from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path

from .proxy import proxy_request
from .logger import get_recent_logs

app = FastAPI(title="API Proxy Logger")

templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


@app.get("/viewer", response_class=HTMLResponse)
async def viewer(request: Request, limit: int = 20):
    """View recent logged requests."""
    logs = get_recent_logs(limit=limit)
    return templates.TemplateResponse(
        request, "viewer.html",
        {"logs": logs, "limit": limit}
    )


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy(request: Request, path: str):
    """Proxy all requests to the target server."""
    return await proxy_request(request, path)
