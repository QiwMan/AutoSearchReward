const fields = {
  searchCount: document.getElementById("searchCount"),
  betweenMin: document.getElementById("betweenMin"),
  betweenMax: document.getElementById("betweenMax"),
  typingMin: document.getElementById("typingMin"),
  typingMax: document.getElementById("typingMax"),
  customKeywords: document.getElementById("customKeywords"),
  saveBtn: document.getElementById("saveBtn"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  status: document.getElementById("status")
};

const DEFAULTS = {
  searchCount: 20,
  betweenSearchMinMs: 3500,
  betweenSearchMaxMs: 9000,
  typingMinMs: 70,
  typingMaxMs: 170,
  customKeywords: ""
};

let statusTimer;
let autosaveTimer;

async function init() {
  const saved = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  const settings = { ...DEFAULTS, ...saved };

  fields.searchCount.value = settings.searchCount;
  fields.betweenMin.value = settings.betweenSearchMinMs;
  fields.betweenMax.value = settings.betweenSearchMaxMs;
  fields.typingMin.value = settings.typingMinMs;
  fields.typingMax.value = settings.typingMaxMs;
  fields.customKeywords.value = settings.customKeywords;

  fields.saveBtn.addEventListener("click", onSave);
  fields.startBtn.addEventListener("click", onStart);
  fields.stopBtn.addEventListener("click", onStop);

  [fields.searchCount, fields.betweenMin, fields.betweenMax, fields.typingMin, fields.typingMax, fields.customKeywords]
    .forEach((el) => {
      el.addEventListener("input", scheduleAutosave);
      el.addEventListener("change", scheduleAutosave);
    });

  await refreshStatus();
  statusTimer = setInterval(refreshStatus, 1000);
}

function collectSettings() {
  const searchCount = parseInt(fields.searchCount.value, 10);
  const betweenMin = parseInt(fields.betweenMin.value, 10);
  const betweenMax = parseInt(fields.betweenMax.value, 10);
  const typingMin = parseInt(fields.typingMin.value, 10);
  const typingMax = parseInt(fields.typingMax.value, 10);

  const settings = {
    searchCount: Number.isNaN(searchCount) ? DEFAULTS.searchCount : searchCount,
    betweenSearchMinMs: Number.isNaN(betweenMin) ? DEFAULTS.betweenSearchMinMs : betweenMin,
    betweenSearchMaxMs: Number.isNaN(betweenMax) ? DEFAULTS.betweenSearchMaxMs : betweenMax,
    typingMinMs: Number.isNaN(typingMin) ? DEFAULTS.typingMinMs : typingMin,
    typingMaxMs: Number.isNaN(typingMax) ? DEFAULTS.typingMaxMs : typingMax,
    customKeywords: fields.customKeywords.value.trim()
  };

  settings.betweenSearchMinMs = Math.min(settings.betweenSearchMinMs, settings.betweenSearchMaxMs);
  settings.betweenSearchMaxMs = Math.max(settings.betweenSearchMinMs, settings.betweenSearchMaxMs);
  settings.typingMinMs = Math.min(settings.typingMinMs, settings.typingMaxMs);
  settings.typingMaxMs = Math.max(settings.typingMinMs, settings.typingMaxMs);

  return settings;
}

function scheduleAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }

  autosaveTimer = setTimeout(async () => {
    await persistSettings("Setingan tersimpan otomatis.");
  }, 450);
}

async function persistSettings(message) {
  const settings = collectSettings();
  await chrome.storage.sync.set(settings);
  if (message) {
    setStatus(message);
  }
}

async function onSave() {
  await persistSettings("Setingan berhasil disimpan.");
}

async function onStart() {
  const settings = collectSettings();
  await chrome.storage.sync.set(settings);
  const response = await chrome.runtime.sendMessage({ type: "start", settings });

  if (!response?.ok) {
    setStatus(`Error: ${response?.error || "unknown"}`);
    return;
  }

  setStatus("Auto-search dimulai.");
  await refreshStatus();
}

async function onStop() {
  await chrome.runtime.sendMessage({ type: "stop" });
  setStatus("Permintaan stop terkirim.");
  await refreshStatus();
}

async function refreshStatus() {
  const response = await chrome.runtime.sendMessage({ type: "getStatus" });
  const status = response?.status;

  if (!response?.ok || !status) {
    setStatus("Tidak bisa membaca status.");
    return;
  }

  fields.startBtn.disabled = status.running;
  fields.stopBtn.disabled = !status.running;

  if (status.running) {
    setStatus(`Running: ${status.progress}/${status.total} | Query: ${status.currentQuery || "-"}`);
    return;
  }

  if (status.lastError) {
    setStatus(`Stopped with error: ${status.lastError}`);
    return;
  }

  if (status.progress > 0 && status.progress === status.total) {
    setStatus(`Selesai: ${status.progress} pencarian.`);
    return;
  }

  setStatus("Status: idle");
}

function setStatus(text) {
  fields.status.textContent = text;
}

window.addEventListener("beforeunload", () => {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }

  chrome.storage.sync.set(collectSettings());

  if (statusTimer) {
    clearInterval(statusTimer);
  }
});

init();
