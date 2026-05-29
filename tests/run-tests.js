const assert = require("assert");
const { briefPath } = require("../lib/brief-store");
const { commandFromMessage, normalizeBriefEmoji, partsInTimezone, previousReportDate } = require("../lib/bot");
const { extractPicksFromBrief, parsePickCsv, pickCsv } = require("../lib/pick-store");

assert.strictEqual(commandFromMessage({ text: "/today@ck_daily_options_picker_bot hello" }), "/today");
assert.strictEqual(commandFromMessage({ text: "hello" }), "");
assert.ok(normalizeBriefEmoji("?? Small cap ticker - TEST").includes("Small cap ticker"));
assert.strictEqual(partsInTimezone(new Date("2026-05-25T12:00:00Z"), "America/New_York"), "2026-05-25");
assert.strictEqual(previousReportDate(new Date("2026-05-25T12:00:00Z")), "2026-05-22");
assert.strictEqual(briefPath("2026-05-26"), "briefs/2026-05-26.txt");
assert.throws(() => briefPath("bad"), /YYYY-MM-DD/);

const sampleBrief = `Information date: 2026-05-29 America/New_York

=================

Small cap ticker - AEO
Bear - PUT
- reason

Mid cap ticker - GAP
Bear - PUT
- reason

Large cap ticker - DELL
Bull - CALL
- reason

=================
References
1. Example - https://example.com`;

assert.deepStrictEqual(extractPicksFromBrief("2026-05-29", sampleBrief), [
  { date: "2026-05-29", ticker: "AEO", size: "small", direction: "put" },
  { date: "2026-05-29", ticker: "GAP", size: "med", direction: "put" },
  { date: "2026-05-29", ticker: "DELL", size: "large", direction: "call" }
]);
assert.strictEqual(parsePickCsv(pickCsv(extractPicksFromBrief("2026-05-29", sampleBrief))).length, 3);

console.log("Tests passed");
