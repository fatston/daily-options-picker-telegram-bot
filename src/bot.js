const { PREPARING_MESSAGE, generatePickerBrief } = require("./picker");
const { isRegularMarketOpenDate, partsInTimezone } = require("./marketCalendar");

const START_MESSAGE = "👋 Welcome to Daily Options Picker.\n\nThis bot was built by Clifton.\n\nIt sends a concise pre-open US options brief once per trading day, before the regular US stock market opens. The bot looks at current market news, identifies one actively discussed US-listed stock with a clear directional news signal, and summarizes whether the read points more toward a call or put idea.\n\nThis is for information and learning only. It is not financial advice, not a trade recommendation, and not personalized to your financial situation.\n\nCommands:\n/subscribe — receive the daily picker\n/unsubscribe — stop receiving daily picks\n/today — get today’s picker now\n/status — check subscription status\n/test — send admin test message\n/help — show commands";

const HELP_MESSAGE = "Commands:\n/start — welcome message and explanation\n/help — list all commands\n/subscribe — receive the daily picker\n/unsubscribe — stop receiving daily picks\n/today — get today’s picker now\n/status — check subscription status\n/test — send admin test message";

const TEST_MESSAGE = "✅ Daily Options Picker test message received.\n\nThe bot is running on Clifton’s desktop and can send Telegram messages successfully.";

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
    this.generatePickerBrief = options.generatePickerBrief || generatePickerBrief;
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
      await this.sendPickerToChat(chatId);
      return;
    }

    if (command) {
      await this.telegram.sendMessage(chatId, "Unknown command. Send /help to see available commands.");
    }
  }

  async sendPickerToChat(chatId) {
    await this.telegram.sendMessage(chatId, PREPARING_MESSAGE);
    const brief = await this.generatePickerBrief({ logger: this.logger });
    await this.telegram.sendMessage(chatId, brief);
  }

  async sendDailyToSubscribers(now) {
    const parts = partsInTimezone(now || new Date(), this.config.pickerTimezone);
    const today = parts.dateString;
    if (this.storage.getLastSentDate() === today) {
      this.logger.info("Daily send skipped; already sent", { today });
      return false;
    }

    const subscribers = this.storage.getSubscribers();
    if (subscribers.length === 0) {
      this.storage.setLastSentDate(today);
      this.logger.info("No subscribers for daily send", { today });
      return false;
    }

    if (!isRegularMarketOpenDate(today)) {
      const text = "No regular US market open today.";
      await this.sendToMany(subscribers, text);
      this.storage.setLastSentDate(today);
      return true;
    }

    await this.sendToMany(subscribers, PREPARING_MESSAGE);

    let brief;
    try {
      brief = await this.generatePickerBrief({ logger: this.logger });
    } catch (error) {
      this.logger.error("Picker generation failed", { error: error.message });
      await this.notifyAdmin(`Daily Options Picker failed: ${error.message}`);
      return false;
    }

    await this.sendToMany(subscribers, brief);
    this.storage.setLastSentDate(today);
    return true;
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
  commandFromMessage
};
