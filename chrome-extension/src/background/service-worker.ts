/**
 * HaloGuard - Service Worker
 * Manages backend communication, authentication, and caching
 */

const DEFAULT_API_URL = 'https://halogaurd-production.up.railway.app';

class ServiceWorkerManager {
  private apiUrl: string = DEFAULT_API_URL;
  private authToken: string | null = null;
  private session: any = null;

  async init(): Promise<void> {
    console.log('[HaloGuard] Service Worker initializing...');
    
    // Load backend URL from storage
    this.loadBackendUrl();
    
    // Initialize authentication
    await this.ensureAuthenticated();
    
    // Setup message listeners
    chrome.runtime.onMessage.addListener((msg, sender, reply) => this.onMessage(msg, sender, reply));
    
    // Setup keep-alive
    this.setupKeepAlive();
    
    console.log('[HaloGuard] Service Worker ready');
  }

  /**
   * Load backend URL from chrome storage
   */
  private loadBackendUrl(): void {
    chrome.storage.sync.get({ backendUrl: DEFAULT_API_URL }, (data) => {
      this.apiUrl = data.backendUrl || DEFAULT_API_URL;
      console.log('[HaloGuard] Backend URL set to:', this.apiUrl);
    });
  }

  /**
   * Ensure we have a valid auth token (optional - continue without if it fails)
   */
  private async ensureAuthenticated(): Promise<void> {
    try {
      // Check if we have a cached token
      const data = await new Promise<any>((resolve) => {
        chrome.storage.local.get({ authToken: null }, resolve);
      });

      if (data?.authToken) {
        this.authToken = data.authToken;
        console.log('[HaloGuard] Using cached auth token');
        return;
      }

      // Try to get new token from backend
      await this.getAuthToken();
    } catch (error) {
      // Auth is optional - log warning but don't fail
      console.warn('[HaloGuard] Auth token initialization skipped:', error);
      // Set a dummy token to allow requests to continue
      this.authToken = 'guest-' + Date.now();
    }
  }

  /**
   * Get auth token from backend
   */
  private async getAuthToken(): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v1/auth/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Auth failed: ${response.status}`);
      }

      const data = await response.json();
      this.authToken = data.token;

      // Cache token
      chrome.storage.local.set({ authToken: data.token });
      console.log('[HaloGuard] Got new auth token');
    } catch (error) {
      console.error('[HaloGuard] Failed to get auth token:', error);
      throw error;
    }
  }

  /**
   * Handle incoming messages from content scripts and popup
   */
  private onMessage(msg: any, sender: any, reply: any): void {
    const { type, payload } = msg;
    
    try {
      switch (type) {
        case 'ANALYZE_CONTENT':
          this.analyze(payload, sender.tab?.id || 0).then(reply).catch((e: any) => reply({ error: String(e) }));
          break;
        
        case 'HEALTH_CHECK':
          this.health().then(reply).catch((e: any) => reply({ error: String(e) }));
          break;
        
        case 'CLEAR_CACHE':
          this.clearCache().then(reply).catch((e: any) => reply({ error: String(e) }));
          break;
        
        case 'SAVE_SETTINGS':
          this.saveSettings(payload).then(reply).catch((e: any) => reply({ error: String(e) }));
          break;
        
        default:
          reply({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[HaloGuard] Message handler error:', error);
      reply({ error: String(error) });
    }
  }

  /**
   * Analyze content via backend
   */
  private async analyze(req: any, tabId: number): Promise<any> {
    try {
      // Ensure authenticated
      if (!this.authToken) {
        await this.ensureAuthenticated();
      }

      const response = await fetch(`${this.apiUrl}/api/v1/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Send results to content script
      chrome.tabs.sendMessage(tabId, { 
        type: 'SHOW_RESULTS', 
        payload: data 
      }).catch(() => {
        console.warn('[HaloGuard] Could not send results to tab');
      });

      return { success: true, data };
    } catch (error) {
      console.error('[HaloGuard] Analysis error:', error);
      throw error;
    }
  }

  /**
   * Check backend health
   */
  private async health(): Promise<any> {
    try {
      const response = await fetch(`${this.apiUrl}/health`, { 
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      return { 
        healthy: response.ok,
        status: response.status
      };
    } catch (error) {
      return { 
        healthy: false, 
        error: String(error) 
      };
    }
  }

  /**
   * Clear cache
   */
  private async clearCache(): Promise<any> {
    try {
      return new Promise((resolve) => {
        chrome.storage.local.clear(() => {
          console.log('[HaloGuard] Cache cleared');
          resolve({ success: true, message: 'Cache cleared' });
        });
      }).catch((error: any) => {
        console.error('[HaloGuard] Cache clear error:', error);
        throw error;
      }).finally(() => {
        // Clear auth token to force new login
        this.authToken = null;
      });
    } catch (error) {
      console.error('[HaloGuard] Clear cache error:', error);
      throw error;
    }
  }

  /**
   * Save settings
   */
  private async saveSettings(settings: any): Promise<any> {
    try {
      // Update backend URL if provided
      if (settings.backendUrl) {
        this.apiUrl = settings.backendUrl;
        chrome.storage.sync.set({ backendUrl: settings.backendUrl });
        
        // Refresh auth token with new backend
        this.authToken = null;
        await this.ensureAuthenticated();
      }

      // Save other settings
      chrome.storage.sync.set({
        autoAnalyze: settings.autoAnalyze,
        threshold: settings.threshold,
        showBadge: settings.showBadge,
        darkMode: settings.darkMode,
      });

      console.log('[HaloGuard] Settings saved');
      return { success: true, message: 'Settings saved' };
    } catch (error) {
      console.error('[HaloGuard] Save settings error:', error);
      throw error;
    }
  }

  /**
   * Setup periodic keep-alive
   */
  private setupKeepAlive(): void {
    // Check if chrome.alarms is available
    if (!chrome.alarms) {
      console.warn('[HaloGuard] chrome.alarms not available, skipping keep-alive');
      return;
    }

    try {
      chrome.alarms.create('haloguard_keepalive', { periodInMinutes: 1 });
      
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'haloguard_keepalive') {
          // Periodic health check
          this.health().then((result) => {
            console.log('[HaloGuard] Keep-alive health check:', result);
          });

          // Re-auth refresh
          chrome.storage.local.get({ keepaliveCount: 0 }, (data) => {
            const count = (data.keepaliveCount || 0) + 1;
            chrome.storage.local.set({ keepaliveCount: count });

            // Refresh token every 12 hours
            if (count % 720 === 0) {
              console.log('[HaloGuard] Refreshing auth token...');
              this.authToken = null;
              this.ensureAuthenticated();
            }
          });
        }
      });
    } catch (error) {
      console.warn('[HaloGuard] Failed to setup keep-alive:', error);
    }
  }
}

const manager = new ServiceWorkerManager();
manager.init();
