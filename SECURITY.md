# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately. Do not open a public GitHub
issue for a suspected vulnerability.

Two ways to reach us:

1. **GitHub private vulnerability reporting** (preferred) - use the
   ["Report a vulnerability"](https://github.com/dappros/ethora-mcp-server/security/advisories/new)
   button on the Security tab. This keeps the report private until a fix ships.
2. **Email** - `contact@dappros.com` with `SECURITY` in the subject line.

Please include the affected version, reproduction steps, and the impact you
believe the issue has. If you have a proof of concept, a minimal one is more
useful than a weaponised one.

We aim to acknowledge a report within 3 working days and to keep you updated
while we work on a fix. We will credit reporters in the release notes unless
you ask us not to.

## Supported versions

Security fixes land on the latest published version of `@ethora/mcp-server`.
Older versions are not patched.

## Scope

This policy covers this repository, the `@ethora/mcp-server` npm package, and
the container image built from this repository.

Vulnerabilities in the Ethora platform itself (the API, chat server, SDKs, or
hosted service) should go to the same addresses above and will be routed to the
right team.

## Handling credentials

This server talks to an Ethora backend using an App JWT or a B2B server token.
Those are secrets:

- Never commit them, and never paste them into shared MCP client config that is
  checked into version control.
- Prefer your MCP client's secret store, or environment variables supplied at
  runtime. The Docker Desktop MCP catalog entry declares both tokens as
  secrets so they are held in Docker's secret store rather than in plain config.
- Use least privilege tokens and rotate them regularly.

Destructive tools (app deletion, wallet transfers, bulk delete) are disabled by
default and only appear when `ETHORA_MCP_ENABLE_DANGEROUS_TOOLS=true` is set
explicitly.
