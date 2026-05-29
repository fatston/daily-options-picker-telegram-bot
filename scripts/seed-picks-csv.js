const fs = require("fs");
const path = require("path");
const { parsePickCsv, pickCsv, savePickCsv } = require("../lib/pick-store");

function loadEnvFile(name) {
  const file = path.join(__dirname, "..", name);
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
  loadEnvFile(".env.production.local");
  const csvPath = path.join(__dirname, "..", "data", "picks.csv");
  const rows = parsePickCsv(fs.readFileSync(csvPath, "utf8"));
  await savePickCsv(pickCsv(rows));
  console.log(`Seeded ${rows.length} picks to Vercel Blob picks/picks.csv`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
