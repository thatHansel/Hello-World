const DEFAULTS = {
  sameHostOnly: false,
  fileExtensionsCsv: "",
  sniffHtmlByFetch: true,
  maxLinkedPages: 30,
  maxDownloads: 200
};

const els = {
  sameHostOnly: document.getElementById("sameHostOnly"),
  fileExtensionsCsv: document.getElementById("fileExtensionsCsv"),
  sniffHtmlByFetch: document.getElementById("sniffHtmlByFetch"),
  maxLinkedPages: document.getElementById("maxLinkedPages"),
  maxDownloads: document.getElementById("maxDownloads"),
  save: document.getElementById("save"),
  status: document.getElementById("status")
};

async function load() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  els.sameHostOnly.checked = !!stored.sameHostOnly;
  els.sniffHtmlByFetch.checked = !!stored.sniffHtmlByFetch;
  els.maxLinkedPages.value = String(stored.maxLinkedPages ?? DEFAULTS.maxLinkedPages);
  els.maxDownloads.value = String(stored.maxDownloads ?? DEFAULTS.maxDownloads);
  els.fileExtensionsCsv.value = stored.fileExtensionsCsv || "";
}

function setStatus(text) {
  els.status.textContent = text;
  if (!text) return;
  setTimeout(() => {
    if (els.status.textContent === text) els.status.textContent = "";
  }, 2000);
}

async function save() {
  const maxLinkedPages = Math.max(
    1,
    Math.min(500, Number.parseInt(els.maxLinkedPages.value || "30", 10))
  );
  const maxDownloads = Math.max(
    1,
    Math.min(5000, Number.parseInt(els.maxDownloads.value || "200", 10))
  );

  await chrome.storage.sync.set({
    sameHostOnly: !!els.sameHostOnly.checked,
    sniffHtmlByFetch: !!els.sniffHtmlByFetch.checked,
    fileExtensionsCsv: String(els.fileExtensionsCsv.value || "").trim(),
    maxLinkedPages,
    maxDownloads
  });
}

els.save.addEventListener("click", async () => {
  try {
    await save();
    setStatus("Saved.");
  } catch (e) {
    setStatus(`Save failed: ${e?.message || e}`);
  }
});

load().catch((e) => setStatus(`Load failed: ${e?.message || e}`));

