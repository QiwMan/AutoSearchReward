const DEFAULT_SETTINGS = {
  searchCount: 20,
  betweenSearchMinMs: 3500,
  betweenSearchMaxMs: 9000,
  typingMinMs: 70,
  typingMaxMs: 170,
  customKeywords: ""
};

const BASE_KEYWORDS = [
  "berita teknologi",
  "cuaca hari ini",
  "tips produktivitas",
  "resep masakan rumahan",
  "fakta sains",
  "olahraga pagi",
  "film terbaru",
  "musik populer",
  "belajar javascript",
  "wisata indonesia",
  "sejarah dunia",
  "tips kesehatan",
  "trik excel",
  "cara belajar cepat",
  "ide sarapan",
  "gaming update",
  "review gadget",
  "latihan bahasa inggris",
  "ekonomi global",
  "desain interior"
];

const runState = {
  running: false,
  stopRequested: false,
  progress: 0,
  total: 0,
  currentQuery: "",
  lastError: ""
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const merged = { ...DEFAULT_SETTINGS, ...current };
  await chrome.storage.sync.set(merged);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) {
    sendResponse({ ok: false, error: "Invalid message." });
    return true;
  }

  if (message.type === "getStatus") {
    sendResponse({ ok: true, status: runState });
    return true;
  }

  if (message.type === "start") {
    if (runState.running) {
      sendResponse({ ok: false, error: "Auto-search is already running." });
      return true;
    }

    startSearchRun(message.settings)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error) });
      });

    return true;
  }

  if (message.type === "stop") {
    runState.stopRequested = true;
    sendResponse({ ok: true });
    return true;
  }

  sendResponse({ ok: false, error: "Unknown message type." });
  return true;
});

async function startSearchRun(incomingSettings = {}) {
  runState.running = true;
  runState.stopRequested = false;
  runState.progress = 0;
  runState.total = 0;
  runState.currentQuery = "";
  runState.lastError = "";

  try {
    const saved = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
    const settings = normalizeSettings({ ...saved, ...incomingSettings });
    await chrome.storage.sync.set(settings);

    const queries = buildQueries(settings.searchCount, settings.customKeywords);
    runState.total = queries.length;

    if (queries.length === 0) {
      throw new Error("No queries were generated. Please set at least 1 search.");
    }

    const tab = await chrome.tabs.create({
      url: "https://www.bing.com/",
      active: false
    });

    for (let i = 0; i < queries.length; i += 1) {
      if (runState.stopRequested) {
        break;
      }

      const query = queries[i];
      runState.progress = i;
      runState.currentQuery = query;

      await waitForTabComplete(tab.id);

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: typeAndSubmitOnBing,
        args: [query, settings.typingMinMs, settings.typingMaxMs]
      });

      runState.progress = i + 1;

      if (runState.stopRequested) {
        break;
      }

      await waitForTabComplete(tab.id);
      await sleep(randInt(settings.betweenSearchMinMs, settings.betweenSearchMaxMs));
    }

    runState.currentQuery = "";
  } catch (error) {
    runState.lastError = String(error?.message || error);
  } finally {
    runState.running = false;
    runState.stopRequested = false;
  }
}

function normalizeSettings(settings) {
  const searchCount = clampInt(settings.searchCount, 1, 100, DEFAULT_SETTINGS.searchCount);
  const betweenSearchMinMs = clampInt(settings.betweenSearchMinMs, 1000, 120000, DEFAULT_SETTINGS.betweenSearchMinMs);
  const betweenSearchMaxMs = clampInt(settings.betweenSearchMaxMs, 1000, 120000, DEFAULT_SETTINGS.betweenSearchMaxMs);
  const typingMinMs = clampInt(settings.typingMinMs, 20, 500, DEFAULT_SETTINGS.typingMinMs);
  const typingMaxMs = clampInt(settings.typingMaxMs, 20, 500, DEFAULT_SETTINGS.typingMaxMs);

  return {
    searchCount,
    betweenSearchMinMs: Math.min(betweenSearchMinMs, betweenSearchMaxMs),
    betweenSearchMaxMs: Math.max(betweenSearchMinMs, betweenSearchMaxMs),
    typingMinMs: Math.min(typingMinMs, typingMaxMs),
    typingMaxMs: Math.max(typingMinMs, typingMaxMs),
    customKeywords: String(settings.customKeywords || "")
  };
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function buildQueries(searchCount, customKeywords) {
  const userKeywords = customKeywords
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  const pool = userKeywords.length > 0 ? userKeywords : BASE_KEYWORDS;
  const queries = [];

  for (let i = 0; i < searchCount; i += 1) {
    const base = pool[randInt(0, pool.length - 1)];
    const suffix = randInt(10, 9999);
    queries.push(`${base} ${suffix}`);
  }

  return queries;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    let timeoutId;

    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timeoutId);
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for tab to finish loading."));
    }, 30000);

    chrome.tabs.onUpdated.addListener(onUpdated);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        cleanup();
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (tab?.status === "complete") {
        cleanup();
        resolve();
      }
    });
  });
}

async function typeAndSubmitOnBing(query, minTypeDelay, maxTypeDelay) {
  const sleepInner = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const randomDelay = () => Math.floor(Math.random() * (maxTypeDelay - minTypeDelay + 1)) + minTypeDelay;

  function dispatchKey(el, type, keyValue) {
    el.dispatchEvent(
      new KeyboardEvent(type, {
        key: keyValue,
        bubbles: true,
        cancelable: true
      })
    );
  }

  function findInput() {
    return (
      document.querySelector("input[name='q']") ||
      document.querySelector("textarea[name='q']") ||
      document.querySelector("#sb_form_q")
    );
  }

  let input = findInput();
  const startedAt = Date.now();

  while (!input && Date.now() - startedAt < 10000) {
    await sleepInner(200);
    input = findInput();
  }

  if (!input) {
    throw new Error("Bing search input not found.");
  }

  input.focus();
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));

  for (const char of query) {
    dispatchKey(input, "keydown", char);
    input.value += char;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    dispatchKey(input, "keyup", char);
    await sleepInner(randomDelay());
  }

  await sleepInner(randomDelay());

  const form = input.closest("form");
  if (form) {
    form.submit();
    return;
  }

  dispatchKey(input, "keydown", "Enter");
  input.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", bubbles: true }));
  dispatchKey(input, "keyup", "Enter");
}
