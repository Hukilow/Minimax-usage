# Changelog

All notable changes to **MiniMax Usage** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-06-26

The first stable release. Polished, documented, and ready for the
VS Code Marketplace.

### Added
- **Persistent history** — chart samples now survive VS Code restarts.
  The in-memory ring buffer is mirrored to `globalState` (debounced 5 s
  after each sample, flushed on shutdown). Storage is bounded by a
  smart downsampler: last hour kept raw, older samples bucketed to fit
  `historySampleLimit` (hard ceiling). Worst-case on-disk size at the
  default limit of 100 is ~5 KB; max 2000 ≈ 100 KB.
- **Multi-window safe persistence** — every save does a read-modify-write
  merge against what's currently in storage, so two VS Code windows
  running against the same workspace no longer clobber each other's
  history. A per-window mutex serializes overlapping flushes.
- **Time-range chips** — `1h / 6h / 24h / 3d / 7d / All` selector on the
  dashboard (default `24h`). Persisted as `minimaxUsage.charts.timeRange`.
  Chips whose range has no samples are dimmed and disabled; picking an
  empty range shows an inline "Show &lt;shortest-range-with-data&gt;" link.
- **Hover tooltip** on charts — crosshair + floating panel showing
  timestamp + per-model `used%` at the hovered point.
- **New command `MiniMax Usage: Toggle Countdown in Status Bar`.**
  Visible in the Command Palette. Persists the toggle through
  `workspace.getConfiguration` so it survives restarts, and shows a
  toast confirming the new state. After toggling — either from the
  command, the settings UI, or by editing the JSON — the status bar
  is re-rendered immediately so the change is visible without waiting
  for the next poll.
- **New command `MiniMax Usage: Clear History`** (also a button in the
  dashboard). Wipes both the in-memory buffer and the on-disk blob.
- New setting `minimaxUsage.charts.persistHistory` — turn off to wipe
  stored data and stop writing new samples.

### Changed
- **Removed `video` from the dashboard entirely.** The progress bar card
  and the chart line are filtered out of the snapshot, so only the
  `general` model is surfaced. The `video` API response is still
  polled and persisted for transparency, but nothing is drawn. To
  unhide it, drop `'video'` from the `HIDDEN_MODELS` set in
  [src/ui/detailsWebview.ts](src/ui/detailsWebview.ts).
- **Replaced `statusBarDisplayMode` (`compact` / `split`) with a single
  boolean `minimaxUsage.statusBar.showCountdown` (default off).** The
  enum never had a useful UI affordance; now there's exactly one thing
  to toggle and it's named after what it does. Setting it on appends
  the live `$(clock) 2h 14m` countdown to each status bar item.
- **Removed `minimaxUsage.charts.showGeneralInterval` and
  `minimaxUsage.charts.showGeneralWeekly`.** Per-series toggles had no
  remaining purpose once `video` was hidden: the only line drawn is
  the `general` one, so there is nothing left to switch on or off.
  `minimaxUsage.charts.timeRange` remains the sole chart setting.

### Fixed
- **The `MiniMax Usage: Toggle Countdown in Status Bar` command was
  invisible in the Command Palette** because a stale `"when": "false"`
  menu clause from the old hidden `toggleStatusBar` command was left
  in `package.json`. Removed.
- **Toggling `statusBar.showCountdown` did nothing visible until the
  next successful poll** (up to 60 s). The toggle now calls
  `statusBar.render(quota.getState())` immediately, so the change is
  visible the moment it happens — even right after install, before any
  fetch has succeeded.
- **Changing `warningThreshold` / `errorThreshold` did nothing visible
  until the next poll** (copy-paste bug from the old `setMode` API).
  Now calls `statusBar.render(quota.getState())` directly.

---

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

[1.0.0]: https://github.com/Hukilow/minimax-usage/releases/tag/v1.0.0
[0.3.0]: https://github.com/Hukilow/minimax-usage/releases/tag/v0.3.0