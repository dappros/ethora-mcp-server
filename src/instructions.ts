// Server-level `instructions` returned in the MCP initialize result. Hosted
// assistants (Claude, ChatGPT, Cursor, agents) read this before any tool call,
// so it carries the auth flow and the ordering that makes the tool set usable.

export const HOSTED_INSTRUCTIONS = [
  "Ethora MCP Server: create and manage Ethora chat/messaging apps, users, chats, AI agents and bots through the Ethora API.",
  "Auth: call `ethora-status` first. If `hasUserToken` is true you are already authenticated (an API key or token was sent as a Bearer header on the connection) and can skip login.",
  "Otherwise call `ethora-user-login` (email + password for an existing account) or `ethora-user-register` (new account). Register returns a generated password and an API key exactly once; tell the user to store them. Headless clients and agents reconnect later by sending the API key as `Authorization: Bearer <key>` instead of logging in again.",
  "Typical flow after auth: `ethora-app-create` to create an app, then `ethora-app-select` to make it current, then chats/users/agents tools (`ethora-app-create-chat`, `ethora-agents-create-v2`, `ethora-agent-invite-to-chat`, `ethora-chats-message-v2` with waitForReplySec, ...).",
  "Stay in user auth mode on the hosted server (`ethora-status` shows authMode=user); app-token and B2B modes are for server integrations and the agents/rooms routes reject app tokens. Room ids: a room JID is `${appId}_${chatId}` and every room tool accepts the JID or the bare chatId.",
  "Use `search` and `fetch` to look up documentation (auth model, quickstarts, recipes, tool reference) before guessing; `ethora-help` returns recommended next calls for the current state.",
  "Never print API keys or passwords in your replies unless the user explicitly asks for them.",
  "Tools marked destructive delete data owned by the authenticated user (apps, agents, users, files); confirm with the user before calling them.",
  "Manage keys with `ethora-api-key-create`, `ethora-api-key-list` and `ethora-api-key-revoke`. Each MCP session is private: nothing from another client's session is visible here.",
  "After registering or creating a key, give the user their `connectorUrl` (returned alongside the key): pasting it as a custom connector in Claude.ai or ChatGPT reconnects them authenticated in every future conversation with no login step.",
].join("\n")

export const STDIO_INSTRUCTIONS = [
  "Ethora MCP Server (local stdio): create and manage Ethora chat/messaging apps, users, chats, AI agents and bots through the Ethora API.",
  "Configuration comes from env vars: ETHORA_API_URL (API base, defaults to Ethora Cloud), ETHORA_APP_JWT (app JWT needed by login/register), optional ETHORA_B2B_TOKEN for server-to-server automation. `ethora-configure` can set them at runtime.",
  "Auth: call `ethora-status`, then `ethora-user-login` (email + password) or `ethora-user-register`; or switch to app/B2B auth with `ethora-auth-use-app` / `ethora-auth-use-b2b` when you hold those tokens.",
  "Typical flow after auth: `ethora-app-create`, `ethora-app-select`, then chats/users/agents tools. Use `search` and `fetch` for documentation and `ethora-help` for recommended next calls.",
  "Never print API keys, tokens or passwords unless the user explicitly asks. Destructive tools are gated behind ETHORA_MCP_ENABLE_DANGEROUS_TOOLS=true and delete data owned by the current user; confirm before calling them.",
].join("\n")

// Entry points where the MCP client already supplies the identity (OAuth on
// /mcp/oauth, a personal connector URL on /mcp/k/<key>, or a Bearer header on
// /mcp). The model must never try to log the user in or ask for secrets.
const AUTHENTICATED_COMMON = [
  "Stay in user auth mode on the hosted server (`ethora-status` shows authMode=user); app-token and B2B modes are for server integrations and the agents/rooms routes reject app tokens. Room ids: a room JID is `${appId}_${chatId}` and every room tool accepts the JID or the bare chatId.",
  "Call `ethora-status` when account state is needed; every tool runs as the authenticated user, so start work directly.",
  "Typical flow: `ethora-app-list` / `ethora-app-select` to pick an app, or `ethora-app-create` for a new one, then chats, users and agents tools (`ethora-agents-create-v2`, `ethora-agent-invite-to-chat`, `ethora-chats-message-v2`, ...).",
  "Use `search` and `fetch` to look up documentation (quickstarts, recipes, tool reference) before guessing; `ethora-help` returns recommended next calls for the current state.",
  "Tools marked destructive delete data owned by the user (apps, agents, users, files); confirm with the user before calling them.",
  "Each MCP session is private: nothing from another client's session is visible here.",
]

export const OAUTH_INSTRUCTIONS = [
  "Ethora MCP Server: create and manage Ethora chat/messaging apps, users, chats, AI agents and bots through the Ethora API.",
  "This connection is authenticated through OAuth. The Ethora user's credentials are supplied by the MCP client; never ask the user for an Ethora password or API key, and do not look for login or register tools, they are not available on this connection.",
  ...AUTHENTICATED_COMMON,
  "If a tool is refused with INSUFFICIENT_SCOPE, the user granted fewer permissions when connecting; explain that and stop rather than retrying.",
].join("\n")

export const AUTHENTICATED_INSTRUCTIONS = [
  "Ethora MCP Server: create and manage Ethora chat/messaging apps, users, chats, AI agents and bots through the Ethora API.",
  "This connection is already authenticated: the client supplied an API key (personal connector URL or Bearer header). Never ask the user for an Ethora password or API key and do not call login or register tools.",
  ...AUTHENTICATED_COMMON,
  "Keys can be managed with `ethora-api-key-create`, `ethora-api-key-list` and `ethora-api-key-revoke` when the user asks; never print key values unless the user explicitly asks.",
].join("\n")

export type InstructionProfile = "stdio" | "open" | "authenticated" | "oauth"

export function instructionsFor(profile: InstructionProfile): string {
  switch (profile) {
    case "stdio": return STDIO_INSTRUCTIONS
    case "oauth": return OAUTH_INSTRUCTIONS
    case "authenticated": return AUTHENTICATED_INSTRUCTIONS
    default: return HOSTED_INSTRUCTIONS
  }
}
