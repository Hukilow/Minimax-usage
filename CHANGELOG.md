# Changelog

All notable changes to **MiniMax Usage** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] — 2026-06-25

### Added
- Status bar (5h + weekly) with color tiers and capped reset countdowns
  (5h bar cannot display more than 5h; weekly bar cannot display more than 7d).
- Detail webview dashboard with hand-rolled canvas history chart.
- Commands: Set / Clear API Key, Refresh, Open Dashboard, Open Billing, Toggle Status Bar.
- Settings: refresh interval, status bar mode, warning/error thresholds, history size, debug logging.
- SecretStorage-backed API key handling.
- MIT license, CI workflow, Copilot customizations for contributors.

### Changed
- Dashboard tier mapping corrected: 20% used now renders green (was red due to inverted comparisons).
- Status bar `aggregate()` now picks the reset timestamp from the same model that gave us the worst-case used%, so multi-model responses no longer display impossible countdowns (e.g. "resets in 6h 30m" for a 5h window).
- Removed the unverified CN region (`api.MiniMax.cn`) — only the live-verified global region is shipped.
- Removed the Activity Bar sidebar container and the per-model TreeView; the dashboard is the single place to inspect quota detail.

[0.3.0]: https://github.com/Hukilow/minimax-usage/releases/tag/v0.3.0
