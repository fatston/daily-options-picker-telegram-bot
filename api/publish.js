const { publishBrief } = require("../lib/bot");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const expected = process.env.PUBLISH_TOKEN || "";
  const received = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || received !== expected) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  try {
    const publishId = String(req.body && req.body.publishId || "").trim();
    if (!publishId) {
      res.status(400).json({ ok: false, error: "publishId_required" });
      return;
    }
    const result = await publishBrief(publishId, req.body && req.body.message, req.body && req.body.picks);
    res.status(200).json({ ok: true, sent: result.sent, stored: true, picks: result.picks, csv: result.csv });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
