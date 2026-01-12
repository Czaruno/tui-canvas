# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-01-12

### Added
- IPC wait-for-result support across all canvases.
- Socket cleanup for non-waiting scenarios.

### Fixed
- OpenCode crash recovery by cleaning orphaned panes/sockets.
- Document canvas mouse escape sequence filtering.
- Document canvas layout stability by using fixed heights.
- Temporary config file cleanup after IPC completion.

### Verified
- IPC flows for calendar meeting picker, document display, and flight booking.

### Known Issues
- Document edit mode has character filtering and navigation bugs.
- Document diff highlighting exists but is not wired up.
