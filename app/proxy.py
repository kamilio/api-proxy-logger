from __future__ import annotations

import os
import json
import httpx
from fastapi import Request, Response
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator
from dotenv import load_dotenv

from .logger import log_request_response

load_dotenv()

TARGET_URL = os.getenv("TARGET_URL", "https://api.poe.com")

EXCLUDED_REQUEST_HEADERS = {"host", "content-length", "transfer-encoding"}
EXCLUDED_RESPONSE_HEADERS = {"content-encoding", "transfer-encoding", "content-length"}


async def proxy_request(request: Request, path: str) -> Response:
    """Proxy a request to the target server."""
    url = f"{TARGET_URL}/{path}"
    if request.query_params:
        url += f"?{request.query_params}"

    request_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in EXCLUDED_REQUEST_HEADERS
    }

    body = await request.body()
    request_body = body.decode("utf-8") if body else None

    try:
        request_body_parsed = json.loads(request_body) if request_body else None
    except (json.JSONDecodeError, TypeError):
        request_body_parsed = request_body

    is_streaming = _should_stream(request_body_parsed)

    if is_streaming:
        return await _handle_streaming_request(
            request.method, url, request_headers,
            body, request_body_parsed
        )
    else:
        return await _handle_regular_request(
            request.method, url, request_headers,
            body, request_body_parsed
        )


def _should_stream(request_body: dict | str | None) -> bool:
    """Check if the request expects a streaming response."""
    if isinstance(request_body, dict):
        return request_body.get("stream", False)
    return False


async def _handle_regular_request(
    method: str,
    url: str,
    headers: dict,
    body: bytes,
    request_body_parsed,
) -> Response:
    """Handle a regular (non-streaming) request."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.request(
            method=method,
            url=url,
            headers=headers,
            content=body if body else None,
        )

        response_headers = {
            k: v for k, v in response.headers.items()
            if k.lower() not in EXCLUDED_RESPONSE_HEADERS
        }

        try:
            response_body = json.loads(response.text)
        except (json.JSONDecodeError, ValueError):
            response_body = response.text

        log_request_response(
            method=method,
            url=url,
            request_headers=headers,
            request_body=request_body_parsed,
            response_status=response.status_code,
            response_headers=response_headers,
            response_body=response_body,
            is_streaming=False,
        )

        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=response_headers,
        )


async def _handle_streaming_request(
    method: str,
    url: str,
    headers: dict,
    body: bytes,
    request_body_parsed,
) -> StreamingResponse:
    """Handle a streaming request (like chat completions with stream=true)."""
    collected_chunks: list[str] = []
    response_status = 0
    response_headers_captured: dict = {}

    async def stream_generator() -> AsyncGenerator[bytes, None]:
        nonlocal response_status, response_headers_captured

        client = httpx.AsyncClient(timeout=120.0)
        try:
            async with client.stream(
                method=method,
                url=url,
                headers=headers,
                content=body if body else None,
            ) as response:
                response_status = response.status_code
                response_headers_captured = {
                    k: v for k, v in response.headers.items()
                    if k.lower() not in EXCLUDED_RESPONSE_HEADERS
                }

                async for chunk in response.aiter_bytes():
                    collected_chunks.append(chunk.decode("utf-8", errors="replace"))
                    yield chunk

                log_request_response(
                    method=method,
                    url=url,
                    request_headers=headers,
                    request_body=request_body_parsed,
                    response_status=response_status,
                    response_headers=response_headers_captured,
                    response_body="".join(collected_chunks),
                    is_streaming=True,
                )
        finally:
            await client.aclose()

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
    )
