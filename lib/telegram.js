const TELEGRAM_API = "https://api.telegram.org";

function token() {
  const value = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!value) throw new Error("TELEGRAM_BOT_TOKEN is required");
  return value;
}

async function telegramCall(method, payload) {
  const response = await fetch(`${TELEGRAM_API}/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(`Telegram API error ${response.status}: ${data.description || "unknown error"}`);
  }
  return data;
}

function commandKeyboard() {
  return {
    keyboard: [[{ text: "/today" }, { text: "/yesterday" }]],
    resize_keyboard: true,
    is_persistent: true
  };
}

async function sendMessage(chatId, text) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    reply_markup: commandKeyboard()
  });
}

module.exports = {
  telegramCall,
  sendMessage
};
