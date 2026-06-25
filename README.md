# MiniMax Usage

> Show your **MiniMax Token Plan** quota (5-hour and weekly) right inside VS Code — status bar, sidebar, and a detail dashboard with a usage history chart.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.96-blue)](https://code.visualstudio.com/)

---

## 📸 Screenshots

### Status bar (bottom-right)
![Status bar](https://raw.githubusercontent.com/Hukilow/minimax-usage/main/docs/screenshots/status-bar.png)

### Sidebar
![Sidebar](https://raw.githubusercontent.com/Hukilow/minimax-usage/main/docs/screenshots/sidebar.png)

### Detail dashboard
![Dashboard](https://raw.githubusercontent.com/Hukilow/minimax-usage/main/docs/screenshots/dashboard.png)

### Settings
![Settings](https://raw.githubusercontent.com/Hukilow/minimax-usage/main/docs/screenshots/settings.png)

---

## ✨ Features

- **Status bar (bottom-right):** live 5-hour and weekly **used %**, color-coded (green / yellow / red), with reset countdowns on hover.
- **Sidebar view:** per-model rows (`general`, `video`, …) with quick access to refresh / dashboard / billing.
- **Detail dashboard:** big usage bars, reset countdowns, **historical chart** of usage over time, auto-refreshing live countdowns.
- **Command palette:** `MiniMax Usage: Set API Key`, `Refresh Now`, `Open Usage Dashboard`, `Open Billing Page`, …
- **Private by design:** API key in OS keychain (`SecretStorage`); no telemetry, no analytics, **zero runtime npm dependencies**.

---

## 📦 Installation

1. Install the **MiniMax Usage** extension from the VS Code Marketplace (search "MiniMax Usage" or run `ext install Hukilow.minimax-usage`).
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **`MiniMax Usage: Set API Key`** and paste your **Subscription Key** from [Billing → Token Plan](https://platform.minimax.io/user-center/payment/token-plan).
4. The status bar should populate within a few seconds.

> A **Subscription Key** is the Team-level key issued when you subscribe to MiniMax Token Plan. It is *not* the same as a pay-as-you-go Open Platform API key.

---

## ⚙️ Settings

| Setting | Default | Description |
|---|---|---|
| `minimaxUsage.refreshIntervalSeconds` | `60` | Polling interval (30–600s). |
| `minimaxUsage.statusBarDisplayMode` | `compact` | `compact` (two panels) or `split` (inline countdown). |
| `minimaxUsage.warningThreshold` | `70` | Used-% at which the status bar turns yellow. |
| `minimaxUsage.errorThreshold` | `90` | Used-% at which the status bar turns red. |
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

### Regenerating screenshots

```bash
powershell -ExecutionPolicy Bypass -File scripts\make-screenshots.ps1
```

This rebuilds the four PNGs in `docs/screenshots/` (status-bar, sidebar, dashboard, settings). Replace them with real captures of the running extension when you have a clean setup.

### Replacing the icon

The Marketplace accepts PNG, JPG, GIF, BMP for the gallery image. The webview tab icon (used by `WebviewPanel.iconPath`) is stricter and only accepts **PNG**.

- Drop your replacement at `media/icon.jpg` (any size).
- Run `powershell -ExecutionPolicy Bypass -File scripts\convert-icon.ps1` — it produces a 128×128 `media/icon.png` (centered square crop + resize).
- Re-run `npm run package` to see the new icon in the packaged `.vsix`.

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

## 📄 License

[MIT](LICENSE) © 2026 Hukilow
