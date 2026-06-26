/**
 * Centralized command registration. Each command is a thin handler that
 * delegates to a service (QuotaService, SecretsStore, DetailsWebview, etc.)
 * registered in the extension context.
 */

import type { Disposable} from 'vscode';
import { commands, env, Uri, window } from 'vscode';
import type { SecretsStore } from '../auth/secrets.js';
import type { QuotaService } from '../api/quota.js';
import type { QuotaState } from '../api/quota.js';
import type { DetailsWebview } from '../ui/detailsWebview.js';
import type { Logger } from '../utils/logger.js';
import { Regions } from '../utils/regions.js';
import type { StatusBar } from '../ui/statusBar.js';

export interface CommandDeps {
  secrets: SecretsStore;
  quota: QuotaService;
  statusBar: StatusBar;
  details: DetailsWebview;
  logger: Logger;
  /** Reads/writes the status bar countdown setting. */
  getShowCountdown: () => boolean;
  setShowCountdown: (v: boolean) => void;
  /** Returns the current QuotaState so a toggle can re-render immediately. */
  getQuotaState: () => QuotaState;
  /** Wipes stored + in-memory history. */
  clearHistory: () => void;
}

export function registerCommands(deps: CommandDeps): Disposable[] {
  return [
    commands.registerCommand('minimaxUsage.setApiKey', () => setApiKey(deps)),
    commands.registerCommand('minimaxUsage.clearApiKey', () => clearApiKey(deps)),
    commands.registerCommand('minimaxUsage.refresh', () => refresh(deps)),
    commands.registerCommand('minimaxUsage.openDashboard', () => openDashboard(deps)),
    commands.registerCommand('minimaxUsage.openBilling', () => openBilling()),
    commands.registerCommand('minimaxUsage.toggleStatusBarCountdown', () => toggleStatusBarCountdown(deps)),
    commands.registerCommand('minimaxUsage.clearHistory', () => clearHistory(deps)),
  ];
}

// --- handlers --------------------------------------------------------------

async function setApiKey(deps: CommandDeps): Promise<void> {
  const current = await deps.secrets.getApiKey();
  const input = await window.showInputBox({
    title: 'MiniMax Usage — Set API Key',
    prompt: 'Paste your MiniMax Token Plan Subscription Key',
    placeHolder: 'sk-cp-…',
    password: true,
    value: current ?? '',
    ignoreFocusOut: true,
    validateInput: (v) => (v && v.trim().length > 10 ? null : 'Key looks too short'),
  });
  if (input === undefined) return;
  try {
    await deps.secrets.setApiKey(input);
    void window.showInformationMessage('MiniMax Usage: API key saved.');
    deps.logger.info('API key updated');
    void deps.quota.refreshNow();
  } catch (err) {
    deps.logger.error('Failed to save API key', err);
    void window.showErrorMessage('MiniMax Usage: failed to save API key.');
  }
}

async function clearApiKey(deps: CommandDeps): Promise<void> {
  const confirm = await window.showWarningMessage(
    'MiniMax Usage — Clear API Key?',
    { modal: true },
    'Clear',
  );
  if (confirm !== 'Clear') return;
  await deps.secrets.clearApiKey();
  void window.showInformationMessage('MiniMax Usage: API key cleared.');
  deps.logger.info('API key cleared');
  void deps.quota.refreshNow();
}

async function refresh(deps: CommandDeps): Promise<void> {
  await deps.quota.refreshNow();
}

function openDashboard(deps: CommandDeps): void {
  deps.details.show();
}

function openBilling(): void {
  void env.openExternal(Uri.parse(Regions.global.billingUrl));
}

/**
 * Flips the inline countdown in the status bar and notifies the user so they
 * know the toggle took effect. The setting is persisted through the normal
 * VS Code configuration flow; we just read/write the current value here.
 */
function toggleStatusBarCountdown(deps: CommandDeps): void {
  const next = !deps.getShowCountdown();
  deps.setShowCountdown(next);
  deps.statusBar.setShowCountdown(next);
  // Force a render with the latest known state so the countdown appears
  // immediately, even before the next poll fires (e.g. just after install,
  // before any fetch has succeeded).
  deps.statusBar.render(deps.getQuotaState());
  deps.logger.info(`status bar countdown = ${next ? 'on' : 'off'}`);
  void window.showInformationMessage(
    `Minimax Usage — status bar countdown ${next ? 'enabled' : 'disabled'}.`,
  );
}

async function clearHistory(deps: CommandDeps): Promise<void> {
  const confirm = await window.showWarningMessage(
    'Minimax Usage — Clear stored chart history?',
    { modal: true, detail: 'Removes every sample kept across VS Code restarts. The dashboard will start collecting again immediately.' },
    'Clear',
  );
  if (confirm !== 'Clear') return;
  deps.clearHistory();
  deps.logger.info('history cleared');
  void window.showInformationMessage('Minimax Usage: history cleared.');
}
