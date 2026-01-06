document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const statusDiv = document.getElementById('status');
  const statsDiv = document.getElementById('stats');

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    statusDiv.textContent = 'Starting scan...';
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      statusDiv.textContent = 'Error: No active tab.';
      startBtn.disabled = false;
      return;
    }

    // Send message to background script to start the process
    chrome.runtime.sendMessage({ 
      action: 'start_download', 
      tabId: tab.id,
      url: tab.url 
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'update_status') {
      statusDiv.textContent = message.status;
      if (message.stats) {
        statsDiv.textContent = `Pages scanned: ${message.stats.pagesScanned}\nFiles found: ${message.stats.filesFound}`;
      }
    } else if (message.action === 'download_complete') {
      startBtn.disabled = false;
      statusDiv.textContent = 'Download complete!';
    } else if (message.action === 'error') {
      startBtn.disabled = false;
      statusDiv.textContent = `Error: ${message.error}`;
    }
  });
});
