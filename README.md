# Ethora MCP Server (Model Context Protocol)

[![npm](https://img.shields.io/npm/v/@ethora/mcp-server.svg)](https://www.npmjs.com/package/@ethora/mcp-server)
[![Node](https://img.shields.io/badge/node-%E2%89%A518.x-blue.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

An MCP (Model Context Protocol) server that connects popular MCP clients to the **Ethora** platform.  
Use it from **Cursor**, **VS Code MCP**, **Claude Desktop**, or **Windsurf/Cline** to log in, manage apps and chats, and interact with wallets (ERC-20).

---

## ✨ What you get

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
  - `ethora-configure` — set API URL + App JWT (in-memory for this MCP session)
  - `ethora-status` — show configured API URL + whether auth tokens are present
  - `ethora-help` — task-oriented help (recommended next calls + “one-click recipes” based on current state)
  - `ethora-run-recipe` — execute a built-in recipe by id (sequential steps; no shell, no file writes)
  - `ethora-doctor` — validate config + ping the configured Ethora API
  - `ethora-app-select` — select current appId and optionally set appToken (B2B)
  - `ethora-auth-use-app` — switch to app-token auth mode (B2B)
  - `ethora-auth-use-user` — switch to user-session auth mode
  - `ethora-auth-use-b2b` — switch to B2B `x-custom-token` auth mode (server token)

- **Chats (v2)**
  - `ethora-chats-broadcast-v2` — enqueue broadcast job (requires app-token auth)
  - `ethora-chats-broadcast-job-v2` — get broadcast job status/results (requires app-token auth)
  - `ethora-wait-broadcast-job-v2` — poll broadcast job until completed/failed (requires app-token auth)
  - `ethora-chats-message-v2` — send a test/automation message through the app chat surface (requires app-token auth)
  - `ethora-chats-history-v2` — read persisted automation/test history for private or group sessions (requires app-token auth)

- **Users (v2 async batch)**
  - `ethora-users-batch-create-v2` — create async users batch job (requires B2B auth)
  - `ethora-users-batch-job-v2` — get users batch job status/results (requires B2B auth)
  - `ethora-wait-users-batch-job-v2` — poll users batch job until completed/failed (requires B2B auth)

- **Files (v2)**
- **Bot / Agent (v2)**
  - `ethora-bot-get-v2` — get bot status/settings (app-token auth)
  - `ethora-bot-update-v2` — update bot settings (app-token auth)
  - `ethora-bot-enable-v2` — enable bot (app-token auth)
  - `ethora-bot-disable-v2` — disable bot (app-token auth)
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
  - `ethora-sources-site-crawl-v2` — crawl a URL into app-local or saved-agent shared knowledge (requires app-token auth; no user creds)
  - `ethora-sources-site-reindex-v2` — reindex URL by urlId (requires app-token auth)
  - `ethora-sources-site-crawl-v2-wait` — single-call long-timeout helper for crawl (app-token auth)
  - `ethora-sources-site-reindex-v2-wait` — single-call long-timeout helper for reindex (app-token auth)
  - `ethora-sources-site-list-v2` — list crawled site sources and current tags for `knowledgeScope=app` or `knowledgeScope=saved_agent` (requires app-token auth)
  - `ethora-sources-site-tags-update-v2` — set/update tags for a crawled site source (requires app-token auth)
  - `ethora-sources-site-delete-url-v2` — delete by URL (requires app-token auth)
  - `ethora-sources-site-delete-url-v2-batch` — batch delete (requires app-token auth)
  - `ethora-sources-docs-upload-v2` — upload docs into app-local or saved-agent shared knowledge (requires app-token auth)
  - `ethora-sources-docs-list-v2` — list indexed documents and current tags for `knowledgeScope=app` or `knowledgeScope=saved_agent` (requires app-token auth)
  - `ethora-sources-docs-tags-update-v2` — set/update tags for an indexed document (requires app-token auth)
  - `ethora-sources-docs-delete-v2` — delete doc by id (requires app-token auth)

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

This MCP server needs:
- **Ethora API URL** (where to send requests)
- **Ethora App JWT** (used for login/register endpoints)

You can provide these either:
- via **env vars**, or
- at runtime via the **`ethora-configure`** tool (in-memory; resets when MCP process restarts)

### Supported env vars

- `ETHORA_API_URL`: full API URL (example: `https://api.ethora.com/v1`, `http://localhost:8080/v1`)
- `ETHORA_BASE_URL`: base host URL (example: `https://api.ethora.com`, `http://localhost:8080`)  
  If provided, the server will default to `.../v1`.
- `ETHORA_APP_JWT` (or `ETHORA_APP_TOKEN`): App JWT string, usually starting with `JWT ...`
- `ETHORA_B2B_TOKEN`: B2B server token for `x-custom-token` auth (JWT with `type=server`)
- `ETHORA_MCP_ENABLE_DANGEROUS_TOOLS`: enable destructive tools (default: disabled). Set to `true` to expose:
  - app deletion tools
  - wallet transfer tools
  - bulk delete tools

> Security: **never** commit App JWTs to git. Configure them via env vars or the client’s secret store.

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

### Cursor

1. Open **Cursor → Settings → MCP**
2. Click **Add new global MCP server**
3. Add an entry for the GrowthBook MCP, following the pattern below:

```json
{
  "mcpServers": {
    "ethora-mcp-server": {
      "command": "npx",
      "args": ["-y", "@ethora/mcp-server"]
    }
  }
}
```

3. Save. You should see **green active** when connected.


### VS Code (MCP extension)

1. Open **User Settings (JSON)**
2. Add an MCP entry:

```json
 "mcp": {
    "servers": {
      "ethora-mcp-server": {
        "command": "npx",
        "args": [
          "-y", "@ethora/mcp-server"
        ]
      }
    }
  }
```

3. Save. The server will auto-start on first use.


### Claude Desktop

1. **Settings → Developer**
2. Click **Edit Config**
3. Open `claude_desktop_config.json`
4. Add the following configuration:

```json
{
  "mcpServers": {
    "ethora-mcp-server": {
      "command": "npx",
      "args": ["-y", "@ethora/mcp-server"]
    }
  }
}
```

### Windsurf (Cline)

1. Run:
   ```bash
   npx -y @ethora/mcp-server
   ```
2. Configure your `mcp_config.json` similarly:
   ```json
   {
     "mcpServers": {
       "ethora-mcp-server": {
         "command": "npx",
         "args": ["-y", "@ethora/mcp-server"]
       }
     }
   }
   ```

   ---

   ---

## 🧪 Quick test

After the server shows as **connected** in your client:

- Run `list tools` (client command) to verify Ethora tools are available.
- Check config/connectivity: call `ethora-doctor` (or `ethora-status`)
- Configure (optional): call `ethora-configure` with `apiUrl` / `appJwt`
- Try a login: call `ethora-user-login`
- List applications: call `ethora-app-list`
- Check wallet: call `ethora-wallet-get-balance`

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

## 🧠 Saved agents and hybrid knowledge

Ethora now distinguishes between:

- **App bot wrapper**: the app-scoped XMPP/chat/widget identity returned by `ethora-bot-get-v2`
- **Saved agent**: a reusable persona/runtime config that can be listed, created, cloned, updated, and activated across apps owned by the same creator

Recommended mental model:

- Keep `/v2/bot` and `ethora-bot-*` for the current app’s active wrapper/runtime
- Use `/v2/agents` and `ethora-agents-*` for reusable templates and agent switching
- Use source tools with `knowledgeScope: "app"` for app-local overlays
- Use source tools with `knowledgeScope: "saved_agent"` plus `savedAgentId` for shared base knowledge

Example: create a saved agent

```json
{
  "name": "Acme Support Base",
  "prompt": "You are the Acme support assistant.",
  "botDisplayName": "Acme Support",
  "isRAG": true,
  "ragTags": ["support", "faq"],
  "llmProvider": "openai",
  "llmModel": "gpt-4o-mini"
}
```

Example: activate a saved agent for the current app

```json
{
  "agentId": "6790abc1234567890def1111"
}
```

Example: upload shared knowledge to a saved agent

```json
{
  "files": [
    {
      "name": "support-playbook.pdf",
      "mimeType": "application/pdf",
      "base64": "BASE64_PDF_CONTENT_HERE"
    }
  ],
  "knowledgeScope": "saved_agent",
  "savedAgentId": "6790abc1234567890def1111"
}
```

Example: list only shared site/doc knowledge for a saved agent

```json
{
  "knowledgeScope": "saved_agent",
  "savedAgentId": "6790abc1234567890def1111"
}
```

Notes:
- `knowledgeScope: "app"` remains the default and preserves previous behavior.
- `knowledgeScope: "saved_agent"` lets one owner reuse a shared knowledge base across multiple apps.
- Activating a saved agent does not replace the app’s XMPP/JID wrapper; it swaps the reusable persona/runtime/base knowledge underneath it.

---

## 🤖 P2: AI-assisted dev loop (test bot, inspect RAG, fetch widget)

Once you already have an app selected with app-token auth:

- Call `ethora-auth-use-app`
- Call `ethora-bot-get-v2` to inspect current bot status, trigger, prompt, widget flags, and runtime LLM settings
- Call `ethora-agents-list-v2` / `ethora-agents-activate-v2` to inspect or switch the reusable saved agent behind the current app wrapper
- Call `ethora-sources-site-list-v2` and `ethora-sources-docs-list-v2` to inspect indexed sources
- Call `ethora-sources-site-tags-update-v2` or `ethora-sources-docs-tags-update-v2` to segment retrieval by tags
- Call `ethora-chats-message-v2` to send a private or group test message
- Call `ethora-chats-history-v2` to read the saved response/history back
- Call `ethora-bot-widget-v2` to fetch the widget embed config and public widget URL metadata

Example: send a private test message

```json
{
  "text": "Summarize the indexed FAQ in 3 bullets.",
  "mode": "private",
  "nickname": "SDK Tester"
}
```

Example: read recent history for that private session

```json
{
  "mode": "private",
  "nickname": "SDK Tester",
  "limit": 10
}
```

Example: send a group-room test message

```json
{
  "text": "What documents are currently indexed for this app?",
  "mode": "group",
  "roomJid": "support_demo@conference.xmpp.example.com"
}
```

Example: apply retrieval tags to a crawled source

```json
{
  "sourceId": "6790abc1234567890def1234",
  "tags": ["support", "faq", "billing"]
}
```

Notes:
- `mode: "private"` uses a persisted private test conversation keyed by `nickname`.
- `mode: "group"` lets you exercise room-style flows by passing `roomJid`.
- `ethora-bot-message-v2` and `ethora-bot-history-v2` remain available as compatibility aliases, but `ethora-chats-*` is the primary surface.
- Saved-agent knowledge can be inspected by passing `knowledgeScope: "saved_agent"` and `savedAgentId` to the source list/tag/delete tools.

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
git clone https://github.com/dappros/ethora-mcp-server.git
cd ethora-mcp-server
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
