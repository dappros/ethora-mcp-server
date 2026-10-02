// Records which tool is executing, for the duration of the call, and fills in
// the current app when a user session has none.
//
// Outbound API calls carry `X-Ethora-Tool` so the backend can count usage per
// tool. Threading the name through every handler would touch ~90 call sites and
// a new tool would silently forget to do it, so it is set once here instead:
// wrapping the registered callback is the only point that reliably knows the
// name for exactly the span of the call, including the API requests the handler
// makes. Applied at build time alongside the annotation and scope passes.
//
// The default app: without a selected app, app-scoped tools fall back to the
// bare route, which the API scopes to the token's own app (the shared base
// app), so "activate my agent" quietly targets the wrong tenant with a 403.
// Most accounts own exactly one app; when that is the case the first
// app-scoped call adopts it (once per session, one `GET /apps/`). Accounts
// with several apps keep the explicit `appId` / `ethora-app-select` contract.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { getSession } from "./session.js"
import { appList } from "./apiClientDappros.js"

// Tools that work without an app, or that pick one: no lookup for these.
const NO_DEFAULT_APP_TOOLS = new Set([
  "ethora-status", "ethora-doctor", "ethora-help", "search", "fetch", "ethora-tools-enable",
  "ethora-app-create", "ethora-app-list", "ethora-app-select", "ethora-app-get", "ethora-app-delete",
  "ethora-user-login", "ethora-user-register", "ethora-user-logout", "ethora-session-configure", "ethora-auth-mode-set",
  "ethora-api-key-create", "ethora-api-key-list", "ethora-api-key-revoke", "ethora-feedback-submit",
  "ethora-recipe-run", "ethora-env-examples-generate", "ethora-b2b-runbook-generate",
])

function ownedApps(body: any): any[] {
  if (Array.isArray(body)) return body
  const data = body?.data ?? body
  return data?.apps || data?.items || data?.results || (Array.isArray(data) ? data : [])
}

/**
 * Adopt the account's only app as the session's current app. Best effort: a
 * failure here must never turn into a tool error, the tool then runs exactly
 * as it would have without this step. Returns the adopted id, if any.
 */
export async function ensureDefaultApp(toolName: string): Promise<string | undefined> {
  const session = getSession()
  if (session.defaultAppChecked || NO_DEFAULT_APP_TOOLS.has(toolName)) return undefined
  if (session.context.currentAppId || session.context.authMode !== "user" || !session.tokens.token) return undefined
  session.defaultAppChecked = true
  try {
    const res = await appList()
    const apps = ownedApps(res?.data)
    if (apps.length !== 1) return undefined
    const id = String(apps[0]?._id || apps[0]?.appId || apps[0]?.id || "").trim()
    if (!id) return undefined
    session.context.currentAppId = id
    return id
  } catch {
    return undefined
  }
}

export function applyToolContext(server: McpServer): string[] {
  const reg: Record<string, any> = (server as any)._registeredTools || {}
  const wrapped: string[] = []

  for (const [name, tool] of Object.entries(reg)) {
    if (!tool || typeof tool.callback !== "function" || tool.__toolContext) continue
    const inner = tool.callback
    tool.callback = async (...args: any[]) => {
      const session = getSession()
      // Nested calls are not a thing (one tool per request), but restore the
      // previous value anyway so a future wrapper cannot be surprised.
      const previous = session.currentTool
      session.currentTool = name
      try {
        await ensureDefaultApp(name)
        return await inner(...args)
      } finally {
        session.currentTool = previous
        try { session.afterTool?.() } catch { /* memory is best effort */ }
      }
    }
    tool.__toolContext = true
    wrapped.push(name)
  }

  return wrapped
}
