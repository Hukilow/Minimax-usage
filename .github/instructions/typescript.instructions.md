---
description: TypeScript coding rules for MiniMax Usage
applyTo: "src/**/*.ts"
---

# TypeScript Style — MiniMax Usage

These rules apply to every `.ts` file under `src/`.

## Strict mode

The project enables `strict: true` and `noUnusedLocals/Parameters: true`. Respect the compiler; do not silence it without a justification comment.

## Imports

- Use the `.js` extension on relative imports (ESM-friendly, esbuild-friendly). Example: `import { Logger } from './utils/logger.js';`
- Prefer `import type { … }` for types only.
- No barrel `index.ts` re-exports inside `src/` — keep imports explicit.
- Group: node/external first, then `vscode`, then internal — separated by a blank line.

## Types

- `interface` over `type` for object shapes; `type` for unions, intersections, primitives, and aliases.
- **Discriminated unions** for state machines. Add a `kind: '...'` literal.
- API response types are defensive: every field is optional. Do not tighten them.
- Avoid `any`. If you must, add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a one-line reason.

## Functions

- Prefer **pure functions** for anything testable. Avoid implicit time / randomness in pure helpers.
- Async functions return `Promise<T>`, not `Promise<void>` unless you genuinely don't care about the value.
- `async function foo(): Promise<void>` is fine for fire-and-forget command handlers.

## Errors

- `throw new Error('message')` for programmer errors.
- For user-visible / network errors, use the `ApiError` class in `src/api/client.ts`.
- Never swallow an error silently. If you must ignore, log it: `logger.warn('…', err);`.

## Comments

- Explain *why*, not *what*. The code already says what.
- `// TODO(name):` for future work; link to the tracking issue.
- `// FIXME:` for things that are broken now and need to be fixed before merge.
- `// NOTE:` for non-obvious trade-offs.

## Linting

- ESLint must pass: `npm run lint`.
- No `// eslint-disable` without a justification comment on the same line.
- `no-console` is on. Use the `Logger` (`src/utils/logger.ts`).

## Testing

- Add a vitest test for every new pure helper.
- Test files live under `src/test/` and use the `.test.ts` suffix.
- Use `describe` + `it`, no global test functions.
- Tests must run in <1s total.

## File size

- Aim for **< 300 lines** per file. If a file grows, split it.
- A file should do one thing (the name should say what).

## Naming

- `camelCase` for variables and functions.
- `PascalCase` for classes and types.
- `UPPER_SNAKE_CASE` for true constants.
- File names match their primary export: `statusBar.ts` exports `StatusBar`.
