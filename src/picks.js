const fs = require("fs");
const path = require("path");

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
  if (row.size === "medium") row.size = "med";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new Error("pick date must use YYYY-MM-DD");
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(row.ticker)) throw new Error("pick ticker is invalid");
  if (!VALID_SIZES.has(row.size)) throw new Error("pick size must be small, med, or large");
  if (!VALID_DIRECTIONS.has(row.direction)) throw new Error("pick direction must be call or put");
  return row;
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
  for (const row of rows) {
    const normalized = normalizePick(row.date, row);
    lines.push([normalized.date, normalized.ticker, normalized.size, normalized.direction].join(","));
  }
  return `${lines.join("\n")}\n`;
}

function readPickCsv(filePath) {
  if (!fs.existsSync(filePath)) return `${PICK_CSV_HEADER}\n`;
  const csv = fs.readFileSync(filePath, "utf8");
  return csv.trim() ? `${csv.trim()}\n` : `${PICK_CSV_HEADER}\n`;
}

function appendPicksToCsv(filePath, date, picks) {
  const incoming = (picks || []).map((pick) => normalizePick(date, pick));
  if (!incoming.length) return { added: 0, total: parsePickCsv(readPickCsv(filePath)).length };

  const byKey = new Map(parsePickCsv(readPickCsv(filePath)).map((row) => [`${row.date}:${row.ticker}`, row]));
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, pickCsv(rows));
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
    return direction ? [normalizePick(date, { ticker: match[1], size, direction })] : [];
  });
}

module.exports = {
  appendPicksToCsv,
  extractPicksFromBrief,
  normalizePick,
  parsePickCsv,
  pickCsv,
  readPickCsv
};
