# Ethora MCP CLI (Model Context Protocol)

[![npm](https://img.shields.io/npm/v/@ethora/mcp-server.svg)](https://www.npmjs.com/package/@ethora/mcp-server)
[![Node](https://img.shields.io/badge/node-%E2%89%A518.x-blue.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=ethora&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBldGhvcmEvbWNwLXNlcnZlciJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522ethora%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540ethora%252Fmcp-server%2522%255D%257D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522ethora%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540ethora%252Fmcp-server%2522%255D%257D)

> One-click install for Cursor and VS Code (buttons above). For Claude Code, Claude Desktop, GitHub Copilot, Gemini CLI, Codex CLI, Windsurf, and Cline, see [Using with MCP Clients](#-using-with-mcp-clients) below.

An MCP (Model Context Protocol) CLI/server that connects popular MCP clients to the **Ethora** platform — an open-source **chat & messaging platform with a built-in AI agent / chatbot framework**. This runs locally on a developer machine via stdio rather than as a hosted Ethora service.  
Use it from **Cursor**, **VS Code MCP**, **Claude Desktop**, or **Windsurf/Cline** to manage apps and chat rooms, broadcast messages, deploy AI agents / chatbots with RAG sources, and automate B2B provisioning workflows. (ERC-20 wallet tools are also included — see the tool list below.)

**Part of the [Ethora SDK ecosystem](https://github.com/dappros/ethora#ecosystem)** — see all SDKs, tools, and sample apps. Follow cross-SDK updates in the [Release Notes](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md).

- npm: <https://www.npmjs.com/package/@ethora/mcp-server>
- Default Ethora API: `https://api.chat.ethora.com/v1` (Swagger: <https://api.chat.ethora.com/api-docs/#/>)

---

## ✨ What you get

- Talk to the Ethora platform directly from your IDE or AI agent client (Cursor, VS Code MCP, Claude Desktop, Windsurf / Cline).
- Both **user-auth** flows (login/register, files, owner/admin endpoints) and **B2B / app-token** flows (tenant provisioning, broadcast jobs, async user batches, AI bot config).
- Built-in recipes, prompts, and generators for the most common Ethora workflows (Vite/Next chat-component setup, B2B bootstrap, AI-bot enablement, RAG sources).
- Standard tool response envelope (`{ ok, ts, meta, data | error }`) so agent code can reason about success/failure consistently.

## 🚦 Just trying it? (60-second quickstart)

Don't read the auth modes yet. Once the server is connected in your client, ask your agent to run, in order:

1. **`ethora-doctor`** — confirms the server is up and can reach the Ethora API. No credentials needed.
2. **`ethora-configure`** with your `appJwt` → **`ethora-auth-use-user`** → **`ethora-user-login`** with an email + password.
3. **`ethora-app-list`** — you're in; this lists your apps.

That's the local-developer path. Need server-side automation instead? Jump to [B2B mode](#2-b2b-mode). Lost at any point, call **`ethora-help`** — it reads your current state and tells you the next call.

## 🔐 Two typical usage modes

### 1) User Auth mode

Best for:

- developers trying Ethora locally
- tenant admins / app owners using MCP manually
- flows that start with `ethora-user-login`

How it works:

- configure `ETHORA_APP_JWT` once for login/register bootstrap
- switch to `ethora-auth-use-user`
- call `ethora-user-login`
- use user-auth tools such as files and legacy owner/admin endpoints

### 2) B2B mode

Best for:

- permanent backend integrations
- partner provisioning flows
- autonomous agents operating Ethora without a human user session

How it works:

- configure `ETHORA_B2B_TOKEN`
- switch to `ethora-auth-use-b2b` for explicit tenant-actor `/v2/apps/:appId/...` routes
- optionally switch into `ethora-auth-use-app` after `ethora-app-select` when you want app-scoped convenience routes powered by `appToken`

Rule of thumb:

- first-time local use usually starts with **User Auth**
- repeatable automation usually starts with **B2B**, then often moves into **app-token** mode for one selected app

### Prompts & Resources (P2: dev-facing docs)

- **Resources** (loadable docs into context)
  - `ethora://docs/auth-map` — appJwt vs appToken vs b2bToken
  - `ethora://docs/chat-component/quickstart` — Vite/Next quickstart + replacing demo tokens
  - `ethora://docs/sdk-backend/quickstart` — backend integration quickstart
  - `ethora://docs/recipes` — common tool sequences (broadcast/sources/files/bot)
- **Prompts**
  - `ethora-auth-map`
  - `ethora-vite-quickstart`
  - `ethora-nextjs-quickstart`
  - `ethora-backend-sdk-quickstart`
  - `ethora-recipes`

### Generators (no shell, no file writes)

- `ethora-generate-chat-component-app-tsx` — ready-to-paste `App.tsx` snippet for `@ethora/chat-component`
- `ethora-generate-env-examples` — `.env.example` templates for:
  - frontend chat component
  - backend SDK integration
  - MCP usage (`ETHORA_API_URL`, `ETHORA_APP_JWT`, `ETHORA_B2B_TOKEN`)
- `ethora-generate-b2b-bootstrap-runbook` — minimal “call these MCP tools in order” runbook for B2B bootstrap

Tip: to list runnable recipes without calling `ethora-help`, call `ethora-run-recipe` with `goal: "auto"` and omit `recipeId`.

- **Session / Config**
  - `ethora-configure` — set API URL plus App JWT / B2B token / appToken for this MCP session
  - `ethora-status` — show configured API URL, active auth mode, and which credentials are present
  - `ethora-help` — task-oriented help (recommended next calls + “one-click recipes” based on current state)
  - `ethora-run-recipe` — execute a built-in recipe by id (sequential steps; no shell, no file writes)
  - `ethora-doctor` — validate config + ping the configured Ethora API for both user and B2B usage
  - `ethora-app-select` — select current appId and optionally set appToken
  - `ethora-auth-use-app` — switch to app-token auth mode for app-scoped operations
  - `ethora-auth-use-user` — switch to user-session auth mode
  - `ethora-auth-use-b2b` — switch to tenant-actor B2B `x-custom-token` auth mode

- **Chats (v2)**
  - `ethora-chats-broadcast-v2` — enqueue broadcast job using app-token auth or B2B + explicit `appId`
  - `ethora-chats-broadcast-job-v2` — get broadcast job status/results using app-token auth or B2B + explicit `appId`
  - `ethora-wait-broadcast-job-v2` — poll broadcast job until completed/failed using app-token auth or B2B + explicit `appId`
  - `ethora-chats-message-v2` — send a test/automation message through the app chat surface (requires app-token auth)
  - `ethora-chats-history-v2` — read persisted automation/test history for private or group sessions (requires app-token auth)

- **Users (v2 async batch)**
  - `ethora-users-batch-create-v2` — create async users batch job (requires B2B auth)
  - `ethora-users-batch-job-v2` — get users batch job status/results (requires B2B auth)
  - `ethora-wait-users-batch-job-v2` — poll users batch job until completed/failed (requires B2B auth)

- **Files (v2)**
- **Bot / Agent (v2)**
  - `ethora-bot-get-v2` — get bot status/settings using app-token auth or B2B + explicit `appId`
  - `ethora-bot-update-v2` — update bot settings using app-token auth or B2B + explicit `appId`
  - `ethora-bot-enable-v2` — enable bot using app-token auth or B2B + explicit `appId`
  - `ethora-bot-disable-v2` — disable bot using app-token auth or B2B + explicit `appId`
  - `ethora-bot-widget-v2` — get widget/embed config and public widget URL metadata (app-token auth)
  - `ethora-agents-list-v2` — list reusable saved agents for the current app owner (app-token auth)
  - `ethora-agents-get-v2` — get one reusable saved agent (app-token auth)
  - `ethora-agents-create-v2` — create a reusable saved agent (app-token auth)
  - `ethora-agents-update-v2` — update a reusable saved agent (app-token auth)
  - `ethora-agents-clone-v2` — clone a reusable saved agent (app-token auth)
  - `ethora-agents-activate-v2` — bind a saved agent as the active bot for the selected app (app-token auth)
  - `ethora-bot-message-v2` — compatibility alias for `ethora-chats-message-v2`
  - `ethora-bot-history-v2` — compatibility alias for `ethora-chats-history-v2`

  - `ethora-files-upload-v2` — upload files (requires user auth)
  - `ethora-files-get-v2` — list/get files (requires user auth)
  - `ethora-files-delete-v2` — delete file by id (requires user auth)

- **Sources**
  - `ethora-sources-site-crawl` — crawl a URL (requires user auth)
  - `ethora-sources-site-reindex` — reindex URL by urlId (requires user auth)
  - `ethora-sources-site-delete-url` — delete by URL (requires user auth)
  - `ethora-sources-site-delete-url-v2` — batch delete URLs (requires user auth)
  - `ethora-sources-docs-upload` — upload docs for ingestion (requires user auth)
  - `ethora-sources-docs-delete` — delete ingested doc by id (requires user auth)
  - `ethora-sources-site-crawl-v2` — crawl a URL using app-token auth or B2B + explicit `appId`
  - `ethora-sources-site-reindex-v2` — reindex URL by urlId using app-token auth or B2B + explicit `appId`
  - `ethora-sources-site-crawl-v2-wait` — single-call long-timeout helper for crawl (app-token auth)
  - `ethora-sources-site-reindex-v2-wait` — single-call long-timeout helper for reindex (app-token auth)
  - `ethora-sources-site-list-v2` — list crawled site sources and current tags using app-token auth or B2B + explicit `appId`
  - `ethora-sources-site-tags-update-v2` — set/update tags for a crawled site source using app-token auth or B2B + explicit `appId`
  - `ethora-sources-site-delete-url-v2` — delete one crawled URL by URL using app-token auth or B2B + explicit `appId`
  - `ethora-sources-site-delete-url-v2-batch` — batch delete crawled source records by id using app-token auth or B2B + explicit `appId`
  - `ethora-sources-docs-upload-v2` — upload docs for ingestion using app-token auth or B2B + explicit `appId`
  - `ethora-sources-docs-list-v2` — list indexed documents and current tags using app-token auth or B2B + explicit `appId`
  - `ethora-sources-docs-tags-update-v2` — set/update tags for an indexed document using app-token auth or B2B + explicit `appId`
  - `ethora-sources-docs-delete-v2` — delete doc by id using app-token auth or B2B + explicit `appId`

- **Auth & Accounts**
  - `ethora-user-login` — login user (email + password)
  - `ethora-user-register` — register user (email + first/last name)

- **Applications**
  - `ethora-app-create` — create app
  - `ethora-app-update` — update app
  - `ethora-app-delete` — delete app
  - `ethora-app-list` — list apps
  - `ethora-b2b-app-create` — create app using B2B auth (x-custom-token)
  - `ethora-b2b-app-bootstrap-ai` — create app → index sources → configure/enable bot, including runtime LLM selection (B2B automation)
  - `ethora-app-tokens-list-v2` — list app token metadata (B2B auth)
  - `ethora-app-tokens-create-v2` — create new app token (returned once) (B2B auth)
  - `ethora-app-tokens-rotate-v2` — rotate token (revoke old, return new once) (B2B auth)
  - `ethora-app-tokens-revoke-v2` — revoke token by tokenId (idempotent) (B2B auth)
  - `ethora-b2b-app-provision` — create app + create tokens + provision rooms + configure bot, including runtime LLM selection (B2B orchestrator)

- **Chat & Rooms**
  - `ethora-app-get-default-rooms` — list default rooms
  - `ethora-app-get-default-rooms-with-app-id` — rooms for a given app
  - `ethora-app-create-chat` — create chat for app
  - `ethora-app-delete-chat` — delete chat

- **Wallet**
  - `ethora-wallet-get-balance` — get balance
  - `ethora-wallet-erc20-transfer` — send ERC-20 tokens

> Tool names above reflect the functional areas exposed by the server. Your exact tool names may vary slightly by version; run the client’s “list tools” to confirm.


<img width="1670" height="995" alt="settings" src="https://github.com/user-attachments/assets/5a3e98da-5362-4ed2-9080-473510ad2837" />
<img width="1691" height="1011" alt="login" src="https://github.com/user-attachments/assets/c70fc2d7-4686-4619-aaad-0ca966ac2912" />


## 📦 Install / Run

### Pre-requisites
Before you begin, ensure you have the following:
- Node.js installed on your system (recommended version 18.x or higher).

### Install

The server is distributed as an npm package and is typically launched by MCP clients via **npx**:

```bash
npx -y @ethora/mcp-server
```

No global install is required.

---

## 🔐 Configuration (env vars)

This MCP server supports both the local user-auth flow and the server-side B2B flow.

Core values:

- **Ethora API URL** (where to send requests)
- **Ethora App JWT** (used only for login/register bootstrap in user-auth mode)
- **Ethora B2B Token** (used for tenant-actor server-to-server flows)

You can provide these either:
- via **env vars**, or
- at runtime via the **`ethora-configure`** tool (in-memory; resets when MCP process restarts)

### Supported env vars

- `ETHORA_API_URL`: full API URL (example: `https://api.chat.ethora.com/v1`, `http://localhost:8080/v1`)
- `ETHORA_BASE_URL`: base host URL (example: `https://api.chat.ethora.com`, `http://localhost:8080`)  
  If provided, the server will default to `.../v1`.
- `ETHORA_APP_JWT`: App JWT string, usually starting with `JWT ...`
- `ETHORA_B2B_TOKEN`: B2B server token for `x-custom-token` auth (JWT with `type=server`)
- `ETHORA_MCP_ENABLE_DANGEROUS_TOOLS`: enable destructive tools (default: disabled). Set to `true` to expose:
  - app deletion tools
  - wallet transfer tools
  - bulk delete tools

> Security: **never** commit App JWTs, B2B tokens, or appTokens to git. Configure them via env vars, the MCP client secret store, or your own backend.

---

## 🧱 Standard response envelope (tools)

All tools return JSON in a consistent envelope:

- Success: `{ ok: true, ts, meta, data }`
- Error: `{ ok: false, ts, meta, error }`, where `error` includes:
  - `code`: stable string (prefer API `code`, otherwise inferred)
  - `httpStatus`: HTTP status when the failure came from an API call
  - `requestId`: request/correlation id if returned by API
  - `hint`: 1-line “what to do next”

---

## 🚀 Using with MCP Clients

Every client runs the same thing — `npx -y @ethora/mcp-server` over stdio. One-click buttons exist for **Cursor** and **VS Code** (top of this README). For the rest it's a short config block or a one-line command.

### Cursor

Use the **[Add to Cursor](https://cursor.com/en/install-mcp?name=ethora&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBldGhvcmEvbWNwLXNlcnZlciJdfQ%3D%3D)** button above, or manually: **Settings → MCP → Add new global MCP server**:

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

### VS Code (and GitHub Copilot)

Use the **Install in VS Code** button above, or add a `.vscode/mcp.json` file (project-level) — note the key is `servers`:

```json
{
  "servers": {
    "ethora": {
      "command": "npx",
      "args": ["-y", "@ethora/mcp-server"]
    }
  }
}
```

GitHub Copilot's **agent mode** in VS Code reads this same `.vscode/mcp.json` — no separate setup. (For a user-level install instead, put the `servers` block under `"mcp"` in your User Settings JSON.)

### Claude Code

One command:

```bash
claude mcp add ethora -- npx -y @ethora/mcp-server
```

Add `--scope user` to make it available in every project. Verify with `claude mcp list`.

To pre-configure credentials, pass them as env vars with `-e` (recommended over the `ethora-configure` tool — see note below):

```bash
claude mcp add ethora \
  -e ETHORA_API_URL=https://api.chat.ethora.com/v1 \
  -e ETHORA_B2B_TOKEN=<your-b2b-token> \
  -- npx -y @ethora/mcp-server
```

> **Secrets note:** prefer env vars (above) or your MCP client's secret store for credentials. The `ethora-configure` tool also works, but it passes secrets as tool arguments, which means they end up in the conversation transcript. Use it for quick local testing, not for tokens you care about.

### Claude Desktop

**Settings → Developer → Edit Config**, open `claude_desktop_config.json`:

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

### Gemini CLI

Add to `~/.gemini/settings.json` (global) or `.gemini/settings.json` (per project):

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

### Codex CLI

Add to `~/.codex/config.toml` — note the table name is `mcp_servers` (underscore; `mcp-servers` is silently ignored):

```toml
[mcp_servers.ethora]
command = "npx"
args = ["-y", "@ethora/mcp-server"]
```

### Windsurf

**Settings → Cascade → MCP Servers → View raw config** (`~/.codeium/windsurf/mcp_config.json`):

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

### Cline

Open the MCP servers panel and edit `cline_mcp_settings.json`:

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

---

## 🧪 Quick test

After the server shows as **connected** in your client:

- Run `list tools` (client command) to verify Ethora tools are available.
- Check config/connectivity: call `ethora-doctor` (or `ethora-status`)
- For a first local/manual test:
  - call `ethora-configure` with `apiUrl` / `appJwt`
  - call `ethora-auth-use-user`
  - call `ethora-user-login`
  - then try `ethora-app-list` or `ethora-wallet-get-balance`
- For a server-side/B2B test:
  - call `ethora-configure` with `apiUrl` / `b2bToken`
  - call `ethora-auth-use-b2b`
  - then try `ethora-b2b-app-create` or `ethora-app-tokens-list-v2`

---

## 🧭 P1: B2B “create app → index sources → deploy bot” in one call

Pre-reqs:
- Configure `ETHORA_API_URL` (or call `ethora-configure`)
- Configure `ETHORA_B2B_TOKEN` (or call `ethora-configure` with `b2bToken`)
- Ensure your Ethora backend is configured with AI service URL/secret (for bot activation)

Suggested flow:
- Call `ethora-auth-use-b2b`
- Call `ethora-b2b-app-bootstrap-ai` with:
  - `displayName`
  - optional `savedAgentId`
  - optional `crawlUrl`
  - optional `docs[]` (base64)
  - `enableBot: true`
  - optional `llmProvider`
  - optional `llmModel`

It will:
- create the app (B2B)
- set current app context (best-effort)
- index sources via `/v2/sources/*` (app-token auth)
- configure and/or enable bot (best-effort)

### Example payloads

Minimal (create app only):

```json
{
  "displayName": "Acme AI Demo",
  "setAsCurrent": true
}
```

Create app + crawl a website + enable bot:

```json
{
  "displayName": "Acme AI Demo",
  "savedAgentId": "6790abc1234567890def1111",
  "crawlUrl": "https://example.com",
  "followLink": true,
  "enableBot": true,
  "botTrigger": "/bot",
  "llmProvider": "openai",
  "llmModel": "gpt-4o-mini"
}
```

Create app + upload docs + enable bot:

```json
{
  "displayName": "Acme AI Demo",
  "docs": [
    {
      "name": "faq.pdf",
      "mimeType": "application/pdf",
      "base64": "BASE64_PDF_CONTENT_HERE"
    }
  ],
  "enableBot": true,
  "llmProvider": "openai",
  "llmModel": "gpt-4o-mini"
}
```

Provision app + token + default rooms + bot settings:

```json
{
  "displayName": "Acme Support",
  "savedAgentId": "6790abc1234567890def1111",
  "tokenLabels": ["default", "staging"],
  "rooms": [
    { "title": "General" },
    { "title": "Support", "pinned": true }
  ],
  "enableBot": true,
  "botTrigger": "/bot",
  "botPrompt": "You are the Acme support assistant.",
  "botGreetingMessage": "Hello. How can I help?",
  "llmProvider": "openai",
  "llmModel": "gpt-4o-mini"
}
```

Provider/model note:
- Common values are `openai` and `openai-compatible`.
- The effective provider/model must also be enabled by your Ethora backend + AI service environment.

---

## 🤖 App automation loop

Once you already have an app selected with `appToken` auth:

- call `ethora-auth-use-app`
- call `ethora-bot-get-v2` to inspect current bot status and prompt settings
- call `ethora-sources-site-list-v2` and `ethora-sources-docs-list-v2` to inspect indexed sources
- call `ethora-sources-site-tags-update-v2` or `ethora-sources-docs-tags-update-v2` to organize retrieval by tags
- call `ethora-chats-message-v2` / `ethora-chats-history-v2` if your backend exposes the chat automation surface on the same API host

Example: apply retrieval tags to a crawled source

```json
{
  "sourceId": "6790abc1234567890def1234",
  "tags": ["support", "faq", "billing"]
}
```

Example: apply retrieval tags to an indexed document

```json
{
  "docId": "6790abc1234567890def1235",
  "tags": ["support", "faq"]
}
```

---

## 🛡️ Security notes

- **Never** hardcode API keys in shared config. Prefer client-side secret stores.
- Use **least privilege** keys and consider **allowlists/rate limits** on your Ethora backend.
- Rotate credentials regularly in production use.

### CI security scans (report-only)

This repo runs **report-only** scans on pushes/PRs:
- **gitleaks** for secret scanning
- **semgrep** for basic SAST

---

## 🧰 Development

Clone and run locally:

```bash
git clone https://github.com/dappros/ethora-mcp-cli.git
cd ethora-mcp-cli
npm install
npm run build
npm start
```

Suggested scripts (if not present):
```json
{
  "scripts": {
    "build": "tsc -p .",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  }
}
```

---

## ❓ Troubleshooting

- **Client can’t connect**: Ensure `npx @ethora/mcp-server` runs locally without errors. Check Node ≥ 18.
- **Auth errors**: Verify `ETHORA_BASE_URL` and any required secrets are set in the client’s environment.
- **Tools missing**: Restart the MCP client and inspect server logs for registration errors.
- **Network**: Confirm outbound access from the IDE to your Ethora host.

---

## 🔗 Related Repos

- **Ethora Chat Component** — our React chat component used in widgets and stand-alone apps
  https://github.com/dappros/ethora-chat-component
- **Ethora WP Plugin** — WordPress integration  
  https://github.com/dappros/ethora-wp-plugin
- **RAG Demos** — RAG AI assistant examples  
  https://github.com/dappros/rag_demos

---

## 📜 License

See [LICENSE](./LICENSE).
