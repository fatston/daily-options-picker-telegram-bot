const { getConfig } = require("./config");
const { createLogger } = require("./logger");
const { JsonStorage } = require("./storage");
const { TelegramClient } = require("./telegram");
const { DailyOptionsBot } = require("./bot");
const { startScheduler } = require("./scheduler");

async function main() {
  const config = getConfig();
  const logger = createLogger(config.logFile);

  if (!config.telegramBotToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required. Add it to .env or the process environment.");
  }

  const storage = new JsonStorage(config.dataFile);
  const telegram = new TelegramClient(config.telegramBotToken);
  const bot = new DailyOptionsBot({ telegram, storage, config, logger });

  const me = await telegram.getMe();
  logger.info("Telegram bot connected", { username: me.result && me.result.username });

  startScheduler(bot, config, logger);

  logger.info("Polling Telegram updates");
  while (true) {
    try {
      await bot.pollOnce();
    } catch (error) {
      logger.error("Polling failed", { error: error.message });
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
