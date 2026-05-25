const START_MESSAGE = "\u{1F44B} Welcome to Daily Options Picker.\n\nThis bot was built by Clifton.\n\nCodex researches current market news each weekday before the regular US open, picks one small-cap, one mid-cap, and one large-cap directional setup, then this Node bot publishes the brief to Telegram.\n\nInformational only. Not financial advice or a trade recommendation.\n\nCommands:\n/subscribe - receive daily picks\n/unsubscribe - stop daily picks\n/today - resend the latest published brief\n/status - check subscription status\n/test - send admin test message\n/help - show commands";

const HELP_MESSAGE = "Commands:\n/start - welcome message\n/help - list commands\n/subscribe - receive daily picks\n/unsubscribe - stop daily picks\n/today - resend the latest published brief\n/status - check subscription status\n/test - send admin test message";

const TEST_MESSAGE = "\u2705 Daily Options Picker test message received.\n\nThe bot is running on Clifton's desktop and can send Telegram messages successfully.";

function normalizeBriefEmoji(message) {
  return String(message || "")
    .replace(/\?\?\s+Small cap ticker/g, "\u{1F539} Small cap ticker")
    .replace(/\?\?\s+Mid cap ticker/g, "\u{1F538} Mid cap ticker")
    .replace(/\?\?\s+Large cap ticker/g, "\u{1F537} Large cap ticker")
    .replace(/\?\?\s+Bull/g, "\u{1F402} Bull")
    .replace(/\?\?\s+Bear/g, "\u{1F43B} Bear");
}

function commandFromMessage(message) {
  const text = (message && message.text || "").trim();
  if (!text.startsWith("/")) return "";
  return text.split(/\s+/)[0].split("@")[0].toLowerCase();
}

class DailyOptionsBot {
  constructor(options) {
    this.telegram = options.telegram;
    this.storage = options.storage;
    this.config = options.config;
    this.logger = options.logger;
  }

  adminChatId() {
    return this.config.adminChatId || this.storage.getAdminChatId();
  }

  isAdmin(chatId) {
    const admin = this.adminChatId();
    return Boolean(admin && String(admin) === String(chatId));
  }

  async notifyAdmin(text) {
    const admin = this.adminChatId();
    if (!admin) return;
    try {
      await this.telegram.sendMessage(admin, text);
    } catch (error) {
      this.logger.warn("Failed to notify admin", { error: error.message });
    }
  }

  async handleMessage(message) {
    const chatId = String(message.chat.id);
    const command = commandFromMessage(message);

    if (command === "/start") {
      if (!this.adminChatId()) this.storage.setAdminChatId(chatId);
      await this.telegram.sendMessage(chatId, START_MESSAGE);
      return;
    }

    if (command === "/help") {
      await this.telegram.sendMessage(chatId, HELP_MESSAGE);
      return;
    }

    if (command === "/subscribe") {
      this.storage.subscribe(chatId);
      await this.telegram.sendMessage(chatId, "You are subscribed to the weekday Daily Options Picker.");
      return;
    }

    if (command === "/unsubscribe") {
      this.storage.unsubscribe(chatId);
      await this.telegram.sendMessage(chatId, "You are unsubscribed from the Daily Options Picker.");
      return;
    }

    if (command === "/status") {
      const status = this.storage.isSubscribed(chatId) ? "subscribed" : "not subscribed";
      await this.telegram.sendMessage(chatId, `This chat is ${status}.`);
      return;
    }

    if (command === "/test") {
      if (this.adminChatId() && !this.isAdmin(chatId)) {
        await this.telegram.sendMessage(chatId, "The /test command is available only to the admin chat.");
        return;
      }
      if (!this.adminChatId()) this.storage.setAdminChatId(chatId);
      await this.telegram.sendMessage(chatId, TEST_MESSAGE);
      return;
    }

    if (command === "/today") {
      const latest = this.storage.getLastBrief();
      await this.telegram.sendMessage(chatId, latest || "No brief has been published yet today.");
      return;
    }

    if (command) {
      await this.telegram.sendMessage(chatId, "Unknown command. Send /help to see available commands.");
    }
  }

  async publishBrief(payload) {
    const message = normalizeBriefEmoji(payload && payload.message).trim();
    const publishId = String(payload && payload.publishId || "").trim();
    if (!message) throw new Error("Publish payload requires message");
    if (publishId && this.storage.getLastPublishId() === publishId) {
      this.logger.info("Publish skipped; duplicate publish id", { publishId });
      return { sent: 0, skipped: true };
    }

    const subscribers = this.storage.getSubscribers();
    await this.sendToMany(subscribers, message);
    this.storage.setLastBrief(message, publishId);
    this.logger.info("Published brief", { publishId, subscriberCount: subscribers.length });
    return { sent: subscribers.length, skipped: false };
  }

  async sendToMany(chatIds, text) {
    for (const chatId of chatIds) {
      try {
        await this.telegram.sendMessage(chatId, text);
      } catch (error) {
        this.logger.warn("Failed to send Telegram message", { chatId, error: error.message });
      }
    }
  }

  async pollOnce() {
    const offset = this.storage.getLastUpdateId() + 1;
    const response = await this.telegram.getUpdates(offset, 25);
    const updates = response.result || [];
    for (const update of updates) {
      this.storage.setLastUpdateId(update.update_id);
      if (update.message && update.message.chat) {
        try {
          await this.handleMessage(update.message);
        } catch (error) {
          this.logger.error("Command handling failed", { error: error.message });
          await this.notifyAdmin(`Daily Options Picker command failed: ${error.message}`);
        }
      }
    }
    return updates.length;
  }
}

module.exports = {
  DailyOptionsBot,
  START_MESSAGE,
  HELP_MESSAGE,
  TEST_MESSAGE,
  commandFromMessage,
  normalizeBriefEmoji
};
