/**
 * HaloGuard Chrome Extension - Popup Script
 * Handles UI interactions and settings management
 */

// Helper function to safely get DOM elements
function getElement<T extends HTMLElement>(id: string, type: string = 'HTMLElement'): T | null {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`[HaloGuard] Missing DOM element: ${id}`);
  }
  return element as T | null;
}

// DOM elements
const autoAnalyzeCheckbox = getElement<HTMLInputElement>('autoAnalyze');
const showBadgeCheckbox = getElement<HTMLInputElement>('showBadge');
const darkModeCheckbox = getElement<HTMLInputElement>('darkMode');
const thresholdSlider = getElement<HTMLInputElement>('threshold');
const thresholdValue = getElement<HTMLElement>('thresholdValue');
const backendUrlInput = getElement<HTMLInputElement>('backendUrl');
const saveBtn = getElement<HTMLButtonElement>('saveBtn');
const clearCacheBtn = getElement<HTMLButtonElement>('clearCacheBtn');
const openDocsBtn = getElement<HTMLButtonElement>('openDocsBtn');
const backendStatus = getElement<HTMLElement>('backend-status');
const backendIcon = getElement<HTMLElement>('backendIcon');
const backendText = getElement<HTMLElement>('backendText');
const notificationEl = getElement<HTMLElement>('notification');

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
      backendUrl: 'https://haloguard-production.up.railway.app',
    },
    (data) => {
      if (autoAnalyzeCheckbox) autoAnalyzeCheckbox.checked = data.autoAnalyze ?? true;
      if (showBadgeCheckbox) showBadgeCheckbox.checked = data.showBadge ?? true;
      if (thresholdSlider) thresholdSlider.value = data.threshold.toString();
      if (darkModeCheckbox) darkModeCheckbox.checked = data.darkMode ?? false;
      if (backendUrlInput) backendUrlInput.value = data.backendUrl || 'https://haloguard-production.up.railway.app';

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
    autoAnalyze: autoAnalyzeCheckbox?.checked ?? true,
    threshold: parseInt(thresholdSlider?.value ?? '50'),
    showBadge: showBadgeCheckbox?.checked ?? true,
    darkMode: darkModeCheckbox?.checked ?? false,
    backendUrl: backendUrlInput?.value || 'https://haloguard-production.up.railway.app',
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
  if (thresholdValue) {
    thresholdValue.textContent = `${value}%`;
  }
  // Update slider background color gradient
  if (thresholdSlider) {
    const percent = value;
    (thresholdSlider as any).style.background = `linear-gradient(to right, #2196F3 0%, #2196F3 ${percent}%, #ddd ${percent}%, #ddd 100%)`;
  }
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
    const url = urlRes.backendUrl || 'https://haloguard-production.up.railway.app';

    const response = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok && backendStatus && backendIcon && backendText) {
      const data = await response.json() as any;
      backendStatus.classList.remove('error');
      backendIcon.textContent = '✅';
      backendText.textContent = `Connected`;
      backendStatus.title = `Status: ${data.status || 'ok'}`;
    } else if (backendStatus && backendIcon && backendText) {
      backendStatus.classList.add('error');
      backendIcon.textContent = '❌';
      backendText.textContent = 'Backend unreachable';
    }
  } catch (error) {
    if (backendStatus && backendIcon && backendText) {
      backendStatus.classList.add('error');
      backendIcon.textContent = '⚠️';
      backendText.textContent = 'Backend connection failed';
      backendStatus.title = 'Make sure HaloGuard backend is running';
    }
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
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSettings);
  }

  // Threshold slider
  if (thresholdSlider) {
    thresholdSlider.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      updateThresholdDisplay(parseInt(value));
    });
  }

  // Clear cache button
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, (response) => {
        if (response.error) {
          showNotification('Failed to clear cache: ' + response.error, 'error');
        } else {
          showNotification('✓ Cache cleared!', 'success');
        }
      });
    });
  }

  // Open docs button
  if (openDocsBtn) {
    openDocsBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/haloguard/docs#readme' });
    });
  }

  // Dark mode toggle
  if (darkModeCheckbox) {
    darkModeCheckbox.addEventListener('change', () => {
      saveSettings();
    });
  }

  // Auto-analyze toggle
  if (autoAnalyzeCheckbox) {
    autoAnalyzeCheckbox.addEventListener('change', saveSettings);
  }

  // Show badge toggle
  if (showBadgeCheckbox) {
    showBadgeCheckbox.addEventListener('change', saveSettings);
  }

  // Backend URL input - save when blurred
  if (backendUrlInput) {
    backendUrlInput.addEventListener('blur', () => {
      if (backendUrlInput.value !== '') {
        saveSettings();
        // Recheck health with new URL
        setTimeout(checkBackendHealth, 500);
      }
    });
  }

  // Re-check backend health every 30 seconds
  setInterval(() => {
    checkBackendHealth();
  }, 30000);
}

// Auto-save settings when closing popup
window.addEventListener('beforeunload', saveSettings);
