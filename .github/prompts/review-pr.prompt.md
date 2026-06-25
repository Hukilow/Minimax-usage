---
name: review-pr
description: Review a pull request for MiniMax Usage against the project invariants
---

# Review PR

Review the current changes against the [project invariants](../copilot-instructions.md). For each file changed, run the checks below. Output a structured report.

## Checks

1. **Zero runtime npm deps**
   - Run `cat package.json | grep -A 30 '"dependencies"'`. It should be empty.
   - If a runtime dep is being added, fail the review.

2. **No telemetry / analytics**
   - `grep -RInE 'analytics|telemetry|sentry|amplitude|mixpanel|posthog' src/` should be empty.

3. **API key safety**
   - `grep -RIn 'apiKey' src/` and verify the key is only read from `SecretStorage` and only sent to `https://api.minimax.io/`.
   - No `console.log(apiKey)`, no `logger.info('key: ' + key)`.

4. **Webview CSP intact**
   - In `src/ui/detailsWebview.ts`, the CSP must include `default-src 'none'`. Anything weaker is a fail.

5. **TypeScript hygiene**
   - `npm run typecheck` clean.
   - `npm run lint` clean.
   - `npm test` clean.

6. **No empty catches**
   - `grep -RInE 'catch\s*\{\s*\}' src/` should be empty.
   - `catch (e) {}` is also a fail — at minimum log it.

7. **Tests for new helpers**
   - Every new pure function in `src/utils/` or `src/api/` should have a corresponding `*.test.ts`.

## Output format

```markdown
## PR review — <branch>

| Check | Status | Notes |
|---|---|---|
| Zero runtime deps | ✅ / ❌ | … |
| No telemetry | ✅ / ❌ | … |
| API key safety | ✅ / ❌ | … |
| CSP intact | ✅ / ❌ | … |
| TypeScript hygiene | ✅ / ❌ | … |
| No empty catches | ✅ / ❌ | … |
| Tests added | ✅ / ❌ | … |

### Blocking issues
- …

### Nits
- …
```

## Tips

- If the change touches the webview, run `npm run build:web` and check `dist/web/main.js` size.
- If the change touches the API client, run the live integration test (see `npm test`).
- When in doubt, defer to `copilot-instructions.md`.
