// Helper to check if a URL is a file or a page
function isLikelyFile(url) {
  const fileExtensions = [
    '.pdf', '.zip', '.rar', '.7z', '.tar', '.gz',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv',
    '.csv', '.txt', '.xml', '.json', '.epub', '.mobi'
  ];
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    // Check if it ends with an extension
    return fileExtensions.some(ext => pathname.endsWith(ext));
  } catch (e) {
    return false;
  }
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Function to fetch and parse a page (for Level 1)
async function fetchAndParse(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    // <a href="...">
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/gi;
    const links = new Set();
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      try {
        const absoluteUrl = new URL(match[2], url).href;
        if (isValidUrl(absoluteUrl) && !absoluteUrl.startsWith('javascript:') && !absoluteUrl.startsWith('mailto:')) {
          links.add(absoluteUrl);
        }
      } catch (e) {
        // Ignore invalid URLs
      }
    }
    return Array.from(links);
  } catch (e) {
    console.error(`Failed to fetch ${url}:`, e);
    return [];
  }
}

// Helper to scrape links from the active tab (Level 0)
async function getLinksFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        return Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
      }
    });
    return results[0].result;
  } catch (e) {
    console.error("Script injection failed", e);
    return [];
  }
}

let isRunning = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start_download') {
    if (isRunning) return;
    isRunning = true;
    processDownloads(request.tabId, request.url).finally(() => {
      isRunning = false;
    });
  }
});

async function processDownloads(tabId, startUrl) {
  try {
    chrome.runtime.sendMessage({ action: 'update_status', status: 'Scanning level 0...', stats: { pagesScanned: 0, filesFound: 0 } });

    // Get Level 0 links directly from the tab DOM
    const level0Links = await getLinksFromTab(tabId);
    
    const pagesToScan = new Set();
    const filesToDownload = new Set();
    // Keep track of visited pages to avoid cycles and redundant work
    const scannedPages = new Set([startUrl]); 
    // Normalize startUrl to avoid self-reference if possible (remove trailing slash etc)

    // Classify Level 0 links
    for (const link of level0Links) {
      if (!isValidUrl(link)) continue;
      
      if (isLikelyFile(link)) {
        filesToDownload.add(link);
      } else {
        pagesToScan.add(link);
      }
    }

    chrome.runtime.sendMessage({ 
      action: 'update_status', 
      status: `Scanning ${pagesToScan.size} level 1 pages...`, 
      stats: { pagesScanned: 1, filesFound: filesToDownload.size } 
    });

    // Scan Level 1 pages
    let scannedCount = 0;
    const totalPages = pagesToScan.size;
    
    // Concurrency limit for fetching to avoid choking
    const BATCH_SIZE = 5;
    const pageArray = Array.from(pagesToScan);
    
    for (let i = 0; i < pageArray.length; i += BATCH_SIZE) {
        const batch = pageArray.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (pageUrl) => {
            if (scannedPages.has(pageUrl)) return;
            scannedPages.add(pageUrl);

            const links = await fetchAndParse(pageUrl);
            for (const link of links) {
                if (isLikelyFile(link)) {
                    filesToDownload.add(link);
                }
            }
            scannedCount++;
        }));
        
        // Update status periodically
        chrome.runtime.sendMessage({ 
            action: 'update_status', 
            status: `Scanning level 1 pages (${scannedCount}/${totalPages})...`, 
            stats: { pagesScanned: 1 + scannedCount, filesFound: filesToDownload.size } 
        });
    }

    // Start Downloads
    chrome.runtime.sendMessage({ 
      action: 'update_status', 
      status: `Downloading ${filesToDownload.size} files...`, 
      stats: { pagesScanned: 1 + scannedCount, filesFound: filesToDownload.size } 
    });

    let downloadedCount = 0;
    for (const fileUrl of filesToDownload) {
      // Suggest a filename
      let filename = fileUrl.split('/').pop().split('#')[0].split('?')[0];
      if (!filename) filename = 'downloaded_file';
      
      // Basic sanitization
      filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

      try {
          chrome.downloads.download({
            url: fileUrl,
            filename: `deep_downloads/${filename}`,
            conflictAction: 'uniquify'
          });
      } catch (e) {
          console.error("Download failed for", fileUrl, e);
      }
      downloadedCount++;
    }

    chrome.runtime.sendMessage({ action: 'download_complete' });

  } catch (error) {
    console.error(error);
    chrome.runtime.sendMessage({ action: 'error', error: error.message });
  }
}
