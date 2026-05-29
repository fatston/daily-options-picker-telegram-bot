const http = require("http");

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 100000) {
        request.destroy(new Error("Request body is too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function hasBearerToken(request, expectedToken) {
  const header = request.headers.authorization || "";
  return Boolean(expectedToken && header === `Bearer ${expectedToken}`);
}

function startPublisherServer(bot, config, logger) {
  if (!config.publishToken) {
    throw new Error("PUBLISH_TOKEN is required for the local publish endpoint.");
  }

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method !== "POST" || request.url !== "/publish") {
        sendJson(response, 404, { ok: false, error: "not_found" });
        return;
      }

      if (!hasBearerToken(request, config.publishToken)) {
        sendJson(response, 401, { ok: false, error: "unauthorized" });
        return;
      }

      const payload = await readJsonBody(request);
      const result = await bot.publishBrief(payload);
      sendJson(response, 200, { ok: true, result });
    } catch (error) {
      logger.error("Publish endpoint failed", { error: error.message });
      await bot.notifyAdmin(`Daily Options Picker publish failed: ${error.message}`);
      sendJson(response, 500, { ok: false, error: error.message });
    }
  });

  server.listen(config.publishPort, config.publishHost, () => {
    logger.info("Publisher endpoint listening", {
      host: config.publishHost,
      port: config.publishPort
    });
  });

  return server;
}

module.exports = {
  hasBearerToken,
  startPublisherServer
};
