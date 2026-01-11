import axios from "axios"
import { appConfig, normalizeApiUrl } from "./config.js"

export const httpTokens = {
  appJwt: appConfig.appJwt,
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

export const httpClientDappros = axios.create({
  baseURL: appConfig.apiUrl,
});

httpClientDappros.interceptors.request.use((config) => {
  // If the user provides a full URL, don't attempt to mutate headers.
  if (!config.url) return config

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

  if (!httpTokens.token) {
    throw new Error("Not logged in. Call `ethora-user-login` first.")
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
    hasUserToken: Boolean(httpTokens.token),
    hasRefreshToken: Boolean(httpTokens.refreshToken),
  }
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
