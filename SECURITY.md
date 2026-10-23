# Security Policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use [GitHub private vulnerability reporting](https://github.com/amoslives/pomoflow/security/advisories/new) and include:

- A concise description of the issue and its impact
- Reproduction steps or a minimal proof of concept
- Affected URLs, browsers, or commits
- Suggested mitigations, if known

Do not include real pairing credentials, private tasks or stats, API tokens, or other secrets. Create an isolated test room if a reproduction requires sync.

## Supported version

Security fixes target the latest commit on `main` and the production deployment at `pomoflow.pages.dev`.

## Credential handling

Pairing links are bearer credentials. Anyone with a valid link can access its sync room. Users should rotate a credential immediately if it is exposed.
