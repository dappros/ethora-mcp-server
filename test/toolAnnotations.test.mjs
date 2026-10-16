// Every tool carries all four MCP hints as explicit booleans with a reason,
// the hints are internally consistent, and the live hosted registry agrees
// with the table (directory reviews check tools/list, not the source).
import test from "node:test"
import assert from "node:assert/strict"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { TOOL_ANNOTATIONS, HINT_KEYS } from "../dist/toolAnnotations.js"
import { TOOL_TITLES, applyToolMeta, removeStdioOnlyTools } from "../dist/toolTitles.js"
import { registerTools } from "../dist/tools.js"
import { registerToolsEnable, applyOAuthSurface, OAUTH_HIDDEN_GROUPS, TOOL_GROUPS } from "../dist/toolGroups.js"
import { OAUTH_HIDDEN_TOOLS } from "../dist/scopeGuard.js"
import { registerPromptsAndResources } from "../dist/prompts.js"
import { registerDocsSearch } from "../dist/docsSearch.js"
import { setHostedMode } from "../dist/session.js"

test("every titled tool has an annotation entry with four booleans and a reason", () => {
  const missing = Object.keys(TOOL_TITLES).filter((t) => !TOOL_ANNOTATIONS[t])
  assert.deepEqual(missing, [], `tools without an annotation entry: ${missing.join(", ")}`)
  const orphans = Object.keys(TOOL_ANNOTATIONS).filter((t) => !TOOL_TITLES[t])
  assert.deepEqual(orphans, [], `annotation entries for unknown tools: ${orphans.join(", ")}`)
  for (const [name, a] of Object.entries(TOOL_ANNOTATIONS)) {
    for (const k of HINT_KEYS) assert.equal(typeof a[k], "boolean", `${name}.${k} must be a boolean`)
    assert.ok(typeof a.why === "string" && a.why.length > 20, `${name} needs a justification`)
  }
})

test("hints are consistent: read-only tools are neither destructive nor non-idempotent", () => {
  for (const [name, a] of Object.entries(TOOL_ANNOTATIONS)) {
    if (a.readOnlyHint) {
      assert.equal(a.destructiveHint, false, `${name} is read-only but destructive`)
      assert.equal(a.idempotentHint, true, `${name} is read-only but not idempotent`)
    }
    // A reason that says "every call ..." describes a non-idempotent tool.
    if (/every call/i.test(a.why)) assert.equal(a.idempotentHint, false, `${name}: reason says every call acts, hint says idempotent`)
    if (/stores nothing/i.test(a.why)) assert.equal(a.readOnlyHint, true, `${name}: reason says stores nothing, hint says not read-only`)
  }
})

test("the hosted registry carries the table's hints on every tool", () => {
  setHostedMode(true)
  const server = new McpServer({ name: "test", version: "0" })
  registerTools(server)
  registerToolsEnable(server)
  registerPromptsAndResources(server)
  registerDocsSearch(server)
  removeStdioOnlyTools(server)
  const meta = applyToolMeta(server)
  assert.deepEqual(meta.unknownAnnotations, [], `registered tools missing from TOOL_ANNOTATIONS: ${meta.unknownAnnotations.join(", ")}`)
  const reg = server._registeredTools
  assert.ok(Object.keys(reg).length > 50, "registry looks too small")
  for (const [name, tool] of Object.entries(reg)) {
    const a = tool.annotations || {}
    for (const k of HINT_KEYS) assert.equal(typeof a[k], "boolean", `${name}.${k} is ${a[k]} in tools/list`)
    const expected = TOOL_ANNOTATIONS[name]
    for (const k of HINT_KEYS) assert.equal(a[k], expected[k], `${name}.${k} differs from the table`)
    assert.ok(a.title, `${name} has no title`)
  }
})

test("every tool that calls the Ethora API or the web is open-world; only in-server tools are closed", () => {
  const local = new Set(["ethora-status", "ethora-help", "ethora-tools-enable", "ethora-app-select", "search", "fetch", "ethora-session-configure", "ethora-auth-mode-set", "ethora.b2b.auth.use", "ethora-b2b-runbook-generate", "ethora-env-examples-generate", "ethora-chat-component-app-generate"])
  for (const [name, a] of Object.entries(TOOL_ANNOTATIONS)) {
    assert.equal(a.openWorldHint, !local.has(name), `${name}.openWorldHint`)
  }
})

test("the OAuth surface lists every offered tool up front and keeps nothing hidden or enable-able", () => {
  setHostedMode(true)
  const server = new McpServer({ name: "test", version: "0" })
  registerTools(server)
  registerToolsEnable(server)
  registerPromptsAndResources(server)
  registerDocsSearch(server)
  removeStdioOnlyTools(server)
  applyToolMeta(server)
  const { listed, removed } = applyOAuthSurface(server)
  const reg = server._registeredTools
  assert.ok(listed.length >= 50, `only ${listed.length} tools listed`)
  assert.equal(reg["ethora-tools-enable"], undefined, "tools-enable must not exist on OAuth")
  for (const n of OAUTH_HIDDEN_TOOLS) assert.equal(reg[n], undefined, `${n} must not exist on OAuth`)
  for (const g of OAUTH_HIDDEN_GROUPS) for (const n of TOOL_GROUPS[g].tools) assert.equal(reg[n], undefined, `${n} (${g}) must not exist on OAuth`)
  for (const [name, t] of Object.entries(reg)) {
    assert.notEqual(t.enabled, false, `${name} is listed but disabled`)
    assert.equal(t._hiddenByGroup, undefined, `${name} still marked hidden`)
  }
  assert.ok(removed.includes("ethora-tools-enable"))
})
