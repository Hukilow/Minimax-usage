---
name: cut-release
description: Bump version, update CHANGELOG, and tag a release of MiniMax Usage
---

# Cut a release

Walk through the release checklist and produce a PR that bumps the version.

## Steps

1. **Choose the bump**
   - `feat:` commits since the last tag → minor (`0.1.0` → `0.2.0`)
   - `fix:` only → patch (`0.1.0` → `0.1.1`)
   - `BREAKING CHANGE:` footer → major (`0.1.0` → `1.0.0`)

   Use `git log --oneline <last-tag>..HEAD` to inspect commits.

2. **Update `package.json` version**
   - Use `npm version <major|minor|patch> --no-git-tag-version`.
   - Open the file and confirm the change.

3. **Update `CHANGELOG.md`**
   - Move entries from `[Unreleased]` to a new dated section.
   - Add a comparison link at the bottom.

4. **Update `README.md` badges** if any version-bumping badge exists (currently none).

5. **Open a PR** titled `chore(release): vX.Y.Z` with:
   - The version bump
   - The CHANGELOG diff
   - A checklist of manual smoke tests (see below)

6. **After merge**: tag the commit `git tag -a vX.Y.Z -m "vX.Y.Z"`.

## Manual smoke tests (run before tagging)

- [ ] `npm ci`
- [ ] `npm run typecheck && npm run lint && npm test`
- [ ] `npm run build && npm run build:web`
- [ ] `npm run package` (produces `minimax-usage-X.Y.Z.vsix`)
- [ ] Open the `.vsix` in a clean VS Code (Extensions panel → … → Install from VSIX)
- [ ] Set the API key, verify the status bar shows 5h and weekly %
- [ ] Click status bar → detail dashboard opens, charts render
- [ ] `MiniMax Usage: Refresh Now` works
- [ ] `MiniMax Usage: Open Billing Page` opens `https://platform.minimax.io/...`

## Do NOT

- Push a tag before the PR is merged and CI is green.
- Publish to the VS Code Marketplace manually — that's a separate workflow.
- Bump the major version without maintainer approval.
