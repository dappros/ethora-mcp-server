// Canonical tool names (27.x) and the aliases that keep every earlier name
// callable.
//
// One rule for every name: `ethora-<resource>-<verb>[-<qualifier>]`.
//   resource  singular noun, optionally two words (app, agent, chat, message,
//             broadcast, source-site, source-doc, user, file, bot, api-key,
//             app-token, widget, wallet, session, auth-mode, recipe, tools)
//   verb      last word (create, list, get, update, delete, send, wait, set,
//             run, reveal, ...); `-wait` / `-start` name the sync/async pair
//   qualifier only after the verb: -wait, -batch, -legacy, -b2b
// No -v2 suffixes: the API version is not the caller's concern. `search` and
// `fetch` keep their names by ChatGPT connector convention.
//
// Every pre-27 name maps here to its canonical tool (some to the same tool
// with a preset argument, where three or two tools were really one). Aliases
// are never listed by tools/list, so directories and assistants see one name
// per operation, but a call to an old name is rewritten and served, so
// published configs, recipes and saved conversations keep working.

export interface ToolAlias {
  to: string
  args?: Record<string, unknown>
}

// Pure renames: old name -> canonical name.
export const TOOL_RENAMES: Record<string, string> = {
  // session
  "ethora-run-recipe": "ethora-recipe-run",
  "ethora-configure": "ethora-session-configure",
  // apps and tokens
  "ethora-app-export-v2": "ethora-app-export",
  "ethora-app-import-v2": "ethora-app-import",
  "ethora-app-tokens-create-v2": "ethora-app-token-create",
  "ethora-app-tokens-list-v2": "ethora-app-token-list",
  "ethora-app-tokens-revoke-v2": "ethora-app-token-revoke",
  "ethora-app-tokens-rotate-v2": "ethora-app-token-rotate",
  "ethora-app-credentials": "ethora-app-credentials-reveal",
  "ethora-app-get-default-rooms-with-app-id": "ethora-app-rooms-list",
  "ethora-app-get-default-rooms": "ethora-app-rooms-list",
  // rooms and messages
  "ethora-app-create-chat": "ethora-chat-create",
  "ethora-app-delete-chat": "ethora-chat-delete",
  "ethora-chats-message-v2": "ethora-message-send",
  "ethora-chats-history-v2": "ethora-chat-history",
  "ethora-chats-broadcast-v2": "ethora-broadcast-send",
  "ethora-chats-broadcast-job-v2": "ethora-broadcast-job-start",
  "ethora-wait-broadcast-job-v2": "ethora-broadcast-job-wait",
  "ethora-messages-search-v2": "ethora-message-search",
  "ethora-messages-context-v2": "ethora-message-context",
  "ethora-unread-counts-v2": "ethora-chat-unread-counts",
  // agents
  "ethora-agents-create-v2": "ethora-agent-create",
  "ethora-agents-list-v2": "ethora-agent-list",
  "ethora-agents-get-v2": "ethora-agent-get",
  "ethora-agents-update-v2": "ethora-agent-update",
  "ethora-agents-clone-v2": "ethora-agent-clone",
  "ethora-agents-delete-v2": "ethora-agent-delete",
  "ethora-agents-export-v2": "ethora-agent-export",
  "ethora-agents-import-v2": "ethora-agent-import",
  "ethora-agents-activate-v2": "ethora-agent-activate",
  "ethora-agent-invite-to-chat": "ethora-agent-invite",
  "ethora-agent-set-visibility": "ethora-agent-visibility-set",
  // widget and generators
  "ethora-widget-embed-snippet": "ethora-widget-snippet-get",
  "ethora-generate-chat-component-app-tsx": "ethora-chat-component-app-generate",
  "ethora-generate-b2b-bootstrap-runbook": "ethora-b2b-runbook-generate",
  "ethora-generate-env-examples": "ethora-env-examples-generate",
  // legacy per-app bot
  "ethora-bot-get-v2": "ethora-bot-get",
  "ethora-bot-update-v2": "ethora-bot-update",
  "ethora-bot-enable-v2": "ethora-bot-enable",
  "ethora-bot-disable-v2": "ethora-bot-disable",
  "ethora-bot-widget-v2": "ethora-bot-widget-get",
  "ethora-bot-history-v2": "ethora-bot-history",
  "ethora-bot-message-v2": "ethora-bot-message-send",
  "ethora-bot-instances-list": "ethora-bot-instance-list",
  "ethora-bot-instance-status": "ethora-bot-instance-status-set",
  "ethora-bot-instance-diag": "ethora-bot-instance-diagnose",
  "ethora-bot-instance-leave-chat": "ethora-bot-instance-leave",
  "ethora-bot-instance-test-message": "ethora-bot-instance-test",
  "ethora-b2b-bot-enable": "ethora-bot-enable-b2b",
  "ethora-sources-docs-upload": "ethora-source-doc-upload-legacy",
  "ethora-sources-docs-delete": "ethora-source-doc-delete-legacy",
  // knowledge sources
  "ethora-sources-site-crawl-v2": "ethora-source-site-crawl",
  "ethora-sources-site-crawl-v2-wait": "ethora-source-site-crawl-wait",
  "ethora-sources-site-reindex-v2": "ethora-source-site-reindex",
  "ethora-sources-site-reindex-v2-wait": "ethora-source-site-reindex-wait",
  "ethora-sources-site-list-v2": "ethora-source-site-list",
  "ethora-sources-site-tags-update-v2": "ethora-source-site-tags-update",
  "ethora-sources-site-delete-url-v2": "ethora-source-site-url-delete",
  "ethora-sources-site-delete-url-v2-batch": "ethora-source-site-url-delete-batch",
  "ethora-sources-docs-upload-v2": "ethora-source-doc-upload",
  "ethora-sources-docs-list-v2": "ethora-source-doc-list",
  "ethora-sources-docs-tags-update-v2": "ethora-source-doc-tags-update",
  "ethora-sources-docs-delete-v2": "ethora-source-doc-delete",
  // users and files
  "ethora-users-batch-create-v2": "ethora-user-batch-create",
  "ethora-users-batch-job-v2": "ethora-user-batch-job-start",
  "ethora-wait-users-batch-job-v2": "ethora-user-batch-job-wait",
  "ethora-files-upload-v2": "ethora-file-upload",
  "ethora-files-get-v2": "ethora-file-get",
  "ethora-files-delete-v2": "ethora-file-delete",
  // wallet (stdio only)
  "ethora-wallet-get-balance": "ethora-wallet-balance-get",
}

// Aliases that need an argument preset, or that were never renamed in the
// source (the dotted first-release names).
export const TOOL_ALIASES_WITH_ARGS: Record<string, ToolAlias> = {
  "ethora-auth-use-user": { to: "ethora-auth-mode-set", args: { mode: "user" } },
  "ethora-auth-use-app": { to: "ethora-auth-mode-set", args: { mode: "app" } },
  "ethora-auth-use-b2b": { to: "ethora-auth-mode-set", args: { mode: "b2b" } },
  "ethora.b2b.auth.use": { to: "ethora-auth-mode-set", args: { mode: "b2b" } },
  "ethora.b2b.app.create": { to: "ethora-b2b-app-create" },
  "ethora.b2b.bot.enable": { to: "ethora-bot-enable-b2b" },
  "ethora.b2b.broadcast.wait": { to: "ethora-broadcast-job-wait" },
  "ethora.b2b.app.bootstrap-ai": { to: "ethora-b2b-app-bootstrap-ai" },
}

export const TOOL_ALIASES: Record<string, ToolAlias> = {
  ...Object.fromEntries(Object.entries(TOOL_RENAMES).map(([from, to]) => [from, { to }])),
  ...TOOL_ALIASES_WITH_ARGS,
}

/** Canonical name for any name, old or new. */
export function canonicalToolName(name: string): string {
  return TOOL_ALIASES[name]?.to || name
}

/** Old names that map to a canonical tool (for docs and error hints). */
export function aliasesOf(canonical: string): string[] {
  return Object.entries(TOOL_ALIASES).filter(([, a]) => a.to === canonical).map(([from]) => from)
}

/**
 * Rewrite a tools/call for an alias into the canonical tool, merging any
 * preset arguments (explicit arguments win). Installed on the low-level
 * request handler map so it runs before the SDK looks the tool up; aliases
 * are not registered tools, so they never appear in tools/list.
 */
export function installToolAliases(server: any) {
  const low: any = server?.server
  const handlers: Map<string, any> | undefined = low?._requestHandlers
  const original = handlers?.get("tools/call")
  if (!handlers || typeof original !== "function" || (original as any)._ethoraAliases) return
  const wrapped = async (request: any, extra: any) => {
    const name = String(request?.params?.name || "")
    const alias = TOOL_ALIASES[name]
    if (alias) {
      request = {
        ...request,
        params: {
          ...request.params,
          name: alias.to,
          arguments: { ...(alias.args || {}), ...(request.params?.arguments || {}) },
        },
      }
    }
    return original(request, extra)
  }
  ;(wrapped as any)._ethoraAliases = true
  handlers.set("tools/call", wrapped)
}
