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
    // Prefer the API's own error text over axios' generic "Request failed with status code N".
    const apiMsg = typeof data?.error === "string" ? data.error : typeof data?.message === "string" ? data.message : undefined
    const msg = apiMsg || e.message || "request failed"
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

// Locally thrown errors carry no HTTP status and no API code, so without a match
// here they fall through to INTERNAL_ERROR. That is wrong for what are ordinary
// validation, precondition and auth problems, and directory reviews single out
// connectors that report internal failures on valid input.
function inferCodeFromMessage(msg: string) {
  const m = String(msg || "")
  // auth mode
  if (m.includes("Not logged in")) return "AUTH_USER_REQUIRED"
  if (m.includes("requires app-token or B2B auth")) return "AUTH_APP_OR_B2B_REQUIRED"
  if (m.includes("requires app-token auth")) return "AUTH_APP_REQUIRED"
  if (m.includes("requires user auth")) return "AUTH_USER_REQUIRED"
  if (m.includes("requires B2B auth")) return "AUTH_B2B_REQUIRED"
  // app context. Both wordings exist in the tool layer; match either.
  if (m.includes("No current app selected") || m.includes("No app selected")) return "APP_NOT_SELECTED"
  if (m.includes("appId is required")) return "VALIDATION_ERROR"
  // room/message addressing
  if (m.includes("A room is required")) return "VALIDATION_ERROR"
  if (m.includes("Cannot determine the appId for this room")) return "VALIDATION_ERROR"
  if (m.includes("aroundStanzaId or aroundMessageId")) return "VALIDATION_ERROR"
  // missing input the schema cannot express
  if (m.includes("No bundle supplied")) return "VALIDATION_ERROR"
  // server/session configuration rather than a bad request
  if (/\bETHORA_[A-Z_]+ is (not configured|empty)/.test(m)) return "CONFIG_REQUIRED"
  // credential families. Match the shape rather than each wording, so new
  // call sites inherit the classification instead of falling to INTERNAL_ERROR.
  if (/appToken is missing|no appToken (available|is configured)|No appToken stored|no app token was created/i.test(m)) return "AUTH_APP_REQUIRED"
  if (/b2bToken is missing|no b2bToken is configured/i.test(m)) return "AUTH_B2B_REQUIRED"
  if (/does not accept app-token auth/i.test(m)) return "AUTH_USER_OR_B2B_REQUIRED"
  // caller-fixable argument problems
  if (/Room id is empty|Room not found in app/i.test(m)) return "VALIDATION_ERROR"
  if (/needs appId|needs the app\b/i.test(m)) return "VALIDATION_ERROR"
  if (/does not support step tool/i.test(m)) return "VALIDATION_ERROR"
  // asked for something the hosted surface deliberately does not allow
  if (/is fixed on a hosted MCP server/i.test(m)) return "UNSUPPORTED_ON_HOSTED"
  // preconditions: the call is well formed but something has to exist first
  if (m.includes("No bot instance of agent")) return "PRECONDITION_REQUIRED"
  if (m.includes("timeout")) return "TIMEOUT"
  return undefined
}

// Some backend errors surface an internal sentinel rather than a sentence.
// Replace the known ones with something a caller can act on; the original is
// still carried in `details`.
const RAW_MESSAGE_REWRITES: Array<[RegExp, string]> = [
  [/^!refreshRecord$/, "The session credential is no longer valid. It may have been revoked or expired. Authenticate again."],
]

function humaniseMessage(msg: string): string {
  const m = String(msg || "")
  for (const [pattern, replacement] of RAW_MESSAGE_REWRITES) {
    if (pattern.test(m.trim())) return replacement
  }
  return m
}

function inferHint(code: string | undefined, httpStatus: number | undefined, msg: string) {
  if (code === "AUTH_APP_OR_B2B_REQUIRED") return "Call `ethora-auth-use-app` (app token) or `ethora-auth-use-b2b` (B2B token). `ethora-status` shows the active mode."
  // The API returns this for a token of the wrong kind for the route. Without a
  // hint the caller only sees "Invalid token type" and cannot tell what to switch to.
  if (code === "INVALID_TOKEN_TYPE") return "The active token is the wrong kind for this route. Agents, rooms and source routes want user auth with an app selected (`ethora-auth-use-user`, then `ethora-app-select`); bot and token-admin routes want app-token or B2B auth (`ethora-auth-use-app` / `ethora-auth-use-b2b`). Check the current mode with `ethora-status`."
  if (code === "REFRESH_RECORD_NOT_FOUND") return "The session credential was revoked or expired. Call `ethora-user-login` again, or reconnect with a valid API key."
  if (code === "PRECONDITION_REQUIRED") return "Something this call depends on does not exist yet. Read the message for the missing object and create it first."
  if (code === "AUTH_USER_OR_B2B_REQUIRED") return "This route rejects app tokens. Call `ethora-auth-use-user` (then `ethora-user-login`) or `ethora-auth-use-b2b`."
  if (code === "UNSUPPORTED_ON_HOSTED") return "This is not available on the hosted server. Run the stdio server locally (`npx -y @ethora/mcp-server`) if you need it."
  if (code === "FLOWS_INVALID") return "The flows YAML did not compile; `details` lists what failed and where. Nothing was saved. Call `fetch` with id `doc:agent-flows` for the authoring format, fix the script and retry."
  if (code === "CONFIG_REQUIRED") return "The server or session is missing configuration named in the message. Set it via env, or call `ethora-configure` for per-session credentials. `ethora-doctor` lists what is missing."
  if (code === "VALIDATION_ERROR") return "The message names the argument to fix. Correct it and call again; `search`/`fetch` have the full input reference for every tool."
  if (code === "APP_NOT_SELECTED") return "Call `ethora-app-select` to set the current appId (and optionally appToken)."
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
  const message = humaniseMessage(parsed.message)
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


