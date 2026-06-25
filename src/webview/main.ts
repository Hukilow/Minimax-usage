/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Webview entry. Bundled by esbuild into dist/web/main.js (IIFE).
 *
 * This file runs in a sandboxed VS Code webview — no Node, no fetch, no
 * eval. Communication with the extension is one-way: we receive `state`
 * messages and send `refresh` / `openBilling` / `setApiKey` requests.
 */

import { drawLineChart } from './chart.js';
import type { DashboardSnapshot } from '../ui/detailsWebview.js';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

const root = document.getElementById('root') as HTMLElement;
const refreshBtn = document.getElementById('refresh') as HTMLButtonElement;
const billingBtn = document.getElementById('billing') as HTMLButtonElement;
const setKeyBtn = document.getElementById('setkey') as HTMLButtonElement;

refreshBtn.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
billingBtn.addEventListener('click', () => vscode.postMessage({ type: 'openBilling' }));
setKeyBtn.addEventListener('click', () => vscode.postMessage({ type: 'setApiKey' }));

// Restore from previous state if any (retainContextWhenHidden is true).
const previous = vscode.getState() as DashboardSnapshot | null;
if (previous) {
  render(previous);
}

window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as { type: string; payload?: DashboardSnapshot };
  if (msg.type === 'state' && msg.payload) {
    vscode.setState(msg.payload);
    render(msg.payload);
  }
});

function render(s: DashboardSnapshot): void {
  if (!s.hasKey) {
    root.innerHTML = `
      <section class="empty">
        <h2>No API key configured</h2>
        <p>Run <code>Minimax Usage: Set API Key</code> from the Command Palette to start tracking your quota.</p>
        <button id="setkey-inline" type="button">Set API Key</button>
      </section>`;
    document.getElementById('setkey-inline')?.addEventListener('click', () =>
      vscode.postMessage({ type: 'setApiKey' }),
    );
    return;
  }

  if (s.lastError && s.perModel.length === 0) {
    root.innerHTML = `
      <section class="error">
        <h2>Last fetch failed</h2>
        <p>${escapeHtml(s.lastError.message)}</p>
        <p class="muted">${escapeHtml(s.lastError.kind)}${s.lastError.status ? ' · HTTP ' + s.lastError.status : ''}</p>
      </section>`;
    return;
  }

  if (s.perModel.length === 0) {
    root.innerHTML = `<p class="loading">${s.inFlight ? 'Loading…' : 'No data yet'}</p>`;
    return;
  }

  const summary = s.perModel
    .map((m) => rowHtml(m, s.thresholds))
    .join('');

  const errorBanner = s.lastError
    ? `<div class="banner banner-error">Last fetch failed: ${escapeHtml(s.lastError.message)}</div>`
    : '';

  const lastFetch = s.lastSuccessAt
    ? new Date(s.lastSuccessAt).toLocaleString()
    : 'never';

  root.innerHTML = `
    ${errorBanner}
    <section class="meta">
      <span>Region: <strong>${escapeHtml(s.region.label)}</strong></span>
      <span>Last fetch: <strong>${escapeHtml(lastFetch)}</strong></span>
    </section>
    <section class="grid">${summary}</section>
    <section class="charts">
      <h2>History</h2>
      <div class="chart-block">
        <h3>5-hour window</h3>
        <canvas id="chart-interval" width="800" height="200"></canvas>
      </div>
      <div class="chart-block">
        <h3>Weekly window</h3>
        <canvas id="chart-weekly" width="800" height="200"></canvas>
      </div>
    </section>
  `;

  // Draw charts (canvas, no DOM cost).
  const intervalData = s.history.series
    .filter((x) => x.window === 'interval')
    .map((x) => ({ label: x.model, values: x.values, color: colorFor(x.model) }));
  const weeklyData = s.history.series
    .filter((x) => x.window === 'weekly')
    .map((x) => ({ label: x.model, values: x.values, color: colorFor(x.model) }));

  const ival = document.getElementById('chart-interval') as HTMLCanvasElement | null;
  const wval = document.getElementById('chart-weekly') as HTMLCanvasElement | null;
  if (ival && s.history.timestamps.length > 0) {
    drawLineChart(ival, s.history.timestamps, intervalData, { yMax: 100, yMin: 0 });
  }
  if (wval && s.history.timestamps.length > 0) {
    drawLineChart(wval, s.history.timestamps, weeklyData, { yMax: 100, yMin: 0 });
  }
}

function rowHtml(
  m: DashboardSnapshot['perModel'][number],
  thresholds: { warning: number; error: number },
): string {
  return `
    <article class="card">
      <header>
        <h3>${escapeHtml(m.model_name)}</h3>
      </header>
      <div class="bar-group">
        ${bar('5h', m.interval, thresholds)}
        ${bar('Wk', m.weekly, thresholds)}
      </div>
    </article>`;
}

function bar(
  label: string,
  w: DashboardSnapshot['perModel'][number]['interval'],
  thresholds: { warning: number; error: number },
): string {
  const pct = Math.max(0, Math.min(100, w.remainingPercent));
  const tier = tierFor(pct, thresholds);
  return `
    <div class="bar-row">
      <div class="bar-label">${label} <span class="status">${escapeHtml(w.statusLabel)}</span></div>
      <div class="bar-track">
        <div class="bar-fill ${tier}" style="width: ${pct}%"></div>
        <span class="bar-text">${pct}%</span>
      </div>
      <div class="bar-meta">resets in <strong>${escapeHtml(w.remainsLabel)}</strong></div>
    </div>`;
}

function tierFor(pct: number, t: { warning: number; error: number }): 'ok' | 'warn' | 'err' {
  if (pct < t.error) return 'err';
  if (pct < t.warning) return 'warn';
  return 'ok';
}

function colorFor(model: string): string {
  // Stable hash → HSL. Bright, theme-independent.
  let hash = 0;
  for (let i = 0; i < model.length; i++) hash = (hash * 31 + model.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

function escapeHtml(s: string | undefined | null): string {
  if (s === undefined || s === null) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
