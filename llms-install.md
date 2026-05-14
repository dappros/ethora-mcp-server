# Installing the Ethora MCP server (for AI agents like Cline)

This file gives an AI coding agent everything it needs to install and verify
`@ethora/mcp-server` with **no extra questions to the user**.

## What this is

`@ethora/mcp-server` is the MCP server for the **Ethora** open-source chat &
messaging platform (with a built-in AI agent / chatbot framework). It lets an
MCP client manage Ethora apps and chat rooms, broadcast messages, deploy AI
agents/chatbots with RAG sources, and run B2B provisioning workflows.

- Runtime: Node.js >= 18 (uses `npx`, no global install needed)
- Transport: stdio
- npm: `@ethora/mcp-server`

## Install

Add this entry to the MCP client's server configuration:

```json
{
  "mcpServers": {
    "ethora": {
      "command": "npx",
      "args": ["-y", "@ethora/mcp-server"]
    }
  }
}
```

That is the complete, working configuration. **No environment variables are
required to start the server** — it defaults to the Ethora Cloud API
(`https://api.chat.ethora.com/v1`), and credentials can be supplied later at
runtime through the `ethora-configure` tool.

### Config file location per client

- **Cline / Claude Dev** — the MCP settings JSON (`cline_mcp_settings.json`)
- **Claude Desktop** — `claude_desktop_config.json`
- **Cursor** — Settings → MCP → Add new global MCP server
- **VS Code (MCP extension)** — User Settings (JSON), under `"mcp": { "servers": { ... } }`
- **Windsurf** — `mcp_config.json`

## Optional environment variables

Only needed if the user wants to pre-configure credentials instead of using the
`ethora-configure` tool at runtime. All optional:

| Variable | Purpose |
|----------|---------|
| `ETHORA_API_URL` | Ethora API URL. Defaults to `https://api.chat.ethora.com/v1`. |
| `ETHORA_APP_JWT` | App JWT for the user-auth login/register bootstrap flow. |
| `ETHORA_B2B_TOKEN` | B2B server token for tenant-actor (`x-custom-token`) flows. |
| `ETHORA_MCP_ENABLE_DANGEROUS_TOOLS` | Set to `true` to expose destructive tools (app/chat deletion, wallet transfers, bulk deletes). Disabled by default. |

To pass them, extend the config with an `env` block:

```json
{
  "mcpServers": {
    "ethora": {
      "command": "npx",
      "args": ["-y", "@ethora/mcp-server"],
      "env": {
        "ETHORA_API_URL": "https://api.chat.ethora.com/v1"
      }
    }
  }
}
```

## Verify the installation

After the client restarts and shows the server as connected:

1. Run the client's "list tools" command — Ethora tools (prefixed `ethora-`)
   should appear.
2. Call `ethora-status` — it returns the current session state (API URL, auth
   mode, which credentials are present). This needs no credentials and confirms
   the server is running.
3. Optionally call `ethora-doctor` — it validates config and pings the Ethora
   API.

If `ethora-status` returns a result, installation succeeded. No credentials are
needed for that check.

## Troubleshooting

- **Server won't start** — confirm `npx -y @ethora/mcp-server` runs without
  error in a terminal; Node must be >= 18.
- **Tools missing** — restart the MCP client and check its logs for server
  registration errors.
- **Auth errors when calling tools** — expected until the user provides
  credentials via `ethora-configure` or the env vars above. `ethora-status` and
  `ethora-doctor` work without credentials.
