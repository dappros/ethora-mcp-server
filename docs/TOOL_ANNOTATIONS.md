# Tool annotations

Generated from `src/toolAnnotations.ts` by `scripts/tool-annotations-doc.mjs`; do not edit by hand.

Every tool the server lists carries the four MCP annotation hints as explicit booleans. The rules:

- **readOnlyHint** is true when the call stores nothing on the server: it returns data, or changes only what this conversation points at (the selected app, the listed tools).
- **destructiveHint** is true when the call deletes, revokes, rotates or removes something, or overwrites existing data: updates and sets, and the re-crawl, re-index and refresh jobs that replace stored pages or index entries. Creating, appending, toggling a reversible flag or starting a job that only adds is not destructive. Always false for read-only tools.
- **idempotentHint** is true when repeating the call with the same arguments has no further effect. Create, send, upload, start-a-job, rotate, register, clone, import, append and model runs are not idempotent.
- **openWorldHint** is true when the call leaves the MCP server: every call to the Ethora API (an independently operated system from the client's point of view), every fetch of an external website, every message delivered to other people. It is false only for the tools that run entirely inside the server: session state, help, documentation search and text generators.

The hosted server (`mcp.chat.ethora.com`) never lists the stdio-only wallet tools. On the OAuth entry (`/mcp/oauth`, used by ChatGPT and Claude.ai) every tool outside the `keys`, `session`, `b2b` and `legacy-bot` groups is listed up front and `ethora-tools-enable` is absent. On the open and personal-URL entries, group `core` is listed by default and the other groups appear after `ethora-tools-enable`.

## Group `core`

| Tool | Read-only | Destructive | Idempotent | Open world | Why |
|---|---|---|---|---|---|
| `ethora-agent-activate` | no | no | yes | yes | Sets which agent answers the app's website widget (one field on the app); setting the same agent twice changes nothing. |
| `ethora-agent-create` | no | no | no | yes | Creates a new AI agent owned by the caller; every call creates another agent. |
| `ethora-agent-invite` | no | no | no | yes | Adds the agent to a room by creating its bot instance there; a second call for the same room reports the existing instance. |
| `ethora-agent-list` | yes | no | yes | yes | Lists the caller's agents and the public ones; stores nothing. |
| `ethora-agent-update` | no | yes | yes | yes | Overwrites fields of an existing agent (prompt, model, flows, settings); the same values applied twice give the same result. |
| `ethora-api-key-create` | no | no | no | yes | Issues a new personal API key; every call issues another key. |
| `ethora-app-create` | no | no | no | yes | Creates a new app (tenant) owned by the caller; every call creates another app. |
| `ethora-app-list` | yes | no | yes | yes | Lists the apps the caller owns; stores nothing. |
| `ethora-app-select` | yes | no | yes | no | Sets which of the caller's apps later calls act on, in this conversation only; no server data changes. |
| `ethora-app-update` | no | yes | yes | yes | Overwrites fields of an existing app (name, branding, settings); the same values applied twice give the same result. |
| `ethora-chat-create` | no | no | no | yes | Creates a new chat room in the app; every call creates another room. |
| `ethora-chat-history` | yes | no | yes | yes | Returns messages of a room the caller can access; stores nothing. |
| `ethora-feedback-submit` | no | no | no | yes | Sends a report to the Ethora team by email and Slack; every call sends another message. |
| `ethora-help` | yes | no | yes | no | Returns recommended next calls for the current state; stores nothing. |
| `ethora-message-send` | no | no | no | yes | Posts a message into a room where other people and agents read it; every call posts another message. |
| `ethora-source-doc-upload` | no | no | no | yes | Stores an uploaded document as agent knowledge; every call stores another document. |
| `ethora-source-site-crawl-wait` | no | yes | no | yes | Same as the crawl tool, then waits for the job: fetches an external website and stores its pages; with `force` it replaces the stored copy of an already indexed page, and every call starts a new crawl. |
| `ethora-status` | yes | no | yes | no | Reports the session's auth mode, selected app and token presence; stores nothing. |
| `ethora-tools-enable` | yes | no | yes | no | Changes which tool groups this conversation lists; nothing on the server changes, and enabling a group twice is the same as once. |
| `ethora-user-login` | no | no | yes | yes | Signs in with email and password against the Ethora API and keeps the resulting token in the session; logging in twice yields the same signed-in state. |
| `ethora-user-register` | no | no | no | yes | Creates a new Ethora account on the server; a second call with the same email fails as a duplicate. |
| `ethora-widget-snippet-get` | yes | no | yes | yes | Builds the website embed snippet from the app's saved settings; stores nothing. |
| `fetch` | yes | no | yes | no | Returns one documentation page or tool reference by id; stores nothing. |
| `search` | yes | no | yes | no | Full-text search over the server's built-in documentation; stores nothing. |

## Group `agents-admin`

| Tool | Read-only | Destructive | Idempotent | Open world | Why |
|---|---|---|---|---|---|
| `ethora-agent-clone` | no | no | no | yes | Creates a new agent copied from an existing one; every call creates another copy. |
| `ethora-agent-delete` | no | yes | yes | yes | Deletes an agent and its bot instances; deleting twice changes nothing more. |
| `ethora-agent-export` | yes | no | yes | yes | Returns the agent as a portable bundle; stores nothing. |
| `ethora-agent-get` | yes | no | yes | yes | Returns one agent's configuration; stores nothing. |
| `ethora-agent-import` | no | no | no | yes | Creates a new agent from a bundle; every call creates another agent. |
| `ethora-agent-knowledge-get` | yes | no | yes | yes | Reports what the agent's knowledge index contains and what is missing from it; stores nothing. |
| `ethora-agent-knowledge-rebuild` | no | yes | no | yes | Re-indexes the agent's stored pages and documents, replacing the search index entries it rebuilds (the stored content is kept); each call starts another job. |
| `ethora-agent-model-list` | yes | no | yes | yes | Lists the AI models the deployment serves; stores nothing. |
| `ethora-agent-soul-append` | no | no | no | yes | Appends text to the agent's Memory; nothing existing is removed, and every call appends again. |
| `ethora-agent-soul-set` | no | yes | yes | yes | Replaces the agent's Memory text; the same text set twice gives the same result. |
| `ethora-agent-try` | no | no | no | yes | Runs one model turn against the agent's prompt and knowledge and returns the answer; nothing is posted or stored, but each call is a new model run with its own result. |
| `ethora-agent-visibility-set` | no | no | yes | yes | Sets the agent's visibility flag (private or public); reversible, and the same value twice changes nothing. |

## Group `apps-admin`

| Tool | Read-only | Destructive | Idempotent | Open world | Why |
|---|---|---|---|---|---|
| `ethora-app-delete` | no | yes | yes | yes | Archives the caller's app and its rooms, users and agents (restorable from the dashboard for a period); deleting twice changes nothing more. |
| `ethora-app-export` | yes | no | yes | yes | Returns the app as a portable bundle; stores nothing. |
| `ethora-app-import` | no | no | no | yes | Creates a new app from a bundle; every call creates another app. |
| `ethora-app-rooms-list` | yes | no | yes | yes | Lists the rooms of an app; stores nothing. |

## Group `b2b`

| Tool | Read-only | Destructive | Idempotent | Open world | Why |
|---|---|---|---|---|---|
| `ethora-b2b-app-bootstrap-ai` | no | no | no | yes | Creates an app with an AI agent and knowledge sources in one call; every call creates new records. |
| `ethora-b2b-app-create` | no | no | no | yes | Creates a new app with a B2B token; every call creates another app. |
| `ethora-b2b-app-provision` | no | no | no | yes | Creates an app plus its default room, users and agent in one call; every call creates new records. |
| `ethora-b2b-runbook-generate` | yes | no | yes | no | Generates a text runbook from the session's values; stores nothing. |
| `ethora-chat-component-app-generate` | yes | no | yes | no | Generates React source text for the chat component; stores nothing. |
| `ethora-env-examples-generate` | yes | no | yes | no | Generates .env example text; stores nothing. |
| `ethora.b2b.app.bootstrap-ai` | no | no | no | yes | Alias of ethora-b2b-app-bootstrap-ai; every call creates new records. |
| `ethora.b2b.app.create` | no | no | no | yes | Alias of ethora-b2b-app-create; every call creates another app. |
| `ethora.b2b.auth.use` | no | no | yes | no | Alias of ethora-auth-mode-set (B2B); switches session credentials, nothing on the server changes. |
| `ethora.b2b.bot.enable` | no | no | no | yes | Alias of ethora-bot-enable-b2b; a second call reports the existing bot. |
| `ethora.b2b.broadcast.wait` | yes | no | yes | yes | Alias of ethora-broadcast-job-wait; stores nothing. |

## Group `keys`

| Tool | Read-only | Destructive | Idempotent | Open world | Why |
|---|---|---|---|---|---|
| `ethora-api-key-list` | yes | no | yes | yes | Lists the caller's API keys (never their secret values); stores nothing. |
| `ethora-api-key-revoke` | no | yes | yes | yes | Revokes an API key so it stops working; revoking twice changes nothing more. |
| `ethora-app-credentials-reveal` | yes | no | yes | yes | Returns the appToken of an app the caller owns (every other tool redacts it); stores nothing. |
| `ethora-app-token-create` | no | no | no | yes | Issues a new app token; every call issues another token. |
| `ethora-app-token-list` | yes | no | yes | yes | Lists an app's server tokens (never their secret values); stores nothing. |
| `ethora-app-token-revoke` | no | yes | yes | yes | Revokes an app token; revoking twice changes nothing more. |
| `ethora-app-token-rotate` | no | yes | no | yes | Replaces an app token with a new one, invalidating the old value; every call rotates again. |

## Group `legacy-bot`

| Tool | Read-only | Destructive | Idempotent | Open world | Why |
|---|---|---|---|---|---|
| `ethora-bot-disable` | no | no | yes | yes | Turns the legacy bot off; reversible, and disabling twice changes nothing. |
| `ethora-bot-enable` | no | no | yes | yes | Turns the legacy bot on; reversible, and enabling twice changes nothing. |
| `ethora-bot-enable-b2b` | no | no | no | yes | Creates and enables the legacy bot for an app with a B2B token; a second call reports the existing bot. |
| `ethora-bot-get` | yes | no | yes | yes | Returns the app's legacy bot configuration; stores nothing. |
| `ethora-bot-history` | yes | no | yes | yes | Legacy alias of ethora-chat-history; stores nothing. |
| `ethora-bot-instance-diagnose` | yes | no | yes | yes | Returns a bot instance's live connection status and recent activity; stores nothing. |
| `ethora-bot-instance-leave` | no | yes | yes | yes | Removes the bot instance from its room; removing twice changes nothing more. |
| `ethora-bot-instance-list` | yes | no | yes | yes | Lists an agent's bot instances (one per room); stores nothing. |
| `ethora-bot-instance-status-set` | no | no | yes | yes | Turns one bot instance on or off; reversible, and setting the current state changes nothing. |
| `ethora-bot-instance-test` | no | no | no | yes | Posts a test message into the instance's room, where its members see it; every call posts again. |
| `ethora-bot-message-send` | no | no | no | yes | Legacy alias of ethora-message-send: posts a message into a room; every call posts again. |
| `ethora-bot-update` | no | yes | yes | yes | Overwrites fields of the legacy bot's configuration; the same values twice give the same result. |
| `ethora-bot-widget-get` | yes | no | yes | yes | Returns the legacy bot's widget settings; stores nothing. |
| `ethora-source-doc-delete-legacy` | no | yes | yes | yes | Deletes a legacy-bot document; deleting twice changes nothing more. |
| `ethora-source-doc-upload-legacy` | no | no | no | yes | Stores an uploaded document for the app's legacy bot; every call stores another document. |

## Group `rooms`

| Tool | Read-only | Destructive | Idempotent | Open world | Why |
|---|---|---|---|---|---|
| `ethora-broadcast-job-get` | yes | no | yes | yes | Fetches the status and per-room results of a broadcast job by id; stores nothing. |
| `ethora-broadcast-job-wait` | yes | no | yes | yes | Polls a broadcast job until it finishes and returns its results; stores nothing. |
| `ethora-broadcast-send` | no | no | no | yes | Posts one message into many rooms of the app, reaching their members; every call posts again. |
| `ethora-chat-delete` | no | yes | yes | yes | Deletes a chat room and its messages; deleting twice changes nothing more. |
| `ethora-chat-unread-counts` | yes | no | yes | yes | Returns unread counts per room; stores nothing. |
| `ethora-message-context` | yes | no | yes | yes | Returns the messages around one message; stores nothing. |
| `ethora-message-search` | yes | no | yes | yes | Searches message text in the caller's rooms; stores nothing. |

## Group `session`

| Tool | Read-only | Destructive | Idempotent | Open world | Why |
|---|---|---|---|---|---|
| `ethora-auth-mode-set` | no | no | yes | no | Switches the session between user, app-token and B2B credentials; nothing on the server changes. |
| `ethora-doctor` | yes | no | yes | yes | Validates the session configuration and pings the API; stores nothing. |
| `ethora-recipe-run` | no | no | no | yes | Runs an ordered sequence of this server's own tools (creates apps, rooms, agents); each run creates new records. `dryRun` only previews. |
| `ethora-session-configure` | no | no | yes | no | Stores API URL and credentials for this session; nothing on the server changes, and the same values set twice are the same session state. |

## Group `sources`

| Tool | Read-only | Destructive | Idempotent | Open world | Why |
|---|---|---|---|---|---|
| `ethora-source-doc-delete` | no | yes | yes | yes | Deletes a knowledge document; deleting twice changes nothing more. |
| `ethora-source-doc-list` | yes | no | yes | yes | Lists the knowledge documents of the app or agent; stores nothing. |
| `ethora-source-doc-tags-update` | no | yes | yes | yes | Replaces the retrieval tags of a document (not additive); the same tags twice give the same result. |
| `ethora-source-site-crawl` | no | yes | no | yes | Fetches pages from an external website and stores them as agent knowledge; with `force` it replaces the stored copy of an already indexed page, which cannot be undone, and every call starts a new crawl. |
| `ethora-source-site-crawl-cancel` | no | yes | yes | yes | Stops a running crawl job and discards the pages it had not finished storing, which cannot be resumed (a new crawl can be started); cancelling twice changes nothing more. |
| `ethora-source-site-list` | yes | no | yes | yes | Lists the crawled pages of the app or agent; stores nothing. |
| `ethora-source-site-refresh` | no | yes | no | yes | Re-crawls a whole site or named pages now and replaces their stored content; every call fetches again. |
| `ethora-source-site-reindex` | no | yes | no | yes | Re-fetches one indexed URL from its website and replaces its stored content, so the previous copy is gone; every call fetches again. |
| `ethora-source-site-reindex-wait` | no | yes | no | yes | Re-fetches one indexed URL, replaces its stored content and waits for the result; every call fetches again. |
| `ethora-source-site-tags-update` | no | yes | yes | yes | Replaces the retrieval tags of a crawled page (not additive); the same tags twice give the same result. |
| `ethora-source-site-url-delete` | no | yes | yes | yes | Deletes one crawled page from the knowledge base; deleting twice changes nothing more. |
| `ethora-source-site-url-delete-batch` | no | yes | yes | yes | Deletes several crawled pages from the knowledge base; deleting twice changes nothing more. |
| `ethora-source-site-watch-list` | yes | no | yes | yes | Lists the watched websites with their refresh schedule and last result; stores nothing. |
| `ethora-source-site-watch-update` | no | no | yes | yes | Sets a watched site's refresh schedule (weekly, daily, off) and resumes a paused site; the same schedule set twice changes nothing. The scheduled crawl itself runs later on the server. |

## Group `users-files`

| Tool | Read-only | Destructive | Idempotent | Open world | Why |
|---|---|---|---|---|---|
| `ethora-file-delete` | no | yes | yes | yes | Deletes a stored file; deleting twice changes nothing more. |
| `ethora-file-get` | yes | no | yes | yes | Returns a file's metadata and download location; stores nothing. |
| `ethora-file-upload` | no | no | no | yes | Stores a new file in the app's storage; every call stores another copy. |
| `ethora-user-batch-create` | no | no | no | yes | Creates several users in the app from a list; every call creates more users (duplicates are reported, not created). |
| `ethora-user-batch-job-get` | yes | no | yes | yes | Fetches the status and per-user results of a users batch job by id; stores nothing. |
| `ethora-user-batch-job-wait` | yes | no | yes | yes | Polls a users batch job until it finishes; stores nothing. |

## Group `widget`

| Tool | Read-only | Destructive | Idempotent | Open world | Why |
|---|---|---|---|---|---|
| `ethora-widget-appearance-get` | yes | no | yes | yes | Returns the widget appearance saved on the app; stores nothing. |
| `ethora-widget-appearance-set` | no | yes | yes | yes | Overwrites the widget appearance saved on the app (merge by default, replace on request); the same values twice give the same result. |

## stdio-only (not on the hosted server)

| Tool | Read-only | Destructive | Idempotent | Open world | Why |
|---|---|---|---|---|---|
| `ethora-wallet-balance-get` | yes | no | yes | yes | Returns the wallet balance of the signed-in user; stores nothing. stdio only. |
| `ethora-wallet-erc20-transfer` | no | yes | no | yes | Moves tokens from the user's wallet to another address on a blockchain, which cannot be undone; every call transfers again. stdio only, behind ETHORA_MCP_ENABLE_DANGEROUS_TOOLS. |
