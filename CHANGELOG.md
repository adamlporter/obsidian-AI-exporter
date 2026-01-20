# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2025-01-15

### Added
- Claude AI conversation extractor support
- Extended Thinking content extraction for Claude
- Artifacts extraction with inline citations
- Privacy Policy updated for Claude AI support

### Security
- Resolved CodeQL security alerts

## [0.4.1] - 2025-01-13

### Changed
- Increased test coverage to meet quality thresholds

## [0.4.0] - 2025-01-12

### Added
- Multiple output options: Obsidian (default), file download, and clipboard
- Output method selector in popup UI
- Design documents for multiple output options feature

## [0.3.0] - 2025-01-11

### Added
- International support (English and Japanese)
- Unit tests with Vitest
- Privacy policy documentation
- GitHub Pages hosting for documentation

### Changed
- Renamed extension from "Gemini to Obsidian" to "Obsidian AI Exporter"
- Improved error messages with localization support

### Fixed
- ESLint configuration updated for flat config format

## [0.2.0] - 2025-01-08

### Added
- Security hardening: API key storage separation (local vs sync)
- Input validation for vault paths and API keys
- Path traversal protection
- YAML injection prevention
- Message sender validation
- Content size limits

### Changed
- API key now stored in chrome.storage.local (not synced)
- Improved error messages

## [0.1.0] - 2025-01-05

### Added
- Initial release
- Gemini conversation extraction
- Obsidian Local REST API integration
- Floating sync button
- Toast notifications
- Configurable frontmatter and callout styles
- Support for code blocks, tables, and lists
