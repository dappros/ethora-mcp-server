// Human-readable titles for every tool, plus the annotation normaliser that
// directory reviews require: Anthropic wants a `title` on every tool, OpenAI
// wants explicit readOnlyHint / openWorldHint / destructiveHint booleans.
// The map is hand-written for readability; a tool without an entry gets a
// generated title and a stderr warning, and the verification script fails.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export const TOOL_TITLES: Record<string, string> = {
  "ethora-session-configure": "Configure Connection",
  "ethora-status": "Session Status",
  "ethora-help": "Help and Next Steps",
  "ethora-tools-enable": "Enable More Tools",
  "ethora-recipe-run": "Run Recipe",
  "ethora-doctor": "Connection Doctor",
  "ethora-auth-mode-set": "Set Auth Mode",
  "ethora-app-select": "Select App",
  "ethora-broadcast-send": "Broadcast Message",
  "ethora-broadcast-job-start": "Get Broadcast Job",
  "ethora-broadcast-job-wait": "Wait for Broadcast Job",
  "ethora-file-upload": "Upload File",
  "ethora-file-get": "Get File",
  "ethora-file-delete": "Delete File",
  "ethora-source-doc-upload-legacy": "Upload Knowledge Document (Legacy)",
  "ethora-source-doc-delete-legacy": "Delete Knowledge Document (Legacy)",
  "ethora-source-site-crawl": "Crawl Website Source",
  "ethora-source-site-reindex": "Reindex Website Source",
  "ethora-source-site-crawl-wait": "Crawl Website Source and Wait",
  "ethora-source-site-reindex-wait": "Reindex Website Source and Wait",
  "ethora-source-site-list": "List Website Sources",
  "ethora-source-site-tags-update": "Update Website Source Tags",
  "ethora-source-site-url-delete": "Delete Website Source URL",
  "ethora-source-site-url-delete-batch": "Delete Website Source URLs",
  "ethora-source-doc-upload": "Upload Knowledge Document",
  "ethora-source-doc-list": "List Knowledge Documents",
  "ethora-source-doc-tags-update": "Update Knowledge Document Tags",
  "ethora-source-doc-delete": "Delete Knowledge Document",
  "ethora-user-batch-create": "Batch Create Users",
  "ethora-user-batch-job-start": "Get Users Batch Job",
  "ethora-user-batch-job-wait": "Wait for Users Batch Job",
  "ethora-app-token-list": "List App Tokens",
  "ethora-app-token-create": "Create App Token",
  "ethora-app-token-rotate": "Rotate App Token",
  "ethora-app-token-revoke": "Revoke App Token",
  "ethora-b2b-app-provision": "Provision App (B2B)",
  "ethora-user-login": "Log In",
  "ethora-user-register": "Register Account",
  "ethora-api-key-create": "Create API Key",
  "ethora-api-key-list": "List API Keys",
  "ethora-api-key-revoke": "Revoke API Key",
  "ethora-widget-snippet-get": "Widget Embed Snippet",
  "ethora-app-list": "List Apps",
  "ethora-app-create": "Create App",
  "ethora-app-credentials-reveal": "Reveal App Token",
  "ethora-feedback-submit": "Send Feedback",
  "ethora-app-update": "Update App",
  "ethora-app-rooms-list": "List App Rooms",
  "ethora-chat-create": "Create Chat Room",
  "ethora-chat-delete": "Delete Chat Room",
  "ethora-app-delete": "Delete App",
  "ethora-wallet-balance-get": "Get Wallet Balance",
  "ethora-wallet-erc20-transfer": "Transfer ERC-20 Tokens (stdio only)",
  "ethora-agent-delete": "Delete Agent",
  "ethora-b2b-app-create": "Create App (B2B)",
  "ethora-bot-enable-b2b": "Enable Legacy Bot (B2B)",
  "ethora-b2b-app-bootstrap-ai": "Bootstrap AI App (B2B)",
  "ethora-bot-get": "Get Legacy Bot",
  "ethora-bot-update": "Update Legacy Bot",
  "ethora-bot-enable": "Enable Legacy Bot",
  "ethora-bot-disable": "Disable Legacy Bot",
  "ethora-bot-widget-get": "Get Legacy Bot Widget",
  "ethora-agent-list": "List Agents",
  "ethora-agent-get": "Get Agent",
  "ethora-agent-create": "Create Agent",
  "ethora-agent-update": "Update Agent",
  "ethora-agent-clone": "Clone Agent",
  "ethora-agent-activate": "Activate Agent for Widget",
  "ethora-agent-visibility-set": "Set Agent Visibility",
  "ethora-agent-invite": "Invite Agent to Chat",
  "ethora-agent-soul-append": "Append to Agent Prompt",
  "ethora-agent-soul-set": "Set Agent Prompt",
  "ethora-agent-export": "Export Agent",
  "ethora-agent-import": "Import Agent",
  "ethora-bot-instance-list": "List Bot Instances",
  "ethora-bot-instance-status-set": "Bot Instance Status",
  "ethora-bot-instance-diagnose": "Diagnose Bot Instance",
  "ethora-bot-instance-test": "Send Test Message to Bot",
  "ethora-bot-instance-leave": "Remove Bot from Chat",
  "ethora-message-search": "Search Messages",
  "ethora-message-context": "Get Message Context",
  "ethora-chat-unread-counts": "Get Unread Counts",
  "ethora-app-export": "Export App",
  "ethora-app-import": "Import App",
  "ethora-message-send": "Send Chat Message",
  "ethora-chat-history": "Get Chat History",
  "ethora-bot-message-send": "Send Chat Message (Legacy Alias)",
  "ethora-bot-history": "Get Chat History (Legacy Alias)",
  "ethora.b2b.auth.use": "Use B2B Auth (Alias)",
  "ethora.b2b.app.create": "Create App (B2B Alias)",
  "ethora.b2b.bot.enable": "Enable Legacy Bot (B2B Alias)",
  "ethora.b2b.broadcast.wait": "Wait for Broadcast Job (Alias)",
  "ethora.b2b.app.bootstrap-ai": "Bootstrap AI App (B2B Alias)",
  "ethora-chat-component-app-generate": "Generate Chat Component App.tsx",
  "ethora-env-examples-generate": "Generate Env Examples",
  "ethora-b2b-runbook-generate": "Generate B2B Bootstrap Runbook",
  "search": "Search Docs",
  "fetch": "Fetch Doc",
}

// Tools that are never offered on the hosted (remote) surface. Directory
// reviews reject connectors that move money or crypto; the stdio CLI keeps them,
// where the deployment operator controls the environment.
//
// `ethora-wallet-balance-get` is read-only, but it hangs on the hosted server:
// a call with a valid authenticated session returned nothing after 61s and again
// after 120s (QA, 260916). A tool that never returns stalls the client's turn,
// and it is the last wallet surface on the remote server, so it comes out until
// the underlying lookup has a bounded timeout.
export const STDIO_ONLY_TOOLS = [
  "ethora-wallet-erc20-transfer",
  "ethora-wallet-balance-get",
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
