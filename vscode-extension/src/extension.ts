import * as vscode from 'vscode';
import axios from 'axios';

/**
 * HaloGuard VS Code Extension
 * Real-time hallucination detection for GitHub Copilot Chat
 */

// Type definitions
interface DetectionIssue {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  confidence: number;
  message: string;
  evidence?: any;
  suggestions?: string[];
}

interface DetectionResult {
  requestId: string;
  processed: boolean;
  latency: number;
  issues: DetectionIssue[];
  overallScore: number;
  flagged: boolean;
}

interface ExtensionConfig {
  backendUrl: string;
  autoDetect: boolean;
  thresholdScore: number;
  showNotifications: boolean;
  colorScheme: 'light' | 'dark' | 'auto';
}

// Global state
let panel: vscode.WebviewPanel | undefined;
let statusBarItem: vscode.StatusBarItem;
let analysisHistory: DetectionResult[] = [];
let conversationHistory: Array<{ role: string; content: string }> = [];
let config: ExtensionConfig = {
  backendUrl: 'http://localhost:3000',
  autoDetect: true,
  thresholdScore: 0.5,
  showNotifications: true,
  colorScheme: 'auto',
};

export function activate(context: vscode.ExtensionContext) {
  console.log('HaloGuard VS Code extension activated');

  // Load configuration
  loadConfiguration();

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'haloguard.openSidebar';
  statusBarItem.text = '🛡️ HaloGuard';
  statusBarItem.tooltip = 'Click to open HaloGuard detection panel';
  statusBarItem.show();

  // Register commands
  const commands = [
    vscode.commands.registerCommand('haloguard.openSidebar', () => openSidebar(context)),
    vscode.commands.registerCommand('haloguard.analyzeSelection', () => analyzeSelection()),
    vscode.commands.registerCommand('haloguard.toggleAutoDetect', () => toggleAutoDetect()),
    vscode.commands.registerCommand('haloguard.clearHistory', () => clearHistory()),
    vscode.commands.registerCommand('haloguard.openSettings', () => openSettings()),
    vscode.commands.registerCommand('haloguard.checkHealth', () => checkBackendHealth()),
  ];

  context.subscriptions.push(statusBarItem, ...commands);

  // Listen to editor changes for auto-detection
  if (config.autoDetect) {
    const changeListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
      if (event.document.languageId === 'markdown' || event.document.languageId === 'plaintext') {
        // Auto-analyze on text change
        const text = event.document.getText();
        if (text.length > 50 && text.length < 5000) {
          advanceDetection(text);
        }
      }
    });
    context.subscriptions.push(changeListener);
  }

  // Monitor Copilot Chat messages (if available via API)
  monitorCopilotChat(context);
}

function loadConfiguration() {
  const vscodeConfig = vscode.workspace.getConfiguration('haloguard');
  config = {
    backendUrl: vscodeConfig.get('backendUrl') || 'http://localhost:3000',
    autoDetect: vscodeConfig.get('autoDetect') ?? true,
    thresholdScore: vscodeConfig.get('thresholdScore') ?? 0.5,
    showNotifications: vscodeConfig.get('showNotifications') ?? true,
    colorScheme: vscodeConfig.get('colorScheme') ?? 'auto',
  };
}

function openSidebar(context: vscode.ExtensionContext) {
  const column = vscode.ViewColumn.Beside;

  if (panel) {
    panel.reveal(column);
  } else {
    panel = vscode.window.createWebviewPanel('haloguard', 'HaloGuard', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    });

    panel.webview.html = getWebviewContent();

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'analyze':
          await analyzeMessage(message.content, 'user');
          break;
        case 'clearHistory':
          clearHistory();
          break;
        case 'checkHealth':
          await checkBackendHealth();
          break;
        case 'openSettings':
          await openSettings();
          break;
      }
    });

    panel.onDidDispose(() => {
      panel = undefined;
    });
  }
}

async function analyzeMessage(content: string, role: string = 'assistant'): Promise<void> {
  try {
    // Add to conversation history
    conversationHistory.push({ role, content });

    // Call backend API
    const response = await axios.post(`${config.backendUrl}/api/v1/analyze`, {
      content,
      model: 'copilot-chat',
      conversationHistory: conversationHistory.slice(-10), // Last 10 messages
      metadata: {
        platform: 'vscode',
        editor: vscode.window.activeTextEditor?.document.fileName,
      },
    }, {
      timeout: 5000,
    });

    const result: DetectionResult = response.data;
    analysisHistory.push(result);

    // Update UI
    if (panel) {
      panel.webview.postMessage({
        command: 'analysisResult',
        result,
      });
    }

    // Show notification if issues found
    if (config.showNotifications && result.flagged) {
      const severity = result.issues[0]?.severity || 'medium';
      const icon = severity === 'critical' ? '🚨' : severity === 'high' ? '⚠️' : 'ℹ️';
      const message = `${icon} HaloGuard: ${result.issues.length} issue(s) detected`;

      if (severity === 'critical' || severity === 'high') {
        vscode.window.showWarningMessage(message);
      } else {
        vscode.window.showInformationMessage(message);
      }
    }

    // Update status bar color
    updateStatusBar(result);

  } catch (error: any) {
    const errorMsg = error.response?.data?.detail || error.message;
    console.error('Analysis error:', errorMsg);
    vscode.window.showErrorMessage(`HaloGuard Error: ${errorMsg}`);
  }
}

async function advanceDetection(text: string): Promise<void> {
  // Advanced detection without user interaction
  // Triggered by text changes
  if (text.length > 100) {
    await analyzeMessage(text, 'system');
  }
}

async function analyzeSelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const selection = editor.selection;
  const text = editor.document.getText(selection) || editor.document.getText();

  if (!text) {
    vscode.window.showWarningMessage('No text selected');
    return;
  }

  openSidebar(vscode.extensions.getExtension('haloguard.haloguard-vscode')!.extensionUri as any);
  await analyzeMessage(text);
}

function toggleAutoDetect(): void {
  config.autoDetect = !config.autoDetect;
  const vscodeConfig = vscode.workspace.getConfiguration('haloguard');
  vscodeConfig.update('autoDetect', config.autoDetect, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`Auto-detection ${config.autoDetect ? 'enabled' : 'disabled'}`);
}

function clearHistory(): void {
  analysisHistory = [];
  conversationHistory = [];
  if (panel) {
    panel.webview.postMessage({ command: 'historyCleared' });
  }
}

async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', 'haloguard');
}

async function checkBackendHealth(): Promise<void> {
  try {
    const response = await axios.get(`${config.backendUrl}/health`, { timeout: 3000 });
    const status = response.data.status === 'healthy' ? '✅ Healthy' : '⚠️ Degraded';
    vscode.window.showInformationMessage(`HaloGuard Backend: ${status}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Cannot connect to HaloGuard backend at ${config.backendUrl}`);
  }
}

function updateStatusBar(result: DetectionResult): void {
  if (result.flagged) {
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    const count = result.issues.length;
    statusBarItem.text = `🛡️ HaloGuard (${count})`;
  } else {
    statusBarItem.backgroundColor = undefined;
    statusBarItem.text = '🛡️ HaloGuard';
  }
}

function monitorCopilotChat(context: vscode.ExtensionContext): void {
  // Monitor for Copilot Chat messages
  // This is a simplified approach - full integration would require VS Code API extensions
  
  const chatWatcher = vscode.workspace.createFileSystemWatcher('**/.copilot-chat/**');
  
  chatWatcher.onDidChange(async (uri) => {
    // When Copilot chat files change, analyze them
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const content = doc.getText();
      if (content && content.length > 20) {
        await analyzeMessage(content, 'copilot');
      }
    } catch (error) {
      // Ignore file access errors
    }
  });

  context.subscriptions.push(chatWatcher);
}

/**
 * Generate HTML content for the webview panel
 */
function getWebviewContent(): string {
  const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
  
  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>HaloGuard Detection Panel</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          padding: 16px;
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
          font-size: 13px;
          line-height: 1.5;
        }

        .container {
          max-width: 100%;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--vscode-widget-border);
        }

        .header h1 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }

        .controls {
          display: flex;
          gap: 8px;
        }

        button {
          padding: 6px 12px;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          border-radius: 2px;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.2s;
        }

        button:hover {
          background: var(--vscode-button-hoverBackground);
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .status {
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status.healthy {
          background: rgba(76, 175, 80, 0.1);
          border: 1px solid rgba(76, 175, 80, 0.3);
          color: #4CAF50;
        }

        .status.warning {
          background: rgba(255, 152, 0, 0.1);
          border: 1px solid rgba(255, 152, 0, 0.3);
          color: #FF9800;
        }

        .status.error {
          background: rgba(244, 67, 54, 0.1);
          border: 1px solid rgba(244, 67, 54, 0.3);
          color: #F44336;
        }

        .issues {
          margin-top: 16px;
        }

        .issue {
          padding: 12px;
          margin-bottom: 8px;
          background: var(--vscode-editor-lineHighlightBackground);
          border-left: 3px solid #FF9800;
          border-radius: 2px;
        }

        .issue.critical {
          border-left-color: #F44336;
        }

        .issue.high {
          border-left-color: #FF5722;
        }

        .issue.medium {
          border-left-color: #FF9800;
        }

        .issue.low {
          border-left-color: #2196F3;
        }

        .issue-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 6px;
        }

        .issue-type {
          font-weight: 600;
          font-size: 13px;
        }

        .issue-score {
          font-size: 11px;
          color: var(--vscode-descriptionForeground);
        }

        .issue-message {
          font-size: 12px;
          color: var(--vscode-foreground);
          margin-bottom: 6px;
        }

        .issue-suggestions {
          font-size: 11px;
          color: var(--vscode-descriptionForeground);
          margin-top: 6px;
          padding-left: 12px;
        }

        .issue-suggestions li {
          margin-bottom: 3px;
          list-style-position: inside;
        }

        .empty-state {
          text-align: center;
          padding: 32px 16px;
          color: var(--vscode-descriptionForeground);
        }

        .icon {
          font-size: 24px;
          margin-bottom: 8px;
        }

        .progress-bar {
          width: 100%;
          height: 4px;
          background: var(--vscode-editor-background);
          border-radius: 2px;
          overflow: hidden;
          margin-top: 8px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #4CAF50, #FFC107, #F44336);
          width: 0%;
          animation: fillProgress 0.3s ease-in-out;
        }

        @keyframes fillProgress {
          from { width: 0%; }
          to { width: var(--progress-width); }
        }

        .score-bar {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .score-bar-visual {
          width: 60px;
          height: 6px;
          background: var(--vscode-progressBar-background);
          border-radius: 2px;
          overflow: hidden;
        }

        .score-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #4CAF50, #FFC107, #F44336);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🛡️ HaloGuard</h1>
          <div class="controls">
            <button id="analyzeBtn" title="Analyze current text">Analyze</button>
            <button id="clearBtn" title="Clear history">Clear</button>
            <button id="settingsBtn" title="Open settings">⚙️</button>
          </div>
        </div>

        <div id="status" class="status healthy" style="display: none;">
          <span id="statusText">Ready</span>
        </div>

        <div id="issues" class="issues"></div>

        <div class="empty-state" id="emptyState">
          <div class="icon">🔍</div>
          <p>Paste or type text to detect hallucinations</p>
          <p style="font-size: 11px; margin-top: 8px; color: var(--vscode-descriptionForeground);">
            Analysis will run automatically as you type
          </p>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('analyzeBtn')?.addEventListener('click', () => {
          vscode.postMessage({ command: 'analyze', content: document.activeElement?.textContent || '' });
        });

        document.getElementById('clearBtn')?.addEventListener('click', () => {
          vscode.postMessage({ command: 'clearHistory' });
        });

        document.getElementById('settingsBtn')?.addEventListener('click', () => {
          vscode.postMessage({ command: 'openSettings' });
        });

        window.addEventListener('message', event => {
          const message = event.data;
          const issuesContainer = document.getElementById('issues');
          const emptyState = document.getElementById('emptyState');

          if (message.command === 'analysisResult') {
            const result = message.result;
            emptyState.style.display = 'none';

            if (result.flagged && result.issues.length > 0) {
              issuesContainer.innerHTML = result.issues
                .map(issue => \`
                  <div class="issue \${issue.severity}">
                    <div class="issue-header">
                      <span class="issue-type">\${issue.type.toUpperCase()}</span>
                      <span class="issue-score">Score: \${(issue.score * 100).toFixed(0)}%</span>
                    </div>
                    <div class="issue-message">\${issue.message}</div>
                    \${issue.suggestions ? \`<ul class="issue-suggestions">\${issue.suggestions.map(s => \`<li>\${s}</li>\`).join('')}</ul>\` : ''}
                  </div>
                \`).join('');
            } else {
              issuesContainer.innerHTML = '<div class="empty-state"><div class="icon">✅</div><p>No issues detected</p></div>';
            }

            const status = document.getElementById('status');
            status.style.display = 'flex';
            status.className = 'status ' + (result.flagged ? 'error' : 'healthy');
            status.querySelector('#statusText').textContent = \`Analysis complete in \${result.latency}ms\`;
          } else if (message.command === 'historyCleared') {
            issuesContainer.innerHTML = '';
            emptyState.style.display = 'block';
          }
        });
      </script>
    </body>
    </html>`;
}

export function deactivate() {
  // Cleanup
  if (panel) {
    panel.dispose();
  }
}
    console.error('Analysis error:', error);
    return null;
  }
}

function toggleDetection() {
  const config = vscode.workspace.getConfiguration('haloguard');
  const enabled = config.get<boolean>('enabled') ?? true;
  config.update('enabled', !enabled, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`HaloGuard detection ${enabled ? 'disabled' : 'enabled'}`);
}

function getWebviewContent(): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 16px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
          }
          h1 {
            margin-top: 0;
            font-size: 18px;
          }
          .status {
            padding: 8px;
            border-radius: 4px;
            margin-bottom: 16px;
          }
          .status.healthy {
            background: var(--vscode-terminal-ansiGreen);
            color: black;
          }
          .status.error {
            background: var(--vscode-terminal-ansiRed);
            color: white;
          }
          .issues {
            margin-top: 16px;
          }
        </style>
      </head>
      <body>
        <h1>🛡️ HaloGuard</h1>
        <div id="status" class="status healthy">
          <strong>Initializing...</strong>
        </div>
        <div id="issues" class="issues">
          <p>Waiting for Copilot Chat messages...</p>
        </div>
        <script>
          console.log('Sidebar loaded');
        </script>
      </body>
    </html>
  `;
}

export function deactivate() {
  if (client) {
    client.disconnect();
  }
}
