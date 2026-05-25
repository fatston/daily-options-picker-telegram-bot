const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { parseWeekdays } = require("../src/config");
const { JsonStorage } = require("../src/storage");
const { isRegularMarketOpenDate, marketHolidays } = require("../src/marketCalendar");
const { shouldRunScheduledPicker } = require("../src/scheduler");
const { DailyOptionsBot, TEST_MESSAGE, commandFromMessage } = require("../src/bot");
const { chooseBestCandidate, parseRssItems, scoreSentiment } = require("../src/picker");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("parseWeekdays reads comma-separated day numbers", () => {
  assert.deepStrictEqual(parseWeekdays("1,2,3,4,5"), [1, 2, 3, 4, 5]);
});

test("storage persists subscribers and last sent date", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dop-"));
  const file = path.join(dir, "state.json");
  const storage = new JsonStorage(file);
  storage.subscribe(123);
  storage.setLastSentDate("2026-05-22");
  const reloaded = new JsonStorage(file);
  assert.strictEqual(reloaded.isSubscribed("123"), true);
  assert.strictEqual(reloaded.getLastSentDate(), "2026-05-22");
});

test("market calendar skips weekends and core NYSE holidays", () => {
  assert.strictEqual(isRegularMarketOpenDate("2026-05-23"), false);
  assert.strictEqual(isRegularMarketOpenDate("2026-05-25"), false);
  assert.strictEqual(isRegularMarketOpenDate("2026-05-26"), true);
  assert.strictEqual(marketHolidays(2026).has("2026-04-03"), true);
});

test("scheduler uses America/New_York wall-clock time and dedupes", () => {
  const config = {
    pickerTime: "08:35",
    pickerTimezone: "America/New_York",
    pickerWeekdays: [1, 2, 3, 4, 5]
  };
  assert.strictEqual(shouldRunScheduledPicker(new Date("2026-05-26T12:35:00Z"), config, ""), true);
  assert.strictEqual(shouldRunScheduledPicker(new Date("2026-05-26T12:35:00Z"), config, "2026-05-26"), false);
  assert.strictEqual(shouldRunScheduledPicker(new Date("2026-05-23T12:35:00Z"), config, ""), false);
});

test("rss parser extracts title link and source", () => {
  const xml = "<rss><channel><item><title><![CDATA[NVDA shares rally]]></title><link>https://example.com/a</link><source>Reuters</source></item></channel></rss>";
  assert.deepStrictEqual(parseRssItems(xml), [{
    title: "NVDA shares rally",
    link: "https://example.com/a",
    source: "Reuters",
    description: ""
  }]);
});

test("candidate chooser requires primary source and directional signal", () => {
  const candidate = chooseBestCandidate([{
    ticker: "NVDA",
    items: [
      { title: "NVDA shares rally after upgrade", description: "", link: "https://reuters.com/a", source: "Reuters", tier: "primary" },
      { title: "NVDA growth wins attention", description: "", link: "https://benzinga.com/a", source: "Benzinga", tier: "secondary" },
      { title: "NVDA record profit", description: "", link: "https://example.com/a", source: "Example", tier: "other" }
    ]
  }]);
  assert.strictEqual(candidate.ticker, "NVDA");
  assert.strictEqual(scoreSentiment(candidate.items) > 0, true);
});

test("command handling covers subscription, status, test, and today", async () => {
  const sent = [];
  const telegram = {
    sendMessage: async (chatId, text) => sent.push({ chatId: String(chatId), text })
  };
  const storage = new JsonStorage(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dop-")), "state.json"));
  const logger = { info() {}, warn() {}, error() {} };
  const bot = new DailyOptionsBot({
    telegram,
    storage,
    config: { adminChatId: "42", pickerTimezone: "America/New_York" },
    logger,
    generatePickerBrief: async () => "brief"
  });

  await bot.handleMessage({ chat: { id: 42 }, text: "/subscribe" });
  await bot.handleMessage({ chat: { id: 42 }, text: "/status" });
  await bot.handleMessage({ chat: { id: 42 }, text: "/test" });
  await bot.handleMessage({ chat: { id: 42 }, text: "/today" });

  assert.strictEqual(storage.isSubscribed("42"), true);
  assert.strictEqual(sent.some((message) => message.text === TEST_MESSAGE), true);
  assert.strictEqual(sent.some((message) => message.text === "brief"), true);
  assert.strictEqual(commandFromMessage({ text: "/today@ck_daily_options_picker_bot" }), "/today");
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
