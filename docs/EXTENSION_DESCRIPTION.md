# HaloGuard Browser & IDE Extensions

## Overview

HaloGuard provides native extensions for popular development tools and AI platforms, enabling real-time hallucination detection without interrupting workflow.

## Supported Platforms

### 1. VS Code Extension (Phase 2)

**Status**: In Development  
**Launch**: Q2 2026

**Features**:
- Inline hallucination detection in GitHub Copilot Chat
- Real-time analysis of code suggestions
- One-click feedback and reporting
- Seamless integration with VS Code

**Installation**:
```bash
code --install-extension HaloGuard.haloguard-vscode
```

**Requirements**:
- VS Code 1.80+
- GitHub Copilot extension (optional, for Copilot Chat analysis)
- Active HaloGuard API key

### 2. Chrome Web Extension (Phase 2)

**Status**: In Development  
**Launch**: Q2 2026

**Supported AI Platforms**:
- ChatGPT (OpenAI)
- Claude (Anthropic)
- Gemini (Google)
- Copilot (Microsoft)
- LLaMA (Meta)
- Grok (X/Twitter)
- Perplexity
- HuggingFace Chat
- And more...

**Features**:
- Overlay detection indicator showing hallucination likelihood
- One-click verification of claims
- Citation tracking
- Conversation history analysis
- Custom knowledge base integration

**Installation**:
1. Visit [Chrome Web Store](https://chrome.web/store/haloguard) (Coming Soon)
2. Click "Add to Chrome"
3. Configure API endpoint and authentication
4. Start detecting hallucinations in real-time

**Requirements**:
- Chrome 100+
- Active HaloGuard API key
- Internet connection

### 3. Firefox Extension (Phase 3)

**Status**: Planned  
**Launch**: Q3 2026

Same features as Chrome extension, optimized for Firefox.

### 4. Safari Extension (Phase 3)

**Status**: Planned  
**Launch**: Q3 2026

Same features as Chrome extension, optimized for Safari.

## Authentication & Setup

### Obtaining an API Key

1. Sign up at https://app.haloguard.io (Self-hosted available)
2. Navigate to Settings → API Keys
3. Generate a new API key
4. Copy the key to your extension settings

### Configuration

Once installed, configure each extension:

```json
{
  "apiEndpoint": "https://api.haloguard.io/api/v1",
  "apiKey": "sk_live_xxxxxxxxxxxxx",
  "detectionLevel": "standard",
  "autoAnalyze": true,
  "showStats": true
}
```

## Detection Features

### Real-Time Analysis

All extensions analyze AI outputs using HaloGuard's 5-tier detection pipeline:

- **Tier 0**: Pattern matching (regex-based hallucinations)
- **Tier 1**: Heuristic detection (common myths, outdated info)
- **Tier 2**: Fact-checking API integration
- **Tier 3**: Natural Language Inference (contradiction detection)
- **Tier 4**: Semantic verification (knowledge graph matching)

**Target latency**: < 500ms P90

### Detection Output

For each AI response, extensions display:

```json
{
  "hallucination_score": 0.72,
  "severity": "HIGH",
  "detections": [
    {
      "type": "factual_error",
      "content": "Founded in 2020",
      "issue": "Actually founded in 2019",
      "confidence": 0.95
    }
  ],
  "timestamp": "2026-04-08T14:32:01Z"
}
```

## Usage Examples

### VS Code: Copilot Chat

1. Open Copilot Chat in VS Code
2. Ask a question
3. See HaloGuard's assessment in the chat sidebar
4. Click for detailed analysis

### Chrome: ChatGPT Analysis

1. Visit ChatGPT
2. Have a conversation
3. HaloGuard overlay shows hallucination indicators
4. Click to expand and see detailed findings

## Privacy & Data

- **Local processing**: Detection tiers 0-2 run locally
- **No logging**: User conversations are NOT stored
- **Optional cloud**: Tier 3-4 analysis available with explicit user consent
- **Encrypted transmission**: All API calls use HTTPS with API key authentication

For full privacy policy, see [PRIVACY.md](../PRIVACY.md).

## Troubleshooting

### Extension Not Detecting

1. Verify API key is valid: Settings → Test Connection
2. Check API endpoint is reachable
3. Ensure extension is enabled for the website/platform
4. Restart browser

### Performance Issues

If extensions are slow:

1. Reduce detection level to "fast" in settings
2. Disable Tier 3-4 analysis (cloud features)
3. Check internet connection quality
4. Report performance issues to support@haloguard.io

### Compatibility Issues

- **Brave Browser**: Use Chrome extension with Brave
- **Edge Browser**: Use Chrome extension with Edge
- **Private Windows**: Enable extension for private mode in browser settings

## Support

- **Documentation**: https://docs.haloguard.io
- **GitHub Issues**: https://github.com/geek-code-psj/haloguard/issues
- **Email**: support@haloguard.io
- **Discord**: https://discord.gg/haloguard

## Contributing

Extensions are open-source! Contributions welcome:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## Release Schedule

- **Q2 2026**: VS Code + Chrome Extension Beta
- **Q3 2026**: Firefox + Safari Extensions
- **Q4 2026**: Mobile support (iOS/Android apps)
- **Q1 2027**: Advanced features (custom models, webhooks)

---

**Last Updated**: April 2026  
**Status**: Pre-Release (Beta Coming Q2 2026)
