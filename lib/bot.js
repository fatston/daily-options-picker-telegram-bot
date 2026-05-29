const { sendMessage } = require("./telegram");
const { loadBrief, saveBrief } = require("./brief-store");
const { appendPicksToCsv, extractPicksFromBrief } = require("./pick-store");

const START_MESSAGE = "\u{1F44B} Welcome to Daily Options Picker.\n\nThis bot was built by Clifton.\n\nCodex researches current market news each weekday before the regular US open, picks one small-cap, one mid-cap, and one large-cap directional setup, then this hosted bot publishes the brief to Telegram.\n\nInformational only. Not financial advice or a trade recommendation.\n\nCommands:\n/subscribe - receive daily picks\n/unsubscribe - stop daily picks\n/today - resend today's brief when ready\n/yesterday - resend the previous brief\n/status - check subscription status\n/test - send admin test message\n/help - show commands";

const HELP_MESSAGE = "Commands:\n/start - welcome message\n/help - list commands\n/subscribe - receive daily picks\n/unsubscribe - stop daily picks\n/today - resend today's brief when ready\n/yesterday - resend the previous brief\n/status - check subscription status\n/test - send admin test message";

const TEST_MESSAGE = "\u2705 Daily Options Picker test message received.\n\nThe hosted bot is online and can send Telegram messages successfully.";

function envList(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function subscriberIds() {
  const ids = new Set(envList("SUBSCRIBER_CHAT_IDS"));
  const admin = process.env.ADMIN_CHAT_ID || "";
  if (admin) ids.add(admin);
  return Array.from(ids);
}

function getBrief(publishId) {
  return process.env[`BRIEF_${String(publishId || "").replace(/-/g, "_")}`] || "";
}

async function getStoredBrief(publishId) {
  return getBrief(publishId) || loadBrief(publishId);
}

function commandFromMessage(message) {
  const text = (message && message.text || "").trim();
  if (!text.startsWith("/")) return "";
  return text.split(/\s+/)[0].split("@")[0].toLowerCase();
}

function partsInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
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

function previousReportDate(now) {
  let dateString = addDays(partsInTimezone(now, process.env.REPORT_TIMEZONE || "America/New_York"), -1);
  const weekdays = envList("REPORT_WEEKDAYS").length ? envList("REPORT_WEEKDAYS").map(Number) : [1, 2, 3, 4, 5];
  for (let i = 0; i < 10; i += 1) {
    const weekday = new Date(`${dateString}T00:00:00Z`).getUTCDay();
    if (weekdays.includes(weekday)) return dateString;
    dateString = addDays(dateString, -1);
  }
  return dateString;
}

function normalizeBriefEmoji(message) {
  return String(message || "")
    .replace(/\?\?\s+Small cap ticker/g, "\u{1F539} Small cap ticker")
    .replace(/\?\?\s+Mid cap ticker/g, "\u{1F538} Mid cap ticker")
    .replace(/\?\?\s+Large cap ticker/g, "\u{1F537} Large cap ticker")
    .replace(/\?\?\s+Bull/g, "\u{1F402} Bull")
    .replace(/\?\?\s+Bear/g, "\u{1F43B} Bear");
}

async function publishBrief(publishId, message, picks) {
  const text = normalizeBriefEmoji(message).trim();
  if (!text) throw new Error("Publish payload requires message");
  await saveBrief(publishId, text);
  const trackedPicks = Array.isArray(picks) && picks.length ? picks : extractPicksFromBrief(publishId, text);
  const csv = trackedPicks.length ? await appendPicksToCsv(publishId, trackedPicks) : { added: 0, total: 0 };
  const subscribers = subscriberIds();
  await Promise.all(subscribers.map((chatId) => sendMessage(chatId, text)));
  return { sent: subscribers.length, picks: trackedPicks.length, csv };
}

async function handleTelegramUpdate(update) {
  const message = update && update.message;
  if (!message || !message.chat) return;

  const chatId = String(message.chat.id);
  const command = commandFromMessage(message);
  const admin = process.env.ADMIN_CHAT_ID || "";

  if (command === "/start") {
    await sendMessage(chatId, START_MESSAGE);
    return;
  }

  if (command === "/help") {
    await sendMessage(chatId, HELP_MESSAGE);
    return;
  }

  if (command === "/subscribe") {
    await sendMessage(chatId, "This hosted bot uses a fixed subscriber list. Ask Clifton to add this chat ID: " + chatId);
    return;
  }

  if (command === "/unsubscribe") {
    await sendMessage(chatId, "This hosted bot uses a fixed subscriber list. Ask Clifton to remove this chat ID: " + chatId);
    return;
  }

  if (command === "/status") {
    await sendMessage(chatId, subscriberIds().includes(chatId) ? "This chat is subscribed." : `This chat is not subscribed. Chat ID: ${chatId}`);
    return;
  }

  if (command === "/test") {
    if (admin && chatId !== admin) {
      await sendMessage(chatId, "The /test command is available only to the admin chat.");
      return;
    }
    await sendMessage(chatId, TEST_MESSAGE);
    return;
  }

  if (command === "/today") {
    const today = partsInTimezone(new Date(), process.env.REPORT_TIMEZONE || "America/New_York");
    await sendMessage(chatId, await getStoredBrief(today) || "Today's report is not ready yet.");
    return;
  }

  if (command === "/yesterday") {
    const reportDate = previousReportDate(new Date());
    await sendMessage(chatId, await getStoredBrief(reportDate) || `No previous brief is available for ${reportDate}.`);
    return;
  }

  if (command) await sendMessage(chatId, "Unknown command. Send /help to see available commands.");
}

module.exports = {
  commandFromMessage,
  handleTelegramUpdate,
  normalizeBriefEmoji,
  partsInTimezone,
  previousReportDate,
  publishBrief,
  subscriberIds
};
