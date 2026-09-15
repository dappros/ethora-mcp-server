import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import { appConfig } from "./config.js"

export type AuthMode = "user" | "app" | "b2b"

export type SessionTokens = {
  appJwt: string
  appToken: string
  b2bToken: string
  token: string
  refreshToken: string
}

export type SessionCtx = {
  authMode: AuthMode
  currentAppId: string
  currentAgentId: string
}

export type SessionContext = {
  id: string
  tokens: SessionTokens
  context: SessionCtx
  clientIp: string
  createdAt: number
  lastSeenAt: number
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

let hosted = false
export function setHostedMode(value: boolean) {
  hosted = value
}
export function isHostedMode() {
  return hosted
}
