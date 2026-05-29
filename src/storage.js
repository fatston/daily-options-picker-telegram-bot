const fs = require("fs");
const path = require("path");

function defaultState() {
  return {
    subscribers: [],
    adminChatId: "",
    lastUpdateId: 0,
    lastBrief: "",
    lastPublishId: "",
    briefHistory: {}
  };
}

class JsonStorage {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = defaultState();
    this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      this.save();
      return this.state;
    }
    const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    this.state = Object.assign(defaultState(), parsed);
    if (!Array.isArray(this.state.subscribers)) this.state.subscribers = [];
    this.state.subscribers = this.state.subscribers.map(String);
    if (!this.state.briefHistory || typeof this.state.briefHistory !== "object" || Array.isArray(this.state.briefHistory)) {
      this.state.briefHistory = {};
    }
    if (this.state.lastPublishId && this.state.lastBrief && !this.state.briefHistory[this.state.lastPublishId]) {
      this.state.briefHistory[this.state.lastPublishId] = this.state.lastBrief;
      this.save();
    }
    return this.state;
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2) + "\n");
  }

  getSubscribers() {
    return this.state.subscribers.slice();
  }

  isSubscribed(chatId) {
    return this.state.subscribers.includes(String(chatId));
  }

  subscribe(chatId) {
    const id = String(chatId);
    if (!this.state.subscribers.includes(id)) {
      this.state.subscribers.push(id);
      this.save();
    }
    return this.state.subscribers.slice();
  }

  unsubscribe(chatId) {
    const id = String(chatId);
    this.state.subscribers = this.state.subscribers.filter((item) => item !== id);
    this.save();
  }

  getAdminChatId() {
    return this.state.adminChatId || "";
  }

  setAdminChatId(chatId) {
    this.state.adminChatId = String(chatId);
    this.save();
  }

  getLastUpdateId() {
    return Number(this.state.lastUpdateId || 0);
  }

  setLastUpdateId(updateId) {
    this.state.lastUpdateId = Number(updateId || 0);
    this.save();
  }

  getLastBrief() {
    return this.state.lastBrief || "";
  }

  getLastPublishId() {
    return this.state.lastPublishId || "";
  }

  setLastBrief(message, publishId) {
    this.state.lastBrief = String(message || "");
    this.state.lastPublishId = String(publishId || "");
    if (this.state.lastPublishId) {
      this.state.briefHistory[this.state.lastPublishId] = this.state.lastBrief;
    }
    this.save();
  }

  getBriefByPublishId(publishId) {
    return this.state.briefHistory[String(publishId || "")] || "";
  }
}

module.exports = {
  JsonStorage,
  defaultState
};
