import type { OutputChannel } from 'vscode';

/**
 * Tiny logger that writes to a VS Code OutputChannel. We never log secrets.
 *
 * Verbosity is controlled by the `minimaxUsage.debug` setting — call sites
 * should use `debug()` for chatty info and `info()` / `warn()` / `error()`
 * for things the user might want to see regardless of the setting.
 */
export class Logger {
  private readonly channel: OutputChannel;
  private debugEnabled: boolean;

  constructor(channel: OutputChannel, debugEnabled = false) {
    this.channel = channel;
    this.debugEnabled = debugEnabled;
  }

  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  info(message: string): void {
    this.channel.appendLine(`[info]  ${message}`);
  }

  warn(message: string): void {
    this.channel.appendLine(`[warn]  ${message}`);
  }

  error(message: string, err?: unknown): void {
    const detail = err === undefined ? '' : ` — ${describe(err)}`;
    this.channel.appendLine(`[error] ${message}${detail}`);
  }

  debug(message: string): void {
    if (this.debugEnabled) {
      this.channel.appendLine(`[debug] ${message}`);
    }
  }

  show(): void {
    this.channel.show(true);
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const meta = err as unknown as { kind?: string; status?: number; upstreamMsg?: string };
    const extra = meta.kind
      ? ` (${meta.kind}${meta.status ? `, status=${meta.status}` : ''})`
      : '';
    return `${err.name}: ${err.message}${extra}`;
  }
  return String(err);
}
