# Daily Options Picker Telegram Bot

Local Telegram publisher for Codex-generated pre-open options briefs.

The flow is:

```text
Codex automation -> local Node.js bot -> Telegram subscribers
```

Codex owns the research and writing. The Node bot only manages Telegram commands, subscriptions, and a local authenticated publish endpoint.

## Setup

1. Install Node.js 14 or newer.
2. Copy `.env.example` to `.env`.
3. Set `TELEGRAM_BOT_TOKEN`.
4. Set `PUBLISH_TOKEN` to a long local secret.
5. Optionally set `ADMIN_CHAT_ID`.
6. Run `npm install`.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | required | Telegram bot token. Do not commit this. |
| `ADMIN_CHAT_ID` | empty | Admin chat for `/test` and error messages. If omitted, first `/start` or `/test` is stored locally. |
| `BOT_DATA_FILE` | `./data/bot-state.json` | Local subscriber/admin/latest-brief state. |
| `BOT_LOG_FILE` | `./logs/bot.log` | JSON-lines log file. |
| `PUBLISH_HOST` | `127.0.0.1` | Local publish server host. |
| `PUBLISH_PORT` | `8787` | Local publish server port. |
| `PUBLISH_TOKEN` | required | Bearer token used by Codex automation to publish. |
| `REPORT_READY_TIME` | `08:35` | Time used by `/today` to estimate when the report should be ready. |
| `REPORT_TIMEZONE` | `America/New_York` | IANA timezone used for report dates and readiness countdowns. |
| `REPORT_WEEKDAYS` | `1,2,3,4,5` | Report weekdays, where Sunday is `0` and Monday is `1`. |

## Run

```bash
npm start
```

The bot uses Telegram long polling. No public webhook is required.

## Commands

- `/start` - welcome message
- `/help` - list commands
- `/subscribe` - receive daily picks
- `/unsubscribe` - stop daily picks
- `/today` - resend today's brief when ready
- `/yesterday` - resend the previous brief
- `/status` - check subscription status
- `/test` - send admin test message

Telegram shows persistent buttons for `/today` and `/yesterday` after bot replies.

## Publish Endpoint

Codex automation posts the finished brief to:

```text
POST http://127.0.0.1:8787/publish
Authorization: Bearer <PUBLISH_TOKEN>
Content-Type: application/json
```

Body:

```json
{
  "publishId": "2026-05-25",
  "message": "..."
}
```

`publishId` prevents duplicate sends. Use the `America/New_York` report date, such as `2026-05-25`, so `/today` and `/yesterday` can find the right brief.

If today's brief has not been published yet, `/today` replies with the time remaining in `xd xh xm` format.

## Codex Automation

The automation prompt lives in `automation/daily-options-brief.md`.

The automation researches current big and small financial/news sources, selects exactly three US-listed names, and sends one concise brief:

- one small cap
- one mid cap
- one large cap

Links belong only at the bottom under `References`.

## Build And Test

```bash
npm run build
npm test
```

The tests cover command wording, subscriptions, `/today` readiness, `/yesterday`, duplicate publish protection, and the local publish endpoint auth.

## Data And Logs

Ignored local files:

- `.env`
- `data/bot-state.json`
- `logs/bot.log`

The bot never places trades. It only publishes informational text.
