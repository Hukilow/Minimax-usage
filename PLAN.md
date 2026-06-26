# MiniMax Usage — VS Code Extension Plan

> **Status:** ✅ **Implementation complete** (v0.1.0). See `README.md` for the user-facing guide.
> **Last updated:** 2026-06-25
> **Author:** Copilot (planning + implementation agent)
> **Target user:** MiniMax Token Plan subscribers (Plus / Max / Ultra)
> **Open-source:** MIT license, GitHub repo

---

## 1. Research Summary

### 1.1 API Endpoint (live-verified)

```
GET https://api.minimax.io/v1/token_plan/remains
Authorization: Bearer <SUBSCRIPTION_KEY>
Content-Type: application/json
```

> The key is the **Subscription Key** (NOT a pay-as-you-go Open Platform API Key). Users get one per Team at [Billing → Token Plan](https://platform.minimax.io/console/plan).

### 1.2 Real Response (verified with user's key)

```jsonc
{
  "model_remains": [
    {
      "model_name": "general",
      "start_time": 1782381600000,           // ms — 5h window start
      "end_time":   1782399600000,           // ms — 5h window end
      "remains_time": 2669853,               // ms until 5h window resets

      "current_interval_total_count": 0,           // server-side count, not always populated
      "current_interval_usage_count": 0,
      "current_interval_remaining_percent": 10,    // 0..100 (can exceed 100 with boost)
      "current_interval_status": 1,                // 1 = limited, 2 = exhausted, 3 = unlimited

      "current_weekly_total_count": 0,
      "current_weekly_usage_count": 0,
      "current_weekly_remaining_percent": 69,
      "current_weekly_status": 1,

      "weekly_start_time": 1782086400000,
      "weekly_end_time":   1782691200000,
      "weekly_remains_time": 294269853
    },
    { "model_name": "video", /* same shape */ }
  ],
  "base_resp": { "status_code": 0, "status_msg": "success" }
}
```

### 1.3 Field Semantics

| Field | Meaning |
|---|---|
| `model_name` | Group of resources: `general` (chat / code / vision), `video`. Future groups likely. |
| `current_interval_*` | **5-hour rolling window** (MiniMax quota unit). |
| `current_weekly_*` | **Weekly window**. |
| `current_*_status` | `1` = normal limited, `2` = exhausted, `3` = unlimited. |
| `current_*_remaining_percent` | Server-authoritative remaining % (display value). |
| `start_time` / `end_time` | 5h window bounds. |
| `weekly_start_time` / `weekly_end_time` | Week bounds. |
| `remains_time` / `weekly_remains_time` | Countdown in ms. |
| `base_resp.status_code === 0` | Success. |

> Defensive parsing: also handle `weekly_boost_permille` (display multiplier, e.g. 1500 ⇒ display up to 150%), per upstream `MiniMax-AI/cli`.

### 1.4 Reference Implementations

- **Upstream:** [MiniMax-AI/cli](https://github.com/MiniMax-AI/cli) — `QuotaModelRemain` type, error mapping, region detection.
- **Comparable extension:** [hyperi-io/claudemeter](https://github.com/hyperi-io/claudemeter) — best-in-class UX for status-bar quota + webview details.
- **VS Code APIs:** `StatusBarItem`, `TreeView`, `Webview`, `SecretStorage`, `Configuration`, `OutputChannel`.

---

## 2. Project Structure

```
minimax-usage/
├── package.json                       # Manifest, contributes, scripts
├── tsconfig.json
├── esbuild.config.mjs                 # Bundler (no webpack)
├── .vscodeignore
├── .eslintrc.json
├── .gitignore
├── .editorconfig
├── README.md
├── CHANGELOG.md
├── LICENSE                            # MIT
├── CONTRIBUTING.md
├── SECURITY.md
├── .env.example
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── workflows/
│       └── ci.yml                     # Lint + build + package VSIX
├── src/
│   ├── extension.ts                   # activate() / deactivate()
│   ├── api/
│   │   ├── client.ts                  # fetch wrapper, base URL, errors
│   │   ├── quota.ts                   # QuotaService (polling, caching, history)
│   │   └── types.ts                   # QuotaResponse / QuotaModelRemain
│   ├── auth/
│   │   └── secrets.ts                 # SecretStorage helper
│   ├── ui/
│   │   ├── statusBar.ts               # Status bar item (compact)
│   │   ├── treeView.ts                # Sidebar TreeView (per-model rows)
│   │   ├── detailsWebview.ts          # Detail panel host
│   │   └── chart.ts                   # Lightweight inline SVG chart
│   ├── commands/
│   │   ├── setApiKey.ts
│   │   ├── clearApiKey.ts
│   │   ├── refresh.ts
│   │   ├── openDashboard.ts
│   │   ├── openBilling.ts
│   │   ├── toggleStatusBar.ts
│   │   └── toggleSidebar.ts
│   ├── utils/
│   │   ├── time.ts                    # Countdown formatting
│   │   ├── logger.ts                  # Output channel wrapper
│   │   └── regions.ts                 # Global vs CN (CN disabled, kept for future)
│   └── webview/
│       ├── main.js                    # Vanilla webview script
│       ├── styles.css
│       └── chart.js                   # Sparkline / bar chart, zero deps
├── media/
│   └── icon.png                       # 128×128 extension icon
└── resources/
    └── token-plan-hero.png            # README screenshot
```

**Stack:** TypeScript + esbuild, Node 22, ESM, `@types/vscode`, `eslint`, `vitest` for unit tests. **Zero runtime dependencies beyond `vscode`** to keep the CVE surface minimal (same policy as `claudemeter`).

---

## 3. Features

### 3.1 Status Bar (always visible, bottom-right)

**Default shape (`compact` — two panels, default for new users):**

```
$(pulse) 5h ●●●○○ 10%  $(history) Wk ●●●●○ 69%
```

- Two status bar items (`alignment: right`, high `priority`), one for 5h, one for weekly.
- **Color tiers** based on remaining %:
  - green ≥ 60 → no decoration
  - yellow ≥ 30 (warning threshold, default) → warning background
  - red < 30 (error threshold, default) → error background + `$(alert)` icon
  - `$(error)` icon when `status === 2` (exhausted)
  - `$(infinity)` icon when `status === 3` (unlimited)
- **Reset countdown tooltip** on hover: `Resets in 2h 14m (14:30 local)`.
- **Click** → opens detail webview.
- Auto-refreshes every 60s (configurable 30s–10min).

**Alternate shape (`split`):**

```
5h ●●●○○ 10% ⌚ 2h 14m   Wk ●●●●○ 69% ⌚ 4d 17h
```

→ Inlined countdown. Same click → detail webview.

### 3.2 Sidebar TreeView (`Minimax Usage`)

- Container view with one collapsible node per model (`general`, `video`, …).
- Each node shows: model label, 5h %, weekly %, mini reset hint.
- Toolbar icons: `refresh`, `open dashboard`, `open billing`.
- Empty state: friendly message + "Set API Key" button.

### 3.3 Detail Webview (click status bar / sidebar row)

Full dashboard with:

- **Big usage bars** (5h + weekly) — color-coded, with %, status badge, countdown to reset, absolute reset timestamp.
- **History graph** — line chart (5h % over time) + secondary bar chart (weekly % over time).
  - Library: **hand-rolled `<canvas>` chart** (`src/webview/chart.ts`) — ~3KB, zero deps. uPlot was the original pick but a vanilla canvas is a better fit for the "zero deps" profile and keeps the webview bundle under 50KB minified.
- **History source:** in-memory ring buffer (default 100 samples). The API is point-in-time only; history is built by polling and caching locally (same approach as `claudemeter`).
- "Open Billing" button → [[[platform.minimax.io/console/plan](https://platform.minimax.io/console/plan)](https://platform.minimax.io/console/usage)](https://platform.minimax.io/console/usage).
- "Refresh now" button.
- Last-fetched timestamp + error banner if the last fetch failed.

### 3.4 Commands (Command Palette)

| Command | Title | Keybind |
|---|---|---|
| `minimaxUsage.setApiKey` | `Minimax Usage: Set API Key` | — |
| `minimaxUsage.clearApiKey` | `Minimax Usage: Clear API Key` | — |
| `minimaxUsage.refresh` | `Minimax Usage: Refresh Now` | — |
| `minimaxUsage.openDashboard` | `Minimax Usage: Open Usage Dashboard` | — |
| `minimaxUsage.openBilling` | `Minimax Usage: Open Billing Page` | — |
| `minimaxUsage.toggleStatusBarCountdown` | `Minimax Usage: Toggle Countdown in Status Bar` | — |
| `minimaxUsage.toggleSidebar` | `Minimax Usage: Toggle Sidebar View` | — |

### 3.5 Settings (`minimaxUsage.*`)

| Key | Type | Default | Notes |
|---|---|---|---|
| `refreshIntervalSeconds` | number 30…600 | 60 | |
| `statusBar.showCountdown` | boolean | `false` | inline `$(clock) 2h 14m` after each item |
| `warningThreshold` | number 1…100 | 30 | yellow tier |
| `errorThreshold` | number 1…100 | 10 | red tier |
| `historySampleLimit` | number 20…2000 | 100 | |
| `showSidebar` | boolean | `true` | |
| `debug` | boolean | `false` | enables Output channel logs |

> API key is **never** a setting — only `Set API Key` command stores it in SecretStorage.

---

## 4. Security & Privacy

- API key stored only in `SecretStorage` (OS-encrypted keystore). Never logged, never written to `settings.json`.
- Single outbound call target: `https://api.minimax.io/v1/token_plan/remains` (CN disabled per user).
- **CSP-locked webview** — `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`.
- All local data (history ring buffer) stays in extension `globalState`, scoped to user machine.
- README includes explicit **Privacy** section: "Reads usage, never writes/calls LLM APIs."
- **Zero runtime npm dependencies** policy — minimizes CVE surface (same approach as `claudemeter`).
- No analytics, no telemetry, no error reporting service.
- `gitleaks` or similar secret-scan in CI is recommended.

---

## 5. Open-Source Readiness

- **License:** MIT.
- **Repo:** GitHub, **owner: `Hukilow`**, **repo name: `minimax-usage`** (to be created). Used for:
  - `repository` field in `package.json`
  - README badges
  - CI triggers
  - Issue templates
- **CI:** GitHub Actions — `npm ci`, lint, build, package `.vsix`, upload artifact on tagged release.
- **Releases:** semantic-release or manual; pre-release channel available.
- **Publisher ID:** `Hukilow` (Marketplace publisher, claimed by user).
- **Display name:** `MiniMax Usage` (proper casing; package id stays `minimax-usage`).
- **Icon:** 128×128 PNG (marketplace requires PNG, not SVG).
- **Marketplace categories:** `Other`, `Visualization`.

---

## 6. Implementation Phases (proposed, NOT started)

| # | Phase | Output |
|---|---|---|
| 1 | **Scaffold** | `package.json`, `tsconfig`, esbuild, lint, activate/deactivate stub, status bar placeholder |
| 2 | **API + auth** | `QuotaClient`, types, `SecretStorage` flow, first manual fetch, error mapping |
| 3 | **Status bar** | Two panels (5h + weekly), refresh loop, color tiers, tooltips |
| 4 | **Sidebar TreeView** | Per-model nodes, toolbar actions, empty state |
| 5 | **Detail webview** | Usage bars, history ring buffer, uPlot chart, reset countdowns, CSP |
| 6 | **Commands & settings** | All palette commands wired; `package.json#contributes.configuration` |
| 7 | **Polish** | Theme tests, error toasts, Output channel logs, README screenshots |
| 8 | **Packaging** | README, LICENSE, icon, CHANGELOG, CI workflow, `.vsix` build |

---

## 7. Decisions Locked (from user)

| Question | Answer |
|---|---|
| Marketplace publisher ID | `Hukilow` (username, claimable) |
| GitHub repo location | **`Hukilow/minimax-usage`** (to be created on user's GitHub) |
| Extension display name | **`MiniMax Usage`** (proper casing; package id stays `minimax-usage`) |
| Default refresh interval | **60s** |
| Default status bar shape | **`compact`** (two-panel, no inline countdown) |
| CN region support | **No** — global only (`api.minimax.io`); CN code paths stubbed/disabled |
| History chart library | **Hand-rolled canvas chart** (~3KB, zero deps, sub-50KB webview bundle target) — *rationale:* the dashboard only needs two simple line charts, and a vanilla `<canvas>` keeps the webview truly self-contained with no third-party JS. uPlot was the original pick; on second pass a hand-rolled chart is the better fit for the project's "zero deps" profile. |
| Sidebar location | **Activity Bar bottom-right** (`minimaxUsage.sidebar`, `position: bottom`) |

---

## 8. Out of Scope (v1)

- CN region (explicitly excluded)
- OAuth device-code flow (uses API key only — same approach as `minimax-code` CLI's `api-key` mode)
- Pay-as-you-go API key support
- Multiple Teams / multi-account switching
- Cross-platform sync of history
- Notification on threshold crossing (could be a v1.1 feature)
- CI/CD pipeline to Marketplace (manual `.vsix` upload for v1)

---

## 9. Open Risks

- **API undocumented** — same risk as `claudemeter`; fields like `weekly_boost_permille` may change. Mitigation: defensive parsing, types are `interface` not strict unions, missing fields don't break the UI.
- **No rate-limit documentation** — 60s default refresh is conservative; settings allow tightening.
- **Bundle size vs features** — uPlot is small but we should keep webview assets under 100KB total.

---

## 10. Acceptance Criteria for v1

1. Extension installs from `.vsix` and activates.
2. User can set API key via command, status bar shows up within 5s.
3. Both 5h and weekly percentages, color-coded, visible at all times.
4. Hovering status bar shows absolute reset time + countdown.
5. Clicking opens a detail webview with usage bars, countdowns, history chart.
6. Manual `Refresh Now` works and updates all surfaces.
7. Invalid / revoked key shows a clear error toast + log to Output channel.
8. Extension handles network failures gracefully (no crash, last-known values shown, error banner).
9. Zero runtime npm dependencies.
10. README + LICENSE + CHANGELOG + CI green.

---

**STOP — Implementation has not been started.** Awaiting user approval to proceed.