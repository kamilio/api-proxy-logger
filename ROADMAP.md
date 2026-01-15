# Future - do not implement now, just my notes

- Group the logs in log directory by the domain
- Make the UI slick, use tailwind

## Context

### API Shapes

Chat Completions
Anthropic Messages
<make it possible to add more if needed>

## 1. Compare Services

I would like to be able to compare services and their response format.

It will take yaml file, and replace the Authorization bearer with different key from .env and execute the request

it will be in logs/compare/<original_filename>/
files
    <service_name>.yaml

Anthropic has a bit of nuance with x-headers

`npx <name> compare <path_to_yaml> --services=openai,anthropic,openrouter`

OpenAI
Anthropic
OpenRouter

## 2. UI to diff compare services

New route localhost/compare to pick your comparision
New route localhost/compare/filename to see diff

## 3. Re-run request

`npm run compare

## 4. Config

Store config in ~./.llm-api-debugger.yaml

## 5. Global config yaml

```
services:
    poe:
        api:
            chat_completions: <url>
            anthropic: <url>
    anthropic:
        api:
            anthropic: <url>
```
