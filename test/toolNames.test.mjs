// 27.x naming: one rule for every listed name, and every earlier name kept
// as an alias that resolves to a tool that exists.
import test from "node:test"
import assert from "node:assert/strict"
import { TOOL_TITLES } from "../dist/toolTitles.js"
import { TOOL_ALIASES, TOOL_RENAMES, canonicalToolName, aliasesOf } from "../dist/toolNames.js"

const canonical = Object.keys(TOOL_TITLES).filter((n) => !n.includes("."))

test("every listed name follows ethora-<resource>-<verb>[-<qualifier>]", () => {
  const rule = /^(search|fetch|ethora-[a-z0-9]+(-[a-z0-9]+)*)$/
  for (const n of canonical) assert.match(n, rule, n)
  const versioned = canonical.filter((n) => /-v\d\b/.test(n))
  assert.deepEqual(versioned, [], `API version suffixes leaked into names: ${versioned}`)
  const verbFirst = canonical.filter((n) => /^ethora-(wait|generate|get|run|set|create|delete|list)-/.test(n))
  assert.deepEqual(verbFirst, [], `verb-first names: ${verbFirst}`)
  const qualifierMisplaced = canonical.filter((n) => /-(wait|batch|legacy|b2b)-/.test(n) && !/-(url-delete-batch|batch-(create|job-start|job-wait)|b2b-(app|runbook))/.test(n))
  assert.deepEqual(qualifierMisplaced, [], `qualifier before the verb: ${qualifierMisplaced}`)
})

test("every alias resolves to a real tool and is not itself listed", () => {
  const titled = new Set(Object.keys(TOOL_TITLES))
  for (const [from, a] of Object.entries(TOOL_ALIASES)) {
    assert.ok(titled.has(a.to), `${from} -> ${a.to}: target has no title (not registered?)`)
    if (!from.includes(".")) assert.ok(!titled.has(from), `${from} is both an alias and a listed tool`)
    assert.notEqual(from, a.to)
  }
  assert.equal(canonicalToolName("ethora-agents-list-v2"), "ethora-agent-list")
  assert.equal(canonicalToolName("ethora-agent-list"), "ethora-agent-list")
  assert.deepEqual(aliasesOf("ethora-auth-mode-set").sort(), ["ethora-auth-use-app", "ethora-auth-use-b2b", "ethora-auth-use-user", "ethora.b2b.auth.use"])
  assert.ok(Object.keys(TOOL_RENAMES).length >= 60)
})
