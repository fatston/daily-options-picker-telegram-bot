# Daily Options Picker Online Telegram Bot

Hosted Telegram webhook and publish endpoint for the Daily Options Picker brief.

## Endpoints

- `GET /api/health`
- `POST /api/telegram` for Telegram webhook updates
- `POST /api/publish` for Codex automation publishes
- `GET /api/picks.csv` for the tracked pick CSV

`/api/publish` and `/api/picks.csv` require `Authorization: Bearer <PUBLISH_TOKEN>`.

## Environment

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `PUBLISH_TOKEN`
- `BLOB_READ_WRITE_TOKEN`
- `ADMIN_CHAT_ID`
- `SUBSCRIBER_CHAT_IDS`
- `REPORT_TIMEZONE`
- `REPORT_WEEKDAYS`

The publish endpoint stores each brief in Vercel Blob under its `publishId`, so `/today` and `/yesterday` can replay the current and previous report-date briefs. It also appends structured picks to `picks/picks.csv` in Vercel Blob using:

```csv
date,ticker,size,direction
```

Seed or refresh the Blob CSV from `data/picks.csv` with `npm run seed:picks`.
