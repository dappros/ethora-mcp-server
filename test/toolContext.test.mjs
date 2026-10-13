// The default-app rule for user sessions with no current app.
import test from "node:test"
import assert from "node:assert/strict"
import { decideDefaultApp, NO_DEFAULT_APP_TOOLS } from "../dist/toolContext.js"
import { appIdFromToken } from "../dist/apiClientDappros.js"

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
const jwt = (payload) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`

test("appIdFromToken reads a user token's app and an app JWT's own id", () => {
  assert.equal(appIdFromToken(jwt({ data: { type: "user", kind: "api-key", userId: "u1", appId: "base" } })), "base")
  // The deployment app JWT carries the app document: _id, not appId.
  assert.equal(appIdFromToken(`JWT ${jwt({ data: { _id: "base", displayName: "Ethora", isBaseApp: true } })}`), "base")
  assert.equal(appIdFromToken(jwt({ data: { type: "user", userId: "u1" } })), undefined, "a user token without appId names no app")
  assert.equal(appIdFromToken("garbage"), undefined)
})

test("an account with exactly one app adopts it", () => {
  assert.deepEqual(decideDefaultApp({ ownedAppIds: ["app1"], userAppId: "base", baseAppId: "base" }), { action: "adopt", appId: "app1" })
  assert.deepEqual(decideDefaultApp({ ownedAppIds: ["app1"], userAppId: "tenant", baseAppId: "base" }), { action: "adopt", appId: "app1" })
})

test("a base-app account with no app is refused; a tenant member with no app keeps the bare route", () => {
  assert.deepEqual(decideDefaultApp({ ownedAppIds: [], userAppId: "base", baseAppId: "base" }), { action: "refuse" })
  assert.deepEqual(decideDefaultApp({ ownedAppIds: [], userAppId: "tenant", baseAppId: "base" }), { action: "none" })
  // Unknown base app (stdio without an app JWT): never refuse on a guess.
  assert.deepEqual(decideDefaultApp({ ownedAppIds: [], userAppId: "base", baseAppId: undefined }), { action: "none" })
})

test("several apps leave the explicit appId contract in place", () => {
  assert.deepEqual(decideDefaultApp({ ownedAppIds: ["a", "b"], userAppId: "base", baseAppId: "base" }), { action: "none" })
})

test("the tools that create or pick an app are never blocked", () => {
  for (const t of ["ethora-app-create", "ethora-app-list", "ethora-app-select", "ethora-status", "ethora-help", "search", "fetch", "ethora-agent-model-list"]) {
    assert.ok(NO_DEFAULT_APP_TOOLS.has(t), t)
  }
  assert.ok(!NO_DEFAULT_APP_TOOLS.has("ethora-chat-create"))
})
