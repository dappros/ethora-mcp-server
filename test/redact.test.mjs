import { test } from "node:test"
import assert from "node:assert/strict"
import { redactSecrets, isSecretKey, REDACTED, REDACTED_APP_TOKEN } from "../dist/redact.js"

test("redacts credential keys at any depth, keeps ids, does not mutate", () => {
  const input = {
    _id: "6aa900000000000000000001", appId: "6aa900000000000000000001",
    appSecret: "s3cr3t", tenantSecret: "t3n4nt", appToken: "JWT abc",
    systemChatAccount: { username: "sys", password: "pw" },
    nested: [{ walletPrivateKey: "pk", mnemonic: "words", label: "keep" }],
    refreshToken: "rt", accessToken: "at", jwt: "j", apiKey: "k", seed: "s",
    emptySecret: "", nullPassword: null,
  }
  const copy = JSON.parse(JSON.stringify(input))
  const out = redactSecrets(input)
  assert.deepEqual(input, copy, "input mutated")
  assert.equal(out._id, input._id); assert.equal(out.appId, input.appId)
  assert.equal(out.appSecret, REDACTED); assert.equal(out.tenantSecret, REDACTED)
  assert.equal(out.appToken, REDACTED_APP_TOKEN)
  assert.equal(out.systemChatAccount.password, REDACTED); assert.equal(out.systemChatAccount.username, "sys")
  assert.equal(out.nested[0].walletPrivateKey, REDACTED); assert.equal(out.nested[0].mnemonic, REDACTED); assert.equal(out.nested[0].label, "keep")
  for (const k of ["refreshToken", "accessToken", "jwt", "apiKey", "seed"]) assert.equal(out[k], REDACTED, k)
  assert.equal(out.emptySecret, "", "empty values are left alone"); assert.equal(out.nullPassword, null)
})

test("key matching is case-insensitive and suffix-aware", () => {
  for (const k of ["AppSecret", "APPTOKEN", "sqlSecret", "adminPassword", "WalletPrivateKey", "Mnemonic"]) assert.ok(isSecretKey(k), k)
  for (const k of ["appId", "_id", "userId", "tokenName", "secretsCount", "passwordless"]) assert.ok(!isSecretKey(k), k)
})

test("arrays and primitives pass through", () => {
  assert.deepEqual(redactSecrets([1, "a", { password: "x" }]), [1, "a", { password: REDACTED }])
  assert.equal(redactSecrets("plain"), "plain"); assert.equal(redactSecrets(null), null)
})
