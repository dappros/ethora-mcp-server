export type McpEnvelope = {
  ok: boolean
  ts: string
  meta?: Record<string, any>
  data?: any
  error?: {
    code?: string
    message: string
    kind?: string
    httpStatus?: number
    requestId?: string
    hint?: string
    details?: any
  }
}

function isoNow() {
  return new Date().toISOString()
}

function parseAxiosishError(error: unknown): { message: string; httpStatus?: number; details?: any; requestId?: string; code?: string } {
  if (error && typeof error === "object" && "response" in error) {
    const e = error as any
    const httpStatus = e.response?.status
    const data = e.response?.data
    const msg = e.message || "request failed"
    const headers = e.response?.headers || {}
    const requestId =
      headers["x-request-id"] ||
      headers["x-requestid"] ||
      headers["x-correlation-id"] ||
      data?.requestId
    const code = typeof data?.code === "string" ? data.code : undefined
    return { message: msg, httpStatus, details: data, requestId, code }
  }
  if (error instanceof Error) return { message: error.message }
  return { message: String(error) }
}

function inferCodeFromMessage(msg: string) {
  const m = String(msg || "")
  if (m.includes("requires app-token auth")) return "AUTH_APP_REQUIRED"
  if (m.includes("requires user auth")) return "AUTH_USER_REQUIRED"
  if (m.includes("requires B2B auth")) return "AUTH_B2B_REQUIRED"
  if (m.includes("No current app selected")) return "APP_NOT_SELECTED"
  if (m.includes("appId is required")) return "VALIDATION_ERROR"
  if (m.includes("timeout")) return "TIMEOUT"
  return undefined
}

function inferHint(code: string | undefined, httpStatus: number | undefined, msg: string) {
  if (code === "AUTH_APP_REQUIRED") return "Call `ethora-auth-use-app` and set appToken via `ethora-app-select`."
  if (code === "AUTH_USER_REQUIRED") return "Call `ethora-auth-use-user` then `ethora-user-login`."
  if (code === "AUTH_B2B_REQUIRED") return "Call `ethora-auth-use-b2b` and set `ETHORA_B2B_TOKEN` (or `ethora-configure`)."
  if (code === "APP_NOT_SELECTED") return "Call `ethora-app-select` to set the current appId (and optionally appToken)."
  if (code === "TIMEOUT") return "Retry, or increase the tool timeout/poll interval if supported."
  if (httpStatus === 401) return "Check credentials/token. Use `ethora-status` and `ethora-help` to fix auth."
  if (httpStatus === 403) return "Token is valid but not permitted. Verify app/user permissions."
  if (httpStatus === 422) return "Validate inputs (required fields, ids, URL formats)."
  if (httpStatus === 404) return "Check resource ids/app context; it may already be deleted or not exist."
  if (String(msg || "").includes("ETHORA_API_URL")) return "Set `ETHORA_API_URL` (or call `ethora-configure`)."
  return "Run `ethora-help` or `ethora-doctor` for recommended next steps."
}

export function ok(data: any, meta?: Record<string, any>): McpEnvelope {
  return { ok: true, ts: isoNow(), meta, data }
}

export function fail(error: unknown, meta?: Record<string, any>): McpEnvelope {
  const parsed = parseAxiosishError(error)
  const message = parsed.message
  const httpStatus = parsed.httpStatus
  const code = parsed.code || inferCodeFromMessage(message) || (httpStatus ? `HTTP_${httpStatus}` : "INTERNAL_ERROR")
  const hint = inferHint(code, httpStatus, message)
  return {
    ok: false,
    ts: isoNow(),
    meta,
    error: {
      code,
      message,
      httpStatus,
      requestId: parsed.requestId,
      hint,
      details: parsed.details,
    },
  }
}


