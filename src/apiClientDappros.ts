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
}

export const httpClientDappros = axios.create({
  baseURL: appConfig.apiUrl,
});

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
        "ETHORA_APP_JWT is not configured. Set env ETHORA_APP_JWT (or ETHORA_APP_TOKEN) or call the `ethora-configure` tool."
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

export function configureClient(params: { apiUrl?: string; appJwt?: string }) {
  const { apiUrl, appJwt } = params
  if (apiUrl) {
    const normalized = normalizeApiUrl(apiUrl)
    appConfig.apiUrl = normalized
    httpClientDappros.defaults.baseURL = normalized
  }
  if (typeof appJwt === "string") {
    httpTokens.appJwt = appJwt
    appConfig.appJwt = appJwt
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
export function sourcesSiteCrawlV2(payload: { url: string; followLink?: boolean }) {
  return httpClientDappros.post(`/v2/sources/site-crawl`, payload)
}

export function sourcesSiteReindexV2(payload: { urlId: string }) {
  return httpClientDappros.post(`/v2/sources/site-crawl-reindex`, payload)
}

export function sourcesSiteDeleteUrlV2Single(payload: { url: string }) {
  return httpClientDappros.delete(`/v2/sources/site-crawl/url`, { data: payload })
}

export function sourcesSiteDeleteUrlV2Batch(payload: { urls: string[] }) {
  return httpClientDappros.delete(`/v2/sources/site-crawl-v2/url`, { data: payload })
}

export function sourcesDocsUploadV2(formData: any, headers?: any) {
  return httpClientDappros.post(`/v2/sources/docs`, formData, { headers })
}

export function sourcesDocsDeleteV2(docId: string) {
  return httpClientDappros.delete(`/v2/sources/docs/${docId}`)
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
