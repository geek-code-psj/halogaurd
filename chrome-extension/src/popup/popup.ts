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
      backendUrl: 'http://localhost:3000',
      autoAnalyze: true,
      threshold: 50,
      showBadge: true,
      darkMode: false,
    },
    (data) => {
      backendUrlInput.value = data.backendUrl || '';
      autoAnalyzeCheckbox.checked = data.autoAnalyze ?? true;
      showBadgeCheckbox.checked = data.showBadge ?? true;
      thresholdSlider.value = data.threshold.toString();
      darkModeCheckbox.checked = data.darkMode ?? false;

      updateThresholdDisplay(data.threshold);

      // Apply dark mode
      if (data.darkMode) {
        document.body.classList.add('dark-mode');
      }
    }
  );
}

/**
 * Save settings to Chrome storage
 */
function saveSettings(): void {
  const settings = {
    backendUrl: backendUrlInput.value || 'http://localhost:3000',
    autoAnalyze: autoAnalyzeCheckbox.checked,
    threshold: parseInt(thresholdSlider.value),
    showBadge: showBadgeCheckbox.checked,
    darkMode: darkModeCheckbox.checked,
  };

  chrome.storage.sync.set(settings, () => {
    showNotification('Settings saved!', 'success');

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
    const urlRes = await chrome.storage.sync.get('backendUrl');
    const url = urlRes.backendUrl || 'http://localhost:3000';

    const response = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      const data = await response.json();
      backendStatus.classList.remove('error');
      backendIcon.textContent = '✅';
      backendText.textContent = `Connected (${data.uptime?.toFixed(1)}s uptime)`;
      backendStatus.title = `Status: ${data.status}`;
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
 * Show notification
 */
function showNotification(message: string, type: 'success' | 'error' = 'success'): void {
  // Could implement a toast notification here
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
      if (response.success) {
        showNotification('Cache cleared!', 'success');
      }
    });
  });

  // Open docs button
  openDocsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/yourusername/haloguard#readme' });
  });

  // Dark mode toggle
  darkModeCheckbox.addEventListener('change', () => {
    saveSettings();
  });

  // Auto-analyze toggle
  autoAnalyzeCheckbox.addEventListener('change', saveSettings);

  // Show badge toggle
  showBadgeCheckbox.addEventListener('change', saveSettings);

  // Backend URL input
  backendUrlInput.addEventListener('blur', () => {
    if (backendUrlInput.value !== '') {
      saveSettings();
      checkBackendHealth();
    }
  });

  // Re-check backend health every 30 seconds
  setInterval(() => {
    checkBackendHealth();
  }, 30000);
}

// Auto-save settings when closing popup
window.addEventListener('beforeunload', saveSettings);
