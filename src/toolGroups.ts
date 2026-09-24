// Tool groups: a small core surface by default, everything else on request.
//
// The full catalogue is ~90 tools and ~120 KB on tools/list. Every crawler
// pulled it and no client went further; Claude.ai and ChatGPT pick tools
// worse as the list grows, and directory reviews score the count and the
// near-duplicate variants (legacy vs v2, async vs -wait, auth-mode switches).
//
// So a session starts with the core group only: the "create an app, give it
// an agent, put it on my site" journey, one variant per operation. The other
// groups stay registered but disabled; `ethora-tools-enable { group }` turns
// one on and the SDK emits tools/list_changed, which Claude, ChatGPT, Cursor
// and Claude Code all honour. Hidden tools remain documented through
// `search` / `fetch`, each doc naming the group to enable.
//
// Escape hatches for callers that want the whole list up front:
// hosted `?tools=all` on the endpoint URL, stdio `ETHORA_MCP_TOOLS=all`.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"
import z from "zod"
import { ok, fail } from "./mcpResponse.js"
import { getSession, isHostedMode } from "./session.js"
import { OAUTH_HIDDEN_TOOLS } from "./scopeGuard.js"
import { asToolResult, getDefaultMeta } from "./tools.js"

export type ToolsProfile = "core" | "all"

export const CORE_GROUP = "core"

// Order matters only for the catalogue listing.
export const TOOL_GROUPS: Record<string, { summary: string; tools: string[] }> = {
  core: {
    summary: "Sign in or register, create an app, add rooms and messages, create and activate an AI agent, give it a knowledge base, get the website widget. Always listed.",
    tools: [
      "ethora-status", "ethora-help", "ethora-feedback-submit", "ethora-tools-enable", "search", "fetch",
      "ethora-user-register", "ethora-user-login", "ethora-api-key-create",
      "ethora-app-create", "ethora-app-list", "ethora-app-select", "ethora-app-update",
      "ethora-chat-create", "ethora-message-send", "ethora-chat-history",
      "ethora-agent-create", "ethora-agent-list", "ethora-agent-update",
      "ethora-agent-invite", "ethora-agent-activate",
      "ethora-source-site-crawl-wait", "ethora-source-doc-upload",
      "ethora-widget-snippet-get",
    ],
  },
  keys: {
    summary: "List and revoke API keys, reveal an app's credentials, mint and rotate app tokens.",
    tools: [
      "ethora-api-key-list", "ethora-api-key-revoke", "ethora-app-credentials-reveal",
      "ethora-app-token-create", "ethora-app-token-list", "ethora-app-token-revoke", "ethora-app-token-rotate",
    ],
  },
  session: {
    summary: "Diagnostics, recipes and switching the session's auth mode (app token, B2B token) for server integrations.",
    tools: ["ethora-doctor", "ethora-recipe-run", "ethora-session-configure", "ethora-auth-mode-set"],
  },
  "apps-admin": {
    summary: "Delete, export and import whole apps; inspect default rooms.",
    tools: ["ethora-app-delete", "ethora-app-export", "ethora-app-import", "ethora-app-rooms-list"],
  },
  rooms: {
    summary: "Delete rooms, broadcast to many rooms, search messages, read message context and unread counts.",
    tools: [
      "ethora-chat-delete", "ethora-broadcast-send", "ethora-broadcast-job-start", "ethora-broadcast-job-wait",
      "ethora-message-search", "ethora-message-context", "ethora-chat-unread-counts",
    ],
  },
  "agents-admin": {
    summary: "Inspect, clone, delete, export and import agents; edit an agent's soul and visibility.",
    tools: [
      "ethora-agent-get", "ethora-agent-clone", "ethora-agent-delete", "ethora-agent-export", "ethora-agent-import",
      "ethora-agent-visibility-set", "ethora-agent-soul-set", "ethora-agent-soul-append",
    ],
  },
  sources: {
    summary: "Knowledge-base maintenance: async crawl and reindex jobs, list and tag sites and documents, delete URLs and documents.",
    tools: [
      "ethora-source-site-crawl", "ethora-source-site-reindex", "ethora-source-site-reindex-wait", "ethora-source-site-list",
      "ethora-source-site-tags-update", "ethora-source-site-url-delete", "ethora-source-site-url-delete-batch",
      "ethora-source-doc-list", "ethora-source-doc-tags-update", "ethora-source-doc-delete",
    ],
  },
  "users-files": {
    summary: "Batch-create users and upload, fetch or delete files.",
    tools: ["ethora-user-batch-create", "ethora-user-batch-job-start", "ethora-user-batch-job-wait", "ethora-file-upload", "ethora-file-get", "ethora-file-delete"],
  },
  "legacy-bot": {
    summary: "The per-app bot of apps created in the dashboard before the agents framework, and the pre-v2 document tools. Prefer the agents and sources tools for anything new.",
    tools: [
      "ethora-bot-get", "ethora-bot-update", "ethora-bot-enable", "ethora-bot-disable", "ethora-bot-widget-get",
      "ethora-bot-history", "ethora-bot-message-send", "ethora-bot-instance-list", "ethora-bot-instance-status-set",
      "ethora-bot-instance-diagnose", "ethora-bot-instance-leave", "ethora-bot-instance-test", "ethora-bot-enable-b2b",
      "ethora-source-doc-upload-legacy", "ethora-source-doc-delete-legacy",
    ],
  },
  b2b: {
    summary: "Server-to-server provisioning with a B2B token, plus code and config generators for integrations.",
    tools: [
      "ethora-b2b-app-create", "ethora-b2b-app-provision", "ethora-b2b-app-bootstrap-ai",
      "ethora-b2b-runbook-generate", "ethora-env-examples-generate", "ethora-chat-component-app-generate",
      // Dotted names from the first release, kept so old integrations keep working.
      "ethora.b2b.auth.use", "ethora.b2b.app.create", "ethora.b2b.bot.enable", "ethora.b2b.broadcast.wait", "ethora.b2b.app.bootstrap-ai",
    ],
  },
  wallet: {
    summary: "Wallet balance and ERC-20 transfer. Local (stdio) only; never offered on the hosted server.",
    tools: ["ethora-wallet-balance-get", "ethora-wallet-erc20-transfer"],
  },
}

export const GROUP_NAMES = Object.keys(TOOL_GROUPS)

const GROUP_OF: Record<string, string> = {}
for (const [group, def] of Object.entries(TOOL_GROUPS)) for (const t of def.tools) GROUP_OF[t] = group

export function groupOf(name: string): string | undefined {
  return GROUP_OF[name]
}

// Wording added to the description of tools whose sibling is the better
// default, so a model that enabled a group still picks the right variant.
const VARIANT_NOTES: Record<string, string> = {
  "ethora-source-site-crawl": "Async variant: returns a job id to poll. Prefer `ethora-source-site-crawl-wait` unless the crawl is expected to exceed its wait budget.",
  "ethora-source-site-reindex": "Async variant: returns a job id to poll. Prefer `ethora-source-site-reindex-wait` unless the job is expected to exceed its wait budget.",
  "ethora-broadcast-job-start": "Async variant of `ethora-broadcast-send`; pair with `ethora-broadcast-job-wait`.",
  "ethora-user-batch-job-start": "Async variant of `ethora-user-batch-create`; pair with `ethora-user-batch-job-wait`.",
  "ethora-source-doc-upload-legacy": "Legacy pre-v2 upload for the per-app bot. For agents use `ethora-source-doc-upload`.",
  "ethora-source-doc-delete-legacy": "Legacy pre-v2 delete for the per-app bot. For agents use `ethora-source-doc-delete`.",
  "ethora.b2b.auth.use": "Legacy dotted name kept for old integrations; use `ethora-auth-mode-set`.",
  "ethora.b2b.app.create": "Legacy dotted name kept for old integrations; use `ethora-b2b-app-create`.",
  "ethora.b2b.bot.enable": "Legacy dotted name kept for old integrations; use `ethora-bot-enable-b2b`.",
  "ethora.b2b.broadcast.wait": "Legacy dotted name kept for old integrations; use `ethora-broadcast-send` or the broadcast job tools.",
  "ethora.b2b.app.bootstrap-ai": "Legacy dotted name kept for old integrations; use `ethora-b2b-app-bootstrap-ai`.",
}
const LEGACY_BOT_NOTE = "Legacy per-app bot (apps created in the dashboard before the agents framework). For anything new use the agents tools (`ethora-agents-*`)."

function registry(server: McpServer): Record<string, any> {
  return (server as any)._registeredTools || {}
}

export function toolsProfileFromEnv(): ToolsProfile {
  return String(process.env.ETHORA_MCP_TOOLS || "").trim().toLowerCase() === "all" ? "all" : "core"
}

/**
 * Disable every non-core tool (unless the profile is "all") and mark the
 * disabled ones so the docs corpus keeps them searchable. Also prefixes the
 * legacy and async variants with the note that names the preferred sibling.
 * Runs before connect(), so no list_changed is emitted.
 */
export function applyToolProfile(server: McpServer, profile: ToolsProfile): { hidden: string[]; listed: string[] } {
  const reg = registry(server)
  const hidden: string[] = []
  const listed: string[] = []
  installAutoEnable(server)
  for (const [name, t] of Object.entries(reg)) {
    if (!t) continue
    const group = GROUP_OF[name]
    const note = VARIANT_NOTES[name] || (group === "legacy-bot" ? LEGACY_BOT_NOTE : "")
    if (note && typeof t.description === "string" && !t.description.startsWith(note)) {
      t.description = `${note}\n${t.description}`
    }
    if (profile === "all" || group === CORE_GROUP || !group) { listed.push(name); continue }
    if (t.enabled !== false && typeof t.disable === "function") t.disable()
    t._hiddenByGroup = group
    hidden.push(name)
  }
  return { hidden, listed }
}

// A call to a hidden tool enables its group and proceeds, instead of the
// SDK's bare "Tool X disabled". The hiding exists to keep the listing small,
// not to withhold anything, so a model that knows a name (from the docs, or
// from an earlier session) should never be refused. The low-level Server
// keeps its handlers in a private map; read it defensively and leave the
// original in place if the shape ever changes.
function installAutoEnable(server: McpServer) {
  const low: any = (server as any).server
  const handlers: Map<string, any> | undefined = low?._requestHandlers
  const original = handlers?.get("tools/call")
  if (!handlers || typeof original !== "function" || (original as any)._ethoraAutoEnable) return
  const wrapped = async (request: any, extra: any) => {
    const name = String(request?.params?.name || "")
    const t = registry(server)[name]
    if (t && t.enabled === false && t._hiddenByGroup) {
      const group = t._hiddenByGroup
      const entry = getSession().entry
      for (const n of TOOL_GROUPS[group]?.tools || []) {
        const sib = registry(server)[n]
        if (!sib || sib.enabled !== false || !sib._hiddenByGroup) continue
        if (entry === "oauth" && OAUTH_HIDDEN_TOOLS.has(n)) continue
        if (typeof sib.enable === "function") sib.enable()
        delete sib._hiddenByGroup
      }
    }
    return original(request, extra)
  }
  ;(wrapped as any)._ethoraAutoEnable = true
  handlers.set("tools/call", wrapped)
}

function catalogue(server: McpServer) {
  const reg = registry(server)
  return GROUP_NAMES
    .filter((g) => !(isHostedMode() && g === "wallet"))
    .map((g) => {
      const tools = TOOL_GROUPS[g].tools.filter((n) => reg[n])
      const enabled = tools.filter((n) => reg[n]?.enabled !== false)
      return { group: g, summary: TOOL_GROUPS[g].summary, tools: tools.length, enabled: enabled.length, listedByDefault: g === CORE_GROUP }
    })
}

/** The one extra tool: list the groups, or enable one (or all). */
export function registerToolsEnable(server: McpServer) {
  const enumGroups = [...GROUP_NAMES.filter((g) => g !== CORE_GROUP), "all"] as unknown as [string, ...string[]]
  server.registerTool(
    "ethora-tools-enable",
    {
      description: `Only the core tools are listed by default. Call this to enable another group for this session; the tool list refreshes automatically (tools/list_changed). Without \`group\` it returns the catalogue: each group's summary, tool count and whether it is enabled. Groups: ${GROUP_NAMES.filter((g) => g !== CORE_GROUP).join(", ")}; \`all\` enables everything. Hidden tools are still described by \`search\` / \`fetch\`, and each doc names its group.\nAuth: none. Errors: UNKNOWN_GROUP for a name outside the list.`,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        group: z.enum(enumGroups).optional().describe("Group to enable, or `all`. Omit to list the groups."),
      },
    },
    async function ({ group }) {
      const meta = getDefaultMeta("ethora-tools-enable")
      try {
        const reg = registry(server)
        if (!group) {
          return asToolResult(ok({ groups: catalogue(server), hint: "Call again with { group } to enable one." }, meta))
        }
        const targets = group === "all" ? GROUP_NAMES.filter((g) => g !== CORE_GROUP) : [group]
        const entry = getSession().entry
        const enabled: string[] = []
        const alreadyEnabled: string[] = []
        const notAvailable: string[] = []
        for (const g of targets) {
          for (const name of TOOL_GROUPS[g].tools) {
            const t = reg[name]
            if (!t) { notAvailable.push(name); continue }
            // OAuth sessions never get the session-credential tools back.
            if (entry === "oauth" && OAUTH_HIDDEN_TOOLS.has(name)) { notAvailable.push(name); continue }
            if (t.enabled !== false) { alreadyEnabled.push(name); continue }
            if (typeof t.enable === "function") t.enable()
            delete t._hiddenByGroup
            enabled.push(name)
          }
        }
        return asToolResult(ok({
          group,
          enabled,
          alreadyEnabled,
          ...(notAvailable.length ? { notAvailable, note: "Not offered on this connection (hosted server or OAuth entry point)." } : {}),
          listedNow: Object.entries(reg).filter(([, t]) => t?.enabled !== false).length,
        }, meta))
      } catch (error) {
        return asToolResult(fail(error, meta))
      }
    }
  )
}
