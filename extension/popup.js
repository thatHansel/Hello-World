const startBtn = document.getElementById("start");
const logEl = document.getElementById("log");
const optsLink = document.getElementById("options");

function addLine(message, level = "info") {
  const div = document.createElement("div");
  div.className = `line ${level === "warn" ? "warn" : level === "error" ? "error" : level === "ok" ? "ok" : ""}`;
  div.textContent = message;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

optsLink.addEventListener("click", async (e) => {
  e.preventDefault();
  await chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "PROGRESS") {
    addLine(msg.payload?.message || "", msg.payload?.level || "info");
  }
  if (msg?.type === "DONE") {
    const ok = !!msg.payload?.ok;
    addLine(msg.payload?.message || (ok ? "Done." : "Failed."), ok ? "ok" : "error");
    if (msg.payload?.folder) {
      addLine(`Folder: ${msg.payload.folder}`, "info");
    }
    startBtn.disabled = false;
  }
});

startBtn.addEventListener("click", async () => {
  logEl.textContent = "";
  startBtn.disabled = true;
  addLine("Running...", "info");
  try {
    await chrome.runtime.sendMessage({ type: "START_DOWNLOAD" });
  } catch (e) {
    addLine(`Could not start: ${e?.message || e}`, "error");
    startBtn.disabled = false;
  }
});

