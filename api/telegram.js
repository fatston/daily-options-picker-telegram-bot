const { handleTelegramUpdate } = require("../lib/bot");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  try {
    await handleTelegramUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
