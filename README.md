# Obsidian AI Exporter

Chrome Extension that exports AI conversations from Google Gemini to Obsidian via the Local REST API.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue)](https://chrome.google.com/webstore)

## Features

- **One-click export**: Floating "Sync" button on Gemini pages
- **Append mode**: Only new messages are added to existing notes
- **Obsidian callouts**: Formatted output with `[!QUESTION]` and `[!NOTE]` callouts
- **YAML frontmatter**: Metadata including title, source, URL, dates, and tags
- **Configurable**: Customizable vault path, template options, and frontmatter fields
- **Localized**: English and Japanese UI support

## Requirements

- Google Chrome 88+ (or Chromium-based browser)
- [Obsidian](https://obsidian.md/)
- [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/gemini2obsidian.git
   cd gemini2obsidian
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

### Setup Obsidian

1. Install the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin in Obsidian
2. Enable the plugin and copy your API key
3. Click the extension icon in Chrome and enter:
   - **API Key**: Your Local REST API key
   - **Port**: Default is `27123`
   - **Vault Path**: Folder path in your vault (e.g., `AI/Gemini`)

## Usage

1. Open a conversation on [gemini.google.com](https://gemini.google.com)
2. Click the purple "Sync" button in the bottom-right corner
3. The conversation will be saved to your Obsidian vault

## Output Format

Conversations are saved as Markdown files with YAML frontmatter:

```markdown
---
id: gemini_abc123
title: "How to implement authentication"
source: gemini
url: https://gemini.google.com/app/abc123
created: 2025-01-10T12:00:00Z
modified: 2025-01-10T12:30:00Z
tags:
  - ai-conversation
  - gemini
message_count: 4
---

> [!QUESTION] User
> How do I implement JWT authentication?

> [!NOTE] Gemini
> To implement JWT authentication, you'll need to...
```

## Development

```bash
# Development server with HMR
npm run dev

# Production build
npm run build

# Lint code
npm run lint

# Format code
npm run format

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Architecture

```
Content Script (gemini.google.com)
    ↓ extracts conversation
Background Service Worker
    ↓ sends to Obsidian
Obsidian Local REST API (127.0.0.1:27123)
```

### Key Components

| Component | Description |
|-----------|-------------|
| `src/content/` | Content script for DOM extraction and UI |
| `src/background/` | Service worker for API communication |
| `src/popup/` | Settings UI |
| `src/lib/` | Shared utilities and types |

## Security

- **Secure storage**: API key stored in `chrome.storage.local` (not synced)
- **Input validation**: Message content and filenames validated
- **Path traversal protection**: Vault paths sanitized against directory traversal attacks
- **Sender verification**: Only trusted origins can send messages
- **CSP**: Content Security Policy configured for extension pages
- **YAML escaping**: Frontmatter values properly escaped

## Privacy

This extension:
- Does **not** collect or transmit your data to external servers
- Only communicates with your local Obsidian instance (127.0.0.1)
- Stores API key locally in your browser (not synced to cloud)

See our [Privacy Policy](https://yourusername.github.io/gemini2obsidian/privacy.html) for details.

## License

MIT

## Contributing

Contributions are welcome! Please read the [CLAUDE.md](CLAUDE.md) for development guidelines.
