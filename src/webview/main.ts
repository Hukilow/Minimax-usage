/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Webview entry. Bundled by esbuild into dist/web/main.js (IIFE).
 *
 * This file runs in a sandboxed VS Code webview — no Node, no fetch, no
 * eval. Communication with the extension is one-way: we receive `state`
 * messages and send `refresh` / `openBilling` / `setApiKey` /
 * `setChartOption` / `clearHistory` requests.
 */

import { drawLineChart } from './chart.js';
import type { DashboardSnapshot, DashboardChartSettings } from '../ui/detailsWebview.js';
import { tierFor } from '../utils/tier.js';

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

// Tell the extension we're alive and ready to receive state. Without this,
// the extension's `onDidReceiveMessage('ready')` handler never fires and the
// webview shows the "Loading…" placeholder until the user clicks Refresh.
vscode.postMessage({ type: 'ready' });

// Refresh the live countdowns every minute so the dashboard stays accurate
// without requiring the user to click Refresh. The cached payload is enough
// because countdowns derive from `endTime`, not from a re-fetch.
setInterval(() => {
  const cached = vscode.getState() as DashboardSnapshot | null;
  if (cached) render(cached);
}, 30_000);

// ---------------------------------------------------------------------------
// Time-range filter
// ---------------------------------------------------------------------------

const RANGE_MS: Record<DashboardChartSettings['timeRange'], number> = {
  '1h': 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '3d': 3 * 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
  all: Number.POSITIVE_INFINITY,
};

const RANGE_LABELS: readonly DashboardChartSettings['timeRange'][] = ['1h', '6h', '24h', '3d', '7d', 'all'];

/**
 * For each range, the number of timestamps that fall inside it. Used to
 * disable chips whose range has no data so the UI never looks "broken".
 */
function rangeAvailability(
  timestamps: number[],
  now: number,
): Record<DashboardChartSettings['timeRange'], number> {
  const out = {} as Record<DashboardChartSettings['timeRange'], number>;
  for (const r of RANGE_LABELS) {
    const span = RANGE_MS[r];
    if (!Number.isFinite(span)) {
      out[r] = timestamps.length;
      continue;
    }
    const cutoff = now - span;
    let count = 0;
    for (const t of timestamps) {
      if (t >= cutoff) count++;
    }
    out[r] = count;
  }
  return out;
}

/** Shortest range that contains at least one sample, or `all` as fallback. */
function recommendRange(timestamps: number[], now: number): DashboardChartSettings['timeRange'] {
  const avail = rangeAvailability(timestamps, now);
  for (const r of RANGE_LABELS) {
    if (avail[r] > 0) return r;
  }
  return 'all';
}

interface FilteredChartData {
  timestamps: number[];
  series: Array<{ label: string; values: number[]; color: string; model: string; window: 'interval' | 'weekly' }>;
}

function filterSeriesForChart(s: DashboardSnapshot, window: 'interval' | 'weekly', now: number): FilteredChartData {
  // 1. Pick the slice of timestamps that fall inside the selected range.
  const span = RANGE_MS[s.chartSettings.timeRange];
  const cutoff = Number.isFinite(span) ? now - span : Number.NEGATIVE_INFINITY;
  let startIdx = 0;
  if (Number.isFinite(cutoff)) {
    let lo = 0;
    let hi = s.history.timestamps.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (s.history.timestamps[mid]! < cutoff) lo = mid + 1;
      else hi = mid;
    }
    startIdx = lo;
  }
  const timestamps = s.history.timestamps.slice(startIdx);

  // 2. Keep only the series for this window. The `video` model is also
  //    filtered out here as defence in depth: even if the snapshot ever
  //    leaks through, no line is ever drawn. (The serializer already
  //    strips it; this is belt-and-suspenders.)
  const series: FilteredChartData['series'] = [];
  for (const src of s.history.series) {
    if (src.window !== window) continue;
    if (src.model === 'video') continue;
    series.push({
      label: src.model,
      values: src.values.slice(startIdx),
      color: colorFor(src.model),
      model: src.model,
      window,
    });
  }

  return { timestamps, series };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

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

  const now = s.history.timestamps.at(-1) ?? Date.now();
  const avail = rangeAvailability(s.history.timestamps, now);

  // No samples at all yet — show a friendly waiting state and skip the
  // chips entirely so they don't look inert.
  if (s.history.timestamps.length === 0) {
    root.innerHTML = `
      ${errorBanner}
      <section class="meta">
        <span>Region: <strong>${escapeHtml(s.region.label)}</strong></span>
        <span>Last fetch: <strong>${escapeHtml(lastFetch)}</strong></span>
      </section>
      <section class="grid">${summary}</section>
      <section class="charts">
        <h2>History</h2>
        <div class="chart-empty">
          <p><strong>Collecting samples…</strong></p>
          <p class="muted">Charts will appear after the first poll (about ${Math.max(1, Math.ceil(60 - (now % 60_000) / 1000))}s).</p>
        </div>
      </section>
    `;
    return;
  }

  // We have samples — decide whether the current chip is useful, and
  // disable chips whose range has no data.
  const currentAvail = avail[s.chartSettings.timeRange];
  const showJumpToOneH = currentAvail === 0;
  const hintText = bufferHint(s.history.timestamps, now);

  root.innerHTML = `
    ${errorBanner}
    <section class="meta">
      <span>Region: <strong>${escapeHtml(s.region.label)}</strong></span>
      <span>Last fetch: <strong>${escapeHtml(lastFetch)}</strong></span>
    </section>
    <section class="grid">${summary}</section>
    <section class="charts">
      <h2>History</h2>
      ${chartsControlsHtml(s.chartSettings, avail)}
      ${hintText ? `<p class="charts-hint muted">${escapeHtml(hintText)}</p>` : ''}
      ${showJumpToOneH ? `<p class="charts-hint warn">No samples in the <strong>${escapeHtml(s.chartSettings.timeRange)}</strong> range yet. <button class="link-btn" id="jump-to-1h" type="button">Show ${escapeHtml(recommendRange(s.history.timestamps, now))}</button></p>` : ''}
      ${chartBlockHtml('5-hour window', 'chart-interval')}
      ${chartBlockHtml('Weekly window', 'chart-weekly')}
    </section>
  `;

  wireControls(s);
  drawChart(s, 'interval', now);
  drawChart(s, 'weekly', now);
}

/** Short sentence describing how much data is in the buffer, for above the charts. */
function bufferHint(timestamps: number[], now: number): string {
  if (timestamps.length === 0) return '';
  const oldest = timestamps[0]!;
  const spanMs = now - oldest;
  if (spanMs < 5 * 60_000) return `Collected ${timestamps.length} samples over the last ${formatCompact(spanMs)}.`;
  return `Showing ${timestamps.length} samples spanning ${formatCompact(spanMs)}.`;
}

function formatCompact(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
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
  const pct = Math.max(0, Math.min(100, w.usedPercent));
  const tier = tierFor(pct, thresholds);
  const remaining = Math.max(0, Math.min(100, w.remainingPercent));
  return `
    <div class="bar-row">
      <div class="bar-label">${label} <span class="status">${escapeHtml(w.statusLabel)}</span></div>
      <div class="bar-track">
        <div class="bar-fill ${tier}" style="width: ${pct}%"></div>
        <span class="bar-text">${pct}% used</span>
      </div>
      <div class="bar-meta">${remaining}% remaining · resets in <strong>${escapeHtml(w.remainsLabel)}</strong></div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Charts controls (time-range chips + per-series checkboxes + clear button)
// ---------------------------------------------------------------------------

function chartsControlsHtml(
  c: DashboardChartSettings,
  avail?: Record<DashboardChartSettings['timeRange'], number>,
): string {
  const chip = (r: DashboardChartSettings['timeRange']) => {
    const count = avail?.[r];
    const empty = count === 0;
    const cls = ['chip'];
    if (r === c.timeRange) cls.push('active');
    if (empty && r !== 'all') cls.push('disabled');
    const title = empty && r !== 'all'
      ? `No samples yet for ${r}.`
      : r === 'all'
        ? 'Show everything in the buffer.'
        : `Show the last ${r}.`;
    return `<button class="${cls.join(' ')}" data-range="${r}" type="button" role="tab" aria-selected="${r === c.timeRange}" title="${escapeHtml(title)}"${empty && r !== 'all' ? ' disabled' : ''}>${r}</button>`;
  };
  return `
    <div class="charts-controls">
      <div class="chips" role="tablist" aria-label="Time range">
        ${RANGE_LABELS.map(chip).join('')}
      </div>
      <button id="clear-history" class="secondary" type="button" title="Wipe the history kept across VS Code restarts">Clear history</button>
    </div>
  `;
}

function chartBlockHtml(title: string, canvasId: string): string {
  return `
    <div class="chart-block">
      <h3>${escapeHtml(title)}</h3>
      <div class="chart-frame">
        <canvas id="${canvasId}" width="800" height="200"></canvas>
        <div class="crosshair"></div>
        <div class="tooltip" role="status" aria-live="polite"></div>
      </div>
    </div>
  `;
}

function wireControls(s: DashboardSnapshot): void {
  // Range chips — optimistic update + persist via extension.
  root.querySelectorAll<HTMLButtonElement>('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const range = btn.dataset.range as DashboardChartSettings['timeRange'] | undefined;
      if (!range || !RANGE_LABELS.includes(range)) return;
      vscode.postMessage({ type: 'setChartOption', key: 'charts.timeRange', value: range });
      // Optimistic local update so the UI feels instant.
      const mutated: DashboardSnapshot = {
        ...s,
        chartSettings: { ...s.chartSettings, timeRange: range },
      };
      vscode.setState(mutated);
      render(mutated);
    });
  });

  // "Jump to <range>" link shown when the current range is empty.
  document.getElementById('jump-to-1h')?.addEventListener('click', () => {
    const target = recommendRange(s.history.timestamps, Date.now());
    vscode.postMessage({ type: 'setChartOption', key: 'charts.timeRange', value: target });
    const mutated: DashboardSnapshot = {
      ...s,
      chartSettings: { ...s.chartSettings, timeRange: target },
    };
    vscode.setState(mutated);
    render(mutated);
  });

  // Clear history.
  document.getElementById('clear-history')?.addEventListener('click', () => {
    if (!window.confirm('Wipe stored chart history? The dashboard will start collecting again immediately.')) return;
    vscode.postMessage({ type: 'clearHistory' });
  });
}

// ---------------------------------------------------------------------------
// Chart rendering + hover tooltip
// ---------------------------------------------------------------------------

function drawChart(s: DashboardSnapshot, window: 'interval' | 'weekly', now: number): void {
  const canvasId = window === 'interval' ? 'chart-interval' : 'chart-weekly';
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;

  const data = filterSeriesForChart(s, window, now);

  if (data.timestamps.length === 0) {
    drawEmpty(canvas, 'No samples in this range yet.');
    attachTooltip(canvas, data);
    return;
  }
  if (data.series.length === 0) {
    drawEmpty(canvas, 'All series hidden. Toggle one above to see data.');
    attachTooltip(canvas, data);
    return;
  }

  drawLineChart(canvas, data.timestamps, data.series, { yMax: 100, yMin: 0 });
  attachTooltip(canvas, data);
}

function drawEmpty(canvas: HTMLCanvasElement, message: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Reset transform (drawLineChart may have applied a dpr scale).
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const cssWidth = canvas.width;
  const cssHeight = canvas.height;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = 'rgba(127,127,127,0.7)';
  ctx.font = '12px var(--vscode-font-family, sans-serif)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, cssWidth / 2, cssHeight / 2);
}

function attachTooltip(canvas: HTMLCanvasElement, data: FilteredChartData): void {
  const frame = canvas.parentElement;
  if (!frame) return;
  const tooltip = frame.querySelector<HTMLDivElement>('.tooltip');
  const crosshair = frame.querySelector<HTMLDivElement>('.crosshair');
  if (!tooltip || !crosshair) return;

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (data.timestamps.length === 0) return;

    // x in [0, rect.width] → index in [0, timestamps.length - 1]
    const t = Math.max(0, Math.min(1, x / Math.max(1, rect.width)));
    const idx = Math.round(t * (data.timestamps.length - 1));

    crosshair.style.display = 'block';
    crosshair.style.left = `${x}px`;
    crosshair.style.height = `${rect.height}px`;

    tooltip.style.display = 'block';
    const tooltipWidth = 180;
    const left = Math.min(Math.max(8, x + 12), Math.max(8, rect.width - tooltipWidth - 8));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `8px`;

    const ts = data.timestamps[idx]!;
    const time = new Date(ts).toLocaleString(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit', month: 'short', day: 'numeric',
    });
    const rows = data.series
      .map((s) => {
        const v = s.values[idx];
        if (!Number.isFinite(v)) return '';
        return `<div class="tt-row"><span class="tt-dot" style="background:${escapeHtml(s.color)}"></span><span class="tt-model">${escapeHtml(s.model)}</span><span class="tt-val">${Math.round(v as number)}%</span></div>`;
      })
      .join('');
    tooltip.innerHTML = `<div class="tt-time">${escapeHtml(time)}</div>${rows || '<div class="tt-empty">no data</div>'}`;
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
    crosshair.style.display = 'none';
  });
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

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
