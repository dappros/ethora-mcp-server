import { isHostedMode } from "./session.js"

// Public base of the hosted server (ETHORA_MCP_PUBLIC_URL with a trailing
// `/mcp` stripped). Empty when not running in hosted mode.
export function publicBase(): string {
  if (!isHostedMode()) return ""
  const raw = String(process.env.ETHORA_MCP_PUBLIC_URL || "").trim().replace(/\/+$/, "")
  if (!raw) return ""
  return raw.replace(/\/mcp$/, "")
}

// Personal connector URL: the API key travels in the path, so URL-only MCP
// clients (Claude.ai / ChatGPT custom connectors) authenticate every
// conversation without a login step. Treat like a password.
export function connectorUrl(token: string): string {
  const base = publicBase()
  const t = String(token || "").trim()
  if (!base || !t) return ""
  return `${base}/mcp/k/${encodeURIComponent(t)}`
}

export const CONNECTOR_URL_NOTE =
  "Paste this URL as a custom connector in Claude.ai (Settings > Connectors > Add custom connector) or ChatGPT; it authenticates every conversation without logging in. Treat it like a password; revoke the key to invalidate it."
