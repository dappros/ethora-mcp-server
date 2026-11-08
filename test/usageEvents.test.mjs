// The usage sink batches, retries once, drops when the API is down and never throws.
import test from "node:test"
import assert from "node:assert/strict"
import { UsageSink, internalEventsEndpoint, userIdFromIdentityKey, outcomeFromToolResult } from "../dist/usageEvents.js"

const ev = (over = {}) => ({ kind: "tool_call", ts: new Date().toISOString(), serverVersion: "t", sessionId: "s", entry: "oauth", client: "c/1", userId: "", appId: "", authMode: "user", tool: "ethora-status", ok: true, ...over })

test("the endpoint drops the /v1 suffix and the sink is disabled without a secret", () => {
  assert.equal(internalEventsEndpoint("http://127.0.0.1:8080/v1"), "http://127.0.0.1:8080/internal/mcp/events")
  assert.equal(internalEventsEndpoint("https://api.example.com/v1/"), "https://api.example.com/internal/mcp/events")
  assert.equal(internalEventsEndpoint(""), "")
  const off = new UsageSink({ endpoint: "http://x/internal/mcp/events", secret: "" })
  assert.equal(off.enabled, false)
  off.record(ev())
  assert.equal(off.pending, 0)
})

test("events are posted in batches with the secret header, and a full batch flushes at once", async () => {
  const calls = []
  const fetchImpl = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, status: 202 } }
  const sink = new UsageSink({ endpoint: "http://api/internal/mcp/events", secret: "sek", batchSize: 3, flushMs: 60_000, fetchImpl, log: () => {} })
  sink.record(ev()); sink.record(ev()); assert.equal(sink.pending, 2)
  sink.record(ev())
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.headers["x-internal-secret"], "sek")
  assert.equal(calls[0].body.events.length, 3)
  assert.equal(sink.stats.sent, 3)
  sink.record(ev())
  await sink.flush()
  assert.equal(calls.length, 2)
  assert.equal(sink.pending, 0)
})

test("a failing API costs one retry, then the batch is dropped and recorded", async () => {
  let n = 0
  const fetchImpl = async () => { n += 1; throw new Error("ECONNREFUSED") }
  const sink = new UsageSink({ endpoint: "http://api/internal/mcp/events", secret: "sek", batchSize: 10, fetchImpl, log: () => {} })
  sink.record(ev()); sink.record(ev())
  await sink.flush()
  assert.equal(n, 2, "one retry")
  assert.deepEqual({ sent: sink.stats.sent, dropped: sink.stats.dropped, failedPosts: sink.stats.failedPosts }, { sent: 0, dropped: 2, failedPosts: 1 })
})

test("the queue is bounded: the oldest event is dropped when full", () => {
  const sink = new UsageSink({ endpoint: "http://api/x", secret: "s", batchSize: 1000, maxQueue: 3, flushMs: 60_000, fetchImpl: async () => ({ ok: true }), log: () => {} })
  for (let i = 0; i < 5; i++) sink.record(ev({ tool: `t${i}` }))
  assert.equal(sink.pending, 3)
  assert.equal(sink.stats.dropped, 2)
})

test("identity keys and tool results are read into event fields", () => {
  assert.equal(userIdFromIdentityKey("user:6acf6313534b82dd6c65aea4"), "6acf6313534b82dd6c65aea4")
  assert.equal(userIdFromIdentityKey("other:abc"), "")
  assert.equal(userIdFromIdentityKey(undefined), "")
  const envelope = (o) => ({ isError: o.ok === false, content: [{ type: "text", text: JSON.stringify(o) }] })
  assert.deepEqual(outcomeFromToolResult(envelope({ ok: true, data: {} })), { ok: true, code: undefined, httpStatus: undefined })
  assert.deepEqual(outcomeFromToolResult(envelope({ ok: false, error: { code: "NO_APP_YET", httpStatus: 422 } })), { ok: false, code: "NO_APP_YET", httpStatus: 422 })
  assert.deepEqual(outcomeFromToolResult({ content: [{ type: "text", text: "plain" }] }), { ok: true })
  assert.deepEqual(outcomeFromToolResult({ isError: true, content: [] }), { ok: false })
})
