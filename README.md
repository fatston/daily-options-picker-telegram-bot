# Daily Options Picker Telegram Bot

A local Telegram bot that sends subscribed users one weekday pre-open options brief before the regular US stock market opens.

The bot runs from this desktop/server, stores subscribers in a local JSON file, and schedules the daily send for weekdays at `08:35` in the `America/New_York` IANA timezone. Daylight saving time is handled by the JavaScript `Intl` timezone APIs.

## Setup

1. Install Node.js 14 or newer.
2. Copy `.env.example` to `.env`.
3. Set `TELEGRAM_BOT_TOKEN` in `.env`.
4. Optionally set `ADMIN_CHAT_ID` in `.env`.
5. Install dependencies:

```bash
npm install
```

This project currently uses only Node built-ins, so `npm install` creates the local lockfile and validates the project metadata.

## Configuration

Environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | required | Telegram bot token. Do not commit this. |
| `ADMIN_CHAT_ID` | empty | Optional chat id allowed to run `/test` and receive errors. If omitted, the first `/start` or `/test` chat is stored locally as admin. |
| `BOT_DATA_FILE` | `./data/bot-state.json` | Persistent subscriber/admin/last-send state. |
| `BOT_LOG_FILE` | `./logs/bot.log` | JSON-lines log file. |
| `PICKER_TIME` | `08:35` | Daily picker time in `HH:mm`. |
| `PICKER_TIMEZONE` | `America/New_York` | IANA timezone for the schedule and duplicate-send date. |
| `PICKER_WEEKDAYS` | `1,2,3,4,5` | Weekday numbers, where Sunday is `0` and Monday is `1`. |

Schedule configuration lives in `.env` via `PICKER_TIME`, `PICKER_TIMEZONE`, and `PICKER_WEEKDAYS`. The default is Monday-Friday at `08:35 America/New_York`.

## Run

```bash
npm start
```

Leave the terminal or background process running on the desktop. The bot uses Telegram long polling, so no public webhook server is required.

## Commands

- `/start` — welcome message and explanation
- `/help` — list all commands
- `/subscribe` — subscribe this chat to daily picks
- `/unsubscribe` — unsubscribe this chat
- `/today` — generate and send today's picker immediately
- `/status` — show whether this chat is subscribed
- `/test` — admin-only test message when `ADMIN_CHAT_ID` is configured

## Picker behaviour

Before `/today` or the scheduled daily run, the bot sends:

```text
🔎 Preparing today’s Daily Options Picker...

Checking pre-open market news and looking for one clear directional setup.
```

It then searches current news through a modular RSS-based provider and prefers liquid large/mid-cap US-listed tickers with:

- at least one primary financial/news source, such as Reuters, CNBC, Bloomberg, MarketWatch, Yahoo Finance, SEC, Nasdaq/NYSE, or company investor relations
- supporting secondary attention when available, such as Benzinga, Seeking Alpha, The Motley Fool, Stocktwits, Reddit, or similar investing discussion sources

If no supported directional setup is found, it sends:

```text
No strong pre-open options signal found today.
```

The bot skips duplicate scheduled sends by storing the last sent `America/New_York` date. On weekends or recognized regular US market holidays, scheduled subscribers receive:

```text
No regular US market open today.
```

## Build And Test

```bash
npm run build
npm test
```

`npm run build` syntax-checks the source files. `npm test` runs command, storage, scheduler, market-calendar, and picker unit tests.

## Data And Logs

Local runtime data is intentionally uncommitted:

- `data/bot-state.json`
- `logs/bot.log`
- `.env`

The bot never places trades. It only sends informational text and includes the disclaimer:

```text
Informational only. Not personalized financial advice.
```
