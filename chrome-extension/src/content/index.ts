/**
 * HaloGuard - Content Script
 * Main entry point for content-side logic
 */

import { FetchInterceptor } from './interceptor';
import { ResultsOverlay } from './overlay';
import { PlatformDetector } from '../utils/platform';
import { Logger } from '../utils/logger';
import { StorageManager } from '../utils/storage';
import { HaloGuardAPI } from '../utils/api';

class ContentScriptManager {
  private overlay: ResultsOverlay | null = null;
  private api = new HaloGuardAPI();
  private storage = new StorageManager();

  async init(): Promise<void> {
    // Check if we're on a supported platform
    const platform = PlatformDetector.detect();
    if (!platform) {
      Logger.debug('Unsupported platform, skipping initialization');
      return;
    }

    Logger.info(`Starting on ${platform.name}`);

    // Get settings
    const settings = await this.storage.getSettings();
    if (!settings.enabled) {
      Logger.info('HaloGuard disabled in settings');
      return;
    }

    // Initialize components
    FetchInterceptor.init();
    this.overlay = new ResultsOverlay();

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener(
      this.handleMessage.bind(this)
    );

    Logger.success(`Content script ready for ${platform.name}`);
  }

  /**
   * Handle messages from background/popup
   */
  private async handleMessage(
    message: any,
    sender: any,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      const { type, payload } = message;

      switch (type) {
        case 'SHOW_RESULTS':
          this.overlay?.show(payload);
          sendResponse({ success: true });
          break;

        case 'HIDE_RESULTS':
          this.overlay?.hide();
          sendResponse({ success: true });
          break;

        case 'PING':
          sendResponse({ pong: true });
          break;

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      Logger.error(`Message handling error: ${error}`);
      sendResponse({ error: String(error) });
    }
  }
}

// Initialize on document load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ContentScriptManager().init();
  });
} else {
  new ContentScriptManager().init();
}
