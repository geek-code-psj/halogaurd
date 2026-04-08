# Phase 2: VS Code Extension - Detailed Implementation Plan

**Duration**: Apr 26 - May 5 (10 days)  
**Deadline**: May 5 (submit to Marketplace)  
**Goal**: Build and test fully functional VS Code extension with sidebar analysis panel

---

## 📦 Deliverables

### ✅ Must Have (MVP)
- [ ] Extension.ts entry point with activation events
- [ ] Sidebar WebView panel with detection results
- [ ] Commands: "Analyze Selection", "Show Settings"
- [ ] Settings configuration (API endpoint, theme)
- [ ] Hover tooltip for quick analysis
- [ ] Local testing working on VS Code
- [ ] Submit to VS Code Marketplace

### 🟡 Nice to Have (Post-MVP)
- [ ] Terminal CLI mode
- [ ] Keyboard shortcuts (Ctrl+Alt+A)
- [ ] Batch analysis UI
- [ ] Result export (CSV/JSON)
- [ ] Dark mode theme

---

## 🏗️ Architecture & Components

### Component Architecture
```
┌──────────────────────────────────────────────────┐
│ VS Code Editor                                   │
├──────────────────────────────────────────────────┤
│ ┌────────────────┐    ┌───────────────────────┐ │
│ │ Sidebar Panel  │    │ Code Editor           │ │
│ │ (WebView)      │    │ - Selection to analyze│ │
│ │                │    │ - Hover tooltip       │ │
│ │ • Results      │    │ - Context menu        │ │
│ │ • Score        │    │                       │ │
│ │ • Issues list  │    │                       │ │
│ └────────────────┘    └───────────────────────┘ │
└──────────┬───────────────────────────────────────┘
           │
    ┌──────┴──────┐
    │ Extension   │ VS Code API
    │ Consumer    │
    └──────┬──────┘
           │
    ┌──────┴──────────────┐
    │ HaloGuard Backend   │ HTTP/WebSocket
    │ API                 │
    └─────────────────────┘
```

### File Structure
```
vscode-extension/
├── src/
│   ├── extension.ts              # Main entry point
│   ├── webview/
│   │   ├── ResultsPanel.tsx      # React component for sidebar
│   │   ├── ResultsPanel.css
│   │   ├── app.tsx              # WebView app
│   │   └── index.html           # WebView template
│   ├── providers/
│   │   ├── HoverProvider.ts      # Hover tooltip logic
│   │   └── CodeLensProvider.ts   # Code lens (optional)
│   ├── commands/
│   │   ├── analyze.ts           # Analyze selection command
│   │   ├── settings.ts          # Settings command
│   │   └── index.ts             # Command registry
│   ├── utils/
│   │   ├── api.ts               # Backend communication
│   │   ├── storage.ts           # VS Code storage
│   │   ├── logger.ts            # Logging
│   │   └── constants.ts         # Config
│   └── types/
│       └── index.ts             # TypeScript interfaces
├── public/
│   ├── icon.png                 # Extension icon
│   └── screenshot.png           # Marketplace screenshot
├── package.json
├── tsconfig.json
└── webpack.config.js
```

---

## 🔧 Implementation Steps (Day by Day)

### Day 1 - Apr 26: PROJECT SETUP
**Tasks**:
- [ ] Create vscode-extension folder structure
- [ ] Initialize package.json with VS Code dependencies
- [ ] Setup TypeScript (tsconfig.json)
- [ ] Configure webpack/Vite build system
- [ ] Create package.json activation events

**Dependencies**:
```json
{
  "vscode": "^1.85.0",
  "@vscode/webview-ui-toolkit": "^1.3.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0"
}
```

**Key Files**:
- [ ] package.json with vscode engine
- [ ] tsconfig.json
- [ ] webpack.config.js
- [ ] .vscodeignore (files to exclude)

**package.json Activation**:
```json
"activationEvents": [
  "onLanguage:javascript",
  "onLanguage:typescript",
  "onLanguage:python",
  "onCommand:haloguard.analyze"
],
"main": "./dist/extension.js",
"contributes": {
  "commands": [
    {
      "command": "haloguard.analyze",
      "title": "HaloGuard: Analyze Selection"
    }
  ]
}
```

---

### Day 2 - Apr 27: CORE EXTENSION ENTRY POINT
**Tasks**:
- [ ] Create src/extension.ts
- [ ] Setup activation handler
- [ ] Register sidebar view container
- [ ] Setup command handlers
- [ ] Initialize WebView panel

**extension.ts Structure**:
```typescript
export async function activate(context: vscode.ExtensionContext) {
  console.log('HaloGuard extension activated');

  // Register sidebar panel
  const provider = new ResultsPanelProvider(context);
  vscode.window.registerWebviewViewProvider(
    ResultsPanelProvider.viewType,
    provider
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('haloguard.analyze', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      
      const selection = editor.document.getText(editor.selection);
      await analyzeSelection(selection);
    })
  );

  // Register hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file' },
      new HoverProvider()
    )
  );
}

export function deactivate() {}
```

---

### Day 3 - Apr 28: WEBVIEW PANEL & REACT APP
**Tasks**:
- [ ] Create ResultsPanel.tsx (React component)
- [ ] Create WebView HTML entry point
- [ ] Setup React + styling
- [ ] Display analysis results
- [ ] Add interactive elements

**ResultsPanel.tsx**:
```typescript
import React, { useState, useEffect } from 'react';
import { AnalysisResult } from '../types';

export const ResultsPanel: React.FC = () => {
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Listen for messages from extension
    window.addEventListener('message', (event) => {
      if (event.data.type === 'analysis') {
        setResults(event.data.payload);
        setLoading(false);
      }
    });
  }, []);

  const handleAnalyze = () => {
    setLoading(true);
    // Send message to extension to analyze
    vscode.postMessage({ command: 'analyze' });
  };

  return (
    <div className="results-panel">
      <h2>HaloGuard Analysis</h2>
      
      {loading && <div className="spinner">Analyzing...</div>}

      {results && (
        <>
          <div className={`score ${results.flagged ? 'flagged' : 'safe'}`}>
            Score: {results.score}%
          </div>
          
          <div className="issues">
            {results.issues.map((issue, idx) => (
              <div key={idx} className={`issue issue-${issue.severity}`}>
                <strong>{issue.type}</strong>
                <p>{issue.description}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <button onClick={handleAnalyze}>Analyze Now</button>
    </div>
  );
};
```

**index.html (WebView)**:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>HaloGuard</title>
  <link rel="stylesheet" href="ResultsPanel.css" />
</head>
<body>
  <div id="root"></div>
  <script src="app.tsx"></script>
</body>
</html>
```

---

### Day 4 - Apr 29: HOVER PROVIDER & CODE LENS
**Tasks**:
- [ ] Create HoverProvider.ts (on-hover analysis)
- [ ] Implement hover text display
- [ ] Add loading indicator for hover
- [ ] Test on code in editor

**HoverProvider.ts**:
```typescript
import * as vscode from 'vscode';

export class HoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    // Get word at position
    const range = document.getWordRangeAtPosition(position);
    if (!range) return null;

    const word = document.getText(range);
    
    // Optional: Show hover hint
    const markdown = new vscode.MarkdownString(
      '📊 **HaloGuard**: Select code and analyze\n\n' +
      `Current word: \`${word}\``
    );
    
    return new vscode.Hover(markdown);
  }
}
```

---

### Day 5 - Apr 30: SETTINGS & CONFIGURATION
**Tasks**:
- [ ] Create settings.json configuration
- [ ] Build settings UI component
- [ ] API endpoint configuration
- [ ] Theme preference storage
- [ ] Load/save settings

**Settings Configuration**:
```json
"configuration": [
  {
    "title": "HaloGuard",
    "properties": {
      "haloguard.apiUrl": {
        "type": "string",
        "default": "https://halogaurd-production.up.railway.app",
        "description": "HaloGuard backend API URL"
      },
      "haloguard.apiKey": {
        "type": "string",
        "default": "",
        "description": "HaloGuard API key (optional)"
      },
      "haloguard.theme": {
        "type": "string",
        "enum": ["light", "dark", "auto"],
        "default": "auto"
      },
      "haloguard.enableOnHover": {
        "type": "boolean",
        "default": true
      }
    }
  }
]
```

**SettingsPage.tsx**:
```typescript
export const SettingsPage: React.FC = () => {
  const [apiUrl, setApiUrl] = useState('');
  const [theme, setTheme] = useState('auto');

  return (
    <div className="settings">
      <h2>HaloGuard Settings</h2>
      
      <div className="setting-group">
        <label>API Endpoint</label>
        <input 
          type="text" 
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
        />
      </div>

      <div className="setting-group">
        <label>Theme</label>
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="auto">Auto (follow VS Code)</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <button onClick={saveSettings}>Save Settings</button>
    </div>
  );
};
```

---

### Day 6 - May 1: BACKEND INTEGRATION
**Tasks**:
- [ ] Create utils/api.ts (HTTP communication)
- [ ] Implement WebSocket connection
- [ ] Add error handling & retries
- [ ] Test with actual backend

**api.ts**:
```typescript
import axios from 'axios';

export async function analyzeCode(
  code: string,
  apiUrl: string
): Promise<AnalysisResult> {
  try {
    const response = await axios.post(
      `${apiUrl}/api/v1/analyze`,
      {
        content: code,
        model: 'vscode-copilot'
      },
      { timeout: 10000 }
    );
    
    return response.data;
  } catch (error) {
    throw new Error(`Analysis failed: ${error.message}`);
  }
}
```

---

### Day 7 - May 2: LOCAL TESTING
**Tasks**:
- [ ] Build: `npm run build`
- [ ] Load in VS Code (F5 debug)
- [ ] Test all commands
- [ ] Test sidebar panel
- [ ] Test hover provider
- [ ] Test error handling

**Manual Testing Checklist**:
- [ ] Extension loads in debug mode ✅
- [ ] Sidebar panel appears ✅
- [ ] Command "Analyze Selection" works ✅
- [ ] Hover shows on code ✅
- [ ] Results display correctly ✅
- [ ] Settings page works ✅
- [ ] No console errors ✅

---

### Day 8 - May 3: POLISH & OPTIMIZATION
**Tasks**:
- [ ] Optimize bundle size (<300KB)
- [ ] Add loading states
- [ ] Improve error messages
- [ ] Test keyboard shortcuts
- [ ] Add accessibility features

**Accessibility**:
- [ ] ARIA labels on all interactive elements
- [ ] Keyboard navigation (Tab order)
- [ ] Color contrast ≥4.5:1
- [ ] Focus indicators visible

---

### Day 9 - May 4: MARKETPLACE PREP
**Tasks**:
- [ ] Create screenshots (1024x768px minimum)
  - Screenshot 1: Sidebar with analysis
  - Screenshot 2: Settings configuration
  - Screenshot 3: Hover analysis
  - Screenshot 4: Error handling (optional)
- [ ] Write marketplace description
- [ ] Create README.md for VS Code Marketplace
- [ ] Prepare privacy policy

**Marketplace Listing**:
```
Title: HaloGuard - AI Hallucination Detector

Summary:
Verify code completions and AI-generated code in VS Code before accepting.
Real-time detection of 6 types of hallucinations with explanations.

Description:
Stop accepting blind AI suggestions. HaloGuard analyzes:
• Copilot code completions
• ChatGPT code snippets
• Claude code generations
• Any AI-generated code in your editor

Features:
✓ Real-time hallucination detection
✓ 5-tier analysis pipeline
✓ Quick settings configuration
✓ Fast results (<2 seconds)
✓ No account required
✓ Free for everyone

How to use:
1. Install extension
2. Select code to analyze
3. Run "Analyze Selection" command
4. See results in sidebar panel

Works with all programming languages.
```

---

### Day 10 - May 5: SUBMIT TO MARKETPLACE 🎉
**Tasks**:
- [ ] Create Microsoft account (if needed)
- [ ] Create publisher account
- [ ] Upload to Marketplace
- [ ] Add all screenshots & description
- [ ] Set category: Developer Tools
- [ ] Submit for review

**VS Code Marketplace Upload**:
1. Create publisher: `vsce create-publisher haloguard`
2. Build package: `vsce package`
3. Upload: `vsce publish`
4. Monitor status (instant, vs Chrome's 3-5 days)

**Expected Result**: Published within minutes

---

## 📊 Success Criteria

### Technical
- [ ] Extension builds without errors
- [ ] All commands working
- [ ] Sidebar panel displaying correctly
- [ ] Hover analysis responsive
- [ ] Settings persisting
- [ ] Backend integration working
- [ ] Bundle size <300KB
- [ ] P90 latency <2 seconds

### Market
- [ ] Extension published to Marketplace
- [ ] 4.0+ star rating
- [ ] Professional screenshots

### Quality
- [ ] 0 critical bugs
- [ ] <5 known minor issues
- [ ] Accessibility compliant

---

**Owner**: VS Code Extension Team  
**Created**: April 9, 2026  
**Status**: READY TO START (Awaits Phase 1 completion)
