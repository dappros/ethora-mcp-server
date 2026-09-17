import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import { appConfig } from "./config.js"

export type AuthMode = "user" | "app" | "b2b"

export type SessionTokens = {
  appJwt: string
  appToken: string
  // appId the stored appToken belongs to (set by app-select / app-create) so a
  // single-call app-token request never uses a token from a different app.
  appTokenAppId: string
  b2bToken: string
  token: string
  refreshToken: string
}

export type SessionCtx = {
  authMode: AuthMode
  currentAppId: string
  currentAgentId: string
}

// OAuth entry point state (only set on /mcp/oauth sessions).
export type SessionOAuth = {
  // Token last validated against the API (GET /v2/users/me) and when.
  validatedToken: string
  validatedAt: number
  // Scopes granted to the token; enforced per tool call by scopeGuard.
  scopes: Set<string>
}

// A failure the caller just saw, kept so `ethora-feedback-submit` can report
// with the context still in hand. This is what makes feedback from an agent
// worth more than a web form: the tool, the code and the API's requestId are
// already known, so a report joins straight to the server-side log row.
export type RecentError = {
  tool: string
  code?: string
  message: string
  requestId?: string
  ts: number
}

export const RECENT_ERRORS_KEPT = 5

export type SessionContext = {
  id: string
  tokens: SessionTokens
  context: SessionCtx
  clientIp: string
  createdAt: number
  lastSeenAt: number
  // "open": /mcp and /mcp/k/<key> (no scope enforcement).
  // "oauth": /mcp/oauth (bearer required, scopes enforced, auth tools hidden).
  entry: "open" | "oauth"
  oauth?: SessionOAuth
  // The Bearer header is re-applied on every request so a long-lived client
  // keeps working after an idle eviction. That used to silently undo an
  // in-session `ethora-auth-use-b2b` / `ethora-configure`, which reported
  // success while every later call still ran as the header's identity.
  // `explicitAuthMode` records that a tool chose the mode deliberately; the
  // header then stops overwriting it until its value actually changes
  // (`headerToken` is what was last seen, so a rotated key still takes effect).
  explicitAuthMode?: boolean
  headerToken?: string
  // Last few tool failures in this session (ring buffer, newest last).
  recentErrors?: RecentError[]
  // Tool currently executing, set by the registration wrapper so outbound API
  // calls can be attributed (X-Ethora-Tool) without every handler passing it.
  currentTool?: string
}

export function createSessionContext(id?: string): SessionContext {
  const now = Date.now()
  return {
    id: id || randomUUID(),
    tokens: {
      // Deployment-level bootstrap credentials seed every session; a session
      // may override them via `ethora-configure` without affecting others.
      appJwt: appConfig.appJwt,
      appToken: "",
      appTokenAppId: "",
      b2bToken: appConfig.b2bToken || "",
      token: "",
      refreshToken: "",
    },
    context: {
      authMode: "user",
      currentAppId: "",
      currentAgentId: "",
    },
    clientIp: "",
    createdAt: now,
    lastSeenAt: now,
    entry: "open",
  }
}

const als = new AsyncLocalStorage<SessionContext>()

// stdio mode: one process per MCP client, so a single default context is the
// whole story. HTTP mode runs every request inside `runWithSession`.
const defaultSession = createSessionContext("stdio")

export function getSession(): SessionContext {
  return als.getStore() || defaultSession
}

export function runWithSession<T>(session: SessionContext, fn: () => T): T {
  return als.run(session, fn)
}

/**
 * Record a tool failure on the current session. Best effort and never throws:
 * a problem here must not turn a handled error into an unhandled one.
 */
export function pushRecentError(entry: RecentError) {
  try {
    const session = getSession()
    const list = session.recentErrors || (session.recentErrors = [])
    list.push(entry)
    if (list.length > RECENT_ERRORS_KEPT) list.splice(0, list.length - RECENT_ERRORS_KEPT)
  } catch {
    /* never let bookkeeping break a tool result */
  }
}

let hosted = false
export function setHostedMode(value: boolean) {
  hosted = value
}
export function isHostedMode() {
  return hosted
}
