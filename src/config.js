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

function parseWeekdays(value) {
  return String(value || "1,2,3,4,5")
    .split(",")
    .map((day) => Number(day.trim()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
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
    pickerTime: process.env.PICKER_TIME || "08:35",
    pickerTimezone: process.env.PICKER_TIMEZONE || "America/New_York",
    pickerWeekdays: parseWeekdays(process.env.PICKER_WEEKDAYS),
    pollIntervalMs: Number(process.env.TELEGRAM_POLL_INTERVAL_MS || 1500),
    scheduleCheckMs: Number(process.env.SCHEDULE_CHECK_MS || 30000)
  };
}

module.exports = {
  getConfig,
  loadDotEnv,
  parseWeekdays
};
