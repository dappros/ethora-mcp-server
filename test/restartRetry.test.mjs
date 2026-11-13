// A server restart or update: reads wait and retry, writes say "call again".
import test from "node:test"
import assert from "node:assert/strict"
import axios, { AxiosError } from "axios"
import { installRestartRetry, classifyRestart, retryAfterMs, restartErrorMessage } from "../dist/restartRetry.js"
import { fail } from "../dist/mcpResponse.js"

// A stub transport: each call takes the next scripted answer
// ({ status, data, headers } or { errno }).
function client(script, opts = {}) {
  const calls = []
  const c = axios.create({
    baseURL: "http://api.test/v1",
    adapter: async (config) => {
      calls.push(config.method)
      const next = script.shift() || { status: 200, data: { ok: true } }
      if (next.errno) {
        const err = new AxiosError("connect " + next.errno, next.errno, config)
        throw err
      }
      const response = { status: next.status, statusText: "", data: next.data || {}, headers: next.headers || {}, config }
      if (next.status >= 400) throw new AxiosError("Request failed with status code " + next.status, "ERR_BAD_RESPONSE", config, null, response)
      return response
    },
  })
  let t = 0
  const waits = []
  installRestartRetry(c, { sleep: async (ms) => { waits.push(ms); t += ms }, now: () => t, ...opts })
  return { c, calls, waits }
}

const restarting = (retryAfter = "2") => ({ status: 503, data: { code: "SERVER_RESTARTING" }, headers: { "retry-after": retryAfter } })

test("a read retries through a restart and succeeds, waiting what Retry-After asks", async () => {
  const { c, calls, waits } = client([restarting("2"), { status: 503, data: { code: "SERVER_UNAVAILABLE" } }, { errno: "ECONNREFUSED" }, { status: 200, data: { ok: true } }])
  const res = await c.get("/apps")
  assert.equal(res.status, 200)
  assert.equal(calls.length, 4)
  assert.deepEqual(waits, [2000, 3000, 3000])
})

test("a read gives up after the budget and the error is marked as a restart", async () => {
  const script = Array.from({ length: 50 }, () => restarting("10"))
  const { c, calls } = client(script, { budgetMs: 45_000 })
  await assert.rejects(c.get("/apps"), (err) => {
    assert.equal(err.ethoraRestart.code, "SERVER_RESTARTING")
    return true
  })
  assert.ok(calls.length >= 4 && calls.length <= 6, `attempts: ${calls.length}`)
})

test("a write is never retried", async () => {
  const { c, calls } = client([restarting(), { status: 200 }])
  await assert.rejects(c.post("/chats", { title: "x" }), (err) => err.ethoraRestart?.code === "SERVER_RESTARTING")
  assert.equal(calls.length, 1)
})

test("other errors pass through untouched", async () => {
  const { c, calls } = client([{ status: 503, data: { code: "SECURE_FILES_NOT_CONFIGURED" } }, { status: 404, data: { error: "nope" } }])
  await assert.rejects(c.get("/files/secure"), (err) => err.response.status === 503 && !err.ethoraRestart)
  await assert.rejects(c.get("/x"), (err) => err.response.status === 404 && !err.ethoraRestart)
  assert.equal(calls.length, 2)
})

test("Retry-After: seconds, HTTP date, default and cap", () => {
  assert.equal(retryAfterMs("4"), 4000)
  assert.equal(retryAfterMs("120"), 10_000)
  assert.equal(retryAfterMs(undefined), 3000)
  assert.equal(retryAfterMs("soon"), 3000)
  assert.equal(retryAfterMs(new Date(5_000).toUTCString(), 0), 5000)
})

test("classification: restart codes, bare 502/503/504, connection errors", () => {
  const r = (status, data) => ({ response: { status, data, headers: {} } })
  assert.equal(classifyRestart(r(503, { code: "SERVER_RESTARTING" })).code, "SERVER_RESTARTING")
  assert.equal(classifyRestart(r(503, {})).code, "SERVER_UNAVAILABLE")
  assert.equal(classifyRestart(r(502, "")).code, "SERVER_UNAVAILABLE")
  assert.equal(classifyRestart(r(504, "")).code, "SERVER_UNAVAILABLE")
  assert.equal(classifyRestart({ code: "ECONNRESET" }).code, "SERVER_UNAVAILABLE")
  assert.equal(classifyRestart(r(500, {})), null)
  assert.equal(classifyRestart({ code: "ENOTFOUND" }), null)
})

test("the tool result says to wait and call again, marked retryable", async () => {
  const { c } = client([restarting()])
  let caught
  try { await c.post("/chats", {}) } catch (e) { caught = e }
  const env = fail(caught, { tool: "ethora-chat-create" })
  assert.equal(env.ok, false)
  assert.equal(env.error.code, "SERVER_RESTARTING")
  assert.equal(env.error.retryable, true)
  assert.equal(env.error.message, "The Ethora server is restarting or updating (SERVER_RESTARTING). Wait about a minute and call the tool again.")
  assert.equal(restartErrorMessage("SERVER_UNAVAILABLE"), "The Ethora server is restarting or updating (SERVER_UNAVAILABLE). Wait about a minute and call the tool again.")
  // A bare proxy 502 that never went through the retry is classified too.
  const env2 = fail({ response: { status: 502, data: "", headers: {} } })
  assert.equal(env2.error.code, "SERVER_UNAVAILABLE")
  assert.equal(env2.error.retryable, true)
})
