#!/usr/bin/env python3
"""Verify Anthropic API via the proxy."""
import os
from dotenv import load_dotenv
import anthropic

load_dotenv()

PROXY_URL = os.getenv("PROXY_URL", "http://localhost:8000")

client = anthropic.Anthropic(
    api_key=os.getenv("POE_API_KEY"),
    base_url=PROXY_URL,
)

print("Testing Anthropic messages via proxy...")
print("-" * 50)

message = client.messages.create(
    model="claude-sonnet-4",
    max_tokens=1024,
    messages=[{"role": "user", "content": "What are the top 3 things to do in NYC?"}],
)

print(message.content[0].text)
print("-" * 50)
print("Anthropic test complete!")
