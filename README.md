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

- **Session / Config**
  - `ethora-configure` — set API URL + App JWT (in-memory for this MCP session)
  - `ethora-status` — show configured API URL + whether auth tokens are present
  - `ethora-doctor` — validate config + ping the configured Ethora API
  - `ethora-app-select` — select current appId and optionally set appToken (B2B)
  - `ethora-auth-use-app` — switch to app-token auth mode (B2B)
  - `ethora-auth-use-user` — switch to user-session auth mode
  - `ethora-auth-use-b2b` — switch to B2B `x-custom-token` auth mode (server token)

- **Chats (v2)**
  - `ethora-chats-broadcast-v2` — enqueue broadcast job (requires app-token auth)
  - `ethora-chats-broadcast-job-v2` — get broadcast job status/results (requires app-token auth)

- **Files (v2)**
- **Bot / Agent (v2)**
  - `ethora-bot-get-v2` — get bot status/settings (app-token auth)
  - `ethora-bot-update-v2` — update bot settings (app-token auth)
  - `ethora-bot-enable-v2` — enable bot (app-token auth)
  - `ethora-bot-disable-v2` — disable bot (app-token auth)

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
  - `ethora-sources-site-crawl-v2` — crawl a URL (requires app-token auth; no user creds)
  - `ethora-sources-site-reindex-v2` — reindex URL by urlId (requires app-token auth)
  - `ethora-sources-site-delete-url-v2` — delete by URL (requires app-token auth)
  - `ethora-sources-site-delete-url-v2-batch` — batch delete (requires app-token auth)
  - `ethora-sources-docs-upload-v2` — upload docs (requires app-token auth)
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
  - `ethora-b2b-app-bootstrap-ai` — create app → index sources → enable bot (B2B automation)

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

> Security: **never** commit App JWTs to git. Configure them via env vars or the client’s secret store.

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
  - optional `crawlUrl`
  - optional `docs[]` (base64)
  - `enableBot: true`

It will:
- create the app (B2B)
- set current app context (best-effort)
- index sources via `/v2/sources/*` (app-token auth)
- enable bot (best-effort)

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
  "crawlUrl": "https://example.com",
  "followLink": true,
  "enableBot": true,
  "botTrigger": "/bot"
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
  "enableBot": true
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
