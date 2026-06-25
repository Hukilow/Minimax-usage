---
description: Webview-specific rules for MiniMax Usage
applyTo: "src/webview/**"
---

# Webview Style — MiniMax Usage

The webview is sandboxed. Everything you write here runs in a VS Code webview, not Node.

## Constraints

- **No Node APIs.** No `require`, no `process`, no `fs`.
- **No `fetch`.** The webview's CSP has `connect-src 'none'`. All data comes via `acquireVsCodeApi().postMessage()`.
- **No `eval`, no `Function()` constructor.**
- **No `localStorage` / `sessionStorage`.** Persist state via `vscode.setState()` only.
- **No external scripts, no CDN.** The bundle is fully self-hosted.

## Communication

```ts
// Extension → webview
panel.webview.postMessage({ type: 'state', payload: { /* serializable */ } });

// Webview → extension
vscode.postMessage({ type: 'refresh' });
```

- Messages are JSON-serializable. No functions, no Buffers, no circular refs.
- The webview treats every message as untrusted. Always validate `type` and `payload` shape.

## Rendering

- **React/Vue/Svelte are not allowed** — the bundle is intentionally tiny. Use plain DOM (`innerHTML` is OK for trusted, server-shaped strings, but **never** inject user input).
- Escape all dynamic strings with the `escapeHtml()` helper in `main.ts`.
- For repeated updates, cache element references — don't re-query the DOM in a hot loop.

## Styles

- All styles live in `src/webview/styles.css` and use `var(--vscode-*)` for theming.
- No inline `<style>` tags (CSP-friendly).
- No `var(--vscode-*)` *additions* — only use what VS Code documents.

## Bundle size

- Keep the IIFE bundle under **50KB** (minified) per build.
- Profile the chart util: a hand-rolled canvas is fine. Avoid 200KB charting libs.

## Testing

- Pure functions (e.g. `chart.ts` helpers) get vitest tests in `src/test/`.
- DOM rendering is best tested manually in the Extension Development Host (`F5`).
