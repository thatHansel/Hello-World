/**
 * Content script injected into the active tab to extract:
 * - the page URL and title
 * - all anchor hrefs on the page (resolved to absolute URLs)
 */
(() => {
  function normalizeUrl(raw, base) {
    try {
      // Ignore javascript:, mailto:, tel:, etc.
      const u = new URL(raw, base);
      if (!/^https?:$/.test(u.protocol)) return null;
      u.hash = "";
      return u.toString();
    } catch {
      return null;
    }
  }

  const base = document.baseURI || location.href;
  const hrefs = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const u = normalizeUrl(a.getAttribute("href"), base);
    if (u) hrefs.push(u);
  }

  chrome.runtime.sendMessage({
    type: "PAGE_LINKS",
    payload: {
      pageUrl: normalizeUrl(location.href, base) || location.href,
      pageTitle: document.title || "",
      hrefs
    }
  });
})();

