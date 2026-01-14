#!/usr/bin/env python3
"""Verify OpenAI-compatible chat completions via the proxy."""
import os
from dotenv import load_dotenv
import openai

load_dotenv()

PROXY_URL = os.getenv("PROXY_URL", "http://localhost:8000")

client = openai.OpenAI(
    api_key=os.getenv("POE_API_KEY"),
    base_url=f"{PROXY_URL}/v1",
)

print("Testing streaming chat completion via proxy...")
print("-" * 50)

stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{
        "role": "user",
        "content": "Write a Bash script to create a new directory and change the current directory to it"
    }],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)

print("\n" + "-" * 50)
print("Streaming test complete!")
