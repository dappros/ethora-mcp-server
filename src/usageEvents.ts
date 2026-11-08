// Usage events for the hosted server: one record per session open and per
// tool call, posted in batches to the API (POST /internal/mcp/events, shared
// INTERNAL_REQUESTS_SECRET) where the weekly activity report reads them.
//
// Why not the API's own request log: it only sees the API calls a tool makes,
// so it misses sessions that never call a tool (most crawler and Claude.ai
// auto-connect sessions), tool calls refused before any API request
// (NO_APP_YET, validation, scope) and the assistant client's name. Those are
// exactly the facts needed to tell adoption from noise.
//
// Fire-and-forget: the queue is bounded, flushes on a timer or when full, and
// a failed post drops its batch after one retry. Nothing here can slow or
// fail a tool call. Disabled (with one log line) when no secret is configured.
import { appConfig, MCP_VERSION } from "./config.js"

export type UsageEvent = {
  kind: "session_open" | "tool_call"
  ts: string
  serverVersion: string
  sessionId: string
  entry: "open" | "key" | "oauth" | ""
  client: string
  userId: string
  appId: string
  authMode: "user" | "app" | "b2b" | ""
  tool?: string
  ok?: boolean
  code?: string
  httpStatus?: number
  durationMs?: number
}

export type UsageSinkOptions = {
  endpoint: string
  secret: string
  flushMs?: number
  batchSize?: number
  maxQueue?: number
  fetchImpl?: typeof fetch
  log?: (line: string) => void
}

export class UsageSink {
  private queue: UsageEvent[] = []
  private timer: NodeJS.Timeout | null = null
  private inflight = false
  readonly stats = { queued: 0, sent: 0, dropped: 0, failedPosts: 0 }
  private readonly opts: Required<Omit<UsageSinkOptions, "fetchImpl" | "log">> & { fetchImpl: typeof fetch; log: (line: string) => void }

  constructor(opts: UsageSinkOptions) {
    this.opts = {
      endpoint: opts.endpoint,
      secret: opts.secret,
      flushMs: opts.flushMs ?? 5000,
      batchSize: opts.batchSize ?? 100,
      maxQueue: opts.maxQueue ?? 2000,
      fetchImpl: opts.fetchImpl ?? fetch,
      log: opts.log ?? ((line) => console.error(line)),
    }
  }

  get enabled(): boolean {
    return Boolean(this.opts.endpoint && this.opts.secret)
  }

  get pending(): number {
    return this.queue.length
  }

  /** Enqueue one event. Never throws; drops the oldest when the queue is full. */
  record(event: UsageEvent): void {
    if (!this.enabled) return
    if (this.queue.length >= this.opts.maxQueue) {
      this.queue.shift()
      this.stats.dropped += 1
    }
    this.queue.push(event)
    this.stats.queued += 1
    if (this.queue.length >= this.opts.batchSize) void this.flush()
    else if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.opts.flushMs)
      this.timer.unref?.()
    }
  }

  /** Post everything queued (in batches). Safe to call at any time. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.inflight || !this.queue.length || !this.enabled) return
    this.inflight = true
    try {
      while (this.queue.length) {
        const batch = this.queue.splice(0, this.opts.batchSize)
        const ok = (await this.post(batch)) || (await this.post(batch))
        if (ok) this.stats.sent += batch.length
        else {
          this.stats.dropped += batch.length
          this.stats.failedPosts += 1
          break // the API is unwell; keep the rest for the next timer
        }
      }
    } finally {
      this.inflight = false
      if (this.queue.length && !this.timer) {
        this.timer = setTimeout(() => void this.flush(), this.opts.flushMs)
        this.timer.unref?.()
      }
    }
  }

  private async post(events: UsageEvent[]): Promise<boolean> {
    try {
      const res = await this.opts.fetchImpl(this.opts.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": this.opts.secret, "x-ethora-client": `mcp/${MCP_VERSION}` },
        body: JSON.stringify({ events }),
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) return true
      this.opts.log(`[mcp-usage] POST ${this.opts.endpoint} -> ${res.status}`)
      return false
    } catch (e: any) {
      this.opts.log(`[mcp-usage] POST ${this.opts.endpoint} failed: ${e?.message || e}`)
      return false
    }
  }
}

/**
 * The internal API base for the events endpoint: the configured API URL
 * without its `/v1` suffix (internal routes are mounted at the root).
 */
export function internalEventsEndpoint(apiUrl: string): string {
  const base = String(apiUrl || "").trim().replace(/\/+$/, "").replace(/\/v[12]$/, "")
  return base ? `${base}/internal/mcp/events` : ""
}

/** `user:<id>` identity keys (account memory) carry the user id this way. */
export function userIdFromIdentityKey(key: string | undefined): string {
  const m = /^user:([0-9a-f]{24})$/i.exec(String(key || ""))
  return m ? m[1].toLowerCase() : ""
}

/**
 * Pull ok / code / httpStatus out of a tool result. Tool results are the
 * JSON envelope from mcpResponse.ts serialised into the first text block;
 * anything else counts as a success with no code.
 */
export function outcomeFromToolResult(result: any): { ok: boolean; code?: string; httpStatus?: number } {
  const isError = result?.isError === true
  const text = result?.content?.find?.((c: any) => c?.type === "text")?.text
  if (typeof text === "string" && text.startsWith("{")) {
    try {
      const env = JSON.parse(text)
      if (env && typeof env === "object" && "ok" in env) {
        const code = typeof env.error?.code === "string" ? env.error.code : undefined
        const httpStatus = typeof env.error?.httpStatus === "number" ? env.error.httpStatus : undefined
        return { ok: env.ok === true && !isError, code, httpStatus }
      }
    } catch {
      /* not an envelope */
    }
  }
  return { ok: !isError }
}

let sink: UsageSink | null = null

/** The process-wide sink, built from config on first use (null when disabled). */
export function usageSink(): UsageSink | null {
  if (sink) return sink.enabled ? sink : null
  sink = new UsageSink({ endpoint: internalEventsEndpoint(appConfig.apiUrl), secret: appConfig.internalSecret })
  if (!sink.enabled) console.error("[mcp-usage] disabled: ETHORA_MCP_INTERNAL_SECRET is not set, usage events are not recorded")
  return sink.enabled ? sink : null
}

/** For tests: replace the process-wide sink. */
export function setUsageSink(next: UsageSink | null) {
  sink = next
}
