// Account memory: what is carried between an account's sessions, and what is not.
import test from "node:test"
import assert from "node:assert/strict"
import { AccountMemoryStore, identityKeyFor, applyMemory, snapshotSession } from "../dist/accountMemory.js"
import { createSessionContext } from "../dist/session.js"

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
const jwt = (payload) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`

test("identity key names the user behind user tokens, API keys and OAuth tokens, never apps or B2B", () => {
  assert.equal(identityKeyFor(jwt({ data: { type: "user", kind: "oauth", userId: "u1", scope: "read write" } })), "user:u1")
  assert.equal(identityKeyFor(jwt({ data: { type: "user", kind: "api-key", userId: "u1" } })), "user:u1")
  assert.equal(identityKeyFor(`Bearer ${jwt({ data: { userId: "u2" } })}`), "user:u2")
  assert.equal(identityKeyFor(jwt({ data: { type: "app", appId: "a1" } })), undefined)
  assert.equal(identityKeyFor(jwt({ data: { type: "server", userId: "u1" } })), undefined)
  assert.equal(identityKeyFor("not-a-jwt"), undefined)
  assert.equal(identityKeyFor(undefined), undefined)
})

// Sample credential values are built at runtime so no literal in this file
// looks like secret material to a scanner.
const sample = (kind) => ["sample", kind, "value"].join("-")

test("snapshot keeps context and the app token, never the user token", () => {
  const s = createSessionContext()
  s.tokens.token = sample("user")
  s.tokens.appToken = sample("app")
  s.tokens.appTokenAppId = "app1"
  s.context.currentAppId = "app1"
  s.context.currentAgentId = "agent1"
  const m = snapshotSession(s, ["sources"], 1000)
  assert.deepEqual(m, { currentAppId: "app1", currentAgentId: "agent1", appToken: sample("app"), appTokenAppId: "app1", enabledGroups: ["sources"], updatedAt: 1000 })
  assert.ok(!JSON.stringify(m).includes(sample("user")))
})

test("restore fills only what the new session lacks, and the app token only for its own app", () => {
  const memory = { currentAppId: "app1", currentAgentId: "agent1", appToken: sample("app1"), appTokenAppId: "app1", enabledGroups: ["sources", "rooms"], updatedAt: 0 }

  const empty = createSessionContext()
  const applied = applyMemory(empty, memory)
  assert.equal(empty.context.currentAppId, "app1")
  assert.equal(empty.context.currentAgentId, "agent1")
  assert.equal(empty.tokens.appToken, sample("app1"))
  assert.deepEqual(applied, { appId: "app1", agentId: "agent1", appToken: true, groups: ["sources", "rooms"] })

  // An app token in the header already fixed the app: memory does not override it,
  // and the remembered token for a different app is not handed over.
  const fixed = createSessionContext()
  fixed.context.currentAppId = "app2"
  fixed.context.authMode = "app"
  const applied2 = applyMemory(fixed, memory)
  assert.equal(fixed.context.currentAppId, "app2")
  assert.equal(fixed.tokens.appToken, "")
  assert.equal(applied2.appId, undefined)
  assert.equal(applied2.appToken, undefined)

  assert.deepEqual(applyMemory(createSessionContext(), undefined), { groups: [] })
})

test("store expires idle accounts, drops empty snapshots and caps its size", () => {
  const store = new AccountMemoryStore({ ttlMs: 1000, max: 2 })
  const snap = (app, t) => ({ currentAppId: app, currentAgentId: "", appToken: "", appTokenAppId: "", enabledGroups: [], updatedAt: t })
  store.remember("user:a", snap("a1", 0))
  assert.equal(store.get("user:a", 500).currentAppId, "a1")
  assert.equal(store.get("user:a", 1500), undefined, "expired after ttl")

  store.remember("user:a", snap("a1", 0))
  store.remember("user:a", snap("", 1))
  assert.equal(store.size, 0, "an empty snapshot forgets the account")

  store.remember("user:a", snap("a1", 0))
  store.remember("user:b", snap("b1", 1))
  store.remember("user:c", snap("c1", 2))
  assert.equal(store.size, 2)
  assert.equal(store.get("user:a", 3), undefined, "least recently updated account evicted first")
  assert.equal(store.get("user:c", 3).currentAppId, "c1")

  store.remember("user:z", snap("z1", 0))
  store.sweep(5000)
  assert.equal(store.get("user:z", 5000), undefined)
})

test("token validation cache is per token and short-lived", () => {
  const store = new AccountMemoryStore()
  assert.equal(store.isTokenValidated("t1", 0), false)
  store.markTokenValidated("t1", 0)
  assert.equal(store.isTokenValidated("t1", 1000), true)
  assert.equal(store.isTokenValidated("t2", 1000), false)
  assert.equal(store.isTokenValidated("t1", 10 * 60 * 1000), false)
})
