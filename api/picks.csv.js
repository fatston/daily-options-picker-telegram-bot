const { loadPickCsv } = require("../lib/pick-store");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
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
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.status(200).send(await loadPickCsv());
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
