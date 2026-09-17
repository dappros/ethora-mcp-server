import { createRequire } from "node:module"

// Read from package.json rather than re-declaring the version here: index.ts
// holds the stamped `SERVER_VERSION` (scripts/sync-version.mjs edits that one
// file), and importing index.ts from the API client would be circular.
const pkg = createRequire(import.meta.url)("../package.json") as { version?: string }
export const MCP_VERSION: string = String(pkg?.version || "unknown")

export function normalizeApiUrl(input: string): string {
  const raw = String(input || "").trim()
  if (!raw) return "https://api.chat.ethora.com/v1"

  const s = raw.replace(/\/+$/, "")
  if (s.endsWith("/v1") || s.endsWith("/v2")) return s

  // Default to the v1 REST API if caller provided only a base host like https://api.chat.ethora.com
  return `${s}/v1`
}

export const appConfig = {
  // Prefer ETHORA_API_URL (full), fall back to ETHORA_BASE_URL (host), then the public Ethora Cloud API.
  apiUrl: normalizeApiUrl(
    process.env.ETHORA_API_URL ??
      process.env.ETHORA_BASE_URL ??
      "https://api.chat.ethora.com/v1"
  ),

  // For login/register endpoints Ethora expects an App JWT. Never hardcode it in repo.
  // Provide it via env or via the `ethora-configure` tool.
  // Keep ETHORA_APP_TOKEN only as a legacy compatibility alias.
  appJwt: process.env.ETHORA_APP_JWT ?? process.env.ETHORA_APP_TOKEN ?? "",

  // For B2B/server flows Ethora expects x-custom-token (JWT with type=server).
  b2bToken: process.env.ETHORA_B2B_TOKEN ?? "",

  // Safety rail: deny-by-default for destructive actions.
  // Enable explicitly for power users / CI automation.
  enableDangerousTools:
    String(process.env.ETHORA_MCP_ENABLE_DANGEROUS_TOOLS ?? "")
      .trim()
      .toLowerCase() === "true",

  // Back-compat alias tools (dot-namespaced ethora.b2b.* + ethora-bot-message/history-v2)
  // are off-by-default to keep the tool surface lean; the canonical tools cover the same ground.
  // Set ETHORA_MCP_ENABLE_ALIASES=true to expose them.
  // Hosted AI chat widget bundle base URL (the embed script is `${widgetUrl}/assistant.js`).
  // Rendered by the deploy from the widget domain; empty when no widget is hosted.
  // Accepts either the widget host (https://widget.example.com) or the full
  // script URL (https://widget.example.com/assistant.js, which is what the
  // deploy's WIDGET_URL carries); the script name is appended by the tool.
  widgetUrl: String(process.env.ETHORA_MCP_WIDGET_URL ?? "").trim().replace(/\/+$/, "").replace(/\/assistant\.js$/i, ""),

  // Public API base for browser-side embeds (data-api-base). Falls back to the
  // OAuth issuer (same host) and then to ETHORA_API_URL when that is not loopback.
  publicApiUrl: (() => {
    const explicit = String(process.env.ETHORA_MCP_PUBLIC_API_URL ?? "").trim()
    if (explicit) return explicit.replace(/\/+$/, "")
    const issuer = String(process.env.ETHORA_MCP_AUTH_ISSUER ?? "").trim()
    if (issuer) return issuer.replace(/\/+$/, "")
    const api = String(process.env.ETHORA_API_URL ?? process.env.ETHORA_BASE_URL ?? "").trim().replace(/\/+$/, "").replace(/\/v[12]$/, "")
    if (api && !/^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(api)) return api
    return ""
  })(),

  enableAliases:
    String(process.env.ETHORA_MCP_ENABLE_ALIASES ?? "")
      .trim()
      .toLowerCase() === "true",
}