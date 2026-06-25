import type { ExtensionContext, Webview, WebviewPanel, Disposable } from 'vscode';
import { Uri, ViewColumn, window } from 'vscode';
import type { QuotaState } from '../api/quota.js';
import { QuotaStatus } from '../api/types.js';
import { Regions } from '../utils/regions.js';

export interface DetailsWebviewCallbacks {
  /** Triggered when the webview asks the extension to refresh. */
  onRefresh: () => void;
  /** Triggered when the webview asks to open the billing page in the OS browser. */
  onOpenBilling: () => void;
  /** Triggered when the webview asks to set the API key. */
  onSetApiKey: () => void;
}

/**
 * Hosts the detail webview. Renders the HTML, locks down the CSP, and pipes
 * QuotaState snapshots into the webview via `postMessage`.
 */
export class DetailsWebview {
  private panel: WebviewPanel | null = null;
  private disposables: Disposable[] = [];
  private state: QuotaState | null = null;

  constructor(
    private readonly ctx: ExtensionContext,
    private readonly callbacks: DetailsWebviewCallbacks,
  ) {}

  /** Shows the webview, creating it if needed. */
  show(): void {
    if (this.panel) {
      this.panel.reveal(ViewColumn.Active);
      if (this.state) this.postState();
      return;
    }
    this.panel = window.createWebviewPanel(
      'minimaxUsage.dashboard',
      'Minimax Usage — Dashboard',
      ViewColumn.Active,
      {
        enableScripts: true,
        enableCommandUris: false,
        retainContextWhenHidden: true,
        localResourceRoots: [
          Uri.joinPath(this.ctx.extensionUri, 'dist', 'web'),
          Uri.joinPath(this.ctx.extensionUri, 'media'),
        ],
      },
    );
    this.panel.iconPath = Uri.joinPath(this.ctx.extensionUri, 'media', 'icon.png');
    this.panel.webview.html = this.renderHtml(this.panel.webview);

    // Wire message handler.
    this.panel.webview.onDidReceiveMessage(
      (msg: { type: string; payload?: unknown }) => {
        switch (msg.type) {
          case 'ready':
            if (this.state) this.postState();
            break;
          case 'refresh':
            this.callbacks.onRefresh();
            break;
          case 'openBilling':
            this.callbacks.onOpenBilling();
            break;
          case 'setApiKey':
            this.callbacks.onSetApiKey();
            break;
        }
      },
      undefined,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  /** Sends a state snapshot to the webview. */
  update(state: QuotaState): void {
    this.state = state;
    if (this.panel) this.postState();
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  // --- internals -----------------------------------------------------------

  private postState(): void {
    if (!this.panel || !this.state) return;
    void this.panel.webview.postMessage({
      type: 'state',
      payload: serializeState(this.state),
    });
  }

  private renderHtml(webview: Webview): string {
    const scriptUri = webview.asWebviewUri(Uri.joinPath(this.ctx.extensionUri, 'dist', 'web', 'main.js'));
    const stylesUri = webview.asWebviewUri(Uri.joinPath(this.ctx.extensionUri, 'dist', 'web', 'styles.css'));
    const cspSource = webview.cspSource;

    // Strict CSP. uPlot/charts are inlined into our bundle; no third-party.
    const csp = [
      "default-src 'none'",
      `script-src 'self' ${cspSource}`,
      `style-src 'self' 'unsafe-inline' ${cspSource}`,
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'none'",
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>Minimax Usage — Dashboard</title>
  <link rel="stylesheet" href="${stylesUri.toString()}" />
</head>
<body>
  <header class="topbar">
    <h1>Minimax Usage</h1>
    <div class="actions">
      <button id="refresh" type="button">Refresh</button>
      <button id="billing" type="button">Open Billing</button>
      <button id="setkey" class="secondary" type="button">Set API Key</button>
    </div>
  </header>
  <main id="root">
    <p class="loading">Loading…</p>
  </main>
  <script src="${scriptUri.toString()}"></script>
</body>
</html>`;
  }
}

// ---- pure serializer (testable) -------------------------------------------

export interface DashboardSnapshot {
  hasKey: boolean;
  inFlight: boolean;
  lastSuccessAt?: string;
  lastFetchAt?: string;
  lastError?: { kind: string; message: string; status?: number };
  perModel: Array<{
    model_name: string;
    interval: {
      usedPercent: number;
      remainingPercent: number;
      status: number;
      statusLabel: string;
      endTime?: string;
      remainsLabel: string;
    };
    weekly: {
      usedPercent: number;
      remainingPercent: number;
      status: number;
      statusLabel: string;
      endTime?: string;
      remainsLabel: string;
    };
  }>;
  history: {
    timestamps: number[];
    series: Array<{
      model: string;
      window: 'interval' | 'weekly';
      values: number[];
    }>;
  };
  region: { key: string; label: string; billingUrl: string };
  thresholds: { warning: number; error: number };
}

function serializeState(state: QuotaState): DashboardSnapshot {
  const formatTime = (ms?: number) => (ms ? new Date(ms).toISOString() : undefined);

  const perModel = (state.perModel ?? []).map((m) => ({
    model_name: m.model_name,
    interval: serializeWindow(m.interval.usedPercent, m.interval.remainingPercent, m.interval.status, m.interval.endTime),
    weekly: serializeWindow(m.weekly.usedPercent, m.weekly.remainingPercent, m.weekly.status, m.weekly.endTime),
  }));

  const history: DashboardSnapshot['history'] = {
    timestamps: state.history.map((h: { timestamp: number }) => h.timestamp),
    series: [],
  };
  const seen = new Set<string>();
  for (const sample of state.history) {
    for (const model of Object.keys(sample.perModel)) {
      const k1 = `${model}::interval`;
      if (!seen.has(k1)) {
        seen.add(k1);
        history.series.push({
          model,
          window: 'interval',
          values: state.history.map((s: { perModel: Record<string, { interval: { usedPercent: number } }> }) =>
            s.perModel[model]?.interval.usedPercent ?? Number.NaN,
          ),
        });
      }
      const k2 = `${model}::weekly`;
      if (!seen.has(k2)) {
        seen.add(k2);
        history.series.push({
          model,
          window: 'weekly',
          values: state.history.map((s: { perModel: Record<string, { weekly: { usedPercent: number } }> }) =>
            s.perModel[model]?.weekly.usedPercent ?? Number.NaN,
          ),
        });
      }
    }
  }

  return {
    hasKey: state.hasKey,
    inFlight: state.inFlight,
    lastSuccessAt: formatTime(state.lastSuccessAt),
    lastFetchAt: formatTime(state.lastFetchAt),
    lastError: state.lastError
      ? { kind: state.lastError.kind, message: state.lastError.message, status: state.lastError.status }
      : undefined,
    perModel,
    history,
    region: {
      key: 'global',
      label: Regions.global.label,
      billingUrl: Regions.global.billingUrl,
    },
    thresholds: { warning: 70, error: 90 },
  };
}

function serializeWindow(
  usedPercent: number,
  remainingPercent: number,
  status: number,
  endTime?: number,
): DashboardSnapshot['perModel'][number]['interval'] {
  return {
    usedPercent,
    remainingPercent,
    status,
    statusLabel: statusLabel(status),
    endTime: endTime ? new Date(endTime).toISOString() : undefined,
    remainsLabel: formatRemains(endTime),
  };
}

function statusLabel(s: number): string {
  if (s === QuotaStatus.Exhausted) return 'exhausted';
  if (s === QuotaStatus.Unlimited) return 'unlimited';
  return 'limited';
}

function formatRemains(endTime: number | undefined): string {
  if (!endTime) return '—';
  const ms = endTime - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}
