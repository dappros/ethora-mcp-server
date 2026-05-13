# Changelog

All notable changes to this package are documented here. For cross-SDK release notes, see [ethora/RELEASE-NOTES.md](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md).

## 26.5.1

- Add `mcpName` to `package.json` and a `server.json` manifest so the package can be published to the official [MCP Registry](https://registry.modelcontextprotocol.io/) (`io.github.dappros/ethora-mcp-cli`).
- Expand the package `description` to summarise what the server does.
- Fix `bin` entry: rename key from `@ethora/mcp-server` (which npm refused as a scoped bin name) to `mcp-server`. Users still invoke via `npx -y @ethora/mcp-server`.
- Fix `main` to point at the built `dist/index.js`.
- Add `prepublishOnly` script so `dist/` is always rebuilt before publishing (prior tarballs were shipping without the compiled output).
- Drop the stray leading zero in the version (`26.05.1` → `26.5.1`) so the published version matches what npm normalises to.
