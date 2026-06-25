---
name: add-command
description: Scaffold a new Command Palette command for MiniMax Usage
---

# Add a Command

Scaffold a new Command Palette command following the project's conventions.

## Inputs

Ask the user for:
- Command ID (kebab-case, prefixed with `minimaxUsage.`)
- Title (will appear in Command Palette)
- Category (default: `Minimax Usage`)
- Optional: a keybinding

## Steps

1. **`package.json`** — add an entry to `contributes.commands`:
   ```json
   {
     "command": "minimaxUsage.<id>",
     "title": "Minimax Usage: <Title>",
     "category": "Minimax Usage"
   }
   ```

2. **`src/commands/register.ts`** — add:
   - A handler function in the `# --- handlers ---` section.
   - A `commands.registerCommand('minimaxUsage.<id>', () => handler(deps))` line in `registerCommands()`.

3. **Wire dependencies** if the handler needs services (`secrets`, `quota`, `details`, …) — they're all on the `CommandDeps` object.

4. **Update menus** if the command should appear in the sidebar toolbar (`package.json#contributes.menus.view/title`).

5. **Add to the README "Commands" table** if it's user-facing.

6. **Add a test** in `src/test/commands.test.ts` if the handler has non-trivial logic.

## Patterns

### Command that opens the webview

```ts
function openX(deps: CommandDeps): void {
  deps.details.show();
}
```

### Command that mutates state

```ts
async function clearX(deps: CommandDeps): Promise<void> {
  const confirm = await window.showWarningMessage('…', { modal: true }, 'Clear');
  if (confirm !== 'Clear') return;
  await deps.secrets.clearX();
  void window.showInformationMessage('…');
  void deps.quota.refreshNow();
}
```

### Command that toggles a setting

```ts
function toggleX(deps: CommandDeps): void {
  const next = !deps.getX();
  deps.setX(next);
  void window.showInformationMessage(`X: ${next}`);
}
```

## Do NOT

- Add a command that requires a new runtime npm dep.
- Add a command that sends the API key anywhere.
- Add a command whose handler has side effects not reflected in `QuotaState` (the UI will desync).
