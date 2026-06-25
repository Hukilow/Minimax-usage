# MiniMax Usage

> Show your **MiniMax Token Plan** quota (5-hour and weekly) right inside VS Code — status bar, sidebar, and a detail dashboard with a usage history chart.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.96-blue)](https://code.visualstudio.com/)

---

## ✨ Features

- **Status bar (bottom-right):** live 5-hour and weekly remaining %, color-coded (green / yellow / red), with reset countdowns on hover.
- **Sidebar view:** per-model rows (`general`, `video`, …) with quick access to refresh / dashboard / billing.
- **Detail dashboard:** big usage bars, reset countdowns, **historical chart** (uPlot, zero dependencies).
- **Command palette:** `MiniMax Usage: Set API Key`, `Refresh Now`, `Open Usage Dashboard`, `Open Billing Page`, ….
- **Private by design:** API key in OS keychain (`SecretStorage`); no telemetry, no analytics, **zero runtime npm dependencies**.

---

## 📦 Installation

1. Install the **MiniMax Usage** extension from the VS Code Marketplace (search "MiniMax Usage" or run `ext install Hukilow.minimax-usage`).
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **`MiniMax Usage: Set API Key`** and paste your **Subscription Key** from [Billing → Token Plan](https://platform.minimax.io/user-center/payment/token-plan).
4. The status bar should populate within a few seconds.

> A **Subscription Key** is the Team-level key issued when you subscribe to MiniMax Token Plan. It is *not* the same as a pay-as-you-go Open Platform API key.

---

## 🖥️ Preview

### Status bar
```
$(pulse)  5h ●●●○○ 10%   $(history)  Wk ●●●●○ 69%
```

### Sidebar
```
Minimax Usage
├── general
│   ├── 5h    10%   resets in 2h 14m
│   └── Wk    69%   resets in 4d 17h
└── video
    ├── 5h   100%
    └── Wk   100%
```

### Detail dashboard
Big bars, reset countdowns, and a history chart of 5h + weekly usage over time.

---

## ⚙️ Settings

| Setting | Default | Description |
|---|---|---|
| `minimaxUsage.refreshIntervalSeconds` | `60` | Polling interval (30–600s). |
| `minimaxUsage.statusBarDisplayMode` | `compact` | `compact` (two panels) or `split` (inline countdown). |
| `minimaxUsage.warningThreshold` | `30` | Yellow tier (remaining %). |
| `minimaxUsage.errorThreshold` | `10` | Red tier (remaining %). |
| `minimaxUsage.historySampleLimit` | `100` | History ring-buffer size. |
| `minimaxUsage.showSidebar` | `true` | Show sidebar container. |
| `minimaxUsage.debug` | `false` | Verbose logs in Output channel. |

---

## 🔐 Privacy

- **Reads** your Token Plan usage (one outbound HTTPS call to `api.minimax.io`).
- **Never writes** to your MiniMax account, never calls LLM APIs, never sends data anywhere else.
- API key is stored locally in your **OS keychain** via VS Code's `SecretStorage` API.
- **No telemetry, no analytics, no error reporting service.**
- **Zero runtime npm dependencies** (CVE surface = 0).
- See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

---

## 🛠️ Development

```bash
git clone https://github.com/Hukilow/minimax-usage.git
cd minimax-usage
npm install
npm run watch            # in one terminal
# In VS Code: Run > "Run Extension"  (uses .vscode/launch.json)
```

### Commands

| Script | Purpose |
|---|---|
| `npm run build` | Bundle the extension (Node target). |
| `npm run build:web` | Bundle the webview (browser target). |
| `npm run watch` | Rebuild on change. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm test` | Vitest unit tests. |
| `npm run package` | Build + bundle + `vsce package` (produces `.vsix`). |

### Project layout

```
src/
├── extension.ts            # activate / deactivate
├── api/                    # HTTP client, QuotaService, types
├── auth/                   # SecretStorage wrapper
├── ui/                     # status bar, tree view, webview
├── commands/               # command palette handlers
├── utils/                  # time, logger, regions
├── webview/                # webview-side TS (bundled separately)
└── test/                   # vitest unit tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

---

## 🗺️ Roadmap (v1.1+)

- Notification on threshold crossing.
- Multi-team / multi-account switching.
- Optional pay-as-you-go Open Platform key.
- CN region (`api.MiniMax.cn`).
- Publish to Open VSX.

---

## 📄 License

[MIT](LICENSE) © 2026 Hukilow
