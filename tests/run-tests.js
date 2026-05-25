const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const { getConfig } = require("../src/config");
const { JsonStorage } = require("../src/storage");
const { DailyOptionsBot, HELP_MESSAGE, START_MESSAGE, TEST_MESSAGE, commandFromMessage } = require("../src/bot");
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
    sendMessage: async (chatId, text) => sent.push({ chatId: String(chatId), text })
  };
  const logger = { info() {}, warn() {}, error() {} };
  const bot = new DailyOptionsBot({
    telegram,
    storage: tempStorage(),
    config: { adminChatId: "42" },
    logger
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
    "PUBLISH_TOKEN=secret"
  ].join("\n"));
  const config = getConfig(dir);
  assert.strictEqual(config.publishPort, 9898);
  assert.strictEqual(config.publishToken, "secret");
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
});

test("command messages list current commands", () => {
  assert.ok(START_MESSAGE.includes("/today — resend the latest published brief"));
  assert.ok(HELP_MESSAGE.includes("/subscribe — receive daily picks"));
  assert.strictEqual(commandFromMessage({ text: "/today@ck_daily_options_picker_bot" }), "/today");
});

test("command handling covers subscribe status test and today", async () => {
  const { bot, sent } = createBot();
  bot.storage.setLastBrief("latest brief", "brief-1");

  await bot.handleMessage({ chat: { id: 42 }, text: "/subscribe" });
  await bot.handleMessage({ chat: { id: 42 }, text: "/status" });
  await bot.handleMessage({ chat: { id: 42 }, text: "/test" });
  await bot.handleMessage({ chat: { id: 42 }, text: "/today" });

  assert.strictEqual(bot.storage.isSubscribed("42"), true);
  assert.strictEqual(sent.some((message) => message.text === TEST_MESSAGE), true);
  assert.strictEqual(sent.some((message) => message.text === "latest brief"), true);
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
