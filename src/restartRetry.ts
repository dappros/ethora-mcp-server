import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios"

// A server restart or update makes the Ethora API unavailable for a few
// seconds to a minute. The API answers 503 { code: "SERVER_RESTARTING" } with
// Retry-After while it shuts down cleanly; the proxy in front of it answers
// 503 { code: "SERVER_UNAVAILABLE" } while it is down. A bare 502 / 503 / 504
// or a refused / reset connection can also show up for a moment.
//
// Reads (GET / HEAD) are retried here, waiting what Retry-After asks for, for
// up to RETRY_BUDGET_MS in total. Anything else is not retried, since it may
// have taken effect; the tool result then says to wait and call again (see
// restartErrorMessage, used by fail() in mcpResponse.ts).

export const RESTART_CODES = ["SERVER_RESTARTING", "SERVER_UNAVAILABLE"] as const
export type RestartCode = (typeof RESTART_CODES)[number]

export const DEFAULT_RETRY_AFTER_MS = 3000
export const MAX_RETRY_AFTER_MS = 10_000
export const RETRY_BUDGET_MS = 45_000

const CONNECTION_ERRORS = new Set(["ECONNREFUSED", "ECONNRESET"])

/** Retry-After as milliseconds: seconds or an HTTP date, default 3 s, at most 10 s. */
export function retryAfterMs(header: unknown, now = Date.now()): number {
  const raw = Array.isArray(header) ? header[0] : header
  const s = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : ""
  let ms = NaN
  if (/^\d+(\.\d+)?$/.test(s)) ms = Number(s) * 1000
  else if (s) {
    const at = Date.parse(s)
    if (Number.isFinite(at)) ms = at - now
  }
  if (!Number.isFinite(ms) || ms <= 0) ms = DEFAULT_RETRY_AFTER_MS
  return Math.min(ms, MAX_RETRY_AFTER_MS)
}

/** The restart code an error stands for, with the wait the server asked for; null for anything else. */
export function classifyRestart(error: unknown, now = Date.now()): { code: RestartCode; waitMs: number } | null {
  const e = error as any
  if (!e || typeof e !== "object") return null
  const res = e.response
  if (res && typeof res.status === "number") {
    const status = res.status
    const apiCode = typeof res.data?.code === "string" ? res.data.code : undefined
    const headers = res.headers || {}
    const waitMs = retryAfterMs(typeof headers.get === "function" ? headers.get("retry-after") : headers["retry-after"], now)
    if (status === 503 && apiCode === "SERVER_RESTARTING") return { code: "SERVER_RESTARTING", waitMs }
    if (status === 503 && (apiCode === "SERVER_UNAVAILABLE" || !apiCode)) return { code: "SERVER_UNAVAILABLE", waitMs }
    if (status === 502 || status === 504) return { code: "SERVER_UNAVAILABLE", waitMs }
    return null
  }
  if (typeof e.code === "string" && CONNECTION_ERRORS.has(e.code)) return { code: "SERVER_UNAVAILABLE", waitMs: DEFAULT_RETRY_AFTER_MS }
  return null
}

export function restartErrorMessage(code: RestartCode): string {
  return `The Ethora server is restarting or updating (${code}). Wait about a minute and call the tool again.`
}

type RetryState = { startedAt: number; attempts: number }
type ConfigWithRetry = InternalAxiosRequestConfig & { _ethoraRestart?: RetryState }

export type RestartRetryOptions = {
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  budgetMs?: number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Adds the retry to an axios instance. Errors that are restarts but are not
 * retried (a write, or the budget is spent) get `ethoraRestart = { code }`, so
 * the tool result can say what happened.
 */
export function installRestartRetry(client: AxiosInstance, opts: RestartRetryOptions = {}) {
  const sleep = opts.sleep || defaultSleep
  const now = opts.now || Date.now
  const budget = opts.budgetMs ?? RETRY_BUDGET_MS
  return client.interceptors.response.use(null, async (error: AxiosError) => {
    const hit = classifyRestart(error, now())
    if (!hit) return Promise.reject(error)
    const config = error.config as ConfigWithRetry | undefined
    const method = String(config?.method || "get").toLowerCase()
    if (!config || (method !== "get" && method !== "head")) {
      ;(error as any).ethoraRestart = { code: hit.code }
      return Promise.reject(error)
    }
    const state = config._ethoraRestart || (config._ethoraRestart = { startedAt: now(), attempts: 0 })
    const elapsed = now() - state.startedAt
    if (elapsed + hit.waitMs > budget) {
      ;(error as any).ethoraRestart = { code: hit.code, attempts: state.attempts }
      return Promise.reject(error)
    }
    state.attempts += 1
    await sleep(hit.waitMs)
    return client(config)
  })
}
