// Popup UI logic
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('statusText');
const fileCount = document.getElementById('fileCount');
const pageCount = document.getElementById('pageCount');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

let isRunning = false;

// Update UI based on state
function updateUI(state) {
  isRunning = state.isRunning;
  fileCount.textContent = state.downloadedCount || 0;
  pageCount.textContent = state.pagesScanned || 0;
  statusText.textContent = state.status || 'Ready to scan';
  
  if (state.error) {
    statusText.innerHTML = `<span class="error">${state.error}</span>`;
  }
  
  startBtn.disabled = isRunning;
  stopBtn.classList.toggle('active', isRunning);
  progressBar.classList.toggle('active', isRunning);
  
  if (state.totalFiles > 0) {
    const percent = Math.round((state.downloadedCount / state.totalFiles) * 100);
    progressFill.style.width = `${percent}%`;
  }
}

// Get current state from background
async function refreshState() {
  const response = await chrome.runtime.sendMessage({ action: 'getState' });
  if (response) {
    updateUI(response);
  }
}

// Start downloading
startBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
    statusText.innerHTML = '<span class="error">Cannot scan this page</span>';
    return;
  }
  
  startBtn.disabled = true;
  statusText.textContent = 'Starting scan...';
  progressBar.classList.add('active');
  stopBtn.classList.add('active');
  
  chrome.runtime.sendMessage({ 
    action: 'start', 
    tabId: tab.id,
    url: tab.url 
  });
});

// Stop downloading
stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stop' });
  stopBtn.classList.remove('active');
  startBtn.disabled = false;
  statusText.textContent = 'Stopped';
  progressBar.classList.remove('active');
});

// Listen for state updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'stateUpdate') {
    updateUI(message.state);
  }
});

// Initial state
refreshState();
