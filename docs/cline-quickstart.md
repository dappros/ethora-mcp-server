# Quickstart: Ethora MCP server in the Cline CLI

A step-by-step walkthrough for installing and verifying `@ethora/mcp-server`
in the [Cline](https://cline.bot) CLI. Every command below was run end-to-end;
the outputs shown are real.

> This doubles as a recording script — each step lists the command, what you'll
> see, and what it proves.

## Prerequisites

- **Node.js ≥ 18** (`node -v`)
- A terminal — macOS, Linux, or Windows

## Step 1 — Install the Cline CLI

```bash
npm install -g cline
```

Then check it:

```bash
cline version
# 3.0.2
```

> If the global install fails with a permissions error, you can run every
> `cline` command below as `npx -y cline@latest <args>` instead — no install
> needed.

**Proves:** Cline CLI is available.

## Step 2 — Add the Ethora MCP server

Cline reads its MCP servers from `~/.cline/data/settings/cline_mcp_settings.json`
(same format as the Cline VS Code extension). Create it:

```bash
mkdir -p ~/.cline/data/settings
cat > ~/.cline/data/settings/cline_mcp_settings.json <<'JSON'
{
  "mcpServers": {
    "ethora": {
      "command": "npx",
      "args": ["-y", "@ethora/mcp-server"]
    }
  }
}
JSON
```

That's the complete configuration — **no credentials are required to start the
server.** It defaults to the Ethora Cloud API and credentials can be supplied
later at runtime via the `ethora-configure` tool (or via env vars — see the
[README](../README.md)).

**Proves:** the server is registered with Cline.

## Step 3 — Verify Cline sees the server

```bash
cline config mcp
```

```
Configured MCP servers (/Users/you/.cline/data/settings/cline_mcp_settings.json):
  ethora [stdio]
```

**Proves:** Cline has picked up the Ethora server as a `stdio` MCP server.

## Step 4 — Confirm the server starts and exposes its tools

You can verify the server itself with a one-shot MCP handshake — this is exactly
what Cline does under the hood when it connects:

```bash
( echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"quickstart","version":"1.0"}}}'; \
  sleep 2; \
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'; \
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; \
  sleep 4 ) | npx -y @ethora/mcp-server 2>/dev/null
```

You'll get back two JSON-RPC responses:

- `initialize` → `serverInfo: { name: "Ethora MCP Server", version: "26.5.1" }`, protocol `2024-11-05`
- `tools/list` → **76 tools** (e.g. `ethora-configure`, `ethora-status`, `ethora-app-create`, `ethora-chats-broadcast-v2`, `ethora-bot-update-v2`, …)

> Only 76 of the server's 80 tools appear by default — the 4 destructive tools
> (app/chat deletion, wallet transfer, bulk delete) are deny-by-default and only
> register when `ETHORA_MCP_ENABLE_DANGEROUS_TOOLS=true` is set. That's the
> intended safety behaviour.

**Proves:** the server starts cleanly via `npx`, speaks MCP, and exposes its
tool surface.

## Step 5 — Call a tool (no credentials needed)

`ethora-status` reports the session state and needs no credentials — a good
smoke test:

```bash
( echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"quickstart","version":"1.0"}}}'; \
  sleep 2; \
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'; \
  echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ethora-status","arguments":{}}}'; \
  sleep 4 ) | npx -y @ethora/mcp-server 2>/dev/null
```

The `tools/call` response carries the standard Ethora envelope:

```json
{
  "ok": true,
  "ts": "2026-05-14T11:11:38.705Z",
  "meta": { "tool": "ethora-status", "apiUrl": "https://api.chat.ethora.com/v1", "authMode": "user", "currentAppId": "" },
  "data": {
    "apiUrl": "https://api.chat.ethora.com/v1",
    "hasAppJwt": false, "hasAppToken": false, "hasB2BToken": false,
    "hasUserToken": false, "authMode": "user",
    "currentAppId": "", "currentAgentId": "", "enableDangerousTools": false
  }
}
```

**Proves:** tools actually execute and return the documented `{ ok, ts, meta, data }`
envelope.

## Step 6 — Use it from a Cline session

With the server configured, let the Cline agent drive it. Cline needs an LLM
provider configured first — `cline auth` for a Cline account, or
`cline auth anthropic --apikey <key>` to bring your own:

```bash
cline "Connect to the 'ethora' MCP server and call its ethora-status tool. Report the exact JSON it returns."
```

Cline connects to the Ethora server, the agent invokes the tool (shown as
`ethora__ethora-status`), and reports back:

```json
{
  "ok": true,
  "ts": "2026-05-14T11:31:12.699Z",
  "meta": { "tool": "ethora-status", "apiUrl": "https://api.chat.ethora.com/v1", "authMode": "user", "currentAppId": "" },
  "data": {
    "apiUrl": "https://api.chat.ethora.com/v1",
    "hasAppJwt": false, "hasAppToken": false, "hasB2BToken": false,
    "hasUserToken": false, "hasRefreshToken": false, "authMode": "user",
    "currentAppId": "", "currentAgentId": "", "enableDangerousTools": false
  }
}
```

**Proves:** the full loop works — Cline's agent connects to the Ethora MCP
server, calls a tool, and gets back a valid result. From here you can ask it to
configure credentials (`ethora-configure`), create an app, deploy an AI
agent/chatbot with RAG sources, broadcast a message, and so on — all 76 tools
are available to the agent.

## Next steps

- **Configure credentials** — `ethora-configure` (runtime) or the
  `ETHORA_API_URL` / `ETHORA_APP_JWT` / `ETHORA_B2B_TOKEN` env vars.
- **Explore the workflows** — call `ethora-help` for task-oriented guidance and
  one-click recipes.
- **AI agent setup** — see the bot/agent tools (`ethora-bot-update-v2`,
  `ethora-agents-create-v2`, `ethora-b2b-app-bootstrap-ai`) and the RAG source
  tools (`ethora-sources-*`).
- Full tool reference and configuration: [README](../README.md).
