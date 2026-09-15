import { randomUUID } from "node:crypto"
import express, { Request, Response } from "express"
import cors from "cors"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { appConfig } from "./config.js"
import { createSessionContext, runWithSession, setHostedMode, SessionContext } from "./session.js"
import { fetchAppJwtByDomainName } from "./apiClientDappros.js"

type Entry = {
  server: McpServer
  transport: StreamableHTTPServerTransport
  session: SessionContext
}

export type HttpServerOptions = {
  name: string
  version: string
  buildServer: () => McpServer
}

function envInt(name: string, fallback: number) {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function envBool(name: string) {
  return String(process.env[name] ?? "").trim().toLowerCase() === "true"
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".")
    if (parts.length < 2) return null
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    return JSON.parse(json)
  } catch {
    return null
  }
}

// Apply an `Authorization: Bearer <jwt>` header to the session. The token is
// only decoded (never verified) to learn which auth mode it belongs to; the
// Ethora API verifies it on every call. Re-applied on every request so a
// long-lived client keeps working after its session was evicted and re-created.
export function applyBearerToSession(session: SessionContext, authorization: string | undefined) {
  const raw = String(authorization || "").trim()
  if (!raw) return
  const m = raw.match(/^(?:Bearer|JWT)\s+(.+)$/i)
  const jwt = (m ? m[1] : raw).trim()
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

  const sessions = new Map<string, Entry>()

  const discovery = () => ({
    name: opts.name,
    version: opts.version,
    endpoint,
    transport: "streamable-http",
    protocol: "mcp",
    auth: ["bearer", "tools:ethora-user-login/ethora-user-register"],
    apiUrl: appConfig.apiUrl,
    docs: "https://github.com/dappros/ethora-mcp-server#readme",
  })

  const app = express()
  app.disable("x-powered-by")
  if (trustProxy) app.set("trust proxy", true)
  app.use(cors({ origin: "*", exposedHeaders: ["Mcp-Session-Id"], allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "Mcp-Protocol-Version", "Last-Event-ID"] }))
  app.use(express.json({ limit: "4mb" }))

  app.get("/", (_req, res) => { res.json(discovery()) })
  app.get("/.well-known/mcp", (_req, res) => { res.json(discovery()) })
  app.get("/healthz", (_req, res) => { res.json({ ok: true, sessions: sessions.size, version: opts.version, appJwtReady: Boolean(appConfig.appJwt) }) })

  const closeEntry = async (sid: string, reason: string) => {
    const entry = sessions.get(sid)
    if (!entry) return
    sessions.delete(sid)
    try { await entry.transport.close() } catch { /* ignore */ }
    try { await entry.server.close() } catch { /* ignore */ }
    console.error(`[mcp-http] session ${sid} closed (${reason}); active=${sessions.size}`)
  }

  const handleMcp = async (req: Request, res: Response) => {
    const sidHeader = req.headers["mcp-session-id"]
    const sid = Array.isArray(sidHeader) ? sidHeader[0] : sidHeader
    let entry = sid ? sessions.get(sid) : undefined

    if (!entry) {
      if (req.method === "POST" && !sid && isInitializeRequest(req.body)) {
        const session = createSessionContext()
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => session.id,
          onsessioninitialized: (id) => {
            sessions.set(id, entry as Entry)
            console.error(`[mcp-http] session ${id} opened from ${session.clientIp || "?"}; active=${sessions.size}`)
          },
        })
        transport.onclose = () => { if (sessions.get(session.id) === entry) sessions.delete(session.id) }
        const server = opts.buildServer()
        entry = { server, transport, session }
        await server.connect(transport)
      } else {
        res.status(sid ? 404 : 400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: sid ? "Session not found or expired. Re-initialize." : "Bad request: missing Mcp-Session-Id or not an initialize request." },
          id: null,
        })
        return
      }
    }

    const { session, transport } = entry
    session.lastSeenAt = Date.now()
    session.clientIp = resolveClientIp(req, trustProxy)
    applyBearerToSession(session, req.headers["authorization"] as string | undefined)

    await runWithSession(session, () => transport.handleRequest(req, res, req.body))

    if (req.method === "DELETE") {
      await closeEntry(session.id, "client DELETE")
    }
  }

  app.all("/mcp", (req, res) => {
    handleMcp(req, res).catch((e) => {
      console.error("[mcp-http] request failed:", e)
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null })
      }
    })
  })

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
  console.error(`[mcp-http] Ethora MCP Server ${opts.version} listening on http://${host}:${port}/mcp (public: ${endpoint}, api: ${appConfig.apiUrl}, trustProxy=${trustProxy}, sessionTtlMs=${sessionTtlMs})`)

  // Listen first so health checks answer while the App JWT is being fetched.
  await bootstrapAppJwt()
}
