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
  enableAliases:
    String(process.env.ETHORA_MCP_ENABLE_ALIASES ?? "")
      .trim()
      .toLowerCase() === "true",
}