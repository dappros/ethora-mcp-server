import axios from "axios"
import { appConfig, normalizeApiUrl } from "./config.js"

export const httpTokens = {
  appJwt: appConfig.appJwt,
  appToken: "",
  b2bToken: appConfig.b2bToken || "",
  _token: '',
  _refreshToken: '',
  set refreshToken(token: string) {
    this._refreshToken = token;
  },
  get refreshToken() {
    return this._refreshToken;
  },
  set token(newToken: string) {
    this._token = newToken;
  },
  get token() {
    return this._token;
  },
};

export const ethoraContext = {
  authMode: "user" as "user" | "app" | "b2b",
  currentAppId: "" as string,
  currentAgentId: "" as string,
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

  if (config.url === '/users/login/refresh') {
    return config;
  }

  if (
    config.url === '/users/login-with-email' ||
    config.url === '/users/login' ||
    (config.url === '/users' && config.method === 'post') ||
    config.url?.startsWith('/users/checkEmail/') ||
    config.url === '/users/sign-up-with-email' ||
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

  try {
    await refreshToken();
    return httpClientDappros(request);
  } catch (error) {
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
    const normalized = normalizeApiUrl(apiUrl)
    appConfig.apiUrl = normalized
    httpClientDappros.defaults.baseURL = normalized
  }
  if (typeof appJwt === "string") {
    httpTokens.appJwt = appJwt
    appConfig.appJwt = appJwt
  }
  if (typeof appToken === "string") {
    httpTokens.appToken = appToken.trim()
  }
  if (typeof b2bToken === "string") {
    httpTokens.b2bToken = b2bToken.trim()
    appConfig.b2bToken = b2bToken.trim()
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
  }
  if (authMode) {
    ethoraContext.authMode = authMode
  } else if (httpTokens.appToken) {
    // If caller provided appToken, default to app auth.
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

export function userRegistration(email: string, firstName: string, lastName: string) {
  return httpClientDappros.post(
    `/users/sign-up-with-email/`,
    {
      email,
      firstName,
      lastName
    }
  )
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

export function agentsListV2() {
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
  botDisplayName?: string
  botAvatarUrl?: string
  isRAG?: boolean
  ragTags?: string[]
  llmProvider?: string
  llmModel?: string
  visibility?: "private" | "public"
  isPublished?: boolean
  categories?: string[]
  meta?: Record<string, any>
}) {
  return httpClientDappros.post(`/v2/agents`, payload || {})
}

export function agentsUpdateV2(agentId: string, payload: {
  name?: string
  slug?: string
  summary?: string
  prompt?: string
  greetingMessage?: string
  trigger?: "any_message" | "/bot"
  botDisplayName?: string
  botAvatarUrl?: string
  isRAG?: boolean
  ragTags?: string[]
  llmProvider?: string
  llmModel?: string
  visibility?: "private" | "public"
  isPublished?: boolean
  categories?: string[]
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

export function agentsActivateV2(agentId: string) {
  return httpClientDappros.post(`/v2/agents/${String(agentId || "").trim()}/activate`, {})
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

// sources (v1-style routes, user auth)
export function sourcesSiteCrawl(appId: string, url: string, followLink: boolean) {
  return httpClientDappros.post(`/sources/site-crawl/${appId}`, { url, followLink })
}

export function sourcesSiteReindex(appId: string, urlId: string) {
  return httpClientDappros.post(`/sources/site-crawl-reindex/${appId}`, { urlId })
}

export function sourcesSiteDeleteUrl(appId: string, url: string) {
  return httpClientDappros.delete(`/sources/site-crawl/url/${appId}`, { data: { url } })
}

export function sourcesSiteDeleteUrlV2(appId: string, urls: string[]) {
  return httpClientDappros.delete(`/sources/site-crawl-v2/url/${appId}`, { data: { urls } })
}

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
