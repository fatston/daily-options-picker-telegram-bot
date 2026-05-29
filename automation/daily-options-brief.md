# Daily Options Picker Codex Automation

Research current pre-open US stock-market news and publish one concise Telegram brief through the local Node bot.

## Schedule

Run on weekdays before the regular US stock market opens: 08:35 America/New_York.

## Research

Use current reputable sources. Browse and verify links before using them.

Primary sources should include large financial/news or official sources such as Reuters, CNBC, Bloomberg, Wall Street Journal, MarketWatch, Yahoo Finance, SEC filings, Nasdaq/NYSE pages, and company investor relations.

Secondary attention sources may include Benzinga, Seeking Alpha, The Motley Fool, Stocktwits, Reddit investing communities, X/Twitter trends, and Google News results.

Pick exactly three US-listed tickers:

- one small cap
- one mid cap
- one large cap

Each pick must have a clear bullish or bearish directional read. Prefer names with active options liquidity. Avoid penny stocks, obvious low-liquidity names, and picks supported only by social chatter. If a pick is weaker or speculative, say so in the bullet for that ticker.

## Message Format

Keep it short and mobile-friendly. Use bullets where useful. Put all links only at the bottom under References.

```text
=================

🔹 Small cap ticker - <TICKER>
<🐂 Bull / 🐻 Bear> - <CALL / PUT>
- <short reason>
- <short caveat if needed>

🔸 Mid cap ticker - <TICKER>
<🐂 Bull / 🐻 Bear> - <CALL / PUT>
- <short reason>
- <short caveat if needed>

🔷 Large cap ticker - <TICKER>
<🐂 Bull / 🐻 Bear> - <CALL / PUT>
- <short reason>
- <short caveat if needed>

=================
References
1. <source name> - <url>
2. <source name> - <url>
3. <source name> - <url>

Informational only. Not personalized financial advice.
```

## Publish

Read `.env` from the repo root. POST the final message and structured picks to the local Node bot:

- URL: `http://127.0.0.1:${PUBLISH_PORT:-8787}/publish`
- Header: `Authorization: Bearer ${PUBLISH_TOKEN}`
- JSON body:

```json
{
  "message": "...",
  "publishId": "YYYY-MM-DD",
  "picks": [
    { "ticker": "SMALL", "size": "small", "direction": "call" },
    { "ticker": "MID", "size": "med", "direction": "put" },
    { "ticker": "LARGE", "size": "large", "direction": "call" }
  ]
}
```

Use the America/New_York report date for `publishId`. This lets `/today` and `/yesterday` return the correct brief.
Use `size` values `small`, `med`, and `large`. Use `direction` values `call` for bullish and `put` for bearish.

If no three credible picks are available, publish a concise message saying no strong pre-open options setup was found today, with references checked where possible.
