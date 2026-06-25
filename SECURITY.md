# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `0.1.x` | ✅ |
| `< 0.1` | ❌ |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Report privately via one of the following channels (in order of preference):

1. **GitHub Security Advisories:** [Report a new advisory](https://github.com/Hukilow/minimax-usage/security/advisories/new) on this repository.
2. **Email:** open a ticket and we will share a PGP-keyed mailbox on request.

You should receive an acknowledgement within **72 hours**. We aim to triage and patch critical issues within **7 days**.

## What to include

- Description of the vulnerability and impact.
- Reproduction steps (PoC code, screenshots, logs).
- Affected version(s).
- Your contact info (optional, for credit).

## Threat model

The extension:

- Stores your MiniMax **Subscription Key** in VS Code's `SecretStorage` (OS keychain).
- Makes one outbound HTTPS request to `https://api.minimax.io/v1/token_plan/remains`.
- Runs a sandboxed webview with a strict CSP (`default-src 'none'; script-src 'self'; …`).
- Ships **zero runtime npm dependencies** (CVE surface = 0).
- Does **not** call LLM APIs, does **not** write to your MiniMax account.

Out of scope for this project: vulnerabilities in the MiniMax API itself, in VS Code, or in your OS keychain.

## Recognition

We credit reporters (with permission) in the release notes once the patch ships.
