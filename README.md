# MiniMax Usage

> Show your **MiniMax Token Plan** quota (5-hour and weekly) right inside VS Code — status bar and a detail dashboard with an interactive usage history chart.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.96-blue)](https://code.visualstudio.com/)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](CHANGELOG.md)

---

## Screenshots

### Status bar (bottom-right)
![Status bar](https://raw.githubusercontent.com/Hukilow/minimax-usage/main/docs/screenshots/status-bar.png)

### Detail dashboard
![Dashboard](https://raw.githubusercontent.com/Hukilow/minimax-usage/main/docs/screenshots/dashboard.png)

### Settings
![Settings](https://raw.githubusercontent.com/Hukilow/minimax-usage/main/docs/screenshots/settings.png)

### Commands (Ctrl+Shift+P / Cmd+Shift+P)
![Commands](https://raw.githubusercontent.com/Hukilow/minimax-usage/main/docs/screenshots/commands.png)

---

## Features

- **Status bar (bottom-right):** live 5-hour and weekly **used %**, color-coded (green / yellow / red), with reset countdowns on hover. The `$(clock) 2h 14m` countdown is opt-in — toggle it on once and it stays on across restarts.
- **Detail dashboard:** big usage bars per model, reset countdowns, **interactive history chart** of usage over time. Hover for a crosshair + tooltip showing per-model `used %` at that timestamp.
- **Interactive charts:**
  - **Time-range chips:** `1h / 6h / 24h / 3d / 7d / All`. Chips with no data are auto-disabled; picking an empty range shows a "Show &lt;suggested range&gt;" shortcut.
  - **Hover tooltip:** crosshair line + floating panel with timestamp + per-model percentage.
- **Persistent history:** chart samples survive VS Code restarts (mirrored to `globalState`, debounced 5 s, flushed on shutdown). At the default 100-sample limit, worst-case on-disk size is ~5 KB. Safe to run with **multiple VS Code windows** against the same workspace.
- **Command palette:** `MiniMax Usage: Set API Key`, `Refresh Now`, `Open Usage Dashboard`, `Open Billing Page`, `Toggle Countdown in Status Bar`, `Clear History`, `Clear API Key`.
- **Private by design:** API key in OS keychain (`SecretStorage`); no telemetry, no analytics, **zero runtime npm dependencies**.

---

## Installation

1. Install the **MiniMax Usage** extension from the VS Code Marketplace (search "MiniMax Usage" or run `ext install Hukilow.minimax-usage`).
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **`MiniMax Usage: Set API Key`** and paste your **Subscription Key** from [Billing → Token Plan](https://platform.minimax.io/console/plan).
4. The status bar should populate within a few seconds.

> A **Subscription Key** is the Team-level key issued when you subscribe to MiniMax Token Plan. It is *not* the same as a pay-as-you-go Open Platform API key.

---

## Commands

| Command | What it does |
|---|---|
| `MiniMax Usage: Set API Key` | Prompt for a Token Plan Subscription Key and save it to SecretStorage. |
| `MiniMax Usage: Clear API Key` | Wipe the stored key (with confirmation). |
| `MiniMax Usage: Refresh Now` | Force an immediate poll (does not wait for the configured interval). |
| `MiniMax Usage: Open Usage Dashboard` | Open the detail dashboard webview. |
| `MiniMax Usage: Open Billing Page` | Open the MiniMax billing page in your OS browser. |
| `MiniMax Usage: Toggle Countdown in Status Bar` | Flip the inline `$(clock) 2h 14m` countdown on each status bar item. |
| `MiniMax Usage: Clear History` | Wipe both the in-memory ring buffer and the on-disk history blob. |

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `minimaxUsage.refreshIntervalSeconds` | `60` | Polling interval (30–600 s). |
| `minimaxUsage.statusBar.showCountdown` | `false` | Append the live reset countdown (`$(clock) 2h 14m`) to each status bar item. Toggled via the `MiniMax Usage: Toggle Countdown in Status Bar` command. |
| `minimaxUsage.warningThreshold` | `70` | Used-% at which the status bar turns yellow. |
| `minimaxUsage.errorThreshold` | `90` | Used-% at which the status bar turns red. |
| `minimaxUsage.historySampleLimit` | `100` | Hard cap on chart history samples (20–2000). Older samples are downsampled so on-disk size stays bounded (~5–100 KB). |
| `minimaxUsage.charts.timeRange` | `24h` | Default time range for the dashboard charts (`1h` / `6h` / `24h` / `3d` / `7d` / `all`). |
| `minimaxUsage.charts.persistHistory` | `true` | Keep chart history across VS Code restarts. Disable to wipe stored data and stop writing new samples. |
| `minimaxUsage.debug` | `false` | Verbose logs in the Output channel (`Minimax Usage`). |

---

## Privacy

- **Reads** your Token Plan usage (one outbound HTTPS call to `api.minimax.io`).
- **Never writes** to your MiniMax account, never calls LLM APIs, never sends data anywhere else.
- API key is stored locally in your **OS keychain** via VS Code's `SecretStorage` API.
- **No telemetry, no analytics, no error reporting service.**
- **Zero runtime npm dependencies** (CVE surface = 0).
- See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

---

## Development

```bash
git clone https://github.com/Hukilow/minimax-usage.git
cd minimax-usage
npm install
npm run watch            # in one terminal
# In VS Code: Run > "Run Extension"  (uses .vscode/launch.json)
```

### Scripts

| Script | Purpose |
|---|---|
| `npm run build` | Bundle the extension (Node target). |
| `npm run build:web` | Bundle the webview (browser target). |
| `npm run watch` | Rebuild on change. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm test` | Vitest unit tests (80 tests). |
| `npm run package` | Build + bundle + `vsce package` (produces `.vsix`). |

### Project layout

```
src/
├── extension.ts            # activate / deactivate — wires services together
├── api/
│   ├── client.ts           # fetch wrapper + error mapping
│   ├── quota.ts            # QuotaService — polling, cache, history
│   ├── historyStore.ts     # debounced persistent history (globalState)
│   └── types.ts            # API + normalized types
├── auth/
│   └── secrets.ts          # SecretStorage wrapper
├── ui/
│   ├── statusBar.ts        # 5h + Weekly StatusBarItems
│   └── detailsWebview.ts   # detail webview host + message protocol
├── commands/
│   └── register.ts         # command palette handlers
├── utils/
│   ├── time.ts             # countdown + percent formatters (pure)
│   ├── logger.ts           # OutputChannel wrapper
│   ├── tier.ts             # ok/warn/err tier mapping
│   ├── ringBuffer.ts       # bounded buffer
│   └── regions.ts          # region registry
├── webview/                # webview-side TS (bundled separately)
│   ├── main.ts             # entry, message handling, render
│   ├── chart.ts            # hand-rolled canvas line chart
│   └── styles.css          # uses var(--vscode-*) throughout
└── test/                   # vitest unit tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, and [PLAN.md](PLAN.md) for the architecture rationale.

---

## 📄 License

[MIT](LICENSE) © 2026 Hukilow