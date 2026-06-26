/**
 * MiniMax Usage — VS Code extension entrypoint.
 *
 * This file is intentionally small. It wires the services together and
 * registers the lifecycle hooks. All real logic lives in dedicated modules.
 */

import type { ConfigurationChangeEvent, ExtensionContext} from 'vscode';
import { commands, window, workspace } from 'vscode';

import { Logger } from './utils/logger.js';
import { SecretsStore } from './auth/secrets.js';
import { QuotaService } from './api/quota.js';
import { QuotaHistoryStore, HISTORY_KEY } from './api/historyStore.js';
import { StatusBar } from './ui/statusBar.js';
import { DetailsWebview } from './ui/detailsWebview.js';
import { registerCommands } from './commands/register.js';
import type { RegionKey } from './utils/regions.js';

const CONFIG_PREFIX = 'minimaxUsage';

let logger: Logger;
let secrets: SecretsStore;
let quota: QuotaService;
let statusBar: StatusBar;
let details: DetailsWebview;
let historyStore: QuotaHistoryStore;

export function activate(context: ExtensionContext): void {
  // 1. Output channel + logger.
  const channel = window.createOutputChannel('Minimax Usage');
  logger = new Logger(channel, readConfigBoolean('debug', false));
  context.subscriptions.push(channel);

  // 2. Secrets store.
  secrets = new SecretsStore(context);

  // 3. Settings (read once + watch for changes).
  const showCountdown = readConfigBoolean('statusBar.showCountdown', false);
  const refreshSeconds = readConfigNumber('refreshIntervalSeconds', 60);
  const historyLimit = readConfigNumber('historySampleLimit', 100);
  const warning = readConfigNumber('warningThreshold', 70);
  const error = readConfigNumber('errorThreshold', 90);
  const region: RegionKey = 'global';

  // 4. Persistent history (debounced writer over globalState).
  historyStore = new QuotaHistoryStore(
    {
      read: () => context.globalState.get(HISTORY_KEY),
      // `globalState.update` is async; awaiting it serializes concurrent
      // flushes within this window. Across windows, the read-modify-write
      // merge inside the store handles synchronization.
      write: (blob) => Promise.resolve(context.globalState.update(HISTORY_KEY, blob)),
    },
    { limit: historyLimit, debounceMs: 5_000 },
  );
  context.subscriptions.push(historyStore);

  // 5. Quota service.
  quota = new QuotaService({
    region,
    intervalMs: refreshSeconds * 1000,
    historyLimit,
    logger,
    getApiKey: () => secrets.getApiKey(),
    historyStore,
  });
  context.subscriptions.push(quota);

  // 6. Status bar.
  statusBar = new StatusBar(context, {
    showCountdown,
    warningThreshold: warning,
    errorThreshold: error,
    onClick: () => details.show(),
  });
  context.subscriptions.push(statusBar);

  // 7. Detail webview (dashboard).
  details = new DetailsWebview(context, {
    onRefresh: () => quota.refreshNow(),
    onOpenBilling: () => commands.executeCommand('minimaxUsage.openBilling'),
    onSetApiKey: () => commands.executeCommand('minimaxUsage.setApiKey'),
    onClearHistory: () => {
      quota.clearHistory();
      logger.info('history cleared (dashboard)');
    },
  });
  context.subscriptions.push(details);

  // 8. Pipe QuotaState into UI surfaces.
  quota.subscribe((state) => {
    statusBar.render(state);
    details.update(state);
  });

  // 9. Start polling.
  quota.start();

  // 10. Watch for config changes.
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
      if (!e.affectsConfiguration(CONFIG_PREFIX)) return;
      applyConfigChange(e);
    }),
  );

  // 11. Register palette commands.
  const cmdDeps = {
    secrets,
    quota,
    statusBar,
    details,
    logger,
    getShowCountdown: () => readConfigBoolean('statusBar.showCountdown', false),
    setShowCountdown: (v: boolean) => void workspace.getConfiguration(CONFIG_PREFIX).update('statusBar.showCountdown', v, true),
    getQuotaState: () => quota.getState(),
    clearHistory: () => quota.clearHistory(),
  };
  for (const d of registerCommands(cmdDeps)) context.subscriptions.push(d);

  logger.info('activated');
}

export function deactivate(): void {
  // Flush any pending history write synchronously so we don't lose the
  // last few samples if VS Code is shutting down. `deactivate` is
  // synchronous so we fire-and-forget — the awaitable variant of
  // flushNow is also exposed for callers that want to await.
  void historyStore?.flushNow();
  historyStore?.dispose();
  logger?.info('deactivated');
}

function applyConfigChange(e: ConfigurationChangeEvent): void {
  if (e.affectsConfiguration(`${CONFIG_PREFIX}.refreshIntervalSeconds`)) {
    const s = readConfigNumber('refreshIntervalSeconds', 60);
    quota.setIntervalMs(s * 1000);
    logger.info(`refresh interval = ${s}s`);
  }
  if (e.affectsConfiguration(`${CONFIG_PREFIX}.statusBar.showCountdown`)) {
    statusBar.setShowCountdown(readConfigBoolean('statusBar.showCountdown', false));
    // Force a render with the latest known state so the countdown appears
    // immediately, even before the next poll fires.
    statusBar.render(quota.getState());
  }
  if (
    e.affectsConfiguration(`${CONFIG_PREFIX}.warningThreshold`) ||
    e.affectsConfiguration(`${CONFIG_PREFIX}.errorThreshold`)
  ) {
    // Re-render with the latest known state so the new tier colors apply
    // immediately, without waiting for the next poll.
    statusBar.render(quota.getState());
  }
  if (e.affectsConfiguration(`${CONFIG_PREFIX}.historySampleLimit`)) {
    quota.setHistoryLimit(readConfigNumber('historySampleLimit', 100));
  }
  if (e.affectsConfiguration(`${CONFIG_PREFIX}.debug`)) {
    logger.setDebug(readConfigBoolean('debug', false));
  }
  if (e.affectsConfiguration(`${CONFIG_PREFIX}.charts.persistHistory`)) {
    const persist = readConfigBoolean('charts.persistHistory', true);
    if (!persist) {
      // User just turned persistence off — wipe the existing blob so we
      // don't keep data they explicitly said they don't want stored.
      historyStore.clear();
      quota.clearHistory();
      logger.info('history persistence disabled; cleared stored history');
    } else {
      logger.info('history persistence enabled');
    }
  }
  if (e.affectsConfiguration(`${CONFIG_PREFIX}.charts.timeRange`)) {
    // Push the new setting to the open dashboard so it re-renders with it,
    // even when the change came from the VS Code settings UI.
    details.refreshSettings();
  }
}

// ---- config helpers --------------------------------------------------------

function cfg<T>(key: string, fallback: T, parse: (raw: unknown) => T): T {
  const v = workspace.getConfiguration(CONFIG_PREFIX).get<T>(key);
  return v === undefined ? fallback : parse(v);
}

function readConfigNumber(key: string, fallback: number): number {
  return cfg(key, fallback, (v) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback));
}

function readConfigBoolean(key: string, fallback: boolean): boolean {
  return cfg(key, fallback, (v) => (typeof v === 'boolean' ? v : fallback));
}
