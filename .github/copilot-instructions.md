# Copilot Instructions — MiniMax Usage

> Project-level guidance for GitHub Copilot (Chat, Edits, Agent, Code Review).

## What this project is

A VS Code extension that displays **MiniMax Token Plan** quota (5-hour and weekly) in the status bar, sidebar, and a detail webview dashboard. Written in TypeScript, bundled with esbuild, with **zero runtime npm dependencies**.

## Core invariants (do not break)

1. **Zero runtime npm dependencies.** The `.vsix` ships nothing but the `vscode` API surface and our own bundled code. No `import x from 'pkg'` outside of devDependencies.
2. **No telemetry, no analytics, no error reporting service.** Offline-friendly by design.
3. **The user's API key is a secret.** It must:
   - Live in `SecretStorage` (never `settings.json`).
   - Never appear in logs, errors, or telemetry.
   - Never be sent anywhere except the documented `api.minimax.io` endpoint.
4. **Webview CSP is locked down:** `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`. No `connect-src`, no remote scripts.
5. **Defensive parsing of the API.** The Token Plan API is undocumented and fields may change. Missing or unknown fields must never crash the UI.

## Tech stack

- **Language:** TypeScript 5.7, strict mode, Node 22, ES2022 target.
- **Bundler:** esbuild (no webpack). Two builds: `dist/extension.js` (Node, CJS) and `dist/web/main.js` (browser, IIFE).
- **Test runner:** vitest.
- **Lint:** ESLint flat config.
- **No framework.** Plain functions and classes. DI via constructor params.

## Code style

- **Prefer pure functions** for anything testable. The webview, time utils, ring buffer, and response parser are all pure.
- **Discriminated unions** for state machines (e.g. `TreeNode`, `QuotaState`).
- **No `any`** unless absolutely necessary (and add a comment explaining why).
- **No `console.log`** in shipped code — use the `Logger` (Output channel) instead.
- **No `// eslint-disable`** without a justification comment.
- **Comments** explain *why*, not *what*. The code already says what.

## File map

| Path | Purpose |
|---|---|
| `src/extension.ts` | activate / deactivate, wires services together |
| `src/api/types.ts` | API response types (defensive, all fields optional) |
| `src/api/client.ts` | `QuotaClient` — fetch wrapper + error mapping |
| `src/api/quota.ts` | `QuotaService` — polling, normalization, history, subscribers |
| `src/auth/secrets.ts` | `SecretStorage` wrapper |
| `src/ui/statusBar.ts` | Two `StatusBarItem`s (5h + weekly), color tiers |
| `src/ui/treeView.ts` | Sidebar `TreeDataProvider` |
| `src/ui/detailsWebview.ts` | Detail webview host (CSP, message protocol) |
| `src/commands/register.ts` | Command Palette registration |
| `src/utils/{time,logger,regions,ringBuffer}.ts` | Pure helpers |
| `src/webview/main.ts` | Webview entry, message handling, render |
| `src/webview/chart.ts` | Hand-rolled canvas line chart |
| `src/webview/styles.css` | Webview styles (uses `var(--vscode-*)`) |
| `src/test/**` | vitest unit tests |

## Common tasks

- **Add a new command:** add an entry to `package.json#contributes.commands`, a handler in `src/commands/register.ts`, and (if relevant) a UI surface in `extension.ts` to wire it.
- **Add a new setting:** add to `package.json#contributes.configuration.properties`, then read it in `extension.ts` via `readConfigXxx` helpers.
- **Add a new API field:** add to `QuotaModelRemain` in `src/api/types.ts`, defensively, and map it in `normalizeWindow()` in `src/api/quota.ts`.
- **Touch the webview:** run `npm run build:web` (esbuild bundles `main.ts` + the chart util into `dist/web/main.js` and copies `styles.css`).
- **Run the full check suite:** `npm run typecheck && npm run lint && npm test && npm run build && npm run build:web`.

## What to avoid

- ❌ Adding npm packages at runtime (only `devDependencies` for build tools and test frameworks).
- ❌ Calling `fetch()` from the extension host without going through `QuotaClient`.
- ❌ Storing user data in `globalState` without a clear schema and a way to clear it.
- ❌ Using `webview.postMessage` to send the API key or any other secret.
- ❌ Loosening the webview CSP for "just one feature."
- ❌ `try { ... } catch {}` (empty catch) — always log or rethrow.

## When in doubt

- Read `PLAN.md` for the architecture rationale.
- Look at `src/api/quota.ts` for the canonical subscriber / state pattern.
- Mirror the style of neighbouring files.
- Add a unit test for any new pure helper.
