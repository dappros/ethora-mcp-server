// What a signed-in account was doing, remembered across MCP sessions.
//
// MCP session state (the selected app, the remembered appToken, the enabled
// tool groups) lives on the SessionContext, which is private to one
// Mcp-Session-Id. Some clients open a brand-new session for every tool call
// (ChatGPT does; the plugin dashboard scan does too), so an app selected in
// call one is gone by call two and every app-scoped tool falls back to the
// token's own app. This store keeps a small snapshot per account, keyed by the
// user id in the bearer token, and the HTTP server re-applies it to each new
// session that arrives with a token for the same account.
//
// Two rules keep it safe:
// - A snapshot is restored only after the bearer has been validated against
//   the API (the user id in a JWT is a claim, not a proof). The HTTP server
//   already validates OAuth tokens once per session; it does the same for any
//   bearer that has something to restore.
// - Only context is kept: ids, the appToken already handed out by the API to
//   this same account, and group names. Never the user token itself.
import { createHash } from "node:crypto"
import type { SessionContext } from "./session.js"

export type AccountMemory = {
  currentAppId: string
  currentAgentId: string
  appToken: string
  appTokenAppId: string
  enabledGroups: string[]
  updatedAt: number
}

export const ACCOUNT_MEMORY_TTL_MS = 24 * 60 * 60 * 1000
export const ACCOUNT_MEMORY_MAX = 10_000
const VALIDATION_TTL_MS = 5 * 60 * 1000

function decodePayload(token: string): any | null {
  try {
    const part = String(token || "").split(".")[1]
    if (!part) return null
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"))
  } catch {
    return null
  }
}

/**
 * Identity key for a bearer token: the user id it names (`user:<id>`), so an
 * OAuth access token, a refreshed one and an API key of the same person share
 * one memory. Tokens that name no user (app tokens, B2B tokens) get no key:
 * their context comes from the token itself on every request.
 */
export function identityKeyFor(bearer: string | undefined): string | undefined {
  const payload = decodePayload(String(bearer || "").replace(/^(?:Bearer|JWT)\s+/i, ""))
  const data = payload?.data || payload || {}
  const type = String(data.type || "").toLowerCase()
  if (type && type !== "user") return undefined
  const id = data.userId || payload?.userId || payload?.sub
  return id ? `user:${String(id)}` : undefined
}

export function tokenHash(bearer: string): string {
  return createHash("sha256").update(String(bearer || "")).digest("hex")
}

/** The part of a session worth carrying to the account's next session. */
export function snapshotSession(session: SessionContext, enabledGroups: string[], now = Date.now()): AccountMemory {
  return {
    currentAppId: String(session.context.currentAppId || ""),
    currentAgentId: String(session.context.currentAgentId || ""),
    appToken: String(session.tokens.appToken || ""),
    appTokenAppId: String(session.tokens.appTokenAppId || ""),
    enabledGroups: [...enabledGroups],
    updatedAt: now,
  }
}

/**
 * Fill the gaps of a fresh session from memory. Anything the bearer header
 * already decided (an app token's own appId, the auth mode) is left alone;
 * memory only supplies what the session does not have yet. Returns what was
 * applied so the caller can log it and enable the groups.
 */
export function applyMemory(session: SessionContext, memory: AccountMemory | undefined): { appId?: string; agentId?: string; appToken?: boolean; groups: string[] } {
  const applied: { appId?: string; agentId?: string; appToken?: boolean; groups: string[] } = { groups: [] }
  if (!memory) return applied
  if (!session.context.currentAppId && memory.currentAppId) {
    session.context.currentAppId = memory.currentAppId
    applied.appId = memory.currentAppId
  }
  if (!session.context.currentAgentId && memory.currentAgentId) {
    session.context.currentAgentId = memory.currentAgentId
    applied.agentId = memory.currentAgentId
  }
  // The remembered appToken belongs to one app; only hand it back when that
  // app is the session's current one, so a token never follows a wrong app.
  if (!session.tokens.appToken && memory.appToken && memory.appTokenAppId && memory.appTokenAppId === session.context.currentAppId) {
    session.tokens.appToken = memory.appToken
    session.tokens.appTokenAppId = memory.appTokenAppId
    applied.appToken = true
  }
  applied.groups = [...memory.enabledGroups]
  return applied
}

export class AccountMemoryStore {
  private readonly memories = new Map<string, AccountMemory>()
  private readonly validated = new Map<string, number>()
  readonly ttlMs: number
  readonly max: number

  constructor(opts?: { ttlMs?: number; max?: number }) {
    this.ttlMs = opts?.ttlMs ?? ACCOUNT_MEMORY_TTL_MS
    this.max = opts?.max ?? ACCOUNT_MEMORY_MAX
  }

  get size() {
    return this.memories.size
  }

  get(key: string, now = Date.now()): AccountMemory | undefined {
    const m = this.memories.get(key)
    if (!m) return undefined
    if (now - m.updatedAt > this.ttlMs) {
      this.memories.delete(key)
      return undefined
    }
    return m
  }

  /** Store a snapshot, unless it carries nothing worth restoring. */
  remember(key: string, memory: AccountMemory) {
    const empty = !memory.currentAppId && !memory.currentAgentId && !memory.appToken && memory.enabledGroups.length === 0
    if (empty) {
      this.memories.delete(key)
      return
    }
    // Re-insert so Map order is least-recently-updated first; the cap then
    // evicts the stalest account instead of an arbitrary one.
    this.memories.delete(key)
    this.memories.set(key, memory)
    while (this.memories.size > this.max) {
      const oldest = this.memories.keys().next().value
      if (oldest === undefined) break
      this.memories.delete(oldest)
    }
  }

  forget(key: string) {
    this.memories.delete(key)
  }

  /** A bearer the API has confirmed recently; saves one validation call per new session. */
  isTokenValidated(bearer: string, now = Date.now()): boolean {
    const until = this.validated.get(tokenHash(bearer))
    if (until === undefined) return false
    if (until <= now) {
      this.validated.delete(tokenHash(bearer))
      return false
    }
    return true
  }

  markTokenValidated(bearer: string, now = Date.now()) {
    this.validated.set(tokenHash(bearer), now + VALIDATION_TTL_MS)
  }

  sweep(now = Date.now()) {
    for (const [k, m] of this.memories) if (now - m.updatedAt > this.ttlMs) this.memories.delete(k)
    for (const [k, until] of this.validated) if (until <= now) this.validated.delete(k)
  }
}
