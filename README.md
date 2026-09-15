# Ethora MCP Server (Model Context Protocol)

[![npm](https://img.shields.io/npm/v/@ethora/mcp-server.svg)](https://www.npmjs.com/package/@ethora/mcp-server)
[![Node](https://img.shields.io/badge/node-%E2%89%A518.x-blue.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=ethora&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBldGhvcmEvbWNwLXNlcnZlciJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522ethora%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540ethora%252Fmcp-server%2522%255D%257D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522ethora%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540ethora%252Fmcp-server%2522%255D%257D)

The MCP server for **Ethora**, an open-source chat and messaging platform with a built-in AI agent framework. It lets Claude, ChatGPT, Cursor, Claude Code, VS Code and autonomous agents create Ethora apps, chat rooms, users and AI agents, post messages, index RAG sources and produce website chat-widget embeds, all through tool calls.

**Part of the [Ethora SDK ecosystem](https://github.com/dappros/ethora#ecosystem)**. Cross-SDK updates: [Release Notes](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md). Package changes: [CHANGELOG.md](./CHANGELOG.md).

- npm: <https://www.npmjs.com/package/@ethora/mcp-server>
- Ethora API (Swagger): <https://api.chat.ethora.com/api-docs/#/>

## Three ways to use it

| | Where it runs | Best for |
|---|---|---|
| **Hosted (Ethora Cloud)** | `https://mcp.chat.ethora.com/mcp` (production rollout in progress; `https://mcp.chat-qa.ethora.com/mcp` is the QA instance) | Claude.ai, ChatGPT, Claude Code, Cursor and agents that talk to Ethora Cloud with no local install |
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
| `/mcp` | Nobody at connect time. Call `ethora-user-login` or `ethora-user-register` inside the session, or send `Authorization: Bearer <token>` on every request (user API key, app token or B2B token; the server picks the auth mode from the token type) | Agents, Claude Code, Cursor, connectors added as "no auth" |
| `/mcp/k/<api-key>` | The key in the path, applied like a Bearer header | Claude.ai and ChatGPT custom connectors, which take a URL but no headers |
| `/mcp/oauth` | An OAuth 2.1 access token obtained through the Ethora authorization server (dynamic client registration, PKCE, scopes `read`, `write`, `admin`) | Connector directories; vendors run the login flow themselves |
| stdio | Env vars `ETHORA_APP_JWT` (login/register bootstrap) and optional `ETHORA_B2B_TOKEN`, or `ethora-configure` at runtime | Local CLI |

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
- hides the identity tools (`ethora-user-login`, `ethora-user-register`, `ethora-configure`, `ethora-auth-use-app`, `ethora-auth-use-user`, `ethora-api-key-create`, `ethora-api-key-list`, `ethora-api-key-revoke`) because the token already fixes who you are.

The authorization server itself is part of the Ethora backend: `<issuer>/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/authorize` (a consent page with sign-in, account creation and Google sign-in), `/oauth/token` and `/oauth/revoke`. Users see and disconnect OAuth grants under Account, AI Assistants, Connected AI apps. When `ETHORA_MCP_AUTH_ISSUER` is unset, both OAuth routes return 404 and discovery omits them.

## What agents can do

The end-to-end journey a new user typically asks for, with the tools in order:

1. `ethora-user-register` (or `ethora-user-login`) to get an authenticated session and an API key.
2. `ethora-app-create { displayName }` then `ethora-app-select { appId }` to make the new app current.
3. `ethora-app-create-chat { title }` to create a group room. The result contains the room JID `${appId}_${chatId}`; every room tool accepts the JID or the bare `chatId`.
4. `ethora-agents-create-v2 { name, prompt, ... }` to create an AI agent persona in that app.
5. `ethora-agent-invite-to-chat { agentIdOrAddress, chatJid }` to put the agent in the room. A bot instance is spawned live, no restart needed.
6. `ethora-chats-message-v2 { text, roomJid, waitForReplySec: 45 }` to post a message and wait for the agent's answer, returned as `replies`. `ethora-chats-history-v2` reads the room afterwards.
7. `ethora-agents-activate-v2 { agentId, chatJid }` to make that agent the app's default responder, then `ethora-widget-embed-snippet` for the `<script>` tag that puts the AI chat widget on a website.

`ethora-help { goal }` returns this and the other recipes (`user-login`, `broadcast`, `sources-ingest`, `files-upload`, `bot-manage`, `chat-test`, `widget`, `b2b-bootstrap-ai`) with the calls filled in for the current state, and `ethora-run-recipe` executes them.

### Documentation inside the server

- **`instructions`** in the initialize result tell the assistant how identity works on the entry point it connected through: the open endpoint explains login and register, personal-URL and Bearer sessions are told they are already authenticated and must never ask for a password or key, OAuth sessions the same plus how to react to `INSUFFICIENT_SCOPE`.
- **`search { query }`** and **`fetch { id }`** (the ChatGPT connector convention) search an in-memory corpus: the auth map, quickstarts, recipes, a hosted getting-started guide, an API keys guide and one reference entry per tool with its inputs. They work unauthenticated.
- **Resources** `ethora://docs/auth-map`, `ethora://docs/chat-component/quickstart`, `ethora://docs/sdk-backend/quickstart`, `ethora://docs/recipes` and **prompts** `ethora-auth-map`, `ethora-vite-quickstart`, `ethora-nextjs-quickstart`, `ethora-backend-sdk-quickstart`, `ethora-recipes`, `ethora-agents-quickstart`.

### Tool groups

91 tools on the hosted server (app deletion, wallet transfer and bulk-delete tools are only registered when `ETHORA_MCP_ENABLE_DANGEROUS_TOOLS=true`, which the monoserver deploy sets; the stdio default is off). Every tool carries MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) so clients can auto-approve reads and confirm the 13 destructive ones.

| Group | Tools |
|---|---|
| Session and help | `ethora-status`, `ethora-doctor`, `ethora-help`, `ethora-run-recipe`, `ethora-configure`, `ethora-auth-use-user`, `ethora-auth-use-app`, `ethora-auth-use-b2b` |
| Accounts and keys | `ethora-user-register`, `ethora-user-login`, `ethora-api-key-create`, `ethora-api-key-list`, `ethora-api-key-revoke` |
| Apps | `ethora-app-create`, `ethora-app-list`, `ethora-app-select`, `ethora-app-update`, `ethora-app-delete`, `ethora-app-export-v2`, `ethora-app-import-v2`, `ethora-app-tokens-create-v2`, `ethora-app-tokens-list-v2`, `ethora-app-tokens-rotate-v2`, `ethora-app-tokens-revoke-v2` |
| Rooms and messages | `ethora-app-create-chat`, `ethora-app-delete-chat`, `ethora-app-get-default-rooms`, `ethora-app-get-default-rooms-with-app-id`, `ethora-chats-message-v2`, `ethora-chats-history-v2`, `ethora-chats-broadcast-v2`, `ethora-chats-broadcast-job-v2`, `ethora-wait-broadcast-job-v2`, `ethora-messages-search-v2`, `ethora-messages-context-v2`, `ethora-unread-counts-v2` |
| AI agents | `ethora-agents-create-v2`, `ethora-agents-list-v2`, `ethora-agents-get-v2`, `ethora-agents-update-v2`, `ethora-agents-clone-v2`, `ethora-agents-delete-v2`, `ethora-agents-export-v2`, `ethora-agents-import-v2`, `ethora-agents-activate-v2`, `ethora-agent-invite-to-chat`, `ethora-agent-set-visibility`, `ethora-agent-soul-set`, `ethora-agent-soul-append`, `ethora-bot-instances-list`, `ethora-bot-instance-status`, `ethora-bot-instance-diag`, `ethora-bot-instance-test-message`, `ethora-bot-instance-leave-chat` |
| Website widget | `ethora-widget-embed-snippet`, `ethora-generate-chat-component-app-tsx` |
| Legacy per-app bot (apps created in the dashboard before the agents framework) | `ethora-bot-get-v2`, `ethora-bot-update-v2`, `ethora-bot-enable-v2`, `ethora-bot-disable-v2`, `ethora-bot-widget-v2`, `ethora-b2b-bot-enable` |
| RAG sources | `ethora-sources-site-crawl-v2`, `ethora-sources-site-crawl-v2-wait`, `ethora-sources-site-reindex-v2`, `ethora-sources-site-reindex-v2-wait`, `ethora-sources-site-list-v2`, `ethora-sources-site-tags-update-v2`, `ethora-sources-site-delete-url-v2`, `ethora-sources-site-delete-url-v2-batch`, `ethora-sources-docs-upload-v2`, `ethora-sources-docs-list-v2`, `ethora-sources-docs-tags-update-v2`, `ethora-sources-docs-delete-v2`, `ethora-sources-docs-upload`, `ethora-sources-docs-delete` |
| Users and files | `ethora-users-batch-create-v2`, `ethora-users-batch-job-v2`, `ethora-wait-users-batch-job-v2`, `ethora-files-upload-v2`, `ethora-files-get-v2`, `ethora-files-delete-v2` |
| B2B provisioning (server integrations with a B2B token) | `ethora-b2b-app-create`, `ethora-b2b-app-provision`, `ethora-b2b-app-bootstrap-ai`, `ethora-generate-b2b-bootstrap-runbook`, `ethora-generate-env-examples` |
| Wallet | `ethora-wallet-get-balance`, `ethora-wallet-erc20-transfer` |
| Docs | `search`, `fetch` |

Alias tools (`ethora.b2b.*`, `ethora-bot-message-v2`, `ethora-bot-history-v2`) are off by default (`ETHORA_MCP_ENABLE_ALIASES=true` to expose them); the canonical tools cover the same ground.

## Website widget

`ethora-widget-embed-snippet` returns the tag for the embeddable AI chat widget:

```html
<script id="chat-content-assistant" src="https://widget.<your domain>/assistant.js"
  data-app-id="<appId>" data-api-base="https://api.<your domain>" data-bot-name="Helper" defer></script>
```

The widget answers with the app's active bot (`defaultBotInstanceId`). On an app created through the API run `ethora-agents-create-v2`, `ethora-app-create-chat`, `ethora-agent-invite-to-chat` and `ethora-agents-activate-v2 { agentId, chatJid }` first; the tool lists these prerequisites and `ethora-help { goal: "widget" }` walks through them. Activation runs in user auth by setting the app's default bot instance (what the admin AI Widget dropdown does). Until a bot is active, the widget's session endpoint answers `AI_BOT_NOT_CONFIGURED`. `ethora-generate-chat-component-app-tsx` produces a React `App.tsx` for `@ethora/chat-component` instead.

## Configuration

### Env vars (stdio and hosted)

| Variable | Meaning |
|---|---|
| `ETHORA_API_URL` | Full API URL, e.g. `https://api.chat.ethora.com/v1` (default). On a hosted server it is fixed for all sessions |
| `ETHORA_BASE_URL` | Host-only alternative to `ETHORA_API_URL`; `/v1` is appended |
| `ETHORA_APP_JWT` | App JWT used only by login and register (`ETHORA_APP_TOKEN` is a legacy alias) |
| `ETHORA_APP_DOMAIN_NAME` | Base app `domainName`; when `ETHORA_APP_JWT` is empty the server fetches the app JWT from `GET /v1/apps/get-config?domainName=...` at startup |
| `ETHORA_B2B_TOKEN` | B2B server token for `x-custom-token` tenant-actor routes |
| `ETHORA_MCP_ENABLE_DANGEROUS_TOOLS` | `true` registers app deletion, wallet transfer and bulk-delete tools (default off) |
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
| `ETHORA_MCP_WIDGET_URL` | Base URL of the hosted AI chat widget (`<url>/assistant.js`) for `ethora-widget-embed-snippet` |
| `ETHORA_MCP_PUBLIC_API_URL` | Public API base browsers can reach, emitted as `data-api-base`; falls back to `ETHORA_MCP_AUTH_ISSUER`, then a non-loopback `ETHORA_API_URL` |

A `.env` file in the working directory is loaded at startup; real environment variables win. Credentials can also be set per session with `ethora-configure` (in memory only; on a hosted server `apiUrl` cannot be changed).

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

Every stdio client runs `npx -y @ethora/mcp-server`; pass credentials as env vars (preferred) or call `ethora-configure` for a quick local test (its arguments end up in the transcript). One-click buttons exist for Cursor and VS Code at the top of this README. For hosted mode use the URL form shown in the quickstart instead.

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

With `ETHORA_B2B_TOKEN` configured, `ethora-auth-use-b2b` switches the session to tenant-actor auth and `ethora-b2b-app-bootstrap-ai` creates an app, indexes sources (`crawlUrl`, `docs[]` as base64) and configures its bot in one call, with optional `llmProvider` and `llmModel`. `ethora-b2b-app-provision` adds app tokens and default rooms. `ethora-users-batch-create-v2` plus `ethora-wait-users-batch-job-v2` provision users asynchronously and `ethora-chats-broadcast-v2` plus `ethora-wait-broadcast-job-v2` send a message to many rooms. `ethora-generate-b2b-bootstrap-runbook` prints the call order for your own automation.

## Troubleshooting

| Symptom | Meaning and fix |
|---|---|
| `TOKEN_MISSING` (401) | The session has no user token. Call `ethora-user-login` or `ethora-user-register`, or connect with a Bearer header or personal URL |
| `REFRESH_RECORD_NOT_FOUND` (401) | The API key or token was revoked. Create a new key |
| `INSUFFICIENT_SCOPE` (403) on `/mcp/oauth` | The OAuth grant lacks the scope the tool needs (`read`, `write` or `admin`). Reconnect and approve the wider scope |
| `This tool requires app-token auth` or `AUTH_USER_REQUIRED` | Wrong auth mode. On the hosted server stay in user mode (`ethora-auth-use-user`); app-token mode is only for `/v2/bot` and widget routes |
| `AI_BOT_NOT_CONFIGURED` from the widget | No active bot on the app. Run the agent, invite and `ethora-agents-activate-v2` steps, then reload the page |
| `BOT_NOT_INITIALIZED` (422) from `ethora-bot-*` | The app has no legacy per-app bot; use the agents tools instead |
| `AGENT_NOT_FOUND` or `APP_NOT_FOUND` (404) | Wrong id or the app was not selected; `ethora-app-select` first, or pass `appId` |
| `Not Acceptable` (406) from `/mcp` | The client must accept both `application/json` and `text/event-stream` |
| Client cannot connect (stdio) | Run `npx -y @ethora/mcp-server` in a terminal and check Node 18 or newer |
| Hosted server not answering | `GET /healthz`; `appJwtReady: false` means the base app JWT bootstrap failed (check `ETHORA_APP_DOMAIN_NAME` and `ETHORA_API_URL`) |

## Security notes

- API keys and personal URLs act as the user until revoked. Keep them in your client's secret store, never in shared config or screenshots, and revoke on suspicion.
- The server never logs request URLs or tokens. Keep your reverse proxy's access log free of request paths for the MCP host (the monoserver nginx template does).
- Anything returned by a tool is visible to the model and stored in the conversation transcript; the server tells assistants not to print keys or passwords, and to confirm destructive tools with the user.
- This repo runs report-only secret and SAST scans (gitleaks, semgrep) on pushes and PRs.

## Development

```bash
git clone https://github.com/dappros/ethora-mcp-server.git
cd ethora-mcp-server
npm install
npm run build          # tsc
npm start              # stdio
ETHORA_MCP_TRANSPORT=http npm start   # hosted mode on 127.0.0.1:3030
npm run inspector      # MCP Inspector against the stdio build
```

`npm run check` type-checks without emitting. Source layout: `src/tools.ts` (tools), `src/prompts.ts` (prompts and resources), `src/docsSearch.ts` (`search` / `fetch`), `src/httpServer.ts` (hosted transport, entry points, OAuth resource handling), `src/session.ts` (per-session state), `src/scopeGuard.ts` (scope enforcement), `src/routeAuth.ts` (backend route auth table), `src/instructions.ts`.

## Related repos

- [ethora-chat-component](https://github.com/dappros/ethora-chat-component): the React chat component used in widgets and stand-alone apps
- [ethora-monoserver](https://github.com/dappros/ethora-monoserver): deploy automation that ships this server as an optional service
- [ethora-wp-plugin](https://github.com/dappros/ethora-wp-plugin): WordPress integration
- [rag_demos](https://github.com/dappros/rag_demos): RAG AI assistant examples

## License

See [LICENSE](./LICENSE).
