// Credentials on the OAuth connection: what needs which scope, and where the
// dashboard link points.
import test from "node:test"
import assert from "node:assert/strict"
import { requiredScope, parseScopes, isAllowed, OAUTH_HIDDEN_TOOLS } from "../dist/scopeGuard.js"
import { accountKeysUrl } from "../dist/tools.js"
import { rememberAppToken, appTokenFor } from "../dist/apiClientDappros.js"

test("minting a credential needs admin; listing keys is a read; revoking is admin", () => {
  assert.equal(requiredScope("ethora-api-key-create", { readOnlyHint: false }), "admin")
  assert.equal(requiredScope("ethora-app-token-create", { readOnlyHint: false }), "admin")
  assert.equal(requiredScope("ethora-app-credentials-reveal", { readOnlyHint: true }), "admin")
  assert.equal(requiredScope("ethora-api-key-list", { readOnlyHint: true }), "read")
  assert.equal(requiredScope("ethora-api-key-revoke", { readOnlyHint: false }), "admin")
  assert.equal(isAllowed(parseScopes("read write"), "admin"), false, "a read-write grant cannot mint a key")
  assert.equal(isAllowed(parseScopes("read write admin"), "admin"), true)
})

test("the API key tools are no longer hidden on OAuth; sign-in and B2B token tools are", () => {
  for (const n of ["ethora-api-key-create", "ethora-api-key-list", "ethora-api-key-revoke"]) assert.equal(OAUTH_HIDDEN_TOOLS.has(n), false, n)
  for (const n of ["ethora-user-login", "ethora-user-register", "ethora-session-configure", "ethora-auth-mode-set", "ethora-app-token-create", "ethora-app-token-rotate"]) assert.equal(OAUTH_HIDDEN_TOOLS.has(n), true, n)
})

test("the keys page link is derived from the public API URL, and never guessed", () => {
  assert.equal(accountKeysUrl("https://api.chat.ethora.com/v1"), "https://app.chat.ethora.com/app/account?tab=AI%20Assistants")
  assert.equal(accountKeysUrl("https://api.example.com/v2/"), "https://app.example.com/app/account?tab=AI%20Assistants")
  assert.equal(accountKeysUrl("http://127.0.0.1:8080/v1"), undefined, "a loopback API has no known dashboard host")
  assert.equal(accountKeysUrl("https://chat.example.com/api/v1"), undefined)
  assert.equal(accountKeysUrl(""), undefined)
})

test("a redaction marker from the API is never remembered as an app token", () => {
  rememberAppToken("64ab00000000000000000001", "[redacted: requires the admin scope]")
  assert.equal(appTokenFor("64ab00000000000000000001"), "")
  rememberAppToken("64ab00000000000000000001", "JWT real-token")
  assert.equal(appTokenFor("64ab00000000000000000001"), "JWT real-token")
})
