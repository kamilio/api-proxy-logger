# Plan

FastAPI app
It proxies all requests localhost/* GET POST etc
It must work with streaming APIs like chat/completions

It will dump/log every request and response into yaml file, exactly as is

- obfuscate Authorization header

## Verification

script verify_completions.py

```
import openai

client = openai.OpenAI(
    api_key = os.getenv("POE_API_KEY") #
    base_url = os.getenv("TARGET_URL") + "/v1",
)

chat = client.chat.completions.create(
    model = "gpt-5.1-codex",
    messages = [{
      "role": "user",
      "content": "Write a Bash script to create a new directory and change the current directory to it"
    }]
    stream = True
)

print(chat.choices[0].message.content)
```

script verify_anthropic

```
# pip install anthropic
import os
import anthropic

client = anthropic.Anthropic(
    api_key=os.getenv("POE_API_KEY"),  # https://poe.com/api_key
    base_url="https://api.poe.com",
)

message = client.messages.create(
    model="claude-sonnet-4",  # or claude-opus-4, claude-3-5-haiku, etc.
    max_tokens=1024,
    messages=[{"role": "user", "content": "What are the top 3 things to do in NYC?"}],
)
print(message.content[0].text)
```

## Viewer

Simple route (exception for not proxy)

Use something that will make this simple and easy to build

GET viewer

Simple HTML app that will read last 20 (configurable via URL param) yaml entries
ability to copy raw, copy node fetch, copy curl, copy python

## Others

make start - will start detached server and pass logs to somewhere
make stop - will stop the detached server
make logs - will read the newest 300 lines of logs - USE THIS TO DEBUG
make start-dev (with watcher)
make install (dependencies)
make test  unit tests
make verify  verify scripts from above

output directory should be in gitignore, pick one
