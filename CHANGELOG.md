# Changelog

All notable changes to this package are documented here. For cross-SDK release notes, see [ethora/RELEASE-NOTES.md](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md).

## 26.5.1

- Add `mcpName` to `package.json` and a `server.json` manifest so the package can be published to the official [MCP Registry](https://registry.modelcontextprotocol.io/) (`io.github.dappros/ethora-mcp-cli`).
- Expand the package `description` to summarise what the server does.
- Fix `bin` entry: rename key from `@ethora/mcp-server` (which npm refused as a scoped bin name) to `mcp-server`. Users still invoke via `npx -y @ethora/mcp-server`.
- Fix `main` to point at the built `dist/index.js`.
- Add `prepublishOnly` script so `dist/` is always rebuilt before publishing (prior tarballs were shipping without the compiled output).
- Drop the stray leading zero in the version (`26.05.1` → `26.5.1`) so the published version matches what npm normalises to.
- Expand the descriptions of the 12 user-auth v1 tools (`ethora-user-login`, `ethora-user-register`, `ethora-app-list`, `ethora-app-create`, `ethora-app-delete`, `ethora-app-update`, `ethora-app-get-default-rooms`, `ethora-app-get-default-rooms-with-app-id`, `ethora-app-create-chat`, `ethora-app-delete-chat`, `ethora-wallet-get-balance`, `ethora-wallet-erc20-transfer`) to explicitly document required auth mode, side effects, idempotency, failure modes, related tools, and parameter semantics. Lifts Glama TDQS Behavioral Transparency from 2/5; no behavior change.
