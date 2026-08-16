(() => {
  if (window.__undertoneCaptureLoaded) return;
  window.__undertoneCaptureLoaded = true;

  const root = document.createElement("div");
  root.id = "undertone-capture-root";
  root.style.cssText = "all:initial; position:fixed; inset:0; z-index:2147483647; pointer-events:none; font-family: Georgia, serif;";
  const shadow = root.attachShadow({ mode: "open" });
  document.documentElement.appendChild(root);

  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .bubble { pointer-events:auto; position:fixed; right:24px; bottom:24px; width:56px; height:56px; border:3px solid #f6f4ef; border-radius:50%; background:#6a5ed6; color:#fff; cursor:grab; box-shadow:0 14px 34px #11182745; display:grid; place-items:center; font:700 19px Georgia,serif; transition:transform .18s ease, box-shadow .18s ease; }
      .bubble:hover { transform:translateY(-3px) rotate(-4deg); box-shadow:0 18px 42px #11182755; }
      .bubble:active { cursor:grabbing; }
      .panel { pointer-events:auto; position:fixed; right:24px; bottom:94px; width:318px; padding:20px; border:1px solid #ded8d0; border-radius:24px; background:#fffdfa; color:#111827; box-shadow:0 22px 60px #11182735; display:none; }
      .panel.open { display:block; }
      .eyebrow { color:#6a5ed6; font:700 10px system-ui,sans-serif; letter-spacing:.18em; text-transform:uppercase; }
      h2 { margin:8px 0 9px; font-size:25px; line-height:1.04; font-weight:400; letter-spacing:-.04em; }
      p { margin:0 0 14px; color:#6d7180; font:13px/1.5 system-ui,sans-serif; }
      button { width:100%; padding:11px 13px; margin-top:8px; border:1px solid #ded8d0; border-radius:999px; background:#fffdfa; color:#111827; cursor:pointer; font:600 13px system-ui,sans-serif; transition:transform .15s ease, background .15s ease; }
      button:hover { transform:translateY(-1px); background:#f1eefb; }
      button.primary { border-color:#111827; background:#111827; color:#fff; }
      .status { display:flex; align-items:center; gap:7px; margin-top:14px; color:#777b88; font:11px system-ui,sans-serif; }
      .status::before { content:""; width:7px; height:7px; border-radius:50%; background:#caf3a6; box-shadow:0 0 0 3px #caf3a633; }
      .panel-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .close { width:28px; min-width:28px; height:28px; margin:0; padding:0; border:0; background:transparent; color:#777b88; font-size:20px; line-height:1; }
      .close:hover { background:#f1eefb; transform:none; }
      .crop { position:fixed; inset:0; background:#111827c7; pointer-events:auto; display:none; }
      .crop.open { display:block; }
      .crop-image { position:absolute; max-width:82vw; max-height:78vh; left:50%; top:50%; transform:translate(-50%,-50%); object-fit:contain; user-select:none; }
      .selection { position:absolute; border:2px solid #caf3a6; background:#caf3a626; cursor:move; box-shadow:0 0 0 9999px #11182755; }
      .selection .handle { position:absolute; right:-7px; bottom:-7px; width:14px; height:14px; border-radius:50%; background:#ff6d7d; cursor:nwse-resize; }
      .crop-actions { position:fixed; left:50%; bottom:28px; transform:translateX(-50%); display:flex; gap:8px; }
      .crop-actions button { width:auto; min-width:100px; background:#fffcf8; }
      .crop-actions button.primary { border-color:#111827; background:#111827; color:#fff; }
    </style>
    <button class="bubble" title="Open Undertone companion" aria-label="Open Undertone companion">U</button>
    <section class="panel" aria-label="Undertone companion">
      <div class="panel-head"><div class="eyebrow">Undertone companion</div><button class="close" data-action="hide" aria-label="Hide companion">×</button></div>
      <h2>Keep the good options.</h2>
      <p>Grab a garment from this page and it will land in your look board, ready for a personal read.</p>
      <button class="primary" data-action="capture">Grab this look</button>
      <button data-action="home">Open styling studio</button>
      <div class="status">Private to this browser</div>
    </section>
    <section class="crop">
      <img class="crop-image" alt="Retail page capture" />
      <div class="selection"><div class="handle"></div></div>
      <div class="crop-actions"><button data-action="cancel">Cancel</button><button class="primary" data-action="use">Add to board</button></div>
    </section>`;

  const bubble = shadow.querySelector(".bubble");
  const panel = shadow.querySelector(".panel");
  const crop = shadow.querySelector(".crop");
  const image = shadow.querySelector(".crop-image");
  const selection = shadow.querySelector(".selection");
  const status = shadow.querySelector(".status");
  let captureDataUrl = "";
  let hidden = false;
  let dragging = null;
  let dragStart = null;

  function showStatus(text) { status.textContent = text; }
  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            resolve({ ok: false, error: runtimeError.message });
            return;
          }
          resolve(response);
        });
      } catch (error) {
        resolve({
          ok: false,
          error: error instanceof Error ? error.message : "Undertone extension is no longer connected",
        });
      }
    });
  }
  function toggle() {
    if (hidden) { root.style.display = "block"; hidden = false; }
    panel.classList.toggle("open");
  }
  function hideCompanion() { panel.classList.remove("open"); root.style.display = "none"; hidden = true; }
  function placeDefaultSelection() {
    const rect = image.getBoundingClientRect();
    selection.style.left = `${rect.left + rect.width * .15}px`;
    selection.style.top = `${rect.top + rect.height * .15}px`;
    selection.style.width = `${rect.width * .7}px`;
    selection.style.height = `${rect.height * .7}px`;
  }
  function openCrop(dataUrl) {
    captureDataUrl = dataUrl;
    image.src = dataUrl;
    crop.classList.add("open");
    image.onload = placeDefaultSelection;
  }
  function closeCrop() { crop.classList.remove("open"); captureDataUrl = ""; }
  function cropSelection() {
    const imageRect = image.getBoundingClientRect();
    const selectRect = selection.getBoundingClientRect();
    const scaleX = image.naturalWidth / imageRect.width;
    const scaleY = image.naturalHeight / imageRect.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(selectRect.width * scaleX));
    canvas.height = Math.max(1, Math.round(selectRect.height * scaleY));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, (selectRect.left - imageRect.left) * scaleX, (selectRect.top - imageRect.top) * scaleY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", .92);
  }

  let bubbleMoved = false;
  bubble.addEventListener("click", () => { if (bubbleMoved) { bubbleMoved = false; return; } toggle(); });
  bubble.addEventListener("pointerdown", (event) => {
    bubbleMoved = false;
    const startX = event.clientX; const startY = event.clientY;
    const rect = bubble.getBoundingClientRect();
    function move(moveEvent) { if (Math.abs(moveEvent.clientX - startX) > 4 || Math.abs(moveEvent.clientY - startY) > 4) bubbleMoved = true; bubble.style.left = `${Math.max(8, rect.left + moveEvent.clientX - startX)}px`; bubble.style.top = `${Math.max(8, rect.top + moveEvent.clientY - startY)}px`; bubble.style.right = "auto"; bubble.style.bottom = "auto"; }
    function up() { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  });

  shadow.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const action = target?.closest("[data-action]")?.dataset.action;
    try {
      if (action === "capture") {
        showStatus("Capturing the visible page…");
        const result = await send({ type: "undertone_capture_visible" });
        if (!result?.ok) { showStatus(result?.error || "Capture failed"); return; }
        panel.classList.remove("open"); openCrop(result.dataUrl);
      }
      if (action === "home") {
        showStatus("Opening your styling studio…");
        const result = await send({ type: "undertone_open_workspace" });
        if (!result?.ok) showStatus(result?.error || "Could not open the styling studio");
      }
      if (action === "hide") hideCompanion();
      if (action === "cancel") closeCrop();
      if (action === "use") {
        showStatus("Adding this garment to your board…");
        const result = await send({ type: "undertone_upload_crop", dataUrl: cropSelection() });
        if (!result?.ok) { closeCrop(); panel.classList.add("open"); showStatus(result?.error || "Could not add garment"); return; }
        closeCrop(); panel.classList.add("open"); showStatus(`Added to your board · ${result.session?.candidates?.length || 1} garment(s) saved.`);
      }
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Undertone could not complete that action");
    }
  });

  function beginDrag(event, mode) {
    const rect = selection.getBoundingClientRect();
    dragging = mode;
    dragStart = { x: event.clientX, y: event.clientY, rect };
    event.preventDefault();
  }
  selection.addEventListener("pointerdown", (event) => beginDrag(event, "move"));
  selection.querySelector(".handle").addEventListener("pointerdown", (event) => { event.stopPropagation(); beginDrag(event, "resize"); });
  window.addEventListener("pointermove", (event) => {
    if (!dragging || !dragStart) return;
    const dx = event.clientX - dragStart.x; const dy = event.clientY - dragStart.y;
    const imageRect = image.getBoundingClientRect();
    if (dragging === "move") {
      selection.style.left = `${Math.max(imageRect.left, Math.min(imageRect.right - dragStart.rect.width, dragStart.rect.left + dx))}px`;
      selection.style.top = `${Math.max(imageRect.top, Math.min(imageRect.bottom - dragStart.rect.height, dragStart.rect.top + dy))}px`;
    } else {
      selection.style.width = `${Math.max(80, Math.min(imageRect.right - dragStart.rect.left, dragStart.rect.width + dx))}px`;
      selection.style.height = `${Math.max(80, Math.min(imageRect.bottom - dragStart.rect.top, dragStart.rect.height + dy))}px`;
    }
  });
  window.addEventListener("pointerup", () => { dragging = null; dragStart = null; });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "undertone_toggle") { toggle(); sendResponse({ ok: true }); }
    if (message.type === "undertone_sync_session") {
      let sessionId = null;
      try { sessionId = JSON.parse(window.localStorage.getItem("undertone-session") || "{}").state?.sessionId || null; } catch (_) {}
      sendResponse({ sessionId });
    }
  });

  // Keep the companion attached to the session currently open in Undertone,
  // even when the user changes sessions without clicking the toolbar icon.
  if (location.href.startsWith("http://localhost:3000/app")) {
    window.setTimeout(() => {
      try {
        const sessionId = JSON.parse(window.localStorage.getItem("undertone-session") || "{}").state?.sessionId || null;
        if (sessionId) void send({ type: "undertone_set_session", sessionId }).catch(() => {});
      } catch (_) {}
    }, 1200);
  }
})();
