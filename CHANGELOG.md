# Changelog

All notable changes to this package are documented here. For cross-SDK release notes, see [ethora/RELEASE-NOTES.md](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md).

## Unreleased

- Add `.plugin/plugin.json` — an [Open Plugin Specification v1.0.0](https://github.com/vercel-labs/open-plugin-spec) manifest declaring the server inline under `mcpServers`. Lets Open-Plugin-aware directories (e.g. cursor.directory's auto-detect) discover the server from the GitHub repo. Repo-only — not shipped in the npm tarball (`files` is `["dist"]`), so no effect on the published package. NB: its `version` field is a fourth version string to keep in sync on release (alongside `package.json`, `server.json`, and `index.ts` serverInfo).

## 26.5.2

- Reframe the `package.json` and `server.json` descriptions to lead with chat/messaging + AI agents / chatbots and drop the ERC-20 wallet mention, matching Ethora's product positioning. The wallet tools themselves are unchanged. Ships with the next published version.
- Add `smithery.yaml` so the server can be discovered/installed via [Smithery](https://smithery.ai). Declares the stdio start command and the optional `ETHORA_API_URL` / `ETHORA_APP_JWT` / `ETHORA_B2B_TOKEN` config.
- Add `llms-install.md` with crisp, no-questions setup instructions for AI coding agents (e.g. Cline) — config block, per-client config-file locations, optional env vars, and a credential-free verification step (`ethora-status`).
- Add `assets/icon-400.png` (400×400 brand mark) for marketplace listings.
- Reframe the README opening to lead with chat/messaging + AI agents / chatbots; ERC-20 wallet tooling is still documented in the tool list but no longer in the headline.
- **Fix: default API URL.** The hardcoded fallback in `config.ts` was the pre-migration host `https://api.ethora.com/v1`, which now returns `410 Gone`. A fresh `npx @ethora/mcp-server` with no `ETHORA_API_URL` set was therefore pointing at a dead endpoint. Corrected to `https://api.chat.ethora.com/v1` (which the README and `server.json` already documented as the default).
- **Fix: MCP `serverInfo` version.** Was hardcoded `1.0.0` in `index.ts`; now `26.5.1` to match the package version that MCP clients display.
- Add `docs/cline-quickstart.md` — a human-followable step-by-step walkthrough for installing and testing the server in the Cline CLI.

## 26.5.1

- Add `mcpName` to `package.json` and a `server.json` manifest so the package can be published to the official [MCP Registry](https://registry.modelcontextprotocol.io/) (`io.github.dappros/ethora-mcp-cli`).
- Expand the package `description` to summarise what the server does.
- Fix `bin` entry: rename key from `@ethora/mcp-server` (which npm refused as a scoped bin name) to `mcp-server`. Users still invoke via `npx -y @ethora/mcp-server`.
- Fix `main` to point at the built `dist/index.js`.
- Add `prepublishOnly` script so `dist/` is always rebuilt before publishing (prior tarballs were shipping without the compiled output).
- Drop the stray leading zero in the version (`26.05.1` → `26.5.1`) so the published version matches what npm normalises to.
- Expand the descriptions of **all 80 tools** to explicitly document required auth mode, side effects, idempotency, failure modes, related tools, and per-parameter semantics. Lifts Glama TDQS Behavioral Transparency (the dimension where the scored tools sat at 2/5); no behavior change. Covers session/config + auth tools, the user-auth v1 tools, the broadcast/files/sources v1+v2 tools, the bot + agents v2 tools, the chats v2 tools, the B2B orchestrators, the generators, the users-batch v2 tools, and the app-tokens v2 tools.
