# Changelog

All notable changes to this package are documented here. For cross-SDK release notes, see [ethora/RELEASE-NOTES.md](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md).

## Unreleased

### Added — Agents API + 2607 endpoint parity
- `ethora-agents-export-v2` / `ethora-agents-import-v2` — export an Agent as a JSON bundle and re-import it (into another App/tenant).
- `ethora-agents-delete-v2` — delete a saved Agent and its BotInstances (gated behind `ETHORA_ENABLE_DANGEROUS_TOOLS`).
- `ethora-bot-instance-diag` / `ethora-bot-instance-test-message` / `ethora-bot-instance-leave-chat` — BotInstance diagnostics, test messaging, and room removal.
- `ethora-messages-search-v2` — search an App's chat messages (GET /v2/apps/:appId/messages/search).
- `ethora-messages-context-v2` — fetch messages around a target message.
- `ethora-unread-counts-v2` — batch per-room unread counts for a set of users.
- `ethora-app-export-v2` / `ethora-app-import-v2` — export/import an App as a portable bundle.

### Fixed — B2B AI bootstrap on current backends
- API/B2B-created apps no longer auto-provision a legacy `aiBot` or seed a default room. `ethora-b2b-app-bootstrap-ai` now provisions (or reuses) a room, drives AI via the Agents API, and treats the legacy `PUT /v2/bot` step as a best-effort skip (was hard-failing with 422 `BOT_NOT_INITIALIZED`). `enableBot: true` now creates and invites an Agent instead of relying on the legacy bot.
- `ethora-b2b-bot-enable` / `ethora-bot-enable-v2` descriptions updated to flag that they target the legacy per-app `aiBot` and to point B2B callers at the Agents API.
- `ethora-agents-quickstart` recipe now creates a room explicitly (step 4b) instead of assuming a seeded default room.
