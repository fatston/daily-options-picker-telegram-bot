const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const { getConfig } = require("../src/config");
const { JsonStorage } = require("../src/storage");
const {
  DailyOptionsBot,
  COMMAND_KEYBOARD,
  HELP_MESSAGE,
  START_MESSAGE,
  TEST_MESSAGE,
  commandFromMessage,
  formatDuration,
  messageOptions,
  nextReportReadyAt,
  normalizeBriefEmoji,
  notReadyMessage,
  previousReportDate
} = require("../src/bot");
const { hasBearerToken, startPublisherServer } = require("../src/publisher");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function tempStorage() {
  return new JsonStorage(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dop-")), "state.json"));
}

function createBot(overrides) {
  const sent = [];
  const telegram = {
    sendMessage: async (chatId, text, options) => sent.push({ chatId: String(chatId), text, options })
  };
  const logger = { info() {}, warn() {}, error() {} };
  const bot = new DailyOptionsBot({
    telegram,
    storage: tempStorage(),
    config: {
      adminChatId: "42",
      reportReadyTime: "08:35",
      reportTimezone: "America/New_York",
      reportWeekdays: [1, 2, 3, 4, 5]
    },
    logger,
    now: () => new Date("2026-05-26T13:00:00Z")
  });
  Object.assign(bot, overrides || {});
  return { bot, sent };
}

function postJson(port, token, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: "/publish",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Authorization": token ? `Bearer ${token}` : ""
      }
    }, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => resolve({ statusCode: response.statusCode, body: JSON.parse(data) }));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

test("config reads publish settings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dop-"));
  fs.writeFileSync(path.join(dir, ".env"), [
    "TELEGRAM_BOT_TOKEN=token",
    "PUBLISH_HOST=127.0.0.1",
    "PUBLISH_PORT=9898",
    "PUBLISH_TOKEN=secret",
    "REPORT_READY_TIME=08:35",
    "REPORT_TIMEZONE=America/New_York"
  ].join("\n"));
  const config = getConfig(dir);
  assert.strictEqual(config.publishPort, 9898);
  assert.strictEqual(config.publishToken, "secret");
  assert.strictEqual(config.reportReadyTime, "08:35");
  assert.deepStrictEqual(config.reportWeekdays, [1, 2, 3, 4, 5]);
});

test("storage persists subscribers and latest brief", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dop-"));
  const file = path.join(dir, "state.json");
  const storage = new JsonStorage(file);
  storage.subscribe(123);
  storage.setLastBrief("brief", "2026-05-25");
  const reloaded = new JsonStorage(file);
  assert.strictEqual(reloaded.isSubscribed("123"), true);
  assert.strictEqual(reloaded.getLastBrief(), "brief");
  assert.strictEqual(reloaded.getLastPublishId(), "2026-05-25");
  assert.strictEqual(reloaded.getBriefByPublishId("2026-05-25"), "brief");
});

test("command messages list current commands", () => {
  assert.ok(START_MESSAGE.includes("\u{1F44B} Welcome"));
  assert.ok(START_MESSAGE.includes("/today - resend today's brief when ready"));
  assert.ok(START_MESSAGE.includes("/yesterday - resend the previous brief"));
  assert.ok(HELP_MESSAGE.includes("/subscribe - receive daily picks"));
  assert.ok(TEST_MESSAGE.includes("\u2705 Daily Options Picker test message received."));
  assert.deepStrictEqual(messageOptions(), { reply_markup: COMMAND_KEYBOARD });
  assert.strictEqual(commandFromMessage({ text: "/today@ck_daily_options_picker_bot" }), "/today");
});

test("report readiness helpers calculate concise countdowns", () => {
  const config = {
    reportReadyTime: "08:35",
    reportTimezone: "America/New_York",
    reportWeekdays: [1, 2, 3, 4, 5]
  };
  const readyAt = nextReportReadyAt(new Date("2026-05-26T12:00:00Z"), config);
  assert.strictEqual(readyAt.toISOString(), "2026-05-26T12:35:00.000Z");
  assert.strictEqual(formatDuration(35 * 60000), "0d 0h 35m");
  assert.strictEqual(previousReportDate(new Date("2026-05-26T13:00:00Z"), config), "2026-05-25");
  assert.ok(notReadyMessage(new Date("2026-05-26T12:00:00Z"), config).includes("0d 0h 35m"));
});

test("brief emoji normalization repairs question-mark placeholders", () => {
  const message = [
    "?? Small cap ticker - TEST",
    "?? Bull - CALL",
    "?? Mid cap ticker - TEST",
    "?? Bear - PUT",
    "?? Large cap ticker - TEST"
  ].join("\n");
  const normalized = normalizeBriefEmoji(message);
  assert.ok(normalized.includes("\u{1F539} Small cap ticker - TEST"));
  assert.ok(normalized.includes("\u{1F402} Bull - CALL"));
  assert.ok(normalized.includes("\u{1F538} Mid cap ticker - TEST"));
  assert.ok(normalized.includes("\u{1F43B} Bear - PUT"));
  assert.ok(normalized.includes("\u{1F537} Large cap ticker - TEST"));
});

test("command handling covers subscribe status test and today", async () => {
  const { bot, sent } = createBot();
  bot.storage.setLastBrief("today brief", "2026-05-26");

  await bot.handleMessage({ chat: { id: 42 }, text: "/subscribe" });
  await bot.handleMessage({ chat: { id: 42 }, text: "/status" });
  await bot.handleMessage({ chat: { id: 42 }, text: "/test" });
  await bot.handleMessage({ chat: { id: 42 }, text: "/today" });

  assert.strictEqual(bot.storage.isSubscribed("42"), true);
  assert.strictEqual(sent.some((message) => message.text === TEST_MESSAGE), true);
  assert.strictEqual(sent.some((message) => message.text === "today brief"), true);
  assert.deepStrictEqual(sent[0].options.reply_markup, COMMAND_KEYBOARD);
});

test("today reports not ready with time remaining", async () => {
  const { bot, sent } = createBot({
    now: () => new Date("2026-05-26T12:00:00Z")
  });

  await bot.handleMessage({ chat: { id: 42 }, text: "/today" });

  assert.strictEqual(sent[0].text, "Today's report is not ready yet.\n\nExpected in 0d 0h 35m.");
  assert.deepStrictEqual(sent[0].options.reply_markup, COMMAND_KEYBOARD);
});

test("yesterday sends previous report day brief", async () => {
  const { bot, sent } = createBot({
    now: () => new Date("2026-05-26T13:00:00Z")
  });
  bot.storage.setLastBrief("yesterday brief", "2026-05-25");

  await bot.handleMessage({ chat: { id: 42 }, text: "/yesterday" });

  assert.strictEqual(sent[0].text, "yesterday brief");
  assert.deepStrictEqual(sent[0].options.reply_markup, COMMAND_KEYBOARD);
});

test("publishBrief sends to subscribers and skips duplicate ids", async () => {
  const { bot, sent } = createBot();
  bot.storage.subscribe("42");
  bot.storage.subscribe("100");

  const first = await bot.publishBrief({ message: "brief", publishId: "daily-1" });
  const second = await bot.publishBrief({ message: "brief again", publishId: "daily-1" });

  assert.deepStrictEqual(first, { sent: 2, skipped: false });
  assert.deepStrictEqual(second, { sent: 0, skipped: true });
  assert.strictEqual(sent.filter((message) => message.text === "brief").length, 2);
});

test("publishBrief normalizes emoji placeholders before sending", async () => {
  const { bot, sent } = createBot();
  bot.storage.subscribe("42");

  await bot.publishBrief({ message: "?? Small cap ticker - TEST\n?? Bull - CALL", publishId: "daily-emoji" });

  assert.strictEqual(sent[0].text, "\u{1F539} Small cap ticker - TEST\n\u{1F402} Bull - CALL");
  assert.deepStrictEqual(sent[0].options.reply_markup, COMMAND_KEYBOARD);
  assert.strictEqual(bot.storage.getLastBrief(), sent[0].text);
});

test("bearer token check requires exact token", () => {
  assert.strictEqual(hasBearerToken({ headers: { authorization: "Bearer abc" } }, "abc"), true);
  assert.strictEqual(hasBearerToken({ headers: { authorization: "Bearer wrong" } }, "abc"), false);
});

test("publisher endpoint authenticates and publishes", async () => {
  const { bot, sent } = createBot();
  bot.storage.subscribe("42");
  const logger = { info() {}, warn() {}, error() {} };
  const server = startPublisherServer(bot, {
    publishHost: "127.0.0.1",
    publishPort: 0,
    publishToken: "secret"
  }, logger);

  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const unauthorized = await postJson(port, "wrong", { message: "brief", publishId: "id-1" });
  const authorized = await postJson(port, "secret", { message: "brief", publishId: "id-1" });
  server.close();

  assert.strictEqual(unauthorized.statusCode, 401);
  assert.strictEqual(authorized.statusCode, 200);
  assert.strictEqual(sent.some((message) => message.text === "brief"), true);
});

(async () => {
  let failed = 0;
  for (const item of tests) {
    try {
      await item.fn();
      console.log(`ok - ${item.name}`);
    } catch (error) {
      failed += 1;
      console.error(`not ok - ${item.name}`);
      console.error(error.stack || error.message);
    }
  }
  if (failed) process.exit(1);
})();
