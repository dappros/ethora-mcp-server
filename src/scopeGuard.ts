import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { getSession } from "./session.js"
import { fail } from "./mcpResponse.js"

export const ALL_SCOPES = ["read", "write", "admin"] as const
export type Scope = (typeof ALL_SCOPES)[number]

// Tools that establish or inspect identity / docs and never touch user data.
export const SCOPE_EXEMPT_TOOLS = new Set([
  "search",
  "fetch",
  "ethora-help",
  "ethora-status",
  "ethora-doctor",
])

// Tools hidden on the OAuth entry point: identity there comes from the OAuth
// token, so session-level credential management makes no sense.
export const OAUTH_HIDDEN_TOOLS = new Set([
  "ethora-user-login",
  "ethora-user-register",
  "ethora-configure",
  "ethora-auth-use-app",
  "ethora-auth-use-user",
  "ethora-auth-use-b2b",
  "ethora-api-key-create",
  "ethora-api-key-list",
  "ethora-api-key-revoke",
])

// Per-tool overrides: tools whose annotations understate their sensitivity.
// Revealing a credential is read-only in API terms but is an admin action.
export const SCOPE_OVERRIDES: Record<string, Scope> = {
  "ethora-app-credentials": "admin",
  // Writes nothing the caller owns and must work on a read-only grant:
  // being unable to report a problem because of scope would be perverse.
  "ethora-feedback-submit": "read",
}

// Required scope for a tool, derived from its annotations (overrides first).
export function requiredScope(name: string, annotations: any): Scope | null {
  if (SCOPE_EXEMPT_TOOLS.has(name)) return null
  if (SCOPE_OVERRIDES[name]) return SCOPE_OVERRIDES[name]
  if (annotations?.destructiveHint) return "admin"
  if (annotations?.readOnlyHint) return "read"
  return "write"
}

// Parse a space-separated OAuth scope string. Empty/absent (API keys, legacy
// user tokens) means full access.
export function parseScopes(scope: unknown): Set<string> {
  const raw = String(scope ?? "").trim()
  if (!raw) return new Set(ALL_SCOPES)
  const set = new Set(raw.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))
  // `admin` implies write and read; `write` implies read.
  if (set.has("admin")) { set.add("write"); set.add("read") }
  if (set.has("write")) set.add("read")
  return set
}

export function isAllowed(scopes: Set<string>, required: Scope | null): boolean {
  if (!required) return true
  return scopes.has(required)
}

function scopeError(tool: string, required: Scope, granted: Set<string>) {
  // Shaped like an API error so `fail()` maps code/message/httpStatus.
  return {
    message: `Insufficient scope for ${tool}: requires "${required}"`,
    response: {
      status: 403,
      data: {
        code: "INSUFFICIENT_SCOPE",
        error: `Insufficient scope for \`${tool}\`: requires "${required}", token grants "${[...granted].join(" ") || "(none)"}". Re-authorize with a broader scope.`,
      },
    },
  }
}

// Wrap every registered tool callback so calls on an OAuth-entry session are
// checked against the token's scopes. Open sessions (/mcp, /mcp/k/<key>) are
// untouched. Runs once per McpServer instance, after all tools are registered.
export function applyScopeGuard(server: McpServer) {
  const reg: Record<string, any> = (server as any)._registeredTools || {}
  for (const [name, tool] of Object.entries(reg)) {
    if (!tool || typeof tool.callback !== "function" || tool.__scopeGuarded) continue
    const original = tool.callback
    const required = requiredScope(name, tool.annotations)
    tool.callback = async (...args: any[]) => {
      const session = getSession()
      if (session.entry === "oauth" && required) {
        const scopes = session.oauth?.scopes || new Set<string>()
        if (!isAllowed(scopes, required)) {
          const envelope = fail(scopeError(name, required, scopes), { tool, scopeRequired: required })
          return { content: [{ type: "text", text: JSON.stringify({ ...envelope, meta: { tool: name, scopeRequired: required } }) }], isError: false }
        }
      }
      return original(...args)
    }
    tool.__scopeGuarded = true
  }
}

// Disable identity-management tools on an OAuth-entry server instance. Safe
// before `connect()` because the SDK only notifies listChanged when connected.
export function hideOAuthTools(server: McpServer) {
  const reg: Record<string, any> = (server as any)._registeredTools || {}
  for (const name of OAUTH_HIDDEN_TOOLS) {
    const t = reg[name]
    if (t && typeof t.disable === "function") t.disable()
  }
}
