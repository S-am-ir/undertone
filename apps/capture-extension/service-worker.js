const API_URL = "http://localhost:8000";
const APP_URL = "http://localhost:3000/app";

async function getSessionId() {
  const stored = await chrome.storage.local.get(["sessionId"]);
  return stored.sessionId || null;
}

async function setSessionId(sessionId) {
  if (sessionId) await chrome.storage.local.set({ sessionId });
}

async function readSessionFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          return JSON.parse(window.localStorage.getItem("undertone-session") || "{}").state?.sessionId || null;
        } catch (_) {
          return null;
        }
      },
    });
    return results?.[0]?.result || null;
  } catch (_) {
    return null;
  }
}

async function syncFromOpenWorkspace() {
  const tabs = await chrome.tabs.query({ url: `${APP_URL}*` });
  const ordered = [...tabs].sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const tab of ordered) {
      if (!tab.id) continue;
      const pageSessionId = await readSessionFromTab(tab.id);
      if (pageSessionId) {
        await setSessionId(pageSessionId);
        return pageSessionId;
      }
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: "undertone_sync_session" });
        if (response?.sessionId) {
          await setSessionId(response.sessionId);
          return response.sessionId;
        }
      } catch (_) {
        // The app tab may still be loading; retry before using the stored fallback.
      }
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return getSessionId();
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "undertone_toggle" });
    return;
  } catch (_) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tabId, { type: "undertone_toggle" });
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || tab.url.startsWith("chrome://")) return;
  try {
    await ensureContentScript(tab.id);
    if (tab.url.startsWith(APP_URL)) {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "undertone_sync_session" });
      if (response?.sessionId) await setSessionId(response.sessionId);
    }
  } catch (error) {
    console.warn("Undertone could not open on this tab", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "undertone_capture_visible") {
      if (sender.tab?.windowId == null) throw new Error("No active browser tab");
      const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
      sendResponse({ ok: true, dataUrl });
      return;
    }

    if (message.type === "undertone_upload_crop") {
      const sessionId = await syncFromOpenWorkspace();
      if (!sessionId) throw new Error("Connect Undertone from the app tab first.");
      const binary = atob(message.dataUrl.split(",")[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const form = new FormData();
      form.append("files", new Blob([bytes], { type: "image/jpeg" }), `captured-look-${Date.now()}.jpg`);
      form.append("category", "clothes");
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}/candidates`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw new Error(await response.text());
      const session = await response.json();
      await chrome.storage.local.set({ queuedCount: session.candidates?.length || 0 });
      sendResponse({ ok: true, session });
      return;
    }

    if (message.type === "undertone_set_session") {
      await setSessionId(message.sessionId);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "undertone_open_workspace") {
      const sessionId = await syncFromOpenWorkspace();
      const suffix = sessionId ? `?capture=1&session=${encodeURIComponent(sessionId)}` : "?capture=1";
      await chrome.tabs.create({ url: `${APP_URL}${suffix}` });
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: true });
  })().catch((error) => sendResponse({ ok: false, error: error.message || "Undertone capture failed" }));
  return true;
});
