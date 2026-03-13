(() => {
  const TOAST_ID = "ars-reward-toast";
  const STATE = {
    initialized: false,
    previousAvailable: null,
    lastToastAt: 0
  };

  init();

  function init() {
    if (STATE.initialized) {
      return;
    }

    STATE.initialized = true;
    ensureToastNode();

    const observer = new MutationObserver(() => {
      scheduleRead();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    scheduleRead();
    setInterval(scheduleRead, 2500);
  }

  let scheduleTimer = null;

  function scheduleRead() {
    if (scheduleTimer) {
      clearTimeout(scheduleTimer);
    }

    scheduleTimer = setTimeout(() => {
      scheduleTimer = null;
      checkPointsChange();
    }, 350);
  }

  function checkPointsChange() {
    const available = extractPointsByLabel(/available\s*points/i);
    if (available == null) {
      return;
    }

    const today = extractPointsByLabel(/today'?s\s*points/i);

    if (STATE.previousAvailable == null) {
      STATE.previousAvailable = available;
      return;
    }

    if (available > STATE.previousAvailable) {
      const gain = available - STATE.previousAvailable;
      const text = today == null
        ? `+${gain} poin | Total: ${formatPoints(available)}`
        : `+${gain} poin | Total: ${formatPoints(available)} | Hari ini: ${formatPoints(today)}`;

      showToast(text, "success");
    }

    STATE.previousAvailable = available;
  }

  function extractPointsByLabel(labelRegex) {
    const labels = getLeafElements().filter((el) => labelRegex.test(cleanText(el.textContent || "")));

    for (const labelEl of labels) {
      const card = labelEl.closest("section, article, div") || labelEl.parentElement;
      if (!card) {
        continue;
      }

      const cardText = cleanText(card.textContent || "");
      const candidates = cardText.match(/\d[\d.,\s]*/g);
      if (!candidates || candidates.length === 0) {
        continue;
      }

      const parsed = candidates
        .map(parsePoints)
        .filter((value) => Number.isFinite(value) && value >= 0);

      if (parsed.length > 0) {
        return parsed[0];
      }
    }

    return null;
  }

  function getLeafElements() {
    return Array.from(document.querySelectorAll("body *")).filter((el) => {
      if (!(el instanceof HTMLElement)) {
        return false;
      }

      if (el.children.length > 0) {
        return false;
      }

      const text = cleanText(el.textContent || "");
      if (!text || text.length > 80) {
        return false;
      }

      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function parsePoints(rawText) {
    const normalized = String(rawText || "")
      .replace(/\s/g, "")
      .replace(/[^\d.,]/g, "")
      .replace(/,/g, "");

    if (!normalized) {
      return Number.NaN;
    }

    return Number.parseInt(normalized, 10);
  }

  function cleanText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function formatPoints(num) {
    return new Intl.NumberFormat("id-ID").format(num);
  }

  function ensureToastNode() {
    if (document.getElementById(TOAST_ID)) {
      return;
    }

    const node = document.createElement("div");
    node.id = TOAST_ID;
    node.setAttribute("aria-live", "polite");
    node.style.position = "fixed";
    node.style.right = "20px";
    node.style.bottom = "20px";
    node.style.zIndex = "2147483647";
    node.style.maxWidth = "340px";
    node.style.padding = "12px 14px";
    node.style.borderRadius = "10px";
    node.style.fontFamily = "Segoe UI, Tahoma, sans-serif";
    node.style.fontSize = "14px";
    node.style.fontWeight = "700";
    node.style.lineHeight = "1.35";
    node.style.color = "#ffffff";
    node.style.background = "linear-gradient(135deg, #0c7a43, #0b5e9e)";
    node.style.boxShadow = "0 10px 28px rgba(0, 0, 0, 0.24)";
    node.style.opacity = "0";
    node.style.transform = "translateY(12px)";
    node.style.transition = "opacity 220ms ease, transform 220ms ease";
    node.style.pointerEvents = "none";

    document.body.appendChild(node);
  }

  function showToast(message, type) {
    const now = Date.now();
    if (now - STATE.lastToastAt < 1200) {
      return;
    }

    STATE.lastToastAt = now;
    const node = document.getElementById(TOAST_ID);
    if (!node) {
      return;
    }

    node.textContent = message;

    if (type === "success") {
      node.style.background = "linear-gradient(135deg, #0c7a43, #0b5e9e)";
    } else {
      node.style.background = "linear-gradient(135deg, #7a0c0c, #9e4b0b)";
    }

    node.style.opacity = "1";
    node.style.transform = "translateY(0)";

    clearTimeout(showToast.hideTimer);
    showToast.hideTimer = setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(12px)";
    }, 3800);
  }

  showToast.hideTimer = null;
})();
