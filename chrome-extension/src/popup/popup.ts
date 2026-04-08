/**
 * HaloGuard Chrome Extension - Popup Script
 * Handles UI interactions and settings management
 */

// DOM elements
const autoAnalyzeCheckbox = document.getElementById('autoAnalyze') as HTMLInputElement;
const showBadgeCheckbox = document.getElementById('showBadge') as HTMLInputElement;
const darkModeCheckbox = document.getElementById('darkMode') as HTMLInputElement;
const thresholdSlider = document.getElementById('threshold') as HTMLInputElement;
const thresholdValue = document.getElementById('thresholdValue') as HTMLElement;
const backendUrlInput = document.getElementById('backendUrl') as HTMLInputElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const clearCacheBtn = document.getElementById('clearCacheBtn') as HTMLButtonElement;
const openDocsBtn = document.getElementById('openDocsBtn') as HTMLButtonElement;
const backendStatus = document.getElementById('backend-status') as HTMLElement;
const backendIcon = document.getElementById('backendIcon') as HTMLElement;
const backendText = document.getElementById('backendText') as HTMLElement;
const notificationEl = document.getElementById('notification') as HTMLElement;

// Load settings on popup open
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  checkBackendHealth();
  setupEventListeners();
});

/**
 * Load settings from Chrome storage
 */
function loadSettings(): void {
  chrome.storage.sync.get(
    {
      autoAnalyze: true,
      threshold: 50,
      showBadge: true,
      darkMode: false,
      backendUrl: 'https://halogaurd-production.up.railway.app',
    },
    (data) => {
      autoAnalyzeCheckbox.checked = data.autoAnalyze ?? true;
      showBadgeCheckbox.checked = data.showBadge ?? true;
      thresholdSlider.value = data.threshold.toString();
      darkModeCheckbox.checked = data.darkMode ?? false;
      backendUrlInput.value = data.backendUrl || 'https://halogaurd-production.up.railway.app';

      updateThresholdDisplay(data.threshold);

      console.log('[HaloGuard] Settings loaded:', data);

      // Apply dark mode
      if (data.darkMode) {
        document.body.classList.add('dark-mode');
      }
    }
  );
}

/**
 * Save settings to Chrome storage AND notify service worker
 */
function saveSettings(): void {
  const settings = {
    autoAnalyze: autoAnalyzeCheckbox.checked,
    threshold: parseInt(thresholdSlider.value),
    showBadge: showBadgeCheckbox.checked,
    darkMode: darkModeCheckbox.checked,
    backendUrl: backendUrlInput.value || 'https://halogaurd-production.up.railway.app',
  };

  // Save to chrome storage
  chrome.storage.sync.set(settings, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to save settings:', chrome.runtime.lastError);
      showNotification('Failed to save settings', 'error');
      return;
    }
    
    console.log('[HaloGuard] Settings saved:', settings);
    
    // Notify service worker of new settings
    chrome.runtime.sendMessage(
      { 
        type: 'SAVE_SETTINGS', 
        payload: settings 
      }, 
      (response) => {
        if (response?.error) {
          showNotification('Backend error: ' + response.error, 'error');
          return;
        }
        showNotification('✓ Settings saved!', 'success');
      }
    );

    // Apply dark mode immediately
    if (settings.darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  });
}

/**
 * Update threshold display
 */
function updateThresholdDisplay(value: number): void {
  thresholdValue.textContent = `${value}%`;
  // Update slider background color gradient
  const percent = value;
  (thresholdSlider as any).style.background = `linear-gradient(to right, #2196F3 0%, #2196F3 ${percent}%, #ddd ${percent}%, #ddd 100%)`;
}

/**
 * Check backend health
 */
async function checkBackendHealth(): Promise<void> {
  try {
    // Get backend URL from storage
    const urlRes = await new Promise<any>((resolve) => {
      chrome.storage.sync.get('backendUrl', resolve);
    });
    const url = urlRes.backendUrl || 'https://halogaurd-production.up.railway.app';

    const response = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      const data = await response.json() as any;
      backendStatus.classList.remove('error');
      backendIcon.textContent = '✅';
      backendText.textContent = `Connected`;
      backendStatus.title = `Status: ${data.status || 'ok'}`;
    } else {
      backendStatus.classList.add('error');
      backendIcon.textContent = '❌';
      backendText.textContent = 'Backend unreachable';
    }
  } catch (error) {
    backendStatus.classList.add('error');
    backendIcon.textContent = '⚠️';
    backendText.textContent = 'Backend connection failed';
    backendStatus.title = 'Make sure HaloGuard backend is running';
  }
}

/**
 * Show notification toast
 */
function showNotification(message: string, type: 'success' | 'error' = 'success'): void {
  if (!notificationEl) return;
  
  notificationEl.textContent = message;
  notificationEl.className = `notification ${type}`;
  notificationEl.style.display = 'block';
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    notificationEl.style.display = 'none';
  }, 3000);
  
  console.log(`[Notification] ${type}: ${message}`);
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  // Save button
  saveBtn.addEventListener('click', saveSettings);

  // Threshold slider
  thresholdSlider.addEventListener('input', (e) => {
    const value = (e.target as HTMLInputElement).value;
    updateThresholdDisplay(parseInt(value));
  });

  // Clear cache button
  clearCacheBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, (response) => {
      if (response.error) {
        showNotification('Failed to clear cache: ' + response.error, 'error');
      } else {
        showNotification('✓ Cache cleared!', 'success');
      }
    });
  });

  // Open docs button
  openDocsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/haloguard/docs#readme' });
  });

  // Dark mode toggle
  darkModeCheckbox.addEventListener('change', () => {
    saveSettings();
  });

  // Auto-analyze toggle
  autoAnalyzeCheckbox.addEventListener('change', saveSettings);

  // Show badge toggle
  showBadgeCheckbox.addEventListener('change', saveSettings);

  // Backend URL input - save when blurred
  backendUrlInput.addEventListener('blur', () => {
    if (backendUrlInput.value !== '') {
      saveSettings();
      // Recheck health with new URL
      setTimeout(checkBackendHealth, 500);
    }
  });

  // Re-check backend health every 30 seconds
  setInterval(() => {
    checkBackendHealth();
  }, 30000);
}

// Auto-save settings when closing popup
window.addEventListener('beforeunload', saveSettings);
