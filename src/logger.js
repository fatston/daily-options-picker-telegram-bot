const fs = require("fs");
const path = require("path");

function createLogger(logFile) {
  function write(level, message, meta) {
    const entry = {
      time: new Date().toISOString(),
      level,
      message,
      meta: meta || undefined
    };
    const line = JSON.stringify(entry);
    if (logFile) {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, line + "\n");
    }
    const stream = level === "error" ? console.error : console.log;
    stream(`[${entry.time}] ${level.toUpperCase()} ${message}`, meta || "");
  }

  return {
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta)
  };
}

module.exports = { createLogger };
