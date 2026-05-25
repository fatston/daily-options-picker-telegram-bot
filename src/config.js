const fs = require("fs");
const path = require("path");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function getConfig(rootDir) {
  const projectRoot = rootDir || path.resolve(__dirname, "..");
  loadDotEnv(path.join(projectRoot, ".env"));

  return {
    projectRoot,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
    adminChatId: process.env.ADMIN_CHAT_ID || "",
    dataFile: path.resolve(projectRoot, process.env.BOT_DATA_FILE || "./data/bot-state.json"),
    logFile: path.resolve(projectRoot, process.env.BOT_LOG_FILE || "./logs/bot.log"),
    publishHost: process.env.PUBLISH_HOST || "127.0.0.1",
    publishPort: Number(process.env.PUBLISH_PORT || 8787),
    publishToken: process.env.PUBLISH_TOKEN || "",
    pollIntervalMs: Number(process.env.TELEGRAM_POLL_INTERVAL_MS || 1500)
  };
}

module.exports = {
  getConfig,
  loadDotEnv
};
