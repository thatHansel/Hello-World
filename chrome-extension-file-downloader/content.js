// Content script - runs in the context of web pages to extract links

const DOCUMENT_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.rtf', '.odt', '.ods', '.odp', '.csv'
];

// Check if URL points to a document
function isDocumentUrl(url) {
  const lower = url.toLowerCase();
  return DOCUMENT_EXTENSIONS.some(ext => lower.includes(ext));
}

// Check if URL is a webpage
function isWebpageUrl(url, baseDomain) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== baseDomain) return false;
    if (isDocumentUrl(url)) return false;
    
    const pathname = urlObj.pathname.toLowerCase();
    // Skip obvious non-pages
    if (pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot|mp3|mp4|wav|avi|mov)$/i)) {
      return false;
    }
    
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

// Normalize URL (remove fragment, handle relative URLs)
function normalizeUrl(href, baseUrl) {
  try {
    const url = new URL(href, baseUrl);
    url.hash = ''; // Remove fragment
    return url.href;
  } catch {
    return null;
  }
}

// Extract all links from the page
function extractLinks(baseDomain) {
  const documents = new Set();
  const pages = new Set();
  const baseUrl = window.location.href;
  
  // Get all anchor tags
  const links = document.querySelectorAll('a[href]');
  
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      return;
    }
    
    const fullUrl = normalizeUrl(href, baseUrl);
    if (!fullUrl) return;
    
    if (isDocumentUrl(fullUrl)) {
      documents.add(fullUrl);
    } else if (isWebpageUrl(fullUrl, baseDomain)) {
      pages.add(fullUrl);
    }
  });
  
  // Also check for documents in other elements (e.g., iframes, embeds)
  document.querySelectorAll('iframe[src], embed[src], object[data]').forEach(el => {
    const src = el.getAttribute('src') || el.getAttribute('data');
    if (src) {
      const fullUrl = normalizeUrl(src, baseUrl);
      if (fullUrl && isDocumentUrl(fullUrl)) {
        documents.add(fullUrl);
      }
    }
  });
  
  return {
    documents: Array.from(documents),
    pages: Array.from(pages)
  };
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getLinks') {
    const results = extractLinks(message.baseDomain);
    sendResponse(results);
  }
  return true;
});
