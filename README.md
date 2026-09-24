# Ethora MCP Server (Model Context Protocol)

[![npm](https://img.shields.io/npm/v/@ethora/mcp-server.svg)](https://www.npmjs.com/package/@ethora/mcp-server)
[![Node](https://img.shields.io/badge/node-%E2%89%A518.x-blue.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Glama score](https://glama.ai/mcp/servers/dappros/ethora-mcp-server/badges/score.svg)](https://glama.ai/mcp/servers/dappros/ethora-mcp-server)
[![Wellknown: live](https://wellknown.network/agents/ethora-mcp-cli/badge.svg)](https://wellknown.network/agents/ethora-mcp-cli)

**Add the hosted server in one click.** You sign in through your browser; there is nothing to install and no key to paste.

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=ethora&config=eyJ1cmwiOiJodHRwczovL21jcC5jaGF0LmV0aG9yYS5jb20vbWNwL29hdXRoIn0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Add_Ethora-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522ethora%2522%252C%2522type%2522%253A%2522http%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fmcp.chat.ethora.com%252Fmcp%252Foauth%2522%257D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Add_Ethora-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522ethora%2522%252C%2522type%2522%253A%2522http%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fmcp.chat.ethora.com%252Fmcp%252Foauth%2522%257D)

For Claude.ai, ChatGPT, Claude Desktop, LM Studio and anything else that takes a connector URL, add
`https://mcp.chat.ethora.com/mcp/oauth` and sign in. Running it yourself instead? See
[Using with stdio clients](#using-with-stdio-clients).

The MCP server for **Ethora**, an open-source chat and messaging platform with a built-in AI agent framework. It lets Claude, ChatGPT, Cursor, Claude Code, VS Code and autonomous agents create Ethora apps, chat rooms, users and AI agents, post messages, index RAG sources and produce website chat-widget embeds, all through tool calls.

**Part of the [Ethora SDK ecosystem](https://github.com/dappros/ethora#ecosystem)**. Cross-SDK updates: [Release Notes](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md). Package changes: [CHANGELOG.md](./CHANGELOG.md).

- npm: <https://www.npmjs.com/package/@ethora/mcp-server>
- MCP Registry: `io.github.dappros/ethora-mcp-server` (<https://registry.modelcontextprotocol.io/>)
- Ethora API (Swagger): <https://api.chat.ethora.com/api-docs/#/>

## Three ways to use it

| | Where it runs | Best for |
|---|---|---|
| **Hosted (Ethora Cloud)** | `https://mcp.chat.ethora.com/mcp` (production; `https://mcp.chat-qa.ethora.com/mcp` is the QA instance) | Claude.ai, ChatGPT, Claude Code, Cursor and agents that talk to Ethora Cloud with no local install |
| **Self-hosted** | Ships with the Ethora monoserver deploy; enable `services.mcp.enabled` in `deploy.yml` and it is served at `mcp.<your domain>/mcp` | Dedicated or on-premise Ethora installs; agent traffic never leaves your infrastructure |
| **stdio CLI** | `npx -y @ethora/mcp-server` on your machine, configured with env vars | Local development, CI, and clients that launch a command |

The hosted and self-hosted modes are the same server started with `ETHORA_MCP_TRANSPORT=http`. Every MCP session has private in-memory state: one client's login, selected app or tokens are never visible to another session.

## 60-second quickstart

**Claude.ai or ChatGPT (custom connector).** In the Ethora web app open Account, then the **AI Assistants** tab, create an API key and copy the **personal connector URL** it shows (`https://mcp.chat.ethora.com/mcp/k/<key>`). Paste it as a custom connector. Every conversation is authenticated with no login step. For a listed connector that uses the vendor's OAuth login instead, the URL is `https://mcp.chat.ethora.com/mcp/oauth`.

**Claude Code.**

```bash
# with a personal connector URL (no headers needed)
claude mcp add --transport http ethora https://mcp.chat.ethora.com/mcp/k/<your API key>

# or the open endpoint plus a Bearer header
claude mcp add --transport http ethora https://mcp.chat.ethora.com/mcp --header "Authorization: Bearer <your API key>"
```

**Cursor, VS Code, and any client that takes a URL and headers.**

```json
{
  "mcpServers": {
    "ethora": {
      "url": "https://mcp.chat.ethora.com/mcp",
      "headers": { "Authorization": "Bearer <your API key>" }
    }
  }
}
```

**Autonomous agents with no account yet.** Connect to `https://mcp.chat.ethora.com/mcp` with no credentials and call `ethora-user-register` with an email, first and last name. It creates the account, logs the session in, and returns a generated password plus an API key and `connectorUrl` exactly once. Store the key and reconnect later with the Bearer header or the personal URL; nothing else is needed, no browser and no email confirmation.

**stdio CLI.**

```bash
ETHORA_API_URL=https://api.chat.ethora.com/v1 ETHORA_APP_JWT="JWT <your app jwt>" npx -y @ethora/mcp-server
```

Then ask your agent to call `ethora-status`, `ethora-user-login` (or `ethora-user-register`) and `ethora-app-list`. Lost at any point, call `ethora-help`: it reads the current state and returns the recommended next calls.

## Entry points and authentication

| Entry point | Who supplies identity | Typical client |
|---|---|---|
| `/mcp` (add `?tools=all` to list every tool up front) | Nobody at connect time. Call `ethora-user-login` or `ethora-user-register` inside the session, or send `Authorization: Bearer <token>` on every request (user API key, app token or B2B token; the server picks the auth mode from the token type) | Agents, Claude Code, Cursor, connectors added as "no auth" |
| `/mcp/k/<api-key>` | The key in the path, applied like a Bearer header | Claude.ai and ChatGPT custom connectors, which take a URL but no headers |
| `/mcp/oauth` | An OAuth 2.1 access token obtained through the Ethora authorization server (dynamic client registration, PKCE, access scopes `read`, `write`, `admin`, plus the identity scopes `openid` and `email` for directories that require them) | Connector directories (Claude, ChatGPT); vendors run the login flow themselves |
| stdio | Env vars `ETHORA_APP_JWT` (login/register bootstrap) and optional `ETHORA_B2B_TOKEN`, or `ethora-session-configure` at runtime | Local CLI |

Stay in **user auth mode** on the hosted server (`ethora-status` shows `authMode: user`). App-token and B2B modes exist for server integrations; the agents and rooms routes reject app tokens.

### API keys

- `ethora-api-key-create { name?, ttlDays? }` mints a key (default 90 days, max 365), shown once together with `connectorUrl`. `ethora-user-register` mints one by default and `ethora-user-login { createApiKey: true }` on request.
- `ethora-api-key-list` shows id, name, created and expiry, never the value. `ethora-api-key-revoke { id }` invalidates it immediately: the next request with that key fails with `REFRESH_RECORD_NOT_FOUND`.
- The same keys are managed in the Ethora web app under Account, AI Assistants, where the personal URL, a Claude Code one-liner and a Cursor config are shown with copy buttons.
- A key acts as the user. Treat the personal URL like a password: do not share screenshots of it, revoke it if it leaks. The server never logs request URLs, and the monoserver nginx template logs method and status only on the MCP host.

### OAuth 2.1 (`/mcp/oauth`)

Set `ETHORA_MCP_AUTH_ISSUER` to the public URL of the Ethora API that hosts the authorization server (the monoserver deploy sets it). The MCP server then:

- serves RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp/oauth`, naming the authorization server and the three scopes;
- answers unauthenticated requests on `/mcp/oauth` with `401` and `WWW-Authenticate: Bearer resource_metadata="..."`, which is how clients discover the flow;
- validates each token against the API once per session (cached five minutes) and enforces the token's `scope` per tool: read-only tools need `read`, destructive tools need `admin`, everything else needs `write`. `search`, `fetch`, `ethora-help`, `ethora-status` and `ethora-doctor` need no scope. Tokens without a scope claim (API keys) get full access;
- hides the identity tools (`ethora-user-login`, `ethora-user-register`, `ethora-session-configure`, `ethora-auth-mode-set`, `ethora-auth-mode-set`, `ethora-api-key-create`, `ethora-api-key-list`, `ethora-api-key-revoke`) because the token already fixes who you are.

The authorization server itself is part of the Ethora backend: `<issuer>/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/authorize` (a consent page with sign-in, account creation and Google sign-in), `/oauth/token`, `/oauth/revoke` and `/oauth/userinfo`. Users see and disconnect OAuth grants under Account, AI Assistants, Connected AI apps. When `ETHORA_MCP_AUTH_ISSUER` is unset, both OAuth routes return 404 and discovery omits them.

**Identity scopes.** Some directories (ChatGPT) require the minimal OpenID Connect surface on top of OAuth 2.1: the `openid` and `email` scopes and a `userinfo` endpoint that returns `sub`, `email` and `email_verified`. These scopes grant no access to apps or data; they only let the client see who signed in, and the consent page says so in plain words. There are no ID tokens or JWKS, because nothing consumes them.

**Email confirmation is optional.** Ethora never blocks sign-up or the dashboard on a confirmed address. When a client asks for the identity scopes and the account's address is not yet confirmed, the consent page adds one step: send the confirmation link, continue after confirming, or continue without sharing the address (the identity scopes are dropped from the grant and everything else proceeds). Google sign-ins arrive confirmed and skip the step. The same confirmation can be sent from Account, AI Assistants in the web app.

## What agents can do

The end-to-end journey a new user typically asks for, with the tools in order:

1. `ethora-user-register` (or `ethora-user-login`) to get an authenticated session and an API key.
2. `ethora-app-create { displayName }` then `ethora-app-select { appId }` to make the new app current.
3. `ethora-chat-create { title }` to create a group room. The result contains the room JID `${appId}_${chatId}`; every room tool accepts the JID or the bare `chatId`.
4. `ethora-agent-create { name, prompt, ... }` to create an AI agent persona in that app.
5. `ethora-agent-invite { agentIdOrAddress, chatJid }` to put the agent in the room. A bot instance is spawned live, no restart needed.
6. `ethora-message-send { text, roomJid, waitForReplySec: 45 }` to post a message and wait for the agent's answer, returned as `replies`. `ethora-chat-history` reads the room afterwards.
7. `ethora-agent-activate { agentId, chatJid }` to make that agent the app's default responder, then `ethora-widget-snippet-get` for the `<script>` tag that puts the AI chat widget on a website.

`ethora-help { goal }` returns this and the other recipes (`user-login`, `broadcast`, `sources-ingest`, `files-upload`, `bot-manage`, `chat-test`, `widget`, `b2b-bootstrap-ai`) with the calls filled in for the current state, and `ethora-recipe-run` executes them.

### First-minute conventions

- **Every create tool answers the same way.** `ethora-app-create`, `ethora-chat-create`, `ethora-agent-create` return the raw API object plus `created` (`kind`, `id`, `name`, and `jid` or `address` where relevant) and `next`, two to four suggested calls with arguments filled in. `ethora-app-create` also returns `dashboardUrl`, the app in the web dashboard.
- **`ethora-help { goal }` has a recipe for each headline job:** `new-app`, `in-app-chat`, `multi-agent-room`, `widget`, `chat-test`, plus the server-integration goals. Each returns the calls in order with arguments to copy.
- **Who spoke.** `ethora-message-send` replies and `ethora-chat-history` rows carry `senderName` and `senderKind` (`human`, `agent`, `app`), so a multi-agent room reads as "Freud: ..., Jung: ..." rather than instance ids.
- **Search understands intent.** `search` maps the phrases people use ("add chat to my React app", "several agents talking to each other", "webhook when a message arrives") to the documents that answer them, and `doc:not-available` says plainly what is not exposed over MCP and where it lives instead. Whole documents are fetchable by their bare id (`doc:recipes`, `doc:chat-component-quickstart`, `doc:sdk-backend-quickstart`, `doc:auth-map`).

### Documentation inside the server

- **`instructions`** in the initialize result tell the assistant how identity works on the entry point it connected through: the open endpoint explains login and register, personal-URL and Bearer sessions are told they are already authenticated and must never ask for a password or key, OAuth sessions the same plus how to react to `INSUFFICIENT_SCOPE`.
- **`search { query }`** and **`fetch { id }`** (the ChatGPT connector convention) search an in-memory corpus: the auth map, quickstarts, recipes, a hosted getting-started guide, an API keys guide and one reference entry per tool with its inputs. They work unauthenticated.
- **Resources** `ethora://docs/auth-map`, `ethora://docs/chat-component/quickstart`, `ethora://docs/sdk-backend/quickstart`, `ethora://docs/recipes` and **prompts** `ethora-auth-map`, `ethora-vite-quickstart`, `ethora-nextjs-quickstart`, `ethora-backend-sdk-quickstart`, `ethora-recipes`, `ethora-agents-quickstart`.

### Tool groups

A session lists **the `core` group only** at first: 24 tools covering the whole "sign in, create an app, add rooms and messages, create and activate an agent, give it a knowledge base, get the widget" journey, one variant per operation. The other groups are registered but hidden, which keeps `tools/list` around 40 KB instead of 120 KB and gives assistants a short list to choose from.

Three ways to get more:

- `ethora-tools-enable { group }` enables a group for the session (or `{ group: "all" }`); the server sends `tools/list_changed` and the client refreshes. With no arguments it returns the catalogue with counts.
- Calling a hidden tool by name enables its group and runs it, so a name learned from the docs or an earlier session is never refused.
- `?tools=all` on the endpoint URL (hosted) or `ETHORA_MCP_TOOLS=all` (stdio) lists everything up front.

`search` and `fetch` describe hidden tools too; every tool doc names its group, and `doc:tool-groups` is the catalogue. Legacy and async variants carry a first line naming the preferred sibling.

| Group | What it covers | Tools |
|---|---|---|
| `core` (listed by default) | Sign in or register, create an app, add rooms and messages, create and activate an AI agent, give it a knowledge base, get the website widget. Always listed. | `ethora-status`, `ethora-help`, `ethora-feedback-submit`, `ethora-tools-enable`, `search`, `fetch`, `ethora-user-register`, `ethora-user-login`, `ethora-api-key-create`, `ethora-app-create`, `ethora-app-list`, `ethora-app-select`, `ethora-app-update`, `ethora-chat-create`, `ethora-message-send`, `ethora-chat-history`, `ethora-agent-create`, `ethora-agent-list`, `ethora-agent-update`, `ethora-agent-invite`, `ethora-agent-activate`, `ethora-source-site-crawl-wait`, `ethora-source-doc-upload`, `ethora-widget-snippet-get` |
| `keys` | List and revoke API keys, reveal an app's credentials, mint and rotate app tokens. | `ethora-api-key-list`, `ethora-api-key-revoke`, `ethora-app-credentials-reveal`, `ethora-app-token-create`, `ethora-app-token-list`, `ethora-app-token-revoke`, `ethora-app-token-rotate` |
| `session` | Diagnostics, recipes and switching the session's auth mode (app token, B2B token) for server integrations. | `ethora-doctor`, `ethora-recipe-run`, `ethora-session-configure`, `ethora-auth-mode-set`, `ethora-auth-mode-set`, `ethora-auth-mode-set` |
| `apps-admin` | Delete, export and import whole apps; inspect default rooms. | `ethora-app-delete`, `ethora-app-export`, `ethora-app-import`, `ethora-app-rooms-list`, `ethora-app-rooms-list` |
| `rooms` | Delete rooms, broadcast to many rooms, search messages, read message context and unread counts. | `ethora-chat-delete`, `ethora-broadcast-send`, `ethora-broadcast-job-start`, `ethora-broadcast-job-wait`, `ethora-message-search`, `ethora-message-context`, `ethora-chat-unread-counts` |
| `agents-admin` | Inspect, clone, delete, export and import agents; edit an agent's soul and visibility. | `ethora-agent-get`, `ethora-agent-clone`, `ethora-agent-delete`, `ethora-agent-export`, `ethora-agent-import`, `ethora-agent-visibility-set`, `ethora-agent-soul-set`, `ethora-agent-soul-append` |
| `sources` | Knowledge-base maintenance: async crawl and reindex jobs, list and tag sites and documents, delete URLs and documents. | `ethora-source-site-crawl`, `ethora-source-site-reindex`, `ethora-source-site-reindex-wait`, `ethora-source-site-list`, `ethora-source-site-tags-update`, `ethora-source-site-url-delete`, `ethora-source-site-url-delete-batch`, `ethora-source-doc-list`, `ethora-source-doc-tags-update`, `ethora-source-doc-delete` |
| `users-files` | Batch-create users and upload, fetch or delete files. | `ethora-user-batch-create`, `ethora-user-batch-job-start`, `ethora-user-batch-job-wait`, `ethora-file-upload`, `ethora-file-get`, `ethora-file-delete` |
| `legacy-bot` | The per-app bot of apps created in the dashboard before the agents framework, and the pre-v2 document tools. Prefer the agents and sources tools for anything new. | `ethora-bot-get`, `ethora-bot-update`, `ethora-bot-enable`, `ethora-bot-disable`, `ethora-bot-widget-get`, `ethora-bot-history`, `ethora-bot-message-send`, `ethora-bot-instance-list`, `ethora-bot-instance-status-set`, `ethora-bot-instance-diagnose`, `ethora-bot-instance-leave`, `ethora-bot-instance-test`, `ethora-bot-enable-b2b`, `ethora-source-doc-upload-legacy`, `ethora-source-doc-delete-legacy` |
| `b2b` | Server-to-server provisioning with a B2B token, plus code and config generators for integrations. | `ethora-b2b-app-create`, `ethora-b2b-app-provision`, `ethora-b2b-app-bootstrap-ai`, `ethora-b2b-runbook-generate`, `ethora-env-examples-generate`, `ethora-chat-component-app-generate`, `ethora.b2b.auth.use`, `ethora.b2b.app.create`, `ethora.b2b.bot.enable`, `ethora.b2b.broadcast.wait`, `ethora.b2b.app.bootstrap-ai` |
| `wallet` | Wallet balance and ERC-20 transfer. Local (stdio) only; never offered on the hosted server. | `ethora-wallet-balance-get`, `ethora-wallet-erc20-transfer` |

App deletion and bulk-delete tools are only registered when `ETHORA_MCP_ENABLE_DANGEROUS_TOOLS=true` (the monoserver deploy sets it; the stdio default is off). Alias tools (`ethora.b2b.*`, `ethora-bot-message-send`, `ethora-bot-history`) are off by default (`ETHORA_MCP_ENABLE_ALIASES=true` to expose them); the canonical tools cover the same ground.

## Website widget

`ethora-widget-snippet-get` returns the tag for the embeddable AI chat widget:

```html
<script id="chat-content-assistant" src="https://widget.<your domain>/assistant.js"
  data-app-id="<appId>" data-api-base="https://api.<your domain>" data-bot-name="Helper" defer></script>
```

The widget answers with the app's active bot (`defaultBotInstanceId`). On an app created through the API run `ethora-agent-create`, `ethora-chat-create`, `ethora-agent-invite` and `ethora-agent-activate { agentId, chatJid }` first; the tool lists these prerequisites and `ethora-help { goal: "widget" }` walks through them. Activation runs in user auth by setting the app's default bot instance (what the admin AI Widget dropdown does). Until a bot is active, the widget's session endpoint answers `AI_BOT_NOT_CONFIGURED`. `ethora-chat-component-app-generate` produces a React `App.tsx` for `@ethora/chat-component` instead.

## Configuration

### Env vars (stdio and hosted)

| Variable | Meaning |
|---|---|
| `ETHORA_API_URL` | Full API URL, e.g. `https://api.chat.ethora.com/v1` (default). On a hosted server it is fixed for all sessions |
| `ETHORA_BASE_URL` | Host-only alternative to `ETHORA_API_URL`; `/v1` is appended |
| `ETHORA_APP_JWT` | App JWT used only by login and register (`ETHORA_APP_TOKEN` is a legacy alias) |
| `ETHORA_APP_DOMAIN_NAME` | Base app `domainName`; when `ETHORA_APP_JWT` is empty the server fetches the app JWT from `GET /v1/apps/get-config?domainName=...` at startup |
| `ETHORA_B2B_TOKEN` | B2B server token for `x-custom-token` tenant-actor routes |
| `ETHORA_MCP_TOOLS` | `all` lists every tool from the start instead of the core group (stdio; hosted uses `?tools=all` on the URL) |
| `ETHORA_MCP_ENABLE_DANGEROUS_TOOLS` | `true` registers app deletion, wallet transfer and bulk-delete tools (default off) |
| `ETHORA_MCP_OPENAI_APPS_CHALLENGE` | Hosted only. Token issued by the OpenAI apps portal for domain verification; served verbatim at `/.well-known/openai-apps-challenge` (404 when unset) |
| `ETHORA_MCP_ENABLE_ALIASES` | `true` exposes the dot-namespaced alias tools (default off) |

### Hosted mode only

| Variable | Meaning |
|---|---|
| `ETHORA_MCP_TRANSPORT` | `stdio` (default) or `http`; `--http` on the command line does the same |
| `ETHORA_MCP_HTTP_HOST`, `ETHORA_MCP_HTTP_PORT` | Bind address, default `127.0.0.1:3030`; put nginx in front |
| `ETHORA_MCP_PUBLIC_URL` | Public base URL advertised in discovery and used for `connectorUrl`, e.g. `https://mcp.chat.ethora.com/mcp` |
| `ETHORA_MCP_TRUST_PROXY` | `true` takes the client IP from `X-Forwarded-For`; it is forwarded to the API so per-IP limits apply per caller |
| `ETHORA_MCP_SESSION_TTL_MS` | Idle session eviction, default 4 hours |
| `ETHORA_MCP_AUTH_ISSUER` | Public URL of the OAuth authorization server (the Ethora API host); enables `/mcp/oauth` |
| `ETHORA_MCP_WIDGET_URL` | Base URL of the hosted AI chat widget (`<url>/assistant.js`) for `ethora-widget-snippet-get` |
| `ETHORA_MCP_PUBLIC_API_URL` | Public API base browsers can reach, emitted as `data-api-base`; falls back to `ETHORA_MCP_AUTH_ISSUER`, then a non-loopback `ETHORA_API_URL` |

A `.env` file in the working directory is loaded at startup; real environment variables win. Credentials can also be set per session with `ethora-session-configure` (in memory only; on a hosted server `apiUrl` cannot be changed).

### Endpoints (hosted)

| Path | Purpose |
|---|---|
| `POST\|GET\|DELETE /mcp` | Streamable HTTP MCP endpoint, open |
| `POST\|GET\|DELETE /mcp/k/<api-key>` | Same, authenticated by the key in the path |
| `POST\|GET\|DELETE /mcp/oauth` | Same, Bearer token required, scopes enforced |
| `GET /healthz` | `{ ok, sessions, version, appJwtReady, oauth }` |
| `GET /.well-known/mcp` and `GET /` | Discovery JSON: endpoint, transport, auth options, OAuth metadata |
| `GET /.well-known/oauth-protected-resource[/mcp/oauth]` | RFC 9728 protected-resource metadata |

### Response envelope

Every tool returns JSON text in one shape: success `{ ok: true, ts, meta, data }`, failure `{ ok: false, ts, meta, error }` where `error` carries `code` (the API's own code when it has one), `message`, `httpStatus`, `requestId` and a one-line `hint`.

## Using with stdio clients

Every stdio client runs `npx -y @ethora/mcp-server`; pass credentials as env vars (preferred) or call `ethora-session-configure` for a quick local test (its arguments end up in the transcript). For hosted mode use the one-click buttons at the top of this README, or the URL form in the
quickstart. One-click buttons for the stdio package:

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=ethora&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBldGhvcmEvbWNwLXNlcnZlciJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522ethora%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540ethora%252Fmcp-server%2522%255D%257D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522ethora%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540ethora%252Fmcp-server%2522%255D%257D)

### Cursor

```json
{ "mcpServers": { "ethora": { "command": "npx", "args": ["-y", "@ethora/mcp-server"] } } }
```

### VS Code (and GitHub Copilot agent mode)

`.vscode/mcp.json` (note the key is `servers`):

```json
{ "servers": { "ethora": { "command": "npx", "args": ["-y", "@ethora/mcp-server"] } } }
```

### Claude Code

```bash
claude mcp add ethora -e ETHORA_API_URL=https://api.chat.ethora.com/v1 -e ETHORA_APP_JWT="JWT <your app jwt>" -- npx -y @ethora/mcp-server
```

Add `--scope user` to make it available in every project; verify with `claude mcp list`.

### Claude Desktop

Settings, Developer, Edit Config (`claude_desktop_config.json`):

```json
{ "mcpServers": { "ethora": { "command": "npx", "args": ["-y", "@ethora/mcp-server"] } } }
```

### Gemini CLI, Windsurf, Cline

Same `mcpServers` block as above in `~/.gemini/settings.json`, `~/.codeium/windsurf/mcp_config.json` or `cline_mcp_settings.json`.

### Codex CLI

`~/.codex/config.toml` (the table is `mcp_servers` with an underscore):

```toml
[mcp_servers.ethora]
command = "npx"
args = ["-y", "@ethora/mcp-server"]
```

### Container

```bash
docker build -t ethora-mcp-server .
docker run -i --rm -e ETHORA_API_URL=https://api.chat.ethora.com/v1 -e ETHORA_APP_JWT="JWT <your app jwt>" ethora-mcp-server
```

Add `-e ETHORA_MCP_TRANSPORT=http -e ETHORA_MCP_HTTP_HOST=0.0.0.0 -p 3030:3030` to run the hosted mode in a container.

## B2B provisioning (server integrations)

With `ETHORA_B2B_TOKEN` configured, `ethora-auth-mode-set` switches the session to tenant-actor auth and `ethora-b2b-app-bootstrap-ai` creates an app, indexes sources (`crawlUrl`, `docs[]` as base64) and configures its bot in one call, with optional `llmProvider` and `llmModel`. `ethora-b2b-app-provision` adds app tokens and default rooms. `ethora-user-batch-create` plus `ethora-user-batch-job-wait` provision users asynchronously and `ethora-broadcast-send` plus `ethora-broadcast-job-wait` send a message to many rooms. `ethora-b2b-runbook-generate` prints the call order for your own automation.

## Troubleshooting

| Symptom | Meaning and fix |
|---|---|
| `TOKEN_MISSING` (401) | The session has no user token. Call `ethora-user-login` or `ethora-user-register`, or connect with a Bearer header or personal URL |
| `REFRESH_RECORD_NOT_FOUND` (401) | The API key or token was revoked. Create a new key |
| `INSUFFICIENT_SCOPE` (403) on `/mcp/oauth` | The OAuth grant lacks the scope the tool needs (`read`, `write` or `admin`). Reconnect and approve the wider scope |
| `This tool requires app-token auth` or `AUTH_USER_REQUIRED` | Wrong auth mode. On the hosted server stay in user mode (`ethora-auth-mode-set`); app-token mode is only for `/v2/bot` and widget routes |
| `AI_BOT_NOT_CONFIGURED` from the widget | No active bot on the app. Run the agent, invite and `ethora-agent-activate` steps, then reload the page |
| `BOT_NOT_INITIALIZED` (422) from `ethora-bot-*` | The app has no legacy per-app bot; use the agents tools instead |
| `AGENT_NOT_FOUND` or `APP_NOT_FOUND` (404) | Wrong id or the app was not selected; `ethora-app-select` first, or pass `appId` |
| `Not Acceptable` (406) from `/mcp` | The client must accept both `application/json` and `text/event-stream` |
| Consent page says `Social sign-in failed (auth/...)` | The Firebase code in parentheses names the cause (the browser console has the full error). `auth/popup-blocked`: allow popups for the API host. A message with no code was fixed in the backend on 2026-09-17; update if you self-host |
| Client cannot connect (stdio) | Run `npx -y @ethora/mcp-server` in a terminal and check Node 18 or newer |
| Hosted server not answering | `GET /healthz`; `appJwtReady: false` means the base app JWT bootstrap failed (check `ETHORA_APP_DOMAIN_NAME` and `ETHORA_API_URL`) |

## Feedback

`ethora-feedback-submit` sends a report (`bug`, `unexpected`, `feature`, `docs`, `other`) to the Ethora team from inside a session. The point of doing this over MCP rather than a web form is context: the session's last few tool failures travel with the report - tool name, error code and the API `requestId` - so a report can be joined to the server-side log entry instead of being re-typed from memory. Set `includeRecentErrors: false` when the report is unrelated to a failure.

It works whether or not the session is authenticated, because the reporter we most need to hear from is the one whose sign-up or credential is the thing that broke; an authenticated report is attributed to that account, and an anonymous one may carry an `email` for a reply. It is also exempt from OAuth scope enforcement, so a read-only grant can still report a problem.

Credential-shaped keys in the attached context are redacted before sending. That is key-based, so it cannot catch a credential pasted into the free-text `message`: the tool description tells the model not to put secrets or end-user personal data there.

Delivery is configured on the API side (`FEEDBACK_EMAIL_TO`, `FEEDBACK_SLACK_WEBHOOK_URL`, `FEEDBACK_RETENTION_DAYS`); the MCP server only submits.

## Usage attribution

Outbound API calls carry `X-Ethora-Client: mcp/<version>` and, for the duration of a tool call, `X-Ethora-Tool: <tool-name>`. The API records these on its request log as `client` and `source: mcp:<tool>`, which is how MCP traffic is separated from the web app and counted per tool. The public unauthenticated endpoints (`/ping`, `/apps/get-config`) are left unattributed.

## Security notes

- **Credentials are redacted from tool results.** `appSecret`, `tenantSecret`, `appToken`, passwords and similar keys come back as `[redacted]` from every tool (results enter the model's context and client logs). `ethora-app-credentials-reveal { appId, confirm: true }` reveals an app's `appToken` on purpose and needs the `admin` scope over OAuth; the App Secret is only ever shown in the web dashboard API tab. Login, register and the api-key / app-token minting tools still return their credential once by design.

- API keys and personal URLs act as the user until revoked. Keep them in your client's secret store, never in shared config or screenshots, and revoke on suspicion.
- The server never logs request URLs or tokens. Keep your reverse proxy's access log free of request paths for the MCP host (the monoserver nginx template does).
- Anything returned by a tool is visible to the model and stored in the conversation transcript; the server tells assistants not to print keys or passwords, and to confirm destructive tools with the user.
- This repo runs report-only secret and SAST scans (gitleaks, semgrep) on pushes and PRs.

## Development

### Version numbers

Versions are calendar-based: **`YY.M.patch`**, where `YY.M` is the year and month the release ships (`26.9.5` is the fifth September 2026 release, `26.10.0` the first of October) and `patch` counts releases within the month. No leading zero on the month, so `26.10` sorts after `26.9` under semver. Breaking changes do not bump a major; they get the next patch and a changelog entry, and earlier tool names stay callable as aliases. `npm run sync-version` refuses any other shape or any month other than the current one (`ETHORA_VERSION_MONTH=YY.M` overrides on purpose), and the publish workflow runs it. `27.0.0` and `27.1.0`, published on 2026-09-24 against this rule, are deprecated; `26.9.5` is the same code.

### Tool naming

Since 27.0 every listed tool follows one rule: **`ethora-<resource>-<verb>[-<qualifier>]`**.

- *resource* is a singular noun, one or two words: `app`, `agent`, `chat`, `message`, `broadcast`, `source-site`, `source-doc`, `user`, `file`, `bot`, `api-key`, `app-token`, `widget`, `wallet`, `session`, `auth-mode`, `recipe`, `tools`.
- *verb* is the last word: `create`, `list`, `get`, `update`, `delete`, `send`, `set`, `run`, `reveal`, `upload`, `crawl`, `reindex`, `start`, `wait`, `enable`, `disable`, `generate`.
- a *qualifier* only ever follows the verb: `-wait` (blocking form of an async job), `-batch`, `-legacy`, `-b2b`.
- no API-version suffixes: `-v2` is gone from every name. `search` and `fetch` keep their names by ChatGPT connector convention.

**Every earlier name still works.** Old names are aliases: never listed by `tools/list`, but a call to one is rewritten to the canonical tool (with a preset argument where three or two tools became one, such as `ethora-auth-use-app` becoming `ethora-auth-mode-set { mode: "app" }`), so published configs, recipes and saved conversations keep working. Results and usage attribution name the canonical tool. The full mapping is in [the alias table](#earlier-tool-names) at the end of this file and in `src/toolNames.ts`, which the test suite checks against the registry.

## Related repos

- [ethora-chat-component](https://github.com/dappros/ethora-chat-component): the React chat component used in widgets and stand-alone apps
- ethora-monoserver: deploy automation that ships this server as an optional service (private repository, available to enterprise customers)
- [ethora-wp-plugin](https://github.com/dappros/ethora-wp-plugin): WordPress integration
- [rag_demos](https://github.com/dappros/rag_demos): RAG AI assistant examples

## Quality and maintenance score

Independently inspected by [Glama](https://glama.ai/mcp/servers/dappros/ethora-mcp-server), which
builds the server, catalogues its tools and rates tool-definition quality and maintenance activity.

[![Ethora MCP Server quality and maintenance score on Glama](https://glama.ai/mcp/servers/dappros/ethora-mcp-server/badges/card.svg)](https://glama.ai/mcp/servers/dappros/ethora-mcp-server)


## Earlier tool names

Names used before 27.0 and the tool each one now resolves to. All of them remain callable.

| Earlier name | Canonical tool |
|---|---|
| `ethora-agents-activate-v2` | `ethora-agent-activate` |
| `ethora-agents-clone-v2` | `ethora-agent-clone` |
| `ethora-agents-create-v2` | `ethora-agent-create` |
| `ethora-agents-delete-v2` | `ethora-agent-delete` |
| `ethora-agents-export-v2` | `ethora-agent-export` |
| `ethora-agents-get-v2` | `ethora-agent-get` |
| `ethora-agents-import-v2` | `ethora-agent-import` |
| `ethora-agent-invite-to-chat` | `ethora-agent-invite` |
| `ethora-agents-list-v2` | `ethora-agent-list` |
| `ethora-agents-update-v2` | `ethora-agent-update` |
| `ethora-agent-set-visibility` | `ethora-agent-visibility-set` |
| `ethora-app-credentials` | `ethora-app-credentials-reveal` |
| `ethora-app-export-v2` | `ethora-app-export` |
| `ethora-app-import-v2` | `ethora-app-import` |
| `ethora-app-get-default-rooms` | `ethora-app-rooms-list` |
| `ethora-app-get-default-rooms-with-app-id` | `ethora-app-rooms-list` |
| `ethora-app-tokens-create-v2` | `ethora-app-token-create` |
| `ethora-app-tokens-list-v2` | `ethora-app-token-list` |
| `ethora-app-tokens-revoke-v2` | `ethora-app-token-revoke` |
| `ethora-app-tokens-rotate-v2` | `ethora-app-token-rotate` |
| `ethora-auth-use-app` | `ethora-auth-mode-set` with `{"mode": "app"}` |
| `ethora-auth-use-b2b` | `ethora-auth-mode-set` with `{"mode": "b2b"}` |
| `ethora-auth-use-user` | `ethora-auth-mode-set` with `{"mode": "user"}` |
| `ethora.b2b.auth.use` | `ethora-auth-mode-set` with `{"mode": "b2b"}` |
| `ethora.b2b.app.bootstrap-ai` | `ethora-b2b-app-bootstrap-ai` |
| `ethora.b2b.app.create` | `ethora-b2b-app-create` |
| `ethora-generate-b2b-bootstrap-runbook` | `ethora-b2b-runbook-generate` |
| `ethora-bot-disable-v2` | `ethora-bot-disable` |
| `ethora-bot-enable-v2` | `ethora-bot-enable` |
| `ethora-b2b-bot-enable` | `ethora-bot-enable-b2b` |
| `ethora.b2b.bot.enable` | `ethora-bot-enable-b2b` |
| `ethora-bot-get-v2` | `ethora-bot-get` |
| `ethora-bot-history-v2` | `ethora-bot-history` |
| `ethora-bot-instance-diag` | `ethora-bot-instance-diagnose` |
| `ethora-bot-instance-leave-chat` | `ethora-bot-instance-leave` |
| `ethora-bot-instances-list` | `ethora-bot-instance-list` |
| `ethora-bot-instance-status` | `ethora-bot-instance-status-set` |
| `ethora-bot-instance-test-message` | `ethora-bot-instance-test` |
| `ethora-bot-message-v2` | `ethora-bot-message-send` |
| `ethora-bot-update-v2` | `ethora-bot-update` |
| `ethora-bot-widget-v2` | `ethora-bot-widget-get` |
| `ethora-chats-broadcast-job-v2` | `ethora-broadcast-job-start` |
| `ethora-wait-broadcast-job-v2` | `ethora-broadcast-job-wait` |
| `ethora.b2b.broadcast.wait` | `ethora-broadcast-job-wait` |
| `ethora-chats-broadcast-v2` | `ethora-broadcast-send` |
| `ethora-generate-chat-component-app-tsx` | `ethora-chat-component-app-generate` |
| `ethora-app-create-chat` | `ethora-chat-create` |
| `ethora-app-delete-chat` | `ethora-chat-delete` |
| `ethora-chats-history-v2` | `ethora-chat-history` |
| `ethora-unread-counts-v2` | `ethora-chat-unread-counts` |
| `ethora-generate-env-examples` | `ethora-env-examples-generate` |
| `ethora-files-delete-v2` | `ethora-file-delete` |
| `ethora-files-get-v2` | `ethora-file-get` |
| `ethora-files-upload-v2` | `ethora-file-upload` |
| `ethora-messages-context-v2` | `ethora-message-context` |
| `ethora-messages-search-v2` | `ethora-message-search` |
| `ethora-chats-message-v2` | `ethora-message-send` |
| `ethora-run-recipe` | `ethora-recipe-run` |
| `ethora-configure` | `ethora-session-configure` |
| `ethora-sources-docs-delete-v2` | `ethora-source-doc-delete` |
| `ethora-sources-docs-delete` | `ethora-source-doc-delete-legacy` |
| `ethora-sources-docs-list-v2` | `ethora-source-doc-list` |
| `ethora-sources-docs-tags-update-v2` | `ethora-source-doc-tags-update` |
| `ethora-sources-docs-upload-v2` | `ethora-source-doc-upload` |
| `ethora-sources-docs-upload` | `ethora-source-doc-upload-legacy` |
| `ethora-sources-site-crawl-v2` | `ethora-source-site-crawl` |
| `ethora-sources-site-crawl-v2-wait` | `ethora-source-site-crawl-wait` |
| `ethora-sources-site-list-v2` | `ethora-source-site-list` |
| `ethora-sources-site-reindex-v2` | `ethora-source-site-reindex` |
| `ethora-sources-site-reindex-v2-wait` | `ethora-source-site-reindex-wait` |
| `ethora-sources-site-tags-update-v2` | `ethora-source-site-tags-update` |
| `ethora-sources-site-delete-url-v2` | `ethora-source-site-url-delete` |
| `ethora-sources-site-delete-url-v2-batch` | `ethora-source-site-url-delete-batch` |
| `ethora-users-batch-create-v2` | `ethora-user-batch-create` |
| `ethora-users-batch-job-v2` | `ethora-user-batch-job-start` |
| `ethora-wait-users-batch-job-v2` | `ethora-user-batch-job-wait` |
| `ethora-wallet-get-balance` | `ethora-wallet-balance-get` |
| `ethora-widget-embed-snippet` | `ethora-widget-snippet-get` |

## License

See [LICENSE](./LICENSE).
