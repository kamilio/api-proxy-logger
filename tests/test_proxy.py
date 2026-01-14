import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock, MagicMock
import httpx

from app.main import app


client = TestClient(app)


class TestViewerRoute:
    def test_viewer_returns_html(self):
        response = client.get("/viewer")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "API Proxy Logger" in response.text

    def test_viewer_with_limit(self):
        response = client.get("/viewer?limit=5")
        assert response.status_code == 200


class TestProxyDetection:
    def test_should_stream_with_stream_true(self):
        from app.proxy import _should_stream

        assert _should_stream({"stream": True}) is True
        assert _should_stream({"stream": False}) is False
        assert _should_stream({"model": "gpt-4"}) is False
        assert _should_stream(None) is False
        assert _should_stream("string body") is False
