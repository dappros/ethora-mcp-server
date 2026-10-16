// Explicit MCP tool annotations for every tool, with the reason each hint is
// set the way it is. Directory reviews (OpenAI, Anthropic) require all four
// hints to be an explicit boolean on every tool and a justification that
// matches the tool's behaviour; a heuristic fill-in left `idempotentHint`
// unset on a fifth of the tools and marked a few wrongly. This table is the
// single source of truth: `applyToolMeta` writes it over whatever a
// registration declared, the test suite fails on a tool without an entry, and
// `scripts/tool-annotations-doc.mjs` renders it as docs/TOOL_ANNOTATIONS.md
// for the review submissions.
//
// The rules, applied consistently (the `why` of each entry is the instance):
//
// readOnlyHint   true when the call stores nothing on the server: it returns
//                data, or changes only what this conversation points at (the
//                selected app, the listed tools). Anything that creates,
//                updates, deletes, sends or starts a job is false.
// destructiveHint true when the call deletes, revokes, rotates or removes
//                something, or overwrites existing data (update / set /
//                replace, including re-crawls that replace stored pages and
//                re-indexing that replaces an agent's search index). Creating
//                a new record, appending, toggling a reversible flag or
//                starting a job that only adds is false. Always false when
//                readOnlyHint is true.
// idempotentHint true when repeating the call with the same arguments has no
//                further effect (reads, selects, sets, updates, deletes,
//                enable/disable, waits). False when every call does something
//                new: create, send, upload, start a job, rotate, register,
//                clone, import, append, run a model turn, send feedback.
// openWorldHint  true when the call leaves the MCP server: every call to the
//                Ethora API (an independently operated system from the
//                client's point of view), every fetch of an external website,
//                every message delivered to other people. False only for the
//                tools that run entirely inside this server: session state,
//                help, documentation search, text generators.

export type ToolAnnotation = {
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
  /** One sentence a reviewer can check against the tool's behaviour. */
  why: string
}

const A = (readOnlyHint: boolean, destructiveHint: boolean, idempotentHint: boolean, openWorldHint: boolean, why: string): ToolAnnotation => ({
  readOnlyHint,
  destructiveHint,
  idempotentHint,
  openWorldHint,
  why,
})

// Shorthands for the recurring shapes. Every API-backed shape is open-world.
const LOCAL = (why: string) => A(true, false, true, false, why)
const READ = (why: string) => A(true, false, true, true, why)
const CREATE = (why: string) => A(false, false, false, true, why)
const UPDATE = (why: string) => A(false, true, true, true, why)
const DELETE = (why: string) => A(false, true, true, true, why)
const TOGGLE = (why: string) => A(false, false, true, true, why)
const JOB = (why: string) => A(false, false, false, true, why)
// A job that replaces stored content (re-crawl, re-index): destructive, not idempotent.
const REPLACE_JOB = (why: string) => A(false, true, false, true, why)

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotation> = {
  // Session and discovery
  "ethora-status": LOCAL("Reports the session's auth mode, selected app and token presence; stores nothing."),
  "ethora-help": LOCAL("Returns recommended next calls for the current state; stores nothing."),
  "ethora-doctor": READ("Validates the session configuration and pings the API; stores nothing."),
  "ethora-tools-enable": LOCAL("Changes which tool groups this conversation lists; nothing on the server changes, and enabling a group twice is the same as once."),
  "ethora-app-select": LOCAL("Sets which of the caller's apps later calls act on, in this conversation only; no server data changes."),
  "ethora-session-configure": A(false, false, true, false, "Stores API URL and credentials for this session; nothing on the server changes, and the same values set twice are the same session state."),
  "ethora-auth-mode-set": A(false, false, true, false, "Switches the session between user, app-token and B2B credentials; nothing on the server changes."),
  "ethora-user-login": A(false, false, true, true, "Signs in with email and password against the Ethora API and keeps the resulting token in the session; logging in twice yields the same signed-in state."),
  "ethora-user-register": A(false, false, false, true, "Creates a new Ethora account on the server; a second call with the same email fails as a duplicate."),
  "ethora-recipe-run": JOB("Runs an ordered sequence of this server's own tools (creates apps, rooms, agents); each run creates new records. `dryRun` only previews."),
  search: LOCAL("Full-text search over the server's built-in documentation; stores nothing."),
  fetch: LOCAL("Returns one documentation page or tool reference by id; stores nothing."),
  "ethora-feedback-submit": A(false, false, false, true, "Sends a report to the Ethora team by email and Slack; every call sends another message."),

  // Apps
  "ethora-app-list": READ("Lists the apps the caller owns; stores nothing."),
  "ethora-app-create": CREATE("Creates a new app (tenant) owned by the caller; every call creates another app."),
  "ethora-app-update": UPDATE("Overwrites fields of an existing app (name, branding, settings); the same values applied twice give the same result."),
  "ethora-app-delete": DELETE("Archives the caller's app and its rooms, users and agents (restorable from the dashboard for a period); deleting twice changes nothing more."),
  "ethora-app-rooms-list": READ("Lists the rooms of an app; stores nothing."),
  "ethora-app-export": READ("Returns the app as a portable bundle; stores nothing."),
  "ethora-app-import": CREATE("Creates a new app from a bundle; every call creates another app."),
  "ethora-app-credentials-reveal": READ("Returns the appToken of an app the caller owns (every other tool redacts it); stores nothing."),
  "ethora-b2b-app-create": CREATE("Creates a new app with a B2B token; every call creates another app."),
  "ethora-b2b-app-provision": CREATE("Creates an app plus its default room, users and agent in one call; every call creates new records."),
  "ethora-b2b-app-bootstrap-ai": CREATE("Creates an app with an AI agent and knowledge sources in one call; every call creates new records."),
  "ethora-b2b-runbook-generate": LOCAL("Generates a text runbook from the session's values; stores nothing."),
  "ethora-env-examples-generate": LOCAL("Generates .env example text; stores nothing."),
  "ethora-chat-component-app-generate": LOCAL("Generates React source text for the chat component; stores nothing."),

  // Rooms and messages
  "ethora-chat-create": CREATE("Creates a new chat room in the app; every call creates another room."),
  "ethora-chat-delete": DELETE("Deletes a chat room and its messages; deleting twice changes nothing more."),
  "ethora-chat-history": READ("Returns messages of a room the caller can access; stores nothing."),
  "ethora-message-send": A(false, false, false, true, "Posts a message into a room where other people and agents read it; every call posts another message."),
  "ethora-message-search": READ("Searches message text in the caller's rooms; stores nothing."),
  "ethora-message-context": READ("Returns the messages around one message; stores nothing."),
  "ethora-chat-unread-counts": READ("Returns unread counts per room; stores nothing."),
  "ethora-broadcast-send": A(false, false, false, true, "Posts one message into many rooms of the app, reaching their members; every call posts again."),
  "ethora-broadcast-job-get": READ("Fetches the status and per-room results of a broadcast job by id; stores nothing."),
  "ethora-broadcast-job-wait": READ("Polls a broadcast job until it finishes and returns its results; stores nothing."),
  "ethora-bot-message-send": A(false, false, false, true, "Legacy alias of ethora-message-send: posts a message into a room; every call posts again."),
  "ethora-bot-history": READ("Legacy alias of ethora-chat-history; stores nothing."),

  // Users and files
  "ethora-user-batch-create": CREATE("Creates several users in the app from a list; every call creates more users (duplicates are reported, not created)."),
  "ethora-user-batch-job-get": READ("Fetches the status and per-user results of a users batch job by id; stores nothing."),
  "ethora-user-batch-job-wait": READ("Polls a users batch job until it finishes; stores nothing."),
  "ethora-file-upload": CREATE("Stores a new file in the app's storage; every call stores another copy."),
  "ethora-file-get": READ("Returns a file's metadata and download location; stores nothing."),
  "ethora-file-delete": DELETE("Deletes a stored file; deleting twice changes nothing more."),

  // Credentials
  "ethora-api-key-create": CREATE("Issues a new personal API key; every call issues another key."),
  "ethora-api-key-list": READ("Lists the caller's API keys (never their secret values); stores nothing."),
  "ethora-api-key-revoke": DELETE("Revokes an API key so it stops working; revoking twice changes nothing more."),
  "ethora-app-token-list": READ("Lists an app's server tokens (never their secret values); stores nothing."),
  "ethora-app-token-create": CREATE("Issues a new app token; every call issues another token."),
  "ethora-app-token-rotate": A(false, true, false, true, "Replaces an app token with a new one, invalidating the old value; every call rotates again."),
  "ethora-app-token-revoke": DELETE("Revokes an app token; revoking twice changes nothing more."),

  // Agents
  "ethora-agent-list": READ("Lists the caller's agents and the public ones; stores nothing."),
  "ethora-agent-get": READ("Returns one agent's configuration; stores nothing."),
  "ethora-agent-model-list": READ("Lists the AI models the deployment serves; stores nothing."),
  "ethora-agent-create": CREATE("Creates a new AI agent owned by the caller; every call creates another agent."),
  "ethora-agent-update": UPDATE("Overwrites fields of an existing agent (prompt, model, flows, settings); the same values applied twice give the same result."),
  "ethora-agent-delete": DELETE("Deletes an agent and its bot instances; deleting twice changes nothing more."),
  "ethora-agent-clone": CREATE("Creates a new agent copied from an existing one; every call creates another copy."),
  "ethora-agent-export": READ("Returns the agent as a portable bundle; stores nothing."),
  "ethora-agent-import": CREATE("Creates a new agent from a bundle; every call creates another agent."),
  "ethora-agent-try": JOB("Runs one model turn against the agent's prompt and knowledge and returns the answer; nothing is posted or stored, but each call is a new model run with its own result."),
  "ethora-agent-invite": CREATE("Adds the agent to a room by creating its bot instance there; a second call for the same room reports the existing instance."),
  "ethora-agent-activate": TOGGLE("Sets which agent answers the app's website widget (one field on the app); setting the same agent twice changes nothing."),
  "ethora-agent-visibility-set": TOGGLE("Sets the agent's visibility flag (private or public); reversible, and the same value twice changes nothing."),
  "ethora-agent-soul-set": UPDATE("Replaces the agent's Memory text; the same text set twice gives the same result."),
  "ethora-agent-soul-append": A(false, false, false, true, "Appends text to the agent's Memory; nothing existing is removed, and every call appends again."),
  "ethora-agent-knowledge-get": READ("Reports what the agent's knowledge index contains and what is missing from it; stores nothing."),
  "ethora-agent-knowledge-rebuild": REPLACE_JOB("Re-indexes the agent's stored pages and documents, replacing the search index entries it rebuilds (the stored content is kept); each call starts another job."),

  // Knowledge sources
  "ethora-source-site-crawl": REPLACE_JOB("Fetches pages from an external website and stores them as agent knowledge; with `force` it replaces the stored copy of an already indexed page, which cannot be undone, and every call starts a new crawl."),
  "ethora-source-site-crawl-wait": REPLACE_JOB("Same as the crawl tool, then waits for the job: fetches an external website and stores its pages; with `force` it replaces the stored copy of an already indexed page, and every call starts a new crawl."),
  "ethora-source-site-crawl-cancel": A(false, true, true, true, "Stops a running crawl job and discards the pages it had not finished storing, which cannot be resumed (a new crawl can be started); cancelling twice changes nothing more."),
  "ethora-source-site-reindex": REPLACE_JOB("Re-fetches one indexed URL from its website and replaces its stored content, so the previous copy is gone; every call fetches again."),
  "ethora-source-site-reindex-wait": REPLACE_JOB("Re-fetches one indexed URL, replaces its stored content and waits for the result; every call fetches again."),
  "ethora-source-site-refresh": REPLACE_JOB("Re-crawls a whole site or named pages now and replaces their stored content; every call fetches again."),
  "ethora-source-site-list": READ("Lists the crawled pages of the app or agent; stores nothing."),
  "ethora-source-site-watch-list": READ("Lists the watched websites with their refresh schedule and last result; stores nothing."),
  "ethora-source-site-watch-update": A(false, false, true, true, "Sets a watched site's refresh schedule (weekly, daily, off) and resumes a paused site; the same schedule set twice changes nothing. The scheduled crawl itself runs later on the server."),
  "ethora-source-site-tags-update": UPDATE("Replaces the retrieval tags of a crawled page (not additive); the same tags twice give the same result."),
  "ethora-source-site-url-delete": DELETE("Deletes one crawled page from the knowledge base; deleting twice changes nothing more."),
  "ethora-source-site-url-delete-batch": DELETE("Deletes several crawled pages from the knowledge base; deleting twice changes nothing more."),
  "ethora-source-doc-upload": CREATE("Stores an uploaded document as agent knowledge; every call stores another document."),
  "ethora-source-doc-list": READ("Lists the knowledge documents of the app or agent; stores nothing."),
  "ethora-source-doc-tags-update": UPDATE("Replaces the retrieval tags of a document (not additive); the same tags twice give the same result."),
  "ethora-source-doc-delete": DELETE("Deletes a knowledge document; deleting twice changes nothing more."),
  "ethora-source-doc-upload-legacy": CREATE("Stores an uploaded document for the app's legacy bot; every call stores another document."),
  "ethora-source-doc-delete-legacy": DELETE("Deletes a legacy-bot document; deleting twice changes nothing more."),

  // Widget
  "ethora-widget-snippet-get": READ("Builds the website embed snippet from the app's saved settings; stores nothing."),
  "ethora-widget-appearance-get": READ("Returns the widget appearance saved on the app; stores nothing."),
  "ethora-widget-appearance-set": UPDATE("Overwrites the widget appearance saved on the app (merge by default, replace on request); the same values twice give the same result."),

  // Legacy per-app bot
  "ethora-bot-get": READ("Returns the app's legacy bot configuration; stores nothing."),
  "ethora-bot-update": UPDATE("Overwrites fields of the legacy bot's configuration; the same values twice give the same result."),
  "ethora-bot-enable": TOGGLE("Turns the legacy bot on; reversible, and enabling twice changes nothing."),
  "ethora-bot-disable": TOGGLE("Turns the legacy bot off; reversible, and disabling twice changes nothing."),
  "ethora-bot-enable-b2b": CREATE("Creates and enables the legacy bot for an app with a B2B token; a second call reports the existing bot."),
  "ethora-bot-widget-get": READ("Returns the legacy bot's widget settings; stores nothing."),
  "ethora-bot-instance-list": READ("Lists an agent's bot instances (one per room); stores nothing."),
  "ethora-bot-instance-status-set": TOGGLE("Turns one bot instance on or off; reversible, and setting the current state changes nothing."),
  "ethora-bot-instance-diagnose": READ("Returns a bot instance's live connection status and recent activity; stores nothing."),
  "ethora-bot-instance-test": A(false, false, false, true, "Posts a test message into the instance's room, where its members see it; every call posts again."),
  "ethora-bot-instance-leave": DELETE("Removes the bot instance from its room; removing twice changes nothing more."),

  // stdio-only wallet tools (never offered on the hosted server)
  "ethora-wallet-balance-get": READ("Returns the wallet balance of the signed-in user; stores nothing. stdio only."),
  "ethora-wallet-erc20-transfer": A(false, true, false, true, "Moves tokens from the user's wallet to another address on a blockchain, which cannot be undone; every call transfers again. stdio only, behind ETHORA_MCP_ENABLE_DANGEROUS_TOOLS."),

  // Dotted B2B aliases (rewritten to their canonical tool before the call)
  "ethora.b2b.auth.use": A(false, false, true, false, "Alias of ethora-auth-mode-set (B2B); switches session credentials, nothing on the server changes."),
  "ethora.b2b.app.create": CREATE("Alias of ethora-b2b-app-create; every call creates another app."),
  "ethora.b2b.bot.enable": CREATE("Alias of ethora-bot-enable-b2b; a second call reports the existing bot."),
  "ethora.b2b.broadcast.wait": READ("Alias of ethora-broadcast-job-wait; stores nothing."),
  "ethora.b2b.app.bootstrap-ai": CREATE("Alias of ethora-b2b-app-bootstrap-ai; every call creates new records."),
}

export const HINT_KEYS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const

/** The four hints for a tool, or undefined when the table has no entry. */
export function annotationsFor(name: string): Omit<ToolAnnotation, "why"> | undefined {
  const a = TOOL_ANNOTATIONS[name]
  if (!a) return undefined
  const { why: _why, ...hints } = a
  return hints
}
