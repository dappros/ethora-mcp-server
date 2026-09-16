// Human-readable titles for every tool, plus the annotation normaliser that
// directory reviews require: Anthropic wants a `title` on every tool, OpenAI
// wants explicit readOnlyHint / openWorldHint / destructiveHint booleans.
// The map is hand-written for readability; a tool without an entry gets a
// generated title and a stderr warning, and the verification script fails.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export const TOOL_TITLES: Record<string, string> = {
  "ethora-configure": "Configure Connection",
  "ethora-status": "Session Status",
  "ethora-help": "Help and Next Steps",
  "ethora-run-recipe": "Run Recipe",
  "ethora-doctor": "Connection Doctor",
  "ethora-auth-use-app": "Use App Token Auth",
  "ethora-auth-use-user": "Use User Auth",
  "ethora-auth-use-b2b": "Use B2B Auth",
  "ethora-app-select": "Select App",
  "ethora-chats-broadcast-v2": "Broadcast Message",
  "ethora-chats-broadcast-job-v2": "Get Broadcast Job",
  "ethora-wait-broadcast-job-v2": "Wait for Broadcast Job",
  "ethora-files-upload-v2": "Upload File",
  "ethora-files-get-v2": "Get File",
  "ethora-files-delete-v2": "Delete File",
  "ethora-sources-docs-upload": "Upload Knowledge Document (Legacy)",
  "ethora-sources-docs-delete": "Delete Knowledge Document (Legacy)",
  "ethora-sources-site-crawl-v2": "Crawl Website Source",
  "ethora-sources-site-reindex-v2": "Reindex Website Source",
  "ethora-sources-site-crawl-v2-wait": "Crawl Website Source and Wait",
  "ethora-sources-site-reindex-v2-wait": "Reindex Website Source and Wait",
  "ethora-sources-site-list-v2": "List Website Sources",
  "ethora-sources-site-tags-update-v2": "Update Website Source Tags",
  "ethora-sources-site-delete-url-v2": "Delete Website Source URL",
  "ethora-sources-site-delete-url-v2-batch": "Delete Website Source URLs",
  "ethora-sources-docs-upload-v2": "Upload Knowledge Document",
  "ethora-sources-docs-list-v2": "List Knowledge Documents",
  "ethora-sources-docs-tags-update-v2": "Update Knowledge Document Tags",
  "ethora-sources-docs-delete-v2": "Delete Knowledge Document",
  "ethora-users-batch-create-v2": "Batch Create Users",
  "ethora-users-batch-job-v2": "Get Users Batch Job",
  "ethora-wait-users-batch-job-v2": "Wait for Users Batch Job",
  "ethora-app-tokens-list-v2": "List App Tokens",
  "ethora-app-tokens-create-v2": "Create App Token",
  "ethora-app-tokens-rotate-v2": "Rotate App Token",
  "ethora-app-tokens-revoke-v2": "Revoke App Token",
  "ethora-b2b-app-provision": "Provision App (B2B)",
  "ethora-user-login": "Log In",
  "ethora-user-register": "Register Account",
  "ethora-api-key-create": "Create API Key",
  "ethora-api-key-list": "List API Keys",
  "ethora-api-key-revoke": "Revoke API Key",
  "ethora-widget-embed-snippet": "Widget Embed Snippet",
  "ethora-app-list": "List Apps",
  "ethora-app-create": "Create App",
  "ethora-app-update": "Update App",
  "ethora-app-get-default-rooms": "Get Default Rooms",
  "ethora-app-get-default-rooms-with-app-id": "Get Default Rooms for App",
  "ethora-app-create-chat": "Create Chat Room",
  "ethora-app-delete-chat": "Delete Chat Room",
  "ethora-app-delete": "Delete App",
  "ethora-wallet-get-balance": "Get Wallet Balance",
  "ethora-wallet-erc20-transfer": "Transfer ERC-20 Tokens (stdio only)",
  "ethora-agents-delete-v2": "Delete Agent",
  "ethora-b2b-app-create": "Create App (B2B)",
  "ethora-b2b-bot-enable": "Enable Legacy Bot (B2B)",
  "ethora-b2b-app-bootstrap-ai": "Bootstrap AI App (B2B)",
  "ethora-bot-get-v2": "Get Legacy Bot",
  "ethora-bot-update-v2": "Update Legacy Bot",
  "ethora-bot-enable-v2": "Enable Legacy Bot",
  "ethora-bot-disable-v2": "Disable Legacy Bot",
  "ethora-bot-widget-v2": "Get Legacy Bot Widget",
  "ethora-agents-list-v2": "List Agents",
  "ethora-agents-get-v2": "Get Agent",
  "ethora-agents-create-v2": "Create Agent",
  "ethora-agents-update-v2": "Update Agent",
  "ethora-agents-clone-v2": "Clone Agent",
  "ethora-agents-activate-v2": "Activate Agent for Widget",
  "ethora-agent-set-visibility": "Set Agent Visibility",
  "ethora-agent-invite-to-chat": "Invite Agent to Chat",
  "ethora-agent-soul-append": "Append to Agent Prompt",
  "ethora-agent-soul-set": "Set Agent Prompt",
  "ethora-agents-export-v2": "Export Agent",
  "ethora-agents-import-v2": "Import Agent",
  "ethora-bot-instances-list": "List Bot Instances",
  "ethora-bot-instance-status": "Bot Instance Status",
  "ethora-bot-instance-diag": "Diagnose Bot Instance",
  "ethora-bot-instance-test-message": "Send Test Message to Bot",
  "ethora-bot-instance-leave-chat": "Remove Bot from Chat",
  "ethora-messages-search-v2": "Search Messages",
  "ethora-messages-context-v2": "Get Message Context",
  "ethora-unread-counts-v2": "Get Unread Counts",
  "ethora-app-export-v2": "Export App",
  "ethora-app-import-v2": "Import App",
  "ethora-chats-message-v2": "Send Chat Message",
  "ethora-chats-history-v2": "Get Chat History",
  "ethora-bot-message-v2": "Send Chat Message (Legacy Alias)",
  "ethora-bot-history-v2": "Get Chat History (Legacy Alias)",
  "ethora.b2b.auth.use": "Use B2B Auth (Alias)",
  "ethora.b2b.app.create": "Create App (B2B Alias)",
  "ethora.b2b.bot.enable": "Enable Legacy Bot (B2B Alias)",
  "ethora.b2b.broadcast.wait": "Wait for Broadcast Job (Alias)",
  "ethora.b2b.app.bootstrap-ai": "Bootstrap AI App (B2B Alias)",
  "ethora-generate-chat-component-app-tsx": "Generate Chat Component App.tsx",
  "ethora-generate-env-examples": "Generate Env Examples",
  "ethora-generate-b2b-bootstrap-runbook": "Generate B2B Bootstrap Runbook",
  "search": "Search Docs",
  "fetch": "Fetch Doc",
}

// Tools that are never offered on the hosted (remote) surface. Directory
// reviews reject connectors that move money or crypto; the stdio CLI keeps them,
// where the deployment operator controls the environment.
//
// `ethora-wallet-get-balance` is read-only, but it hangs on the hosted server:
// a call with a valid authenticated session returned nothing after 61s and again
// after 120s (QA, 260916). A tool that never returns stalls the client's turn,
// and it is the last wallet surface on the remote server, so it comes out until
// the underlying lookup has a bounded timeout.
export const STDIO_ONLY_TOOLS = [
  "ethora-wallet-erc20-transfer",
  "ethora-wallet-get-balance",
] as const

function generatedTitle(name: string): string {
  return name
    .replace(/^ethora[-.]/, "")
    .replace(/-v2$/, "")
    .split(/[-.]/)
    .filter(Boolean)
    .map((w) => (w === "b2b" ? "B2B" : w === "api" ? "API" : w === "ai" ? "AI" : w[0].toUpperCase() + w.slice(1)))
    .join(" ")
}

function looksDestructive(name: string): boolean {
  return /delete|revoke|transfer|leave-chat|purge/.test(name)
}

export function titleFor(name: string): { title: string; known: boolean } {
  const t = TOOL_TITLES[name]
  return t ? { title: t, known: true } : { title: generatedTitle(name), known: false }
}

/**
 * Normalise every registered tool so tools/list carries a top-level `title`,
 * `annotations.title`, and explicit boolean readOnlyHint / destructiveHint /
 * openWorldHint (idempotentHint kept when the tool declared it). Existing
 * values win; only missing fields are filled. Safe to call more than once.
 */
export function applyToolMeta(server: McpServer): { total: number; unknownTitles: string[] } {
  const reg: Record<string, any> = (server as any)._registeredTools || {}
  const unknownTitles: string[] = []
  let total = 0
  for (const [name, tool] of Object.entries(reg)) {
    if (!tool) continue
    total++
    const { title, known } = titleFor(name)
    if (!known) unknownTitles.push(name)
    const a = { ...(tool.annotations || {}) }
    if (typeof a.readOnlyHint !== "boolean") a.readOnlyHint = false
    if (typeof a.destructiveHint !== "boolean") a.destructiveHint = a.readOnlyHint ? false : looksDestructive(name)
    if (typeof a.openWorldHint !== "boolean") a.openWorldHint = true
    // The hand-written map wins over any ad-hoc title in the registration so
    // listings stay consistent; generated titles only fill gaps.
    if (known || !a.title) a.title = title
    tool.annotations = a
    if (known || !tool.title) tool.title = a.title
  }
  if (unknownTitles.length) {
    console.error(`[tool-meta] ${unknownTitles.length} tool(s) have no entry in TOOL_TITLES (generated titles used): ${unknownTitles.join(", ")}`)
  }
  return { total, unknownTitles }
}

/** Remove tools that must not be exposed on the hosted surface. */
export function removeStdioOnlyTools(server: McpServer): string[] {
  const reg: Record<string, any> = (server as any)._registeredTools || {}
  const removed: string[] = []
  for (const name of STDIO_ONLY_TOOLS) {
    const tool = reg[name]
    if (tool && typeof tool.remove === "function") {
      tool.remove()
      removed.push(name)
    }
  }
  return removed
}
