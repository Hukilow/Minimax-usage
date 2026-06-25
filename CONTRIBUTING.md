# Contributing to MiniMax Usage

Thanks for your interest in **MiniMax Usage**! This project welcomes contributions — bug reports, fixes, features, docs, and tests.

## 🧭 Ground rules

- **Be respectful.** See the [VS Code Code of Conduct](https://github.com/microsoft/vscode/wiki/Code-of-Conduct).
- **Keep it small and reviewable.** Open one PR per logical change.
- **Zero runtime dependencies** is a hard constraint for v1. Don't add npm runtime deps.
- **No telemetry, no analytics, no error reporting** — keep the extension offline-friendly.

## 🛠️ Local setup

```bash
git clone https://github.com/Hukilow/minimax-usage.git
cd minimax-usage
npm install
npm run watch          # terminal 1
# In VS Code, press F5 to launch the Extension Development Host
```

You will need:
- Node 22+
- VS Code 1.96+
- A MiniMax Token Plan **Subscription Key** for end-to-end testing

## 🔄 Workflow

1. **Fork** the repository and create a feature branch: `git checkout -b feat/your-feature`.
2. Make your changes. Add or update **unit tests** (vitest) when applicable.
3. Run the full check suite locally:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build && npm run build:web
   ```
4. Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md) and link any related issues.
5. Ensure CI is green.

## 📁 Project structure

```
src/
├── api/             # HTTP client, QuotaService, types
├── auth/            # SecretStorage wrapper
├── ui/              # status bar, tree view, webview host
├── commands/        # command palette handlers
├── utils/           # time, logger, regions
├── webview/         # webview-side TS (browser target)
└── test/            # vitest tests
```

## ✍️ Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — docs only
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `test:` — add or fix tests
- `chore:` — tooling, deps, config
- `security:` — vulnerability fix

Examples: `feat(statusbar): add split mode`, `fix(webview): clamp negative percent`.

## 🐛 Bug reports

Please use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:
- VS Code version (`Code > About`)
- Extension version
- OS
- Steps to reproduce
- Expected vs actual behavior
- Output channel log (enable `minimaxUsage.debug` first)

## 💡 Feature requests

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md). Describe the use case, not just the solution.

## 🔐 Security issues

**Do not open a public issue.** Follow [SECURITY.md](SECURITY.md) for private reporting.

## 📜 License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
