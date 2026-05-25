const https = require("https");

function requestJson(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        let parsed;
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch (error) {
          return reject(new Error(`Invalid JSON response from Telegram: ${error.message}`));
        }
        if (res.statusCode < 200 || res.statusCode >= 300 || parsed.ok === false) {
          return reject(new Error(`Telegram API error ${res.statusCode}: ${parsed.description || data}`));
        }
        resolve(parsed);
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("Telegram request timed out")));
    if (body) req.write(body);
    req.end();
  });
}

class TelegramClient {
  constructor(token) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  call(method, payload) {
    const body = JSON.stringify(payload || {});
    return requestJson(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, body);
  }

  sendMessage(chatId, text) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    });
  }

  getUpdates(offset, timeout) {
    return this.call("getUpdates", {
      offset,
      timeout: timeout || 25,
      allowed_updates: ["message"]
    });
  }

  getMe() {
    return this.call("getMe", {});
  }
}

module.exports = {
  TelegramClient
};
