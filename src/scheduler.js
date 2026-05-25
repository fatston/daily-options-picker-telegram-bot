const { partsInTimezone } = require("./marketCalendar");

function parseTime(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid PICKER_TIME "${value}". Expected HH:mm.`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function shouldRunScheduledPicker(now, config, lastSentDate) {
  const target = parseTime(config.pickerTime);
  const parts = partsInTimezone(now, config.pickerTimezone);
  if (!config.pickerWeekdays.includes(parts.weekday)) return false;
  if (parts.hour !== target.hour || parts.minute !== target.minute) return false;
  if (lastSentDate === parts.dateString) return false;
  return true;
}

function startScheduler(bot, config, logger) {
  logger.info("Scheduler registered", {
    weekdays: config.pickerWeekdays,
    time: config.pickerTime,
    timezone: config.pickerTimezone
  });

  const interval = setInterval(async () => {
    try {
      const now = new Date();
      if (shouldRunScheduledPicker(now, config, bot.storage.getLastSentDate())) {
        await bot.sendDailyToSubscribers(now);
      }
    } catch (error) {
      logger.error("Scheduler tick failed", { error: error.message });
      await bot.notifyAdmin(`Daily Options Picker scheduler failed: ${error.message}`);
    }
  }, config.scheduleCheckMs);

  return interval;
}

module.exports = {
  parseTime,
  shouldRunScheduledPicker,
  startScheduler
};
