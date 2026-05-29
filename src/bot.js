const { appendPicksToCsv, extractPicksFromBrief } = require("./picks");

const START_MESSAGE = "\u{1F44B} Welcome to Daily Options Picker.\n\nThis bot was built by Clifton.\n\nCodex researches current market news each weekday before the regular US open, picks one small-cap, one mid-cap, and one large-cap directional setup, then this Node bot publishes the brief to Telegram.\n\nInformational only. Not financial advice or a trade recommendation.\n\nCommands:\n/subscribe - receive daily picks\n/unsubscribe - stop daily picks\n/today - resend today's brief when ready\n/yesterday - resend the previous brief\n/status - check subscription status\n/test - send admin test message\n/help - show commands";

const HELP_MESSAGE = "Commands:\n/start - welcome message\n/help - list commands\n/subscribe - receive daily picks\n/unsubscribe - stop daily picks\n/today - resend today's brief when ready\n/yesterday - resend the previous brief\n/status - check subscription status\n/test - send admin test message";

const TEST_MESSAGE = "\u2705 Daily Options Picker test message received.\n\nThe bot is running on Clifton's desktop and can send Telegram messages successfully.";

const COMMAND_KEYBOARD = {
  keyboard: [[{ text: "/today" }, { text: "/yesterday" }]],
  resize_keyboard: true,
  is_persistent: true
};

function messageOptions() {
  return { reply_markup: COMMAND_KEYBOARD };
}

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

function parseReadyTime(value) {
  const match = String(value || "08:35").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 8, minute: 35 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function partsInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  const dateString = `${parts.year}-${parts.month}-${parts.day}`;
  const utcDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  return {
    dateString,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: utcDate.getUTCDay()
  };
}

function addDays(dateString, days) {
  const date = new Date(Date.UTC(
    Number(dateString.slice(0, 4)),
    Number(dateString.slice(5, 7)) - 1,
    Number(dateString.slice(8, 10))
  ));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nyDateToUtcInstant(dateString, hour, minute, timezone) {
  let guess = new Date(Date.UTC(
    Number(dateString.slice(0, 4)),
    Number(dateString.slice(5, 7)) - 1,
    Number(dateString.slice(8, 10)),
    hour,
    minute
  ));

  for (let i = 0; i < 3; i += 1) {
    const parts = partsInTimezone(guess, timezone);
    const deltaMinutes = ((hour - parts.hour) * 60) + (minute - parts.minute);
    guess = new Date(guess.getTime() + deltaMinutes * 60000);
  }

  return guess;
}

function nextReportReadyAt(now, config) {
  const timezone = config.reportTimezone || "America/New_York";
  const weekdays = config.reportWeekdays || [1, 2, 3, 4, 5];
  const ready = parseReadyTime(config.reportReadyTime);
  let dateString = partsInTimezone(now, timezone).dateString;

  for (let i = 0; i < 10; i += 1) {
    const weekday = new Date(`${dateString}T00:00:00Z`).getUTCDay();
    const readyAt = nyDateToUtcInstant(dateString, ready.hour, ready.minute, timezone);
    if (weekdays.includes(weekday) && readyAt > now) return readyAt;
    dateString = addDays(dateString, 1);
  }

  return nyDateToUtcInstant(dateString, ready.hour, ready.minute, timezone);
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
}

function previousReportDate(now, config) {
  const timezone = config.reportTimezone || "America/New_York";
  const weekdays = config.reportWeekdays || [1, 2, 3, 4, 5];
  let dateString = addDays(partsInTimezone(now, timezone).dateString, -1);

  for (let i = 0; i < 10; i += 1) {
    const weekday = new Date(`${dateString}T00:00:00Z`).getUTCDay();
    if (weekdays.includes(weekday)) return dateString;
    dateString = addDays(dateString, -1);
  }

  return dateString;
}

function notReadyMessage(now, config) {
  const readyAt = nextReportReadyAt(now, config);
  return `Today's report is not ready yet.\n\nExpected in ${formatDuration(readyAt.getTime() - now.getTime())}.`;
}

class DailyOptionsBot {
  constructor(options) {
    this.telegram = options.telegram;
    this.storage = options.storage;
    this.config = options.config;
    this.logger = options.logger;
    this.now = options.now || (() => new Date());
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
      await this.sendCommandMessage(chatId, START_MESSAGE);
      return;
    }

    if (command === "/help") {
      await this.sendCommandMessage(chatId, HELP_MESSAGE);
      return;
    }

    if (command === "/subscribe") {
      this.storage.subscribe(chatId);
      await this.sendCommandMessage(chatId, "You are subscribed to the weekday Daily Options Picker.");
      return;
    }

    if (command === "/unsubscribe") {
      this.storage.unsubscribe(chatId);
      await this.sendCommandMessage(chatId, "You are unsubscribed from the Daily Options Picker.");
      return;
    }

    if (command === "/status") {
      const status = this.storage.isSubscribed(chatId) ? "subscribed" : "not subscribed";
      await this.sendCommandMessage(chatId, `This chat is ${status}.`);
      return;
    }

    if (command === "/test") {
      if (this.adminChatId() && !this.isAdmin(chatId)) {
        await this.sendCommandMessage(chatId, "The /test command is available only to the admin chat.");
        return;
      }
      if (!this.adminChatId()) this.storage.setAdminChatId(chatId);
      await this.sendCommandMessage(chatId, TEST_MESSAGE);
      return;
    }

    if (command === "/today") {
      const now = this.now();
      const today = partsInTimezone(now, this.config.reportTimezone || "America/New_York").dateString;
      const brief = this.storage.getBriefByPublishId(today);
      await this.sendCommandMessage(chatId, brief || notReadyMessage(now, this.config));
      return;
    }

    if (command === "/yesterday") {
      const reportDate = previousReportDate(this.now(), this.config);
      const brief = this.storage.getBriefByPublishId(reportDate);
      await this.sendCommandMessage(chatId, brief || `No previous brief is available for ${reportDate}.`);
      return;
    }

    if (command) {
      await this.sendCommandMessage(chatId, "Unknown command. Send /help to see available commands.");
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
    const canTrackPicks = /^\d{4}-\d{2}-\d{2}$/.test(publishId);
    const picks = canTrackPicks && Array.isArray(payload && payload.picks) && payload.picks.length
      ? payload.picks
      : canTrackPicks ? extractPicksFromBrief(publishId, message) : [];
    const csv = canTrackPicks && this.config.picksFile ? appendPicksToCsv(this.config.picksFile, publishId, picks) : { added: 0, total: 0 };
    this.logger.info("Published brief", { publishId, subscriberCount: subscribers.length, picks: picks.length });
    return { sent: subscribers.length, skipped: false, picks: picks.length, csv };
  }

  async sendToMany(chatIds, text) {
    for (const chatId of chatIds) {
      try {
        await this.sendCommandMessage(chatId, text);
      } catch (error) {
        this.logger.warn("Failed to send Telegram message", { chatId, error: error.message });
      }
    }
  }

  sendCommandMessage(chatId, text) {
    return this.telegram.sendMessage(chatId, text, messageOptions());
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
  COMMAND_KEYBOARD,
  commandFromMessage,
  messageOptions,
  normalizeBriefEmoji,
  nextReportReadyAt,
  partsInTimezone,
  formatDuration,
  previousReportDate,
  notReadyMessage
};
