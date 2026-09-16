import axios from "axios"
import { appConfig, normalizeApiUrl } from "./config.js"
import { getSession, isHostedMode } from "./session.js"

// `httpTokens` / `ethoraContext` keep their historical shape, but every read
// and write resolves against the *current* session (AsyncLocalStorage). In
// stdio mode that is a single default session; in hosted HTTP mode each
// Mcp-Session-Id gets its own, so one client's login never leaks to another.
export const httpTokens = {
  get appJwt() { return getSession().tokens.appJwt },
  set appJwt(v: string) { getSession().tokens.appJwt = v },
  get appToken() { return getSession().tokens.appToken },
  set appToken(v: string) { getSession().tokens.appToken = v },
  get appTokenAppId() { return getSession().tokens.appTokenAppId },
  set appTokenAppId(v: string) { getSession().tokens.appTokenAppId = v },
  get b2bToken() { return getSession().tokens.b2bToken },
  set b2bToken(v: string) { getSession().tokens.b2bToken = v },
  get token() { return getSession().tokens.token },
  set token(v: string) { getSession().tokens.token = v },
  get refreshToken() { return getSession().tokens.refreshToken },
  set refreshToken(v: string) { getSession().tokens.refreshToken = v },
}

export const ethoraContext = {
  get authMode() { return getSession().context.authMode },
  set authMode(v: "user" | "app" | "b2b") { getSession().context.authMode = v },
  get currentAppId() { return getSession().context.currentAppId },
  set currentAppId(v: string) { getSession().context.currentAppId = v },
  get currentAgentId() { return getSession().context.currentAgentId },
  set currentAgentId(v: string) { getSession().context.currentAgentId = v },
}

export const httpClientDappros = axios.create({
  baseURL: appConfig.apiUrl,
});

export const httpClientEthora = httpClientDappros

// Small helper used by `ethora-doctor`
export async function apiPing(timeoutMs = 3000) {
  return httpClientDappros.get("/ping", { timeout: timeoutMs })
}

httpClientDappros.interceptors.request.use((config) => {
  // If the user provides a full URL, don't attempt to mutate headers.
  if (!config.url) return config

  // Allow calling v2 endpoints even if baseURL is configured as .../v1.
  // Example: baseURL=https://api.ethora.com/v1 + url=/v2/chats/broadcast => should call https://api.ethora.com/v2/...
  const baseURL = String(config.baseURL || httpClientDappros.defaults.baseURL || "")
  if (config.url.startsWith("/v2/") && /\/v1\/?$/.test(baseURL)) {
    config.baseURL = baseURL.replace(/\/v1\/?$/, "")
  }

  // Hosted mode: pass the real caller's address through so the API's per-IP
  // limiters see individual clients rather than the MCP host.
  const clientIp = getSession().clientIp
  if (clientIp) {
    ;(config.headers as any)["X-Forwarded-For"] = clientIp
    ;(config.headers as any)["X-Real-IP"] = clientIp
  }

  if (config.url === '/users/login/refresh' || config.url === '/v2/users/login/refresh') {
    return config;
  }

  // Public, unauthenticated endpoints.
  if (config.url === '/ping' || config.url.startsWith('/apps/get-config')) {
    return config;
  }

  if (
    config.url === '/users/login-with-email' ||
    config.url === '/users/login' ||
    (config.url === '/users' && config.method === 'post') ||
    config.url?.startsWith('/users/checkEmail/') ||
    config.url === '/users/sign-up-with-email' ||
    config.url === '/users/sign-up-with-email/' ||
    config.url === '/v2/users/sign-up-with-email' ||
    config.url === '/v2/users/login-with-email' ||
    config.url === '/users/sign-up-resend-email' ||
    config.url === '/users/forgot' ||
    config.url === '/users/reset'
  ) {
    if (!httpTokens.appJwt) {
      throw new Error(
        "ETHORA_APP_JWT is not configured. Set env ETHORA_APP_JWT or call the `ethora-configure` tool."
      )
    }
    config.headers.Authorization = httpTokens.appJwt;

    return config;
  }

  if (ethoraContext.authMode === "b2b") {
    if (!httpTokens.b2bToken) {
      throw new Error("B2B auth is selected but no b2bToken is configured. Set env ETHORA_B2B_TOKEN or call `ethora-configure` with b2bToken, or switch auth mode.")
    }
    // Backend expects `x-custom-token` for b2b/server/client flows.
    // Keep any existing Authorization header untouched.
    ;(config.headers as any)["x-custom-token"] = httpTokens.b2bToken
    return config
  }

  // Single-call override: a tool that must hit an app-token-only route (e.g.
  // /v2/agents/:id/activate) from a user session marks the request with
  // `x-ethora-auth: app`; the stored appToken is used for that call only.
  const authOverride = (config.headers as any)?.["x-ethora-auth"]
  if (authOverride) {
    delete (config.headers as any)["x-ethora-auth"]
    if (authOverride === "app") {
      if (!httpTokens.appToken) {
        throw new Error("This call needs the app's appToken. Call `ethora-app-select { appId, appToken }` (appToken comes from the `ethora-app-create` result or the admin UI) and retry.")
      }
      config.headers.Authorization = httpTokens.appToken
      return config
    }
  }

  if (ethoraContext.authMode === "app") {
    if (!httpTokens.appToken) {
      throw new Error("App-token auth is selected but no appToken is configured. Call `ethora-app-select` with appToken, or call `ethora-configure` and set appToken.")
    }
    config.headers.Authorization = httpTokens.appToken
    return config
  }

  if (!httpTokens.token) {
    throw new Error("Not logged in. Call `ethora-user-login` first (or switch to app-token auth via `ethora-auth-use-app`).")
  }
  config.headers.Authorization = httpTokens.token;

  return config;
}, null);

httpClientDappros.interceptors.response.use(null, async (error) => {
  if (!error.response || error.response.status !== 401) {
    return Promise.reject(error);
  }
  const request = error.config;
  const url = request.url;

  if (
    url === '/users/login/refresh' ||
    url === '/users/login-with-email' ||
    url === '/users/login'
  ) {
    return Promise.reject(error);
  }

  // Only a user session that holds a refresh token can recover from a 401.
  // Bearer/API-key sessions, app-token and B2B sessions have nothing to
  // refresh, so surface the API's own error (e.g. REFRESH_RECORD_NOT_FOUND
  // for a revoked key) instead of a misleading refresh failure.
  if (
    ethoraContext.authMode !== "user" ||
    !httpTokens.refreshToken ||
    (request as any)._ethoraRetried
  ) {
    return Promise.reject(error);
  }

  try {
    await refreshToken();
    ;(request as any)._ethoraRetried = true
    return httpClientDappros(request);
  } catch (refreshError: any) {
    console.error(`[api] token refresh after 401 failed: ${refreshError?.response?.data?.code || refreshError?.message || refreshError}`)
    // Reject with the ORIGINAL error so callers see why the request failed.
    return Promise.reject(error);
  }
});

export const refreshToken = async () => {
  try {
    const response = await httpClientDappros.post('/users/login/refresh', null, {
      headers: {
        Authorization: httpTokens.refreshToken,
      },
    });
    const { token, refreshToken } = response.data;
    httpTokens.token = token;
    httpTokens.refreshToken = refreshToken;

    return httpTokens;
  } catch (error) {
    console.error('Token refresh failed:', error);
    throw error;
  }
};

export function configureClient(params: { apiUrl?: string; appJwt?: string; appToken?: string; b2bToken?: string }) {
  const { apiUrl, appJwt, appToken, b2bToken } = params
  if (apiUrl) {
    if (isHostedMode()) {
      throw new Error("apiUrl is fixed on a hosted MCP server and cannot be changed per session. Run the stdio server locally if you need to target another Ethora API.")
    }
    const normalized = normalizeApiUrl(apiUrl)
    appConfig.apiUrl = normalized
    httpClientDappros.defaults.baseURL = normalized
  }
  if (typeof appJwt === "string") {
    httpTokens.appJwt = appJwt
    if (!isHostedMode()) appConfig.appJwt = appJwt
  }
  if (typeof appToken === "string") {
    httpTokens.appToken = appToken.trim()
  }
  if (typeof b2bToken === "string") {
    httpTokens.b2bToken = b2bToken.trim()
    if (!isHostedMode()) appConfig.b2bToken = b2bToken.trim()
  }
  return getClientState()
}

export function getClientState() {
  return {
    apiUrl: String(httpClientDappros.defaults.baseURL || ""),
    hasAppJwt: Boolean(httpTokens.appJwt),
    hasAppToken: Boolean(httpTokens.appToken),
    hasB2BToken: Boolean(httpTokens.b2bToken),
    hasUserToken: Boolean(httpTokens.token),
    hasRefreshToken: Boolean(httpTokens.refreshToken),
    authMode: ethoraContext.authMode,
    currentAppId: ethoraContext.currentAppId,
    currentAgentId: ethoraContext.currentAgentId,
    enableDangerousTools: Boolean(appConfig.enableDangerousTools),
    enableAliases: Boolean(appConfig.enableAliases),
    hosted: isHostedMode(),
    sessionId: getSession().id,
  }
}

export function selectApp(params: { appId: string; appToken?: string; authMode?: "app" | "user" | "b2b" }) {
  const { appId, appToken, authMode } = params
  ethoraContext.currentAppId = String(appId || "").trim()
  if (!ethoraContext.currentAppId) {
    throw new Error("appId is required")
  }
  if (typeof appToken === "string") {
    httpTokens.appToken = appToken.trim()
    httpTokens.appTokenAppId = httpTokens.appToken ? ethoraContext.currentAppId : ""
  }
  if (authMode) {
    ethoraContext.authMode = authMode
  } else if (typeof appToken === "string" && appToken.trim()) {
    // Only an appToken passed in THIS call switches to app auth. A token merely
    // remembered from `ethora-app-create` must not flip a user session into
    // app mode (the agents/rooms routes reject app tokens).
    ethoraContext.authMode = "app"
  }
  return getClientState()
}

export function selectAgent(params: { agentId: string }) {
  ethoraContext.currentAgentId = String(params.agentId || "").trim()
  return getClientState()
}

export function setAuthMode(authMode: "app" | "user" | "b2b") {
  ethoraContext.authMode = authMode
  return getClientState()
}

export function configureB2BToken(b2bToken: string) {
  httpTokens.b2bToken = String(b2bToken || "").trim()
  return getClientState()
}

export function userRegistration(email: string, firstName: string, lastName: string, password?: string) {
  if (password) {
    // v2 signup accepts a password and creates a ready-to-login account
    // (no e-mail confirmation gate), which is what agent-driven signups need.
    return httpClientDappros.post(`/v2/users/sign-up-with-email`, { email, firstName, lastName, password })
  }
  return httpClientDappros.post(
    `/users/sign-up-with-email/`,
    {
      email,
      firstName,
      lastName
    }
  )
}

// User API keys (long-lived, revocable user tokens for agents / headless clients)
export function apiKeyCreate(payload?: { name?: string; ttlDays?: number }) {
  return httpClientDappros.post(`/v2/users/me/api-keys`, payload || {})
}

export function apiKeyList() {
  return httpClientDappros.get(`/v2/users/me/api-keys`)
}

export function apiKeyRevoke(id: string) {
  return httpClientDappros.delete(`/v2/users/me/api-keys/${String(id || "").trim()}`)
}

// Current user for the session's token. Used by the OAuth entry point to
// validate a bearer token against the API before serving the session.
export function usersMe(timeoutMs = 5000) {
  return httpClientDappros.get(`/v2/users/me`, { timeout: timeoutMs })
}

// Fetch the public app config (incl. the App JWT used to bootstrap login /
// register) for an app by its domainName. Used by the hosted server so a
// deployment only needs to know its base app's domainName, not a secret.
export async function fetchAppJwtByDomainName(domainName: string, timeoutMs = 5000) {
  const res = await httpClientDappros.get(`/apps/get-config`, { params: { domainName }, timeout: timeoutMs })
  const app = res.data?.result || res.data?.data || res.data
  const token = String(app?.appToken || "").trim()
  if (!token) throw new Error(`get-config for domainName=${domainName} returned no appToken`)
  return token.startsWith("JWT ") ? token : `JWT ${token}`
}

export async function userLogin(email: string, password: string) {
  let resp = await httpClientDappros.post(
    `/users/login-with-email`,
    {
      email,
      password,
    }
  )
  let data = resp.data
  httpTokens.token = data.token
  httpTokens.refreshToken = data.refreshToken
  return resp
}

export function appList() {
  return httpClientDappros.get(
    `/apps/`
  )
}

// Single app document (owner view). The tool layer redacts credentials from
// results; `ethora-app-credentials` is the one place appToken is passed through.
export function appGet(appId: string) {
  return httpClientDappros.get(`/apps/${String(appId || "").trim()}`)
}

export function appCreate(displayName: string) {
  return httpClientDappros.post(
    `/apps/`,
    {
      displayName
    }
  )
}

export function appCreateV2(displayName: string) {
  return httpClientDappros.post(
    `/v2/apps`,
    {
      displayName,
    }
  )
}

export function appDelete(appId: string) {
  return httpClientDappros.delete(
    `/apps/${appId}`
  )
}

export function appUpdate(appId: string, changes: any) {
  return httpClientDappros.put(
    `/apps/${appId}`,
    changes
  )
}

export function appGetDefaultRooms() {
  return httpClientDappros.get(
    `/apps/get-default-rooms`
  )
}

export function appGetDefaultRoomsWithAppId(appId: string) {
  return httpClientDappros.get(
    `/apps/get-default-rooms/app-id/${appId}`
  )
}

export function appCreateChat(appId: string, title: string, pinned: boolean) {
  return httpClientDappros.post(
    `/apps/create-app-chat/${appId}`,
    {
      title,
      pinned
    }
  )
}

export function appDeleteChat(appId: string, chatJid: string) {
  return httpClientDappros.delete(
    `/apps/delete-app-chat/${appId}`,
    { data: { chatJid: chatJid } }
  )
}

export function walletGetBalance() {
  return httpClientDappros.get(
    `/wallets/balance`
  )
}

export function walletERC20Transfer(toWallet: string, amount: number) {
  return httpClientDappros.post(
    `/tokens/transfer`,
    {
      toWallet,
      amount,
      "tokenId": "ERC20",
      "tokenName": "Dappros Platform Token"
    }
  )
}

// v2 chats (app-token auth)
export function chatsBroadcastV2(payload: {
  text: string
  allRooms?: boolean
  chatIds?: string[]
  chatNames?: string[]
}) {
  return httpClientDappros.post(`/v2/chats/broadcast`, payload)
}

export function chatsBroadcastJobV2(jobId: string) {
  return httpClientDappros.get(`/v2/chats/broadcast/${jobId}`)
}

export function chatsBroadcastForAppV2(appId: string, payload: {
  text: string
  allRooms?: boolean
  chatIds?: string[]
  chatNames?: string[]
}) {
  return httpClientDappros.post(`/v2/apps/${String(appId || "").trim()}/chats/broadcast`, payload)
}

export function chatsBroadcastJobForAppV2(appId: string, jobId: string) {
  return httpClientDappros.get(`/v2/apps/${String(appId || "").trim()}/chats/broadcast/${String(jobId || "").trim()}`)
}

// v2 bot management (app-token auth)
export function botGetV2() {
  return httpClientDappros.get(`/v2/bot`)
}

export function botGetForAppV2(appId: string) {
  return httpClientDappros.get(`/v2/apps/${String(appId || "").trim()}/bot`)
}

export function botUpdateV2(payload: {
  status?: "on" | "off"
  savedAgentId?: string
  trigger?: "any_message" | "/bot"
  prompt?: string
  greetingMessage?: string
  chatId?: string
  isRAG?: boolean
  botFirstName?: string
  botLastName?: string
  botDisplayName?: string
  botAvatarUrl?: string
  ragTags?: string[]
  llmProvider?: string
  llmModel?: string
  widgetPublicEnabled?: boolean
  widgetPublicUrl?: string
}) {
  return httpClientDappros.put(`/v2/bot`, payload)
}

export function botUpdateForAppV2(appId: string, payload: {
  status?: "on" | "off"
  savedAgentId?: string
  trigger?: "any_message" | "/bot"
  prompt?: string
  greetingMessage?: string
  chatId?: string
  isRAG?: boolean
  botFirstName?: string
  botLastName?: string
  botDisplayName?: string
  botAvatarUrl?: string
  ragTags?: string[]
  llmProvider?: string
  llmModel?: string
  widgetPublicEnabled?: boolean
  widgetPublicUrl?: string
}) {
  return httpClientDappros.put(`/v2/apps/${String(appId || "").trim()}/bot`, payload)
}

// Agents: the app-scoped `/v2/apps/:appId/agents` routes accept a user token
// or a B2B token (tenantActor) and land the agent in that app; the bare
// `/v2/agents` routes are user-only and default to the token's own app.
export function agentsListV2(appId?: string) {
  const id = String(appId || "").trim()
  if (id) return httpClientDappros.get(`/v2/apps/${id}/agents`)
  return httpClientDappros.get(`/v2/agents`)
}

export function agentsGetV2(agentId: string) {
  return httpClientDappros.get(`/v2/agents/${String(agentId || "").trim()}`)
}

export function agentsCreateV2(payload: {
  name?: string
  slug?: string
  summary?: string
  prompt?: string
  greetingMessage?: string
  trigger?: "any_message" | "/bot"
  responseMode?: "always" | "mentioned" | "smart" | "probability"
  responseProbability?: number
  cooldownSec?: number
  botDisplayName?: string
  botAvatarUrl?: string
  isRAG?: boolean
  ragTags?: string[]
  llmProvider?: string
  llmModel?: string
  visibility?: "private" | "public"
  isPublished?: boolean
  categories?: string[]
  flowsYaml?: string
  meta?: Record<string, any>
  ownerAppId?: string
}, appId?: string) {
  const id = String(appId || "").trim()
  if (id) return httpClientDappros.post(`/v2/apps/${id}/agents`, { ...(payload || {}), ownerAppId: (payload && payload.ownerAppId) || id })
  return httpClientDappros.post(`/v2/agents`, payload || {})
}

export function agentsUpdateV2(agentId: string, payload: {
  name?: string
  slug?: string
  summary?: string
  prompt?: string
  greetingMessage?: string
  trigger?: "any_message" | "/bot"
  responseMode?: "always" | "mentioned" | "smart" | "probability"
  responseProbability?: number
  cooldownSec?: number
  botDisplayName?: string
  botAvatarUrl?: string
  isRAG?: boolean
  ragTags?: string[]
  llmProvider?: string
  llmModel?: string
  visibility?: "private" | "public"
  isPublished?: boolean
  categories?: string[]
  flowsYaml?: string
  meta?: Record<string, any>
}) {
  return httpClientDappros.put(`/v2/agents/${String(agentId || "").trim()}`, payload || {})
}

export function agentsCloneV2(agentId: string, payload?: {
  name?: string
  slug?: string
  summary?: string
}) {
  return httpClientDappros.post(`/v2/agents/${String(agentId || "").trim()}/clone`, payload || {})
}

// App-token-only route (authMw('app')). Sent with the session's stored appToken
// via the `x-ethora-auth: app` override so user-mode sessions do not have to
// switch auth mode. `chatJid` tells the backend which room becomes the widget
// chat; API-created apps have no bound AI Widget chat, so it is required there.
export function agentsActivateV2(agentId: string, body?: { chatJid?: string; appId?: string }) {
  return httpClientDappros.post(
    `/v2/agents/${String(agentId || "").trim()}/activate`,
    { ...(body?.chatJid ? { chatJid: body.chatJid } : {}), ...(body?.appId ? { appId: body.appId } : {}) },
    { headers: { "x-ethora-auth": "app" } }
  )
}

// Remember the appToken returned by app creation (or passed to app-select) so
// app-token-only calls for that app work from a user session.
export function rememberAppToken(appId: string, appToken: string) {
  const id = String(appId || "").trim(); const tok = String(appToken || "").trim()
  if (!id || !tok) return
  httpTokens.appToken = tok
  httpTokens.appTokenAppId = id
}

export function appTokenFor(appId: string): string {
  const id = String(appId || "").trim()
  if (!httpTokens.appToken) return ""
  if (httpTokens.appTokenAppId && id && httpTokens.appTokenAppId !== id) return ""
  return httpTokens.appToken
}

// Phase 1 (Agents): additional wrappers backing the new MCP tools.
export function agentsSetVisibilityV2(idOrAddress: string, visibility: "private" | "unlisted" | "public") {
  return httpClientDappros.post(`/v2/agents/${String(idOrAddress || "").trim()}/visibility`, { visibility })
}

export function agentsSoulV2(idOrAddress: string, payload: { soulMd?: string; append?: string }) {
  return httpClientDappros.post(`/v2/agents/${String(idOrAddress || "").trim()}/soul`, payload || {})
}

export function agentsInviteToChatV2(idOrAddress: string, payload: { appId?: string; chatId?: string; chatJid?: string }) {
  // Use the per-app variant when appId is provided so tenantActor (B2B) auth lands on the right route.
  if (payload?.appId) {
    return httpClientDappros.post(
      `/v2/apps/${String(payload.appId).trim()}/agents/${String(idOrAddress || "").trim()}/invite-to-chat`,
      payload || {}
    )
  }
  return httpClientDappros.post(`/v2/agents/${String(idOrAddress || "").trim()}/invite-to-chat`, payload || {})
}

export function botInstancesListV2(params?: { appId?: string; agentId?: string }) {
  return httpClientDappros.get(`/v2/bot-instances`, { params })
}

// Rooms of an app - GET /v2/apps/:appId/chats (tenantActor). Items carry the Mongo `_id`
// (what the messages route wants as :chatId) and `name` (the XMPP local part `${appId}_${suffix}`).
export function appChatsListV2(appId: string, params?: { limit?: number; offset?: number; includeMembers?: boolean }) {
  return httpClientDappros.get(`/v2/apps/${String(appId || "").trim()}/chats`, { params: { includeMembers: false, limit: 500, ...(params || {}) } })
}

// Room message history (mod_mam archive) - GET /v2/apps/:appId/chats/:chatId/messages (tenantActor).
export function appChatMessagesV2(appId: string, chatId: string, params?: { limit?: number; before?: number }) {
  return httpClientDappros.get(`/v2/apps/${String(appId || "").trim()}/chats/${String(chatId || "").trim()}/messages`, { params: params || {} })
}

export function botInstanceGetV2(id: string) {
  return httpClientDappros.get(`/v2/bot-instances/${String(id || "").trim()}`)
}

export function botInstanceStatusV2(id: string, status: "on" | "off") {
  return httpClientDappros.post(`/v2/bot-instances/${String(id || "").trim()}/status`, { status })
}

// --- Agents: full-lifecycle completions (2607 API parity) ---

export function agentsDeleteV2(idOrAddress: string) {
  return httpClientDappros.delete(`/v2/agents/${String(idOrAddress || "").trim()}`)
}

export function agentsExportV2(idOrAddress: string, format: "json" | "zip" = "json") {
  return httpClientDappros.get(`/v2/agents/${String(idOrAddress || "").trim()}/export`, { params: { format } })
}

export function agentsImportV2(bundle: any, ownerAppId?: string) {
  // application/json: the request body IS the bundle (output of GET .../export?format=json).
  const config = ownerAppId ? { params: { ownerAppId } } : undefined
  return httpClientDappros.post(`/v2/agents/import`, bundle || {}, config)
}

export function agentBotInstanceDiagV2(idOrAddress: string, botInstanceId: string) {
  return httpClientDappros.get(
    `/v2/agents/${String(idOrAddress || "").trim()}/bot-instances/${String(botInstanceId || "").trim()}/diag`
  )
}

export function agentBotInstanceTestMessageV2(
  idOrAddress: string,
  botInstanceId: string,
  payload: { text?: string; roomJid?: string }
) {
  return httpClientDappros.post(
    `/v2/agents/${String(idOrAddress || "").trim()}/bot-instances/${String(botInstanceId || "").trim()}/test-message`,
    payload || {}
  )
}

export function agentBotInstanceLeaveChatV2(idOrAddress: string, botInstanceId: string, payload: { chatJid: string }) {
  return httpClientDappros.post(
    `/v2/agents/${String(idOrAddress || "").trim()}/bot-instances/${String(botInstanceId || "").trim()}/leave-chat`,
    payload || {}
  )
}

// --- App-scoped chat reads + App bundles (2607 API parity) ---

export function appMessagesSearchV2(
  appId: string,
  params: {
    q: string
    mode?: "substring" | "fulltext"
    chatId?: string
    fromUserId?: string
    since?: string
    until?: string
    sort?: "relevance" | "date"
    limit?: number
    offset?: number
  }
) {
  return httpClientDappros.get(`/v2/apps/${String(appId || "").trim()}/messages/search`, { params })
}

export function appMessagesContextV2(
  appId: string,
  chatId: string,
  params: { aroundStanzaId?: string; aroundMessageId?: string; radius?: number }
) {
  return httpClientDappros.get(
    `/v2/apps/${String(appId || "").trim()}/chats/${String(chatId || "").trim()}/messages/context`,
    { params }
  )
}

export function appUsersUnreadCountsV2(
  appId: string,
  payload: { userIds: string[]; mode?: "count" | "flag"; cap?: number; concurrency?: number }
) {
  return httpClientDappros.post(`/v2/apps/${String(appId || "").trim()}/users/unread-counts`, payload || {})
}

export function appExportV2(appId: string, opts?: { format?: "json" | "zip"; include?: string }) {
  const params: Record<string, string> = { format: opts?.format || "json" }
  if (opts?.include) params.include = opts.include
  return httpClientDappros.get(`/v2/apps/${String(appId || "").trim()}/export`, { params })
}

export function appImportV2(bundle: any, domainNameOverride?: string) {
  // application/json: the request body IS the bundle (output of GET .../export?format=json).
  const config = domainNameOverride ? { params: { domainNameOverride } } : undefined
  return httpClientDappros.post(`/v2/apps/import`, bundle || {}, config)
}

export function botWidgetGetV2() {
  return httpClientDappros.get(`/v2/bot/widget`)
}

export function botMessageCreateV2(payload: {
  text: string
  mode?: "private" | "group"
  nickname?: string
  roomJid?: string
}) {
  return httpClientDappros.post(`/v2/chats/messages`, payload)
}

export function botHistoryGetV2(params?: {
  mode?: "private" | "group"
  nickname?: string
  roomJid?: string
  limit?: number
}) {
  return httpClientDappros.get(`/v2/chats/history`, { params: params || {} })
}

export const chatsMessageCreateV2 = botMessageCreateV2
export const chatsHistoryGetV2 = botHistoryGetV2

// sources (v1-style routes, user auth). The site-crawl ones are gone: the
// backend dropped POST /sources/site-crawl/:appId, POST
// /sources/site-crawl-reindex/:appId and both DELETE url routes. Use the
// site-crawl-v2 helpers below, which hit /v2/sources/* and
// /v2/apps/:appId/sources/*.
export function sourcesDocsUpload(appId: string, formData: any, headers?: any) {
  return httpClientDappros.post(`/sources/docs/${appId}`, formData, { headers })
}

export function sourcesDocsDelete(appId: string, docId: string) {
  return httpClientDappros.delete(`/sources/docs/${appId}/${docId}`)
}

// sources (v2 app-token endpoints)
export function sourcesSiteCrawlV2(payload: { url: string; followLink?: boolean; knowledgeScope?: "app" | "saved_agent"; savedAgentId?: string }, opts?: { timeoutMs?: number }) {
  return httpClientDappros.post(`/v2/sources/site-crawl`, payload, { timeout: opts?.timeoutMs })
}

export function sourcesSiteCrawlForAppV2(appId: string, payload: { url: string; followLink?: boolean }, opts?: { timeoutMs?: number }) {
  return httpClientDappros.post(`/v2/apps/${String(appId || "").trim()}/sources/site-crawl`, payload, { timeout: opts?.timeoutMs })
}

export function sourcesSiteListV2(params?: { knowledgeScope?: "app" | "saved_agent"; savedAgentId?: string }) {
  return httpClientDappros.get(`/v2/sources/site-crawl`, { params: params || {} })
}

export function sourcesSiteListForAppV2(appId: string) {
  return httpClientDappros.get(`/v2/apps/${String(appId || "").trim()}/sources/site-crawl`)
}

export function sourcesSiteReindexV2(payload: { urlId: string; knowledgeScope?: "app" | "saved_agent"; savedAgentId?: string }, opts?: { timeoutMs?: number }) {
  return httpClientDappros.post(`/v2/sources/site-crawl-reindex`, payload, { timeout: opts?.timeoutMs })
}

export function sourcesSiteReindexForAppV2(appId: string, payload: { urlId: string }, opts?: { timeoutMs?: number }) {
  return httpClientDappros.post(`/v2/apps/${String(appId || "").trim()}/sources/site-crawl-reindex`, payload, { timeout: opts?.timeoutMs })
}

export function sourcesSiteTagsUpdateV2(sourceId: string, tags: string[], extra?: { knowledgeScope?: "app" | "saved_agent"; savedAgentId?: string }) {
  return httpClientDappros.patch(`/v2/sources/site-crawl/${sourceId}/tags`, { tags, ...(extra || {}) })
}

export function sourcesSiteTagsUpdateForAppV2(appId: string, sourceId: string, tags: string[]) {
  return httpClientDappros.patch(`/v2/apps/${String(appId || "").trim()}/sources/site-crawl/${String(sourceId || "").trim()}/tags`, { tags })
}

export function sourcesSiteDeleteUrlV2Single(payload: { url: string; knowledgeScope?: "app" | "saved_agent"; savedAgentId?: string }) {
  return httpClientDappros.delete(`/v2/sources/site-crawl/url`, { data: payload })
}

export function sourcesSiteDeleteUrlForAppV2(appId: string, payload: { url: string }) {
  return httpClientDappros.delete(`/v2/apps/${String(appId || "").trim()}/sources/site-crawl/url`, { data: payload })
}

export function sourcesSiteDeleteUrlV2Batch(payload: { urls: string[]; knowledgeScope?: "app" | "saved_agent"; savedAgentId?: string }) {
  return httpClientDappros.delete(`/v2/sources/site-crawl-v2/url`, { data: payload })
}

export function sourcesSiteDeleteBatchForAppV2(appId: string, payload: { ids: string[] }) {
  return httpClientDappros.delete(`/v2/apps/${String(appId || "").trim()}/sources/site-crawl-v2/url`, { data: payload })
}

export function sourcesDocsUploadV2(formData: any, headers?: any) {
  return httpClientDappros.post(`/v2/sources/docs`, formData, { headers })
}

export function sourcesDocsUploadForAppV2(appId: string, formData: any, headers?: any) {
  return httpClientDappros.post(`/v2/apps/${String(appId || "").trim()}/sources/docs`, formData, { headers })
}

export function sourcesDocsListV2(params?: { knowledgeScope?: "app" | "saved_agent"; savedAgentId?: string }) {
  return httpClientDappros.get(`/v2/sources/docs`, { params: params || {} })
}

export function sourcesDocsListForAppV2(appId: string) {
  return httpClientDappros.get(`/v2/apps/${String(appId || "").trim()}/sources/docs`)
}

export function sourcesDocsTagsUpdateV2(docId: string, tags: string[], extra?: { knowledgeScope?: "app" | "saved_agent"; savedAgentId?: string }) {
  return httpClientDappros.patch(`/v2/sources/docs/${docId}/tags`, { tags, ...(extra || {}) })
}

export function sourcesDocsTagsUpdateForAppV2(appId: string, docId: string, tags: string[]) {
  return httpClientDappros.patch(`/v2/apps/${String(appId || "").trim()}/sources/docs/${String(docId || "").trim()}/tags`, { tags })
}

export function sourcesDocsDeleteV2(docId: string, params?: { knowledgeScope?: "app" | "saved_agent"; savedAgentId?: string }) {
  return httpClientDappros.delete(`/v2/sources/docs/${docId}`, { params: params || {} })
}

export function sourcesDocsDeleteForAppV2(appId: string, docId: string) {
  return httpClientDappros.delete(`/v2/apps/${String(appId || "").trim()}/sources/docs/${String(docId || "").trim()}`)
}

// users v2 batch (async jobs; b2b auth)
export function usersBatchCreateV2(payload: any, opts?: { timeoutMs?: number }) {
  return httpClientDappros.post(`/v2/users/batch`, payload, { timeout: opts?.timeoutMs })
}

export function usersBatchCreateJobV2(jobId: string, opts?: { timeoutMs?: number }) {
  const id = String(jobId || "").trim()
  return httpClientDappros.get(`/v2/users/batch/${id}`, { timeout: opts?.timeoutMs })
}

// apps v2 token lifecycle (b2b auth)
export function appTokensListV2(appId: string, opts?: { timeoutMs?: number }) {
  const id = String(appId || "").trim()
  return httpClientDappros.get(`/v2/apps/${id}/tokens`, { timeout: opts?.timeoutMs })
}

export function appTokensCreateV2(appId: string, payload?: { label?: string }, opts?: { timeoutMs?: number }) {
  const id = String(appId || "").trim()
  return httpClientDappros.post(`/v2/apps/${id}/tokens`, payload || {}, { timeout: opts?.timeoutMs })
}

export function appTokensRotateV2(appId: string, tokenId: string, payload?: { label?: string }, opts?: { timeoutMs?: number }) {
  const id = String(appId || "").trim()
  const tid = String(tokenId || "").trim()
  return httpClientDappros.post(`/v2/apps/${id}/tokens/${tid}/rotate`, payload || {}, { timeout: opts?.timeoutMs })
}

export function appTokensRevokeV2(appId: string, tokenId: string, opts?: { timeoutMs?: number }) {
  const id = String(appId || "").trim()
  const tid = String(tokenId || "").trim()
  return httpClientDappros.delete(`/v2/apps/${id}/tokens/${tid}`, { timeout: opts?.timeoutMs })
}

export function appProvisionV2(appId: string, payload: { rooms?: Array<{ title: string; pinned?: boolean }> }, opts?: { timeoutMs?: number }) {
  const id = String(appId || "").trim()
  return httpClientDappros.post(`/v2/apps/${id}/provision`, payload || {}, { timeout: opts?.timeoutMs })
}

// files v2 (user auth)
export function filesUploadV2(formData: any, headers?: any) {
  return httpClientDappros.post(`/v2/files`, formData, { headers })
}

export function filesGetV2(id?: string) {
  return httpClientDappros.get(id ? `/v2/files/${id}` : `/v2/files`)
}

export function filesDeleteV2(id: string) {
  return httpClientDappros.delete(`/v2/files/${id}`)
}
