export type McpEnvelope = {
  ok: boolean
  ts: string
  meta?: Record<string, any>
  data?: any
  error?: {
    message: string
    kind?: string
    status?: number
    details?: any
  }
}

function isoNow() {
  return new Date().toISOString()
}

function parseAxiosishError(error: unknown): { message: string; status?: number; details?: any } {
  if (error && typeof error === "object" && "response" in error) {
    const e = error as any
    const status = e.response?.status
    const data = e.response?.data
    const msg = e.message || "request failed"
    return { message: msg, status, details: data }
  }
  if (error instanceof Error) return { message: error.message }
  return { message: String(error) }
}

export function ok(data: any, meta?: Record<string, any>): McpEnvelope {
  return { ok: true, ts: isoNow(), meta, data }
}

export function fail(error: unknown, meta?: Record<string, any>): McpEnvelope {
  const parsed = parseAxiosishError(error)
  return {
    ok: false,
    ts: isoNow(),
    meta,
    error: {
      message: parsed.message,
      status: parsed.status,
      details: parsed.details,
    },
  }
}


