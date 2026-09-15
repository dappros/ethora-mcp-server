import express, { Request, Response } from "express"
import cors from "cors"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { appConfig } from "./config.js"
import { createSessionContext, runWithSession, setHostedMode, SessionContext } from "./session.js"
import { fetchAppJwtByDomainName, usersMe } from "./apiClientDappros.js"
import { ALL_SCOPES, hideOAuthTools, parseScopes } from "./scopeGuard.js"

type Entry = {
  server: McpServer
  transport: StreamableHTTPServerTransport
  session: SessionContext
}

type EntryKind = "open" | "oauth"

export type HttpServerOptions = {
  name: string
  version: string
  buildServer: (profile: "open" | "authenticated" | "oauth") => McpServer
}

const OAUTH_VALIDATION_TTL_MS = 5 * 60 * 1000

function envInt(name: string, fallback: number) {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function envBool(name: string) {
  return String(process.env[name] ?? "").trim().toLowerCase() === "true"
}

export function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".")
    if (parts.length < 2) return null
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    return JSON.parse(json)
  } catch {
    return null
  }
}

function extractBearer(authorization: string | undefined): string {
  const raw = String(authorization || "").trim()
  if (!raw) return ""
  const m = raw.match(/^(?:Bearer|JWT)\s+(.+)$/i)
  return (m ? m[1] : raw).trim()
}

// Apply an `Authorization: Bearer <jwt>` header to the session. The token is
// only decoded (never verified) to learn which auth mode it belongs to; the
// Ethora API verifies it on every call. Re-applied on every request so a
// long-lived client keeps working after its session was evicted and re-created.
export function applyBearerToSession(session: SessionContext, authorization: string | undefined) {
  const jwt = extractBearer(authorization)
  if (!jwt) return
  const payload = decodeJwtPayload(jwt)
  const data = payload?.data || {}
  const type = String(data.type || "").toLowerCase()

  if (type === "app") {
    session.tokens.appToken = jwt
    session.context.authMode = "app"
    if (data.appId) session.context.currentAppId = String(data.appId)
    return
  }
  if (type === "server" || type === "client") {
    session.tokens.b2bToken = jwt
    session.context.authMode = "b2b"
    return
  }
  // "user" or legacy tokens without an explicit type: treat as a user token.
  session.tokens.token = jwt
  session.context.authMode = "user"
}

export function resolveClientIp(req: Request, trustProxy: boolean) {
  if (trustProxy) {
    const xff = req.headers["x-forwarded-for"]
    const first = (Array.isArray(xff) ? xff[0] : xff || "").split(",")[0].trim()
    if (first) return first
    const xrip = req.headers["x-real-ip"]
    if (typeof xrip === "string" && xrip.trim()) return xrip.trim()
  }
  return String(req.socket?.remoteAddress || "").replace(/^::ffff:/, "")
}

// Scopes granted to a token: the JWT `data.scope` claim (space separated).
// Absent (API keys, legacy user tokens) means full access. A test-only
// override lets the scope check be exercised without minting scoped tokens.
export function scopesForToken(jwt: string): Set<string> {
  if (process.env.NODE_ENV === "test" && process.env.ETHORA_MCP_TEST_FORCE_SCOPE) {
    return parseScopes(process.env.ETHORA_MCP_TEST_FORCE_SCOPE)
  }
  const payload = decodeJwtPayload(jwt)
  return parseScopes(payload?.data?.scope ?? payload?.scope)
}

async function bootstrapAppJwt() {
  if (appConfig.appJwt) return
  const domainName = String(process.env.ETHORA_APP_DOMAIN_NAME || "").trim()
  if (!domainName) {
    console.error("[mcp-http] ETHORA_APP_JWT is empty and ETHORA_APP_DOMAIN_NAME is not set: login/register tools will fail until one is configured.")
    return
  }
  const delays = [0, 2000, 5000, 10000, 20000]
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]))
    try {
      appConfig.appJwt = await fetchAppJwtByDomainName(domainName)
      console.error(`[mcp-http] App JWT bootstrapped from ${appConfig.apiUrl} for domainName=${domainName}`)
      return
    } catch (e: any) {
      console.error(`[mcp-http] App JWT bootstrap attempt ${i + 1}/${delays.length} failed: ${e?.message || e}`)
    }
  }
  console.error("[mcp-http] App JWT bootstrap failed. Set ETHORA_APP_JWT explicitly or check ETHORA_API_URL / ETHORA_APP_DOMAIN_NAME. Server is up, but login/register tools will fail.")
}

export async function startHttpServer(opts: HttpServerOptions) {
  setHostedMode(true)

  const host = String(process.env.ETHORA_MCP_HTTP_HOST || "127.0.0.1")
  const port = envInt("ETHORA_MCP_HTTP_PORT", 3030)
  const sessionTtlMs = envInt("ETHORA_MCP_SESSION_TTL_MS", 4 * 60 * 60 * 1000)
  const trustProxy = envBool("ETHORA_MCP_TRUST_PROXY")
  const publicUrl = String(process.env.ETHORA_MCP_PUBLIC_URL || "").trim().replace(/\/+$/, "") || `http://${host}:${port}`
  const endpoint = publicUrl.endsWith("/mcp") ? publicUrl : `${publicUrl}/mcp`
  const publicBase = endpoint.replace(/\/mcp$/, "")
  // Let tools (connectorUrl) see the resolved public URL even when it was derived.
  if (!process.env.ETHORA_MCP_PUBLIC_URL) process.env.ETHORA_MCP_PUBLIC_URL = endpoint
  const authIssuer = String(process.env.ETHORA_MCP_AUTH_ISSUER || "").trim().replace(/\/+$/, "")
  const oauthEndpoint = `${publicBase}/mcp/oauth`
  const prmUrl = `${publicBase}/.well-known/oauth-protected-resource/mcp/oauth`

  const sessions = new Map<string, Entry>()

  const discovery = () => ({
    name: opts.name,
    version: opts.version,
    endpoint,
    transport: "streamable-http",
    protocol: "mcp",
    auth: ["bearer", "tools:ethora-user-login/ethora-user-register", "personal-url"],
    personalUrl: `${publicBase}/mcp/k/<api-key>`,
    ...(authIssuer
      ? {
          oauthEndpoint,
          oauth: { authorizationServer: authIssuer, protectedResourceMetadata: prmUrl, scopes: [...ALL_SCOPES] },
        }
      : {}),
    // Public API base for humans/agents reading this document; the server itself
    // may talk to the API over loopback, which must not leak here.
    apiUrl: appConfig.publicApiUrl || appConfig.apiUrl,
    docs: "https://github.com/dappros/ethora-mcp-server#readme",
  })

  const protectedResourceMetadata = () => ({
    resource: oauthEndpoint,
    authorization_servers: [authIssuer],
    bearer_methods_supported: ["header"],
    scopes_supported: [...ALL_SCOPES],
    resource_name: opts.name,
    resource_documentation: "https://github.com/dappros/ethora-mcp-server#readme",
  })

  const app = express()
  app.disable("x-powered-by")
  if (trustProxy) app.set("trust proxy", true)
  app.use(cors({ origin: "*", exposedHeaders: ["Mcp-Session-Id", "WWW-Authenticate"], allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "Mcp-Protocol-Version", "Last-Event-ID"] }))
  app.use(express.json({ limit: "4mb" }))

  app.get("/", (_req, res) => { res.json(discovery()) })
  app.get("/.well-known/mcp", (_req, res) => { res.json(discovery()) })
  app.get("/healthz", (_req, res) => { res.json({ ok: true, sessions: sessions.size, version: opts.version, appJwtReady: Boolean(appConfig.appJwt), oauth: Boolean(authIssuer) }) })

  const prmHandler = (_req: Request, res: Response) => {
    if (!authIssuer) { res.status(404).json({ error: "oauth_not_configured" }); return }
    res.json(protectedResourceMetadata())
  }
  app.get("/.well-known/oauth-protected-resource", prmHandler)
  app.get("/.well-known/oauth-protected-resource/mcp/oauth", prmHandler)

  const closeEntry = async (sid: string, reason: string) => {
    const entry = sessions.get(sid)
    if (!entry) return
    sessions.delete(sid)
    try { await entry.transport.close() } catch { /* ignore */ }
    try { await entry.server.close() } catch { /* ignore */ }
    console.error(`[mcp-http] session ${sid} closed (${reason}); active=${sessions.size}`)
  }

  const unauthorized = (res: Response, hadToken: boolean, description?: string) => {
    const parts = [`Bearer realm="ethora"`, `resource_metadata="${prmUrl}"`]
    if (hadToken) parts.push(`error="invalid_token"`)
    if (description) parts.push(`error_description="${description.replace(/"/g, "'")}"`)
    res.setHeader("WWW-Authenticate", parts.join(", "))
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: hadToken ? "Unauthorized: token rejected by the Ethora API" : "Unauthorized: Bearer token required" },
      id: null,
    })
  }

  // Validate the bearer token once per session (cached for a few minutes) by
  // asking the API who it belongs to. Returns false when the API rejects it.
  const validateOAuthToken = async (session: SessionContext, jwt: string): Promise<boolean> => {
    const now = Date.now()
    const cached = session.oauth
    if (cached && cached.validatedToken === jwt && now - cached.validatedAt < OAUTH_VALIDATION_TTL_MS) return true
    try {
      await runWithSession(session, () => usersMe())
    } catch (e: any) {
      const status = e?.response?.status
      // Only auth failures mean "bad token"; transient API errors keep a
      // previously validated token usable.
      if (status === 401 || status === 403 || status === 400) return false
      if (cached && cached.validatedToken === jwt) return true
      console.error(`[mcp-http] oauth token validation failed: ${status || e?.code || e?.message || "unknown error"}`)
      return false
    }
    session.oauth = { validatedToken: jwt, validatedAt: now, scopes: scopesForToken(jwt) }
    return true
  }

  const handleMcp = async (req: Request, res: Response, kind: EntryKind, pathKey?: string) => {
    if (kind === "oauth" && !authIssuer) {
      res.status(404).json({ jsonrpc: "2.0", error: { code: -32000, message: "OAuth entry point not configured (ETHORA_MCP_AUTH_ISSUER)" }, id: null })
      return
    }

    const headerJwt = extractBearer(req.headers["authorization"] as string | undefined)
    if (kind === "oauth" && !headerJwt) {
      unauthorized(res, false)
      return
    }

    const sidHeader = req.headers["mcp-session-id"]
    const sid = Array.isArray(sidHeader) ? sidHeader[0] : sidHeader
    let entry = sid ? sessions.get(sid) : undefined
    let fresh = false

    if (!entry) {
      if (req.method === "POST" && !sid && isInitializeRequest(req.body)) {
        const session = createSessionContext()
        session.entry = kind
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => session.id,
          onsessioninitialized: (id) => {
            sessions.set(id, entry as Entry)
            console.error(`[mcp-http] session ${id} opened (${kind}) from ${session.clientIp || "?"}; active=${sessions.size}`)
          },
        })
        transport.onclose = () => { if (sessions.get(session.id) === entry) sessions.delete(session.id) }
        // Instructions follow how identity arrives: OAuth token, a key in the
        // path or a Bearer header (already authenticated), or nothing (open).
        const profile = kind === "oauth" ? "oauth" : (pathKey || headerJwt) ? "authenticated" : "open"
        const server = opts.buildServer(profile)
        if (kind === "oauth") hideOAuthTools(server)
        entry = { server, transport, session }
        fresh = true
      } else {
        res.status(sid ? 404 : 400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: sid ? "Session not found or expired. Re-initialize." : "Bad request: missing Mcp-Session-Id or not an initialize request." },
          id: null,
        })
        return
      }
    }

    const { session, transport, server } = entry
    if (session.entry !== kind) {
      // A session id from one entry point must not be reused on another.
      res.status(404).json({ jsonrpc: "2.0", error: { code: -32000, message: "Session not found for this endpoint. Re-initialize." }, id: null })
      return
    }
    session.lastSeenAt = Date.now()
    session.clientIp = resolveClientIp(req, trustProxy)

    // Personal URL: the key in the path acts as the bearer; an explicit
    // Authorization header (applied afterwards) still wins.
    if (pathKey) applyBearerToSession(session, `Bearer ${pathKey}`)
    applyBearerToSession(session, req.headers["authorization"] as string | undefined)

    if (kind === "oauth") {
      const ok = await validateOAuthToken(session, headerJwt)
      if (!ok) {
        if (fresh) { try { await server.close() } catch { /* ignore */ } }
        unauthorized(res, true)
        return
      }
    }

    if (fresh) await server.connect(transport)

    await runWithSession(session, () => transport.handleRequest(req, res, req.body))

    if (req.method === "DELETE") {
      await closeEntry(session.id, "client DELETE")
    }
  }

  const route = (kind: EntryKind, keyFrom?: (req: Request) => string) => (req: Request, res: Response) => {
    const key = keyFrom ? keyFrom(req) : undefined
    handleMcp(req, res, kind, key).catch((e) => {
      // Never log the request URL or headers here: personal URLs carry the key.
      console.error(`[mcp-http] request failed (${kind}): ${e?.message || e}`)
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null })
      }
    })
  }

  app.all("/mcp", route("open"))
  app.all("/mcp/k/:key", route("open", (req) => String(req.params.key || "")))
  app.all("/mcp/oauth", route("oauth"))

  const sweeper = setInterval(() => {
    const now = Date.now()
    for (const [sid, e] of sessions) {
      if (now - e.session.lastSeenAt > sessionTtlMs) void closeEntry(sid, "idle timeout")
    }
  }, Math.min(60_000, sessionTtlMs))
  sweeper.unref()

  await new Promise<void>((resolve, reject) => {
    const srv = app.listen(port, host, () => resolve())
    srv.on("error", reject)
  })
  console.error(`[mcp-http] Ethora MCP Server ${opts.version} listening on http://${host}:${port}/mcp (public: ${endpoint}, api: ${appConfig.apiUrl}, trustProxy=${trustProxy}, sessionTtlMs=${sessionTtlMs}, oauth=${authIssuer ? oauthEndpoint : "off"})`)

  // Listen first so health checks answer while the App JWT is being fetched.
  await bootstrapAppJwt()
}
