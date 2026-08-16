# Undertone Capture Companion

This is a local Manifest V3 Chrome extension for the Undertone demo. It adds a small draggable capture button to the active page, captures the visible browser tab after an explicit click, lets you crop a garment, and uploads the crop to the local Undertone API.

## Local setup

1. Start the Undertone API and web app with the normal project workflow.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked**. In the folder picker, select this exact folder:
   `C:\Users\smeer\Desktop\youcam\apps\capture-extension`
   Select the folder itself, not the `manifest.json` file.
5. When the **Undertone Companion** card appears, optionally click the pin icon in Chrome’s extensions menu.
6. Open `http://localhost:3000/app` and keep the styling studio tab available. For the finished sample path, use `http://localhost:3000/app?demo=1`; it opens the ranked decision after the sample pack finishes preparing.
7. While the Undertone app tab is active, click the Undertone extension icon once. This connects the companion to the current styling session and opens the floating control.
8. Browse to a retail page, click the floating **U** control, choose **Grab this look**, adjust the crop, and choose **Add to board**.
9. Return to the styling studio or choose **Open styling studio** from the companion. The captured garment will be available on the look board.

When extension files change, return to `chrome://extensions` and click **Reload** on the Undertone Companion card. Refresh the webpage afterward so the updated floating control is injected. You do not need to install the extension again.

The extension does not contain YouCam or LLM keys. It only talks to the local API at `http://localhost:8000`.
