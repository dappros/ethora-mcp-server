// Every tool has exactly one group, the core group is small and free of the
// variant pairs reviewers flagged, and the titles map and the groups agree.
import test from "node:test"
import assert from "node:assert/strict"
import { TOOL_GROUPS, CORE_GROUP, groupOf, GROUP_NAMES } from "../dist/toolGroups.js"
import { TOOL_TITLES, STDIO_ONLY_TOOLS } from "../dist/toolTitles.js"

const allGrouped = Object.values(TOOL_GROUPS).flatMap((g) => g.tools)

test("every tool belongs to exactly one group", () => {
  const seen = new Map()
  for (const [g, def] of Object.entries(TOOL_GROUPS)) for (const t of def.tools) {
    assert.equal(seen.get(t), undefined, `${t} is in both ${seen.get(t)} and ${g}`)
    seen.set(t, g)
  }
  const titled = Object.keys(TOOL_TITLES)
  const missing = titled.filter((t) => !seen.has(t))
  assert.deepEqual(missing, [], `tools with a title but no group: ${missing.join(", ")}`)
  const unknown = allGrouped.filter((t) => !TOOL_TITLES[t])
  assert.deepEqual(unknown, [], `grouped tools with no title: ${unknown.join(", ")}`)
})

test("the core group is small and lists one variant per operation", () => {
  const core = TOOL_GROUPS[CORE_GROUP].tools
  assert.ok(core.length <= 25, `core has ${core.length} tools`)
  // Pairs that must never both be in the default list.
  const pairs = [
    ["ethora-sources-site-crawl-v2", "ethora-sources-site-crawl-v2-wait"],
    ["ethora-sources-docs-upload", "ethora-sources-docs-upload-v2"],
    ["ethora-chats-broadcast-v2", "ethora-chats-broadcast-job-v2"],
  ]
  for (const [a, b] of pairs) assert.ok(!(core.includes(a) && core.includes(b)), `${a} and ${b} both in core`)
  for (const t of core) assert.ok(!t.startsWith("ethora-bot-"), `legacy bot tool ${t} in core`)
  for (const t of STDIO_ONLY_TOOLS) assert.ok(!core.includes(t), `stdio-only ${t} in core`)
  assert.ok(core.includes("ethora-tools-enable"))
  assert.equal(groupOf("ethora-tools-enable"), CORE_GROUP)
  assert.ok(GROUP_NAMES.includes("legacy-bot"))
})
