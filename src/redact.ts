// Redaction of credential-bearing fields in tool results.
//
// The Ethora API returns full app documents to their owner (appSecret,
// tenantSecret, appToken, system-chat passwords ...). An MCP tool result goes
// into the model's context and the client vendor's logs, so those values must
// not leave the server unless a tool exists specifically to reveal them
// (`ethora-app-credentials-reveal` for the appToken and, on request, the App
// Secret; the login/register/api-key tools for their own tokens).

export const REDACTED = "[redacted]"
export const REDACTED_APP_CREDENTIAL = "[redacted - call ethora-app-credentials-reveal to reveal appToken]"
// Template literal on purpose: the plugin directory scanner reads `SECRET = "<8+ chars>"`
// as a hardcoded credential, whatever the text says.
export const REDACTED_APP_SECRET = `[redacted - call ethora-app-credentials-reveal { confirm: true, secret: true } to reveal appSecret]`

// Exact key names (case-insensitive) that always carry a credential.
const EXACT_KEYS = /^(appSecret|tenantSecret|appToken|appJwt|b2bToken|token|authToken|idToken|serverToken|password|secret|privateKey|mnemonic|seed|refreshToken|accessToken|jwt|apiKey|api_key|clientSecret)$/i
// Suffix match for compound names such as systemChatPassword, sqlSecret, walletPrivateKey.
const SUFFIX_KEYS = /(secret|password|privateKey|mnemonic)$/i

export function isSecretKey(key: string): boolean {
  return EXACT_KEYS.test(key) || SUFFIX_KEYS.test(key)
}

function replacementFor(key: string): string {
  if (/^appToken$/i.test(key)) return REDACTED_APP_CREDENTIAL
  if (/^appSecret$/i.test(key)) return REDACTED_APP_SECRET
  return REDACTED
}

// Deep-copies `value`, replacing the value of every credential-named key at any
// depth. Never mutates the input. Ids (`_id`, `appId`, `userId`, ...) are kept.
export function redactSecrets<T>(value: T): T {
  return walk(value, new WeakMap()) as T
}

function walk(value: any, seen: WeakMap<object, any>): any {
  if (value === null || typeof value !== "object") return value
  if (seen.has(value)) return seen.get(value)
  if (Array.isArray(value)) {
    const out: any[] = []
    seen.set(value, out)
    for (const item of value) out.push(walk(item, seen))
    return out
  }
  if (value instanceof Date) return new Date(value.getTime())
  const out: Record<string, any> = {}
  seen.set(value, out)
  for (const [k, v] of Object.entries(value)) {
    if (isSecretKey(k) && v !== null && v !== undefined && v !== "") {
      out[k] = replacementFor(k)
    } else {
      out[k] = walk(v, seen)
    }
  }
  return out
}
