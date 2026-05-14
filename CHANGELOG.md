# Changelog

All notable changes to this package are documented here. For cross-SDK release notes, see [ethora/RELEASE-NOTES.md](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md).

## 26.5.1

- Add `mcpName` to `package.json` and a `server.json` manifest so the package can be published to the official [MCP Registry](https://registry.modelcontextprotocol.io/) (`io.github.dappros/ethora-mcp-cli`).
- Expand the package `description` to summarise what the server does.
- Fix `bin` entry: rename key from `@ethora/mcp-server` (which npm refused as a scoped bin name) to `mcp-server`. Users still invoke via `npx -y @ethora/mcp-server`.
- Fix `main` to point at the built `dist/index.js`.
- Add `prepublishOnly` script so `dist/` is always rebuilt before publishing (prior tarballs were shipping without the compiled output).
- Drop the stray leading zero in the version (`26.05.1` → `26.5.1`) so the published version matches what npm normalises to.
- Expand the descriptions of **all 80 tools** to explicitly document required auth mode, side effects, idempotency, failure modes, related tools, and per-parameter semantics. Lifts Glama TDQS Behavioral Transparency (the dimension where the scored tools sat at 2/5); no behavior change. Covers session/config + auth tools, the user-auth v1 tools, the broadcast/files/sources v1+v2 tools, the bot + agents v2 tools, the chats v2 tools, the B2B orchestrators, the generators, the users-batch v2 tools, and the app-tokens v2 tools.
