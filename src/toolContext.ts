// Records which tool is executing, for the duration of the call, and settles
// the current app for user sessions that have none.
//
// Outbound API calls carry `X-Ethora-Tool` so the backend can count usage per
// tool. Threading the name through every handler would touch ~90 call sites and
// a new tool would silently forget to do it, so it is set once here instead:
// wrapping the registered callback is the only point that reliably knows the
// name for exactly the span of the call, including the API requests the handler
// makes. Applied at build time alongside the annotation and scope passes.
//
// The current app: without a selected app, app-scoped tools fall back to the
// bare route, which the API scopes to the token's own app. For an account that
// signed up on the hosted server that is the shared base app, so "create a
// room" quietly targeted the wrong tenant and came back 403 or 422. Two rules
// close that gap, each decided once per session with one `GET /apps/`:
//   - the account owns exactly one app: adopt it as the current app;
//   - the account owns none and lives in the base app: refuse app-scoped
//     tools with NO_APP_YET and point at `ethora-app-create`. Members of a
//     customer's app keep the bare route, which is their own app.
// Accounts with several apps keep the explicit `appId` / `ethora-app-select`
// contract.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { getSession } from "./session.js"
import { appList, appIdFromToken } from "./apiClientDappros.js"
import { appConfig } from "./config.js"
import { fail } from "./mcpResponse.js"

// Tools that work without an app, or that pick one: no lookup, no refusal.
// Agent tools that address an agent by id (list, get, try, update, delete,
// soul, visibility, export, knowledge) are included: an agent belongs to the
// account, not to an app. Creating one is not: a new agent is homed in the
// account's app, and without one it would land in the shared base app.
export const NO_DEFAULT_APP_TOOLS = new Set([
  "ethora-status", "ethora-doctor", "ethora-help", "search", "fetch", "ethora-tools-enable",
  "ethora-app-create", "ethora-app-list", "ethora-app-select", "ethora-app-get", "ethora-app-delete",
  "ethora-user-login", "ethora-user-register", "ethora-user-logout", "ethora-session-configure", "ethora-auth-mode-set",
  "ethora-api-key-create", "ethora-api-key-list", "ethora-api-key-revoke", "ethora-feedback-submit",
  "ethora-recipe-run", "ethora-env-examples-generate", "ethora-b2b-runbook-generate",
  "ethora-agent-model-list", "ethora-agent-list", "ethora-agent-get", "ethora-agent-try", "ethora-agent-update",
  "ethora-agent-delete", "ethora-agent-soul-set", "ethora-agent-soul-append", "ethora-agent-visibility-set",
  "ethora-agent-export", "ethora-agent-knowledge-get", "ethora-agent-knowledge-rebuild",
])

export const NO_APP_YET_MESSAGE =
  "This account has no app of its own yet, so there is nothing for this tool to act on. Call `ethora-app-create { displayName }` first; the new app becomes the current app and app-scoped tools then work without an appId. App-scoped tools never run against the shared Ethora app."

function ownedApps(body: any): any[] {
  if (Array.isArray(body)) return body
  const data = body?.data ?? body
  return data?.apps || data?.items || data?.results || (Array.isArray(data) ? data : [])
}

/**
 * What to do for a user session with no current app, given the apps it owns.
 * Pure, so the rule is testable without an API: `adopt` names the single owned
 * app; `refuse` means the account lives in the base app and owns nothing;
 * `none` leaves the session as it is.
 */
export function decideDefaultApp(input: { ownedAppIds: string[]; userAppId?: string; baseAppId?: string }): { action: "adopt"; appId: string } | { action: "refuse" } | { action: "none" } {
  const ids = input.ownedAppIds.filter(Boolean)
  if (ids.length === 1) return { action: "adopt", appId: ids[0] }
  if (ids.length === 0 && input.userAppId && input.baseAppId && input.userAppId === input.baseAppId) return { action: "refuse" }
  return { action: "none" }
}

/**
 * Settle the current app for this session once: adopt the only owned app, or
 * mark the session as having no app yet. Best effort: a failure here must
 * never turn into a tool error, the tool then runs exactly as it would have
 * without this step.
 */
export async function ensureDefaultApp(toolName: string): Promise<void> {
  const session = getSession()
  if (NO_DEFAULT_APP_TOOLS.has(toolName)) return
  if (session.context.currentAppId || session.context.authMode !== "user" || !session.tokens.token) return
  if (!session.defaultAppChecked) {
    session.defaultAppChecked = true
    try {
      const res = await appList()
      const apps = ownedApps(res?.data)
      const decision = decideDefaultApp({
        ownedAppIds: apps.map((a: any) => String(a?._id || a?.appId || a?.id || "").trim()),
        userAppId: appIdFromToken(session.tokens.token),
        baseAppId: appIdFromToken(appConfig.appJwt),
      })
      if (decision.action === "adopt") session.context.currentAppId = decision.appId
      else if (decision.action === "refuse") session.noAppYet = true
    } catch {
      /* cannot tell; let the tool run as before */
    }
  }
  if (session.noAppYet && !session.context.currentAppId) {
    const err: any = new Error(NO_APP_YET_MESSAGE)
    err.code = "NO_APP_YET"
    throw err
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
        try {
          await ensureDefaultApp(name)
        } catch (e: any) {
          if (e?.code !== "NO_APP_YET") throw e
          // Same envelope every tool returns on failure, so the caller gets the
          // code and hint rather than a transport-level error.
          const env = fail(e, { tool: name })
          return { content: [{ type: "text", text: JSON.stringify(env, null, 2) }], isError: true }
        }
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
