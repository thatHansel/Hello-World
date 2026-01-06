// Background service worker - handles coordination and downloads

const MAX_FILES = 500;
const DOCUMENT_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.rtf', '.odt', '.ods', '.odp', '.csv'
];

let state = {
  isRunning: false,
  status: 'Ready to scan',
  downloadedCount: 0,
  pagesScanned: 0,
  totalFiles: 0,
  error: null
};

let downloadedUrls = new Set();
let pendingDownloads = [];
let baseDomain = '';
let stopRequested = false;

// Reset state for new scan
function resetState() {
  state = {
    isRunning: false,
    status: 'Ready to scan',
    downloadedCount: 0,
    pagesScanned: 0,
    totalFiles: 0,
    error: null
  };
  downloadedUrls = new Set();
  pendingDownloads = [];
  baseDomain = '';
  stopRequested = false;
}

// Broadcast state to popup
function broadcastState() {
  chrome.runtime.sendMessage({ action: 'stateUpdate', state }).catch(() => {
    // Popup might be closed, ignore error
  });
}

// Update status and broadcast
function updateStatus(status) {
  state.status = status;
  broadcastState();
}

// Extract domain from URL
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Check if URL is on the same domain
function isSameDomain(url) {
  const domain = getDomain(url);
  return domain && domain === baseDomain;
}

// Check if URL points to a document
function isDocumentUrl(url) {
  const lower = url.toLowerCase();
  return DOCUMENT_EXTENSIONS.some(ext => lower.includes(ext));
}

// Check if URL is a webpage (for following links)
function isWebpageUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    // Skip obvious non-pages
    if (isDocumentUrl(url)) return false;
    if (pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot|mp3|mp4|wav|avi|mov)$/i)) return false;
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

// Generate filename from URL
function getFilename(url) {
  try {
    const urlObj = new URL(url);
    let filename = urlObj.pathname.split('/').pop() || 'document';
    
    // Remove query params from filename
    filename = filename.split('?')[0];
    
    // If no extension, try to detect from URL
    if (!DOCUMENT_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext))) {
      if (url.toLowerCase().includes('.pdf')) filename += '.pdf';
      else filename += '.pdf'; // Default to PDF
    }
    
    return filename;
  } catch {
    return 'document.pdf';
  }
}

// Download a single file
async function downloadFile(url) {
  if (stopRequested || state.downloadedCount >= MAX_FILES) return false;
  if (downloadedUrls.has(url)) return false;
  
  downloadedUrls.add(url);
  
  try {
    const filename = getFilename(url);
    await chrome.downloads.download({
      url: url,
      filename: `downloaded-documents/${filename}`,
      conflictAction: 'uniquify'
    });
    
    state.downloadedCount++;
    broadcastState();
    return true;
  } catch (error) {
    console.error('Download failed:', url, error);
    return false;
  }
}

// Inject content script and get links from a page
async function scanPage(tabId, url) {
  if (stopRequested) return { documents: [], pages: [] };
  
  try {
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    
    // Small delay for script to load
    await new Promise(r => setTimeout(r, 100));
    
    // Get links from the page
    const results = await chrome.tabs.sendMessage(tabId, { 
      action: 'getLinks',
      baseDomain: baseDomain
    });
    
    return results || { documents: [], pages: [] };
  } catch (error) {
    console.error('Failed to scan page:', url, error);
    return { documents: [], pages: [] };
  }
}

// Fetch and scan a linked page
async function scanLinkedPage(url) {
  if (stopRequested) return [];
  
  try {
    // Create a new tab to scan (in background)
    const tab = await chrome.tabs.create({ url, active: false });
    
    // Wait for page to load
    await new Promise((resolve) => {
      const listener = (tabId, info) => {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      
      // Timeout after 15 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 15000);
    });
    
    // Scan for documents
    const results = await scanPage(tab.id, url);
    
    // Close the tab
    await chrome.tabs.remove(tab.id).catch(() => {});
    
    return results.documents || [];
  } catch (error) {
    console.error('Failed to scan linked page:', url, error);
    return [];
  }
}

// Main scanning process
async function startScanning(tabId, startUrl) {
  resetState();
  state.isRunning = true;
  baseDomain = getDomain(startUrl);
  
  if (!baseDomain) {
    state.error = 'Invalid URL';
    state.isRunning = false;
    broadcastState();
    return;
  }
  
  updateStatus('Scanning current page...');
  
  try {
    // Scan the starting page
    const mainPageResults = await scanPage(tabId, startUrl);
    state.pagesScanned = 1;
    
    const allDocuments = new Set(mainPageResults.documents || []);
    const pagesToScan = (mainPageResults.pages || []).filter(url => isSameDomain(url));
    
    updateStatus(`Found ${allDocuments.size} documents, ${pagesToScan.length} pages to scan...`);
    
    // Scan linked pages (one level deep)
    for (let i = 0; i < pagesToScan.length && !stopRequested; i++) {
      const pageUrl = pagesToScan[i];
      updateStatus(`Scanning page ${i + 1}/${pagesToScan.length}...`);
      
      const linkedDocs = await scanLinkedPage(pageUrl);
      linkedDocs.forEach(doc => allDocuments.add(doc));
      
      state.pagesScanned++;
      broadcastState();
      
      // Check file limit
      if (allDocuments.size >= MAX_FILES) {
        updateStatus('Reached file limit during scan');
        break;
      }
    }
    
    if (stopRequested) {
      updateStatus('Stopped');
      state.isRunning = false;
      broadcastState();
      return;
    }
    
    // Filter to same domain and limit
    const documentsToDownload = Array.from(allDocuments)
      .filter(url => isSameDomain(url))
      .slice(0, MAX_FILES);
    
    state.totalFiles = documentsToDownload.length;
    updateStatus(`Downloading ${documentsToDownload.length} documents...`);
    
    // Download all documents
    for (const docUrl of documentsToDownload) {
      if (stopRequested) break;
      await downloadFile(docUrl);
      
      // Small delay between downloads to avoid overwhelming
      await new Promise(r => setTimeout(r, 100));
    }
    
    state.isRunning = false;
    if (!stopRequested) {
      updateStatus(`Complete! Downloaded ${state.downloadedCount} files`);
    } else {
      updateStatus(`Stopped. Downloaded ${state.downloadedCount} files`);
    }
  } catch (error) {
    state.error = error.message;
    state.isRunning = false;
    updateStatus('Error: ' + error.message);
  }
  
  broadcastState();
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start') {
    startScanning(message.tabId, message.url);
    sendResponse({ started: true });
  } else if (message.action === 'stop') {
    stopRequested = true;
    state.isRunning = false;
    updateStatus('Stopping...');
    sendResponse({ stopped: true });
  } else if (message.action === 'getState') {
    sendResponse(state);
  }
  return true;
});
