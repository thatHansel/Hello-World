const DEFAULT_OPTIONS = {
  // If true, only crawl/download links on the same hostname as the starting page.
  sameHostOnly: false,
  // Treat these extensions as "files" to download (case-insensitive).
  // If empty, a built-in common list is used.
  fileExtensionsCsv:
    "pdf,zip,rar,7z,tar,gz,bz2,xz,doc,docx,xls,xlsx,ppt,pptx,odt,ods,odp," +
    "csv,tsv,json,xml,yaml,yml,txt,log,md," +
    "jpg,jpeg,png,gif,webp,svg,bmp,tif,tiff,ico," +
    "mp3,wav,flac,m4a,ogg,mp4,mov,mkv,webm,avi," +
    "exe,dmg,pkg,deb,rpm,apk,ipa",
  // If true, attempt to identify HTML pages by making a fetch and checking content-type.
  // If false, uses only URL heuristics (faster, fewer permissions issues).
  sniffHtmlByFetch: true,
  // Max pages to crawl at depth 1 (to prevent accidental explosions).
  maxLinkedPages: 30,
  // Max total downloads in a run (safety).
  maxDownloads: 200
};

async function getOptions() {
  const stored = await chrome.storage.sync.get(DEFAULT_OPTIONS);
  return { ...DEFAULT_OPTIONS, ...stored };
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function normalizeHttpUrl(raw, base) {
  try {
    const u = new URL(raw, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function uniq(arr) {
  return [...new Set(arr)];
}

function extFromUrl(u) {
  try {
    const url = new URL(u);
    const last = url.pathname.split("/").pop() || "";
    const idx = last.lastIndexOf(".");
    if (idx <= 0) return "";
    return last.slice(idx + 1).toLowerCase();
  } catch {
    return "";
  }
}

function looksLikeHtmlPageUrl(u) {
  try {
    const url = new URL(u);
    const p = url.pathname;
    if (p.endsWith("/")) return true;
    const last = p.split("/").pop() || "";
    if (!last) return true;
    // If there is no dot, likely a route/page.
    if (!last.includes(".")) return true;
    const ext = extFromUrl(u);
    return ["html", "htm", "php", "asp", "aspx", "jsp"].includes(ext);
  } catch {
    return false;
  }
}

async function fetchHtmlAndExtractLinks(pageUrl, options) {
  // If sniffing is off, we only treat "page-ish" URLs as pages but still need HTML to extract.
  // We'll try a fetch; if it fails, return null.
  try {
    const res = await fetch(pageUrl, { method: "GET", redirect: "follow" });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (options.sniffHtmlByFetch && !ct.includes("text/html")) return null;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const hrefs = [];
    for (const a of doc.querySelectorAll("a[href]")) {
      const u = normalizeHttpUrl(a.getAttribute("href"), pageUrl);
      if (u) hrefs.push(u);
    }
    return uniq(hrefs);
  } catch {
    return null;
  }
}

function parseExtSet(csv) {
  return new Set(
    csv
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isFileLink(url, extSet) {
  const ext = extFromUrl(url);
  if (!ext) return false;
  return extSet.has(ext);
}

function filenameFromUrl(url, fallbackPrefix = "file") {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    // ignore
  }
  return `${fallbackPrefix}`;
}

function safePathSegment(s) {
  // Avoid Windows reserved chars and path traversal, keep it simple.
  return (s || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\.\.+/g, ".")
    .slice(0, 120);
}

function shouldKeepUrl(url, startUrl, options) {
  if (!url) return false;
  if (!/^https?:\/\//.test(url)) return false;
  if (!options.sameHostOnly) return true;
  try {
    const a = new URL(url);
    const b = new URL(startUrl);
    return a.hostname === b.hostname;
  } catch {
    return false;
  }
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

async function downloadMany(urls, folderPrefix, options) {
  const max = options.maxDownloads;
  let count = 0;

  for (const url of urls) {
    if (count >= max) {
      broadcast({
        type: "PROGRESS",
        payload: { level: "warn", message: `Hit maxDownloads (${max}); stopping.` }
      });
      break;
    }
    count += 1;

    const filename = safePathSegment(filenameFromUrl(url, "download"));
    const full = `${folderPrefix}/${filename}`;
    broadcast({
      type: "PROGRESS",
      payload: { level: "info", message: `Downloading: ${url}` }
    });

    try {
      await chrome.downloads.download({
        url,
        filename: full,
        conflictAction: "uniquify",
        saveAs: false
      });
    } catch (e) {
      broadcast({
        type: "PROGRESS",
        payload: {
          level: "error",
          message: `Failed download: ${url} (${e?.message || e})`
        }
      });
    }
  }
}

async function runOneLevelCrawl(activeTab) {
  const options = await getOptions();

  const startUrl = activeTab?.url;
  if (!startUrl || !/^https?:\/\//.test(startUrl)) {
    broadcast({
      type: "DONE",
      payload: {
        ok: false,
        message: "Open a http(s) page first (not chrome:// or file://)."
      }
    });
    return;
  }

  const extSet = parseExtSet(options.fileExtensionsCsv);
  const stamp = nowStamp();
  const host = (() => {
    try {
      return new URL(startUrl).hostname;
    } catch {
      return "downloads";
    }
  })();
  const folderPrefix = `linked-downloads/${safePathSegment(host)}/${stamp}`;

  broadcast({
    type: "PROGRESS",
    payload: { level: "info", message: `Starting from: ${startUrl}` }
  });

  // Step 1: inject content script into active tab to get on-page links.
  let startPageLinks = null;
  const onMessage = (msg, sender) => {
    if (msg?.type === "PAGE_LINKS" && sender?.tab?.id === activeTab.id) {
      startPageLinks = msg.payload;
    }
  };
  chrome.runtime.onMessage.addListener(onMessage);
  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ["content_script.js"]
    });
    // Wait briefly for content script to respond.
    for (let i = 0; i < 40; i++) {
      if (startPageLinks) break;
      await new Promise((r) => setTimeout(r, 50));
    }
  } finally {
    chrome.runtime.onMessage.removeListener(onMessage);
  }

  if (!startPageLinks?.hrefs?.length) {
    broadcast({
      type: "DONE",
      payload: { ok: false, message: "No links found on the starting page." }
    });
    return;
  }

  const rawHrefs0 = uniq(startPageLinks.hrefs)
    .map((u) => normalizeHttpUrl(u, startUrl))
    .filter((u) => shouldKeepUrl(u, startUrl, options));

  // Partition depth-0 links into files vs candidate pages.
  const depth0Files = [];
  const depth1Pages = [];
  for (const u of rawHrefs0) {
    if (isFileLink(u, extSet)) depth0Files.push(u);
    else if (looksLikeHtmlPageUrl(u)) depth1Pages.push(u);
  }

  const pagesToCrawl = uniq(depth1Pages).slice(0, options.maxLinkedPages);
  if (depth1Pages.length > pagesToCrawl.length) {
    broadcast({
      type: "PROGRESS",
      payload: {
        level: "warn",
        message: `Limiting linked pages to ${options.maxLinkedPages} (had ${depth1Pages.length}).`
      }
    });
  }

  broadcast({
    type: "PROGRESS",
    payload: {
      level: "info",
      message: `Found ${depth0Files.length} file links on starting page. Crawling ${pagesToCrawl.length} linked pages...`
    }
  });

  // Step 2: fetch and parse each linked page (depth 1), extract file links only.
  const depth1FileLinks = [];
  let idx = 0;
  for (const pageUrl of pagesToCrawl) {
    idx += 1;
    broadcast({
      type: "PROGRESS",
      payload: { level: "info", message: `Crawling (${idx}/${pagesToCrawl.length}): ${pageUrl}` }
    });

    const links = await fetchHtmlAndExtractLinks(pageUrl, options);
    if (!links) {
      broadcast({
        type: "PROGRESS",
        payload: {
          level: "warn",
          message:
            `Could not read or parse linked page (may be blocked by CORS/auth): ${pageUrl}`
        }
      });
      continue;
    }

    for (const u of links) {
      if (!shouldKeepUrl(u, startUrl, options)) continue;
      if (isFileLink(u, extSet)) depth1FileLinks.push(u);
    }
  }

  const allFiles = uniq([...depth0Files, ...depth1FileLinks]);

  broadcast({
    type: "PROGRESS",
    payload: {
      level: "info",
      message: `Total unique file links to download: ${allFiles.length}`
    }
  });

  await downloadMany(allFiles, folderPrefix, options);

  broadcast({
    type: "DONE",
    payload: {
      ok: true,
      message: `Done. Attempted ${Math.min(allFiles.length, options.maxDownloads)} downloads.`,
      folder: folderPrefix
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "START_DOWNLOAD") {
    (async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true
      });
      await runOneLevelCrawl(tab);
    })();
    sendResponse({ ok: true });
    return true;
  }
});

