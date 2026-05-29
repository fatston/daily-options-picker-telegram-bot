const { get, put } = require("@vercel/blob");

const PICK_CSV_PATH = "picks/picks.csv";
const PICK_CSV_HEADER = "date,ticker,size,direction";
const VALID_SIZES = new Set(["small", "med", "large"]);
const VALID_DIRECTIONS = new Set(["call", "put"]);

function normalizePick(date, pick) {
  const row = {
    date: String((pick && pick.date) || date || "").trim(),
    ticker: String((pick && pick.ticker) || "").trim().toUpperCase(),
    size: String((pick && pick.size) || "").trim().toLowerCase(),
    direction: String((pick && pick.direction) || "").trim().toLowerCase()
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new Error("pick date must use YYYY-MM-DD");
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(row.ticker)) throw new Error("pick ticker is invalid");
  if (row.size === "medium") row.size = "med";
  if (!VALID_SIZES.has(row.size)) throw new Error("pick size must be small, med, or large");
  if (!VALID_DIRECTIONS.has(row.direction)) throw new Error("pick direction must be call or put");
  return row;
}

function csvLine(row) {
  return [row.date, row.ticker, row.size, row.direction].join(",");
}

function parsePickCsv(csv) {
  return String(csv || "")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [date, ticker, size, direction] = line.split(",");
      return normalizePick(date, { ticker, size, direction });
    });
}

function pickCsv(rows) {
  const lines = [PICK_CSV_HEADER];
  for (const row of rows) lines.push(csvLine(normalizePick(row.date, row)));
  return `${lines.join("\n")}\n`;
}

async function streamToText(stream) {
  return new Response(stream).text();
}

async function loadPickCsv() {
  try {
    const result = await get(PICK_CSV_PATH, {
      access: "private",
      useCache: false
    });
    if (!result || !result.stream) return `${PICK_CSV_HEADER}\n`;
    const csv = await streamToText(result.stream);
    return csv.trim() ? `${csv.trim()}\n` : `${PICK_CSV_HEADER}\n`;
  } catch (error) {
    if (error && /not found/i.test(error.message || "")) return `${PICK_CSV_HEADER}\n`;
    throw error;
  }
}

async function savePickCsv(csv) {
  await put(PICK_CSV_PATH, String(csv || `${PICK_CSV_HEADER}\n`), {
    access: "private",
    allowOverwrite: true,
    contentType: "text/csv; charset=utf-8",
    cacheControlMaxAge: 60
  });
}

async function appendPicksToCsv(date, picks) {
  const incoming = (picks || []).map((pick) => normalizePick(date, pick));
  if (!incoming.length) return { added: 0, total: parsePickCsv(await loadPickCsv()).length };

  const existing = parsePickCsv(await loadPickCsv());
  const byKey = new Map(existing.map((row) => [`${row.date}:${row.ticker}`, row]));
  let added = 0;

  for (const row of incoming) {
    const key = `${row.date}:${row.ticker}`;
    if (!byKey.has(key)) {
      byKey.set(key, row);
      added += 1;
    }
  }

  const rows = Array.from(byKey.values()).sort((a, b) => (
    a.date.localeCompare(b.date) || a.size.localeCompare(b.size) || a.ticker.localeCompare(b.ticker)
  ));
  await savePickCsv(pickCsv(rows));
  return { added, total: rows.length };
}

function extractPicksFromBrief(date, message) {
  const text = String(message || "");
  const sections = [
    { size: "small", pattern: /Small cap ticker\s*-\s*([A-Z][A-Z0-9.-]{0,9})([\s\S]*?)(?=Mid cap ticker|Large cap ticker|References|$)/i },
    { size: "med", pattern: /Mid cap ticker\s*-\s*([A-Z][A-Z0-9.-]{0,9})([\s\S]*?)(?=Small cap ticker|Large cap ticker|References|$)/i },
    { size: "large", pattern: /Large cap ticker\s*-\s*([A-Z][A-Z0-9.-]{0,9})([\s\S]*?)(?=Small cap ticker|Mid cap ticker|References|$)/i }
  ];

  return sections.flatMap(({ size, pattern }) => {
    const match = text.match(pattern);
    if (!match) return [];
    const direction = /\bCALL\b/i.test(match[2]) ? "call" : /\bPUT\b/i.test(match[2]) ? "put" : "";
    if (!direction) return [];
    return [normalizePick(date, { ticker: match[1], size, direction })];
  });
}

module.exports = {
  PICK_CSV_HEADER,
  PICK_CSV_PATH,
  appendPicksToCsv,
  extractPicksFromBrief,
  loadPickCsv,
  normalizePick,
  parsePickCsv,
  pickCsv,
  savePickCsv
};
