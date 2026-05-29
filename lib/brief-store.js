const { get, put } = require("@vercel/blob");

function briefPath(publishId) {
  const id = String(publishId || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) {
    throw new Error("publishId must use YYYY-MM-DD");
  }
  return `briefs/${id}.txt`;
}

async function streamToText(stream) {
  return new Response(stream).text();
}

async function saveBrief(publishId, message) {
  await put(briefPath(publishId), String(message || ""), {
    access: "private",
    allowOverwrite: true,
    contentType: "text/plain; charset=utf-8",
    cacheControlMaxAge: 60
  });
}

async function loadBrief(publishId) {
  try {
    const result = await get(briefPath(publishId), {
      access: "private",
      useCache: false
    });
    if (!result || !result.stream) return "";
    return streamToText(result.stream);
  } catch (error) {
    if (error && /not found/i.test(error.message || "")) return "";
    throw error;
  }
}

module.exports = {
  briefPath,
  loadBrief,
  saveBrief
};
