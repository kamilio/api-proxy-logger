# Instructions

## Principles

TDD
YAGNI
Keep it simple

## Git

Use semantic release format

## Debugging and verification

When making UI changes or debuggin views, use following process

- take screnshot of index page `npm run screenshot_index`
- take screenshot of detail view `npm run screenshot_detail`

## Server process / daemon

Screenshot scripts run their own server

- check if server is running `npm run status` and start server daemon`npm start` if needed
- `npm stop` - stop background server using PID file
- `npm restart` - stop then start
