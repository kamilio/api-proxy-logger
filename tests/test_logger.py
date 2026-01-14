import pytest
import tempfile
import os
from pathlib import Path

from app.logger import obfuscate_headers, log_request_response, get_recent_logs, LOGS_DIR


class TestObfuscateHeaders:
    def test_obfuscates_authorization(self):
        headers = {"Authorization": "Bearer sk-1234567890abcdef"}
        result = obfuscate_headers(headers)
        assert result["Authorization"] == "Bearer...cdef"

    def test_short_authorization(self):
        headers = {"Authorization": "short"}
        result = obfuscate_headers(headers)
        assert result["Authorization"] == "***"

    def test_preserves_other_headers(self):
        headers = {
            "Authorization": "Bearer token12345",
            "Content-Type": "application/json",
            "X-Custom": "value"
        }
        result = obfuscate_headers(headers)
        assert result["Content-Type"] == "application/json"
        assert result["X-Custom"] == "value"

    def test_case_insensitive(self):
        headers = {"authorization": "Bearer sk-1234567890abcdef"}
        result = obfuscate_headers(headers)
        assert "..." in result["authorization"]


class TestLogRequestResponse:
    def test_creates_log_file(self, tmp_path, monkeypatch):
        monkeypatch.setattr("app.logger.LOGS_DIR", tmp_path)

        filepath = log_request_response(
            method="POST",
            url="https://api.example.com/v1/chat",
            request_headers={"Content-Type": "application/json"},
            request_body={"message": "hello"},
            response_status=200,
            response_headers={"Content-Type": "application/json"},
            response_body={"reply": "world"},
        )

        assert Path(filepath).exists()
        assert filepath.endswith(".yaml")

    def test_log_content(self, tmp_path, monkeypatch):
        import yaml
        monkeypatch.setattr("app.logger.LOGS_DIR", tmp_path)

        filepath = log_request_response(
            method="GET",
            url="https://api.example.com/test",
            request_headers={"Authorization": "Bearer sk-1234567890"},
            request_body=None,
            response_status=404,
            response_headers={},
            response_body="Not found",
        )

        with open(filepath) as f:
            data = yaml.safe_load(f)

        assert data["request"]["method"] == "GET"
        assert data["response"]["status"] == 404
        assert "..." in data["request"]["headers"]["Authorization"]


class TestGetRecentLogs:
    def test_returns_logs(self, tmp_path, monkeypatch):
        monkeypatch.setattr("app.logger.LOGS_DIR", tmp_path)

        for i in range(5):
            log_request_response(
                method="GET",
                url=f"https://api.example.com/{i}",
                request_headers={},
                request_body=None,
                response_status=200,
                response_headers={},
                response_body=f"Response {i}",
            )

        logs = get_recent_logs(limit=3)
        assert len(logs) == 3

    def test_respects_limit(self, tmp_path, monkeypatch):
        monkeypatch.setattr("app.logger.LOGS_DIR", tmp_path)

        for i in range(10):
            log_request_response(
                method="GET",
                url=f"https://api.example.com/{i}",
                request_headers={},
                request_body=None,
                response_status=200,
                response_headers={},
                response_body=f"Response {i}",
            )

        logs = get_recent_logs(limit=5)
        assert len(logs) == 5
