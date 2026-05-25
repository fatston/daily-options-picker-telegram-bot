const https = require("https");

const PREPARING_MESSAGE = "🔎 Preparing today’s Daily Options Picker...\n\nChecking pre-open market news and looking for one clear directional setup.";

const CANDIDATES = [
  "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL", "AMD", "NFLX", "AVGO",
  "JPM", "BAC", "DIS", "BA", "PLTR", "COIN", "SHOP", "CRM", "INTC", "XOM"
];

const PRIMARY_SOURCES = [
  "Reuters", "CNBC", "Bloomberg", "Wall Street Journal", "MarketWatch", "Yahoo Finance",
  "SEC", "Nasdaq", "NYSE", "Investor Relations", "PR Newswire", "Business Wire"
];

const SECONDARY_SOURCES = [
  "Benzinga", "Seeking Alpha", "Motley Fool", "Stocktwits", "Reddit", "TheStreet"
];

function fetchText(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "DailyOptionsPickerBot/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchText(res.headers.location, timeoutMs));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs || 15000, () => req.destroy(new Error(`Timed out fetching ${url}`)));
  });
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseRssItems(xml) {
  const matches = String(xml || "").match(/<item>[\s\S]*?<\/item>/g) || [];
  return matches.map((item) => {
    const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
    const source = (item.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1];
    const description = (item.match(/<description>([\s\S]*?)<\/description>/) || [])[1];
    return {
      title: decodeXml(title).trim(),
      link: decodeXml(link).trim(),
      source: decodeXml(source).trim(),
      description: decodeXml(description).replace(/<[^>]+>/g, "").trim()
    };
  }).filter((item) => item.title && item.link);
}

function sourceTier(item) {
  const haystack = `${item.source} ${item.title} ${item.link}`;
  if (PRIMARY_SOURCES.some((source) => haystack.toLowerCase().includes(source.toLowerCase()))) return "primary";
  if (SECONDARY_SOURCES.some((source) => haystack.toLowerCase().includes(source.toLowerCase()))) return "secondary";
  return "other";
}

function scoreSentiment(items) {
  const bullish = ["surge", "rally", "beats", "beat", "raises", "upgrade", "upgraded", "record", "growth", "profit", "approval", "partnership", "wins"];
  const bearish = ["falls", "drops", "misses", "miss", "cuts", "downgrade", "downgraded", "probe", "lawsuit", "warning", "recall", "loss", "weak"];
  let score = 0;
  for (const item of items) {
    const text = `${item.title} ${item.description}`.toLowerCase();
    for (const word of bullish) if (text.includes(word)) score += 1;
    for (const word of bearish) if (text.includes(word)) score -= 1;
  }
  return score;
}

async function searchTickerNews(ticker) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${ticker} stock premarket news options`)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await fetchText(url, 15000);
  return parseRssItems(xml).slice(0, 8).map((item) => Object.assign(item, { ticker, tier: sourceTier(item) }));
}

async function withRetries(fn, attempts, logger) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (logger) logger.warn("External call failed; retrying", { attempt: i + 1, error: error.message });
      await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw lastError;
}

function chooseBestCandidate(results) {
  const scored = results.map((result) => {
    const primaryCount = result.items.filter((item) => item.tier === "primary").length;
    const secondaryCount = result.items.filter((item) => item.tier === "secondary").length;
    const sentiment = scoreSentiment(result.items);
    const strength = Math.abs(sentiment) + primaryCount * 2 + secondaryCount;
    return Object.assign({}, result, { primaryCount, secondaryCount, sentiment, strength });
  }).filter((item) => item.items.length >= 3 && item.primaryCount >= 1 && item.sentiment !== 0);

  scored.sort((a, b) => b.strength - a.strength);
  return scored[0] || null;
}

function cleanReasonTitle(title, ticker) {
  return title.replace(new RegExp(`\\b${ticker}\\b`, "gi"), ticker).replace(/\s+-\s+[^-]+$/, "").trim();
}

async function generatePickerBrief(options) {
  const logger = options && options.logger;
  const results = [];
  const selectedTickers = CANDIDATES.slice(0, 10);

  for (const ticker of selectedTickers) {
    try {
      const items = await withRetries(() => searchTickerNews(ticker), 2, logger);
      results.push({ ticker, items });
    } catch (error) {
      if (logger) logger.warn("News lookup failed", { ticker, error: error.message });
    }
  }

  const candidate = chooseBestCandidate(results);
  if (!candidate) return "No strong pre-open options signal found today.";

  const direction = candidate.sentiment > 0 ? "Bullish" : "Bearish";
  const optionDirection = candidate.sentiment > 0 ? "Call" : "Put";
  const reasons = candidate.items
    .filter((item) => item.tier === "primary")
    .concat(candidate.items.filter((item) => item.tier !== "primary"))
    .slice(0, 3);

  while (reasons.length < 3 && candidate.items[reasons.length]) reasons.push(candidate.items[reasons.length]);

  const weak = candidate.primaryCount < 1 || candidate.secondaryCount < 1 || Math.abs(candidate.sentiment) < 2;
  const caveats = weak
    ? "Signal is weaker because current source support or retail-attention evidence is limited. Check earnings timing, volatility, spreads, and liquidity before acting."
    : "Pre-open headlines can reverse quickly. Check earnings timing, volatility, spreads, and liquidity before acting.";

  return [
    "📈 Daily Options Picker",
    "",
    `Ticker: ${candidate.ticker}`,
    `Direction: ${direction}`,
    `Suggested option direction: ${optionDirection}`,
    "",
    "Why:",
    ...reasons.slice(0, 3).map((item, index) => `${index + 1}. ${cleanReasonTitle(item.title, candidate.ticker)} (${item.link})`),
    "",
    "Caveats:",
    caveats,
    "",
    "Disclaimer:",
    "Informational only. Not personalized financial advice."
  ].join("\n");
}

module.exports = {
  PREPARING_MESSAGE,
  generatePickerBrief,
  parseRssItems,
  chooseBestCandidate,
  scoreSentiment
};
