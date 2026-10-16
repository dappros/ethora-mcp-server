#!/usr/bin/env node
// Render docs/TOOL_ANNOTATIONS.md from the annotation table, so the document
// handed to directory reviewers is generated from the same source the server
// serves in tools/list. Run after `npm run build`:
//
//   node scripts/tool-annotations-doc.mjs            # write the file
//   node scripts/tool-annotations-doc.mjs --check    # exit 1 when it is stale
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const { TOOL_ANNOTATIONS } = await import(join(root, "dist/toolAnnotations.js"))
const { TOOL_TITLES, STDIO_ONLY_TOOLS } = await import(join(root, "dist/toolTitles.js"))
const { TOOL_GROUPS, CORE_GROUP } = await import(join(root, "dist/toolGroups.js"))

const groupOf = {}
for (const [g, def] of Object.entries(TOOL_GROUPS)) for (const t of def.tools) groupOf[t] = g
const yn = (b) => (b ? "yes" : "no")

const lines = []
lines.push("# Tool annotations")
lines.push("")
lines.push("Generated from `src/toolAnnotations.ts` by `scripts/tool-annotations-doc.mjs`; do not edit by hand.")
lines.push("")
lines.push("Every tool the server lists carries the four MCP annotation hints as explicit booleans. The rules:")
lines.push("")
lines.push("- **readOnlyHint** is true when the call stores nothing on the server: it returns data, or changes only what this conversation points at (the selected app, the listed tools).")
lines.push("- **destructiveHint** is true when the call deletes, revokes, rotates or removes something, or overwrites existing data: updates and sets, and the re-crawl, re-index and refresh jobs that replace stored pages or index entries. Creating, appending, toggling a reversible flag or starting a job that only adds is not destructive. Always false for read-only tools.")
lines.push("- **idempotentHint** is true when repeating the call with the same arguments has no further effect. Create, send, upload, start-a-job, rotate, register, clone, import, append and model runs are not idempotent.")
lines.push("- **openWorldHint** is true when the call leaves the MCP server: every call to the Ethora API (an independently operated system from the client's point of view), every fetch of an external website, every message delivered to other people. It is false only for the tools that run entirely inside the server: session state, help, documentation search and text generators.")
lines.push("")
lines.push("The hosted server (`mcp.chat.ethora.com`) never lists the stdio-only wallet tools. On the OAuth entry (`/mcp/oauth`, used by ChatGPT and Claude.ai) every tool outside the `keys`, `session`, `b2b` and `legacy-bot` groups is listed up front and `ethora-tools-enable` is absent. On the open and personal-URL entries, group `core` is listed by default and the other groups appear after `ethora-tools-enable`.")
lines.push("")

const order = [CORE_GROUP, ...Object.keys(TOOL_GROUPS).filter((g) => g !== CORE_GROUP).sort(), "stdio-only", "aliases"]
const bucket = (name) => (STDIO_ONLY_TOOLS.includes(name) ? "stdio-only" : groupOf[name] || "aliases")
for (const g of order) {
  const names = Object.keys(TOOL_TITLES).filter((n) => bucket(n) === g).sort()
  if (!names.length) continue
  lines.push(`## ${g === "aliases" ? "Aliases (rewritten to their canonical tool)" : g === "stdio-only" ? "stdio-only (not on the hosted server)" : `Group \`${g}\``}`)
  lines.push("")
  lines.push("| Tool | Read-only | Destructive | Idempotent | Open world | Why |")
  lines.push("|---|---|---|---|---|---|")
  for (const n of names) {
    const a = TOOL_ANNOTATIONS[n]
    if (!a) throw new Error(`no annotation entry for ${n}`)
    lines.push(`| \`${n}\` | ${yn(a.readOnlyHint)} | ${yn(a.destructiveHint)} | ${yn(a.idempotentHint)} | ${yn(a.openWorldHint)} | ${a.why.replace(/\|/g, "\\|")} |`)
  }
  lines.push("")
}

const out = join(root, "docs/TOOL_ANNOTATIONS.md")
const text = lines.join("\n")
if (process.argv.includes("--check")) {
  let current = ""
  try { current = readFileSync(out, "utf8") } catch { /* missing counts as stale */ }
  if (current !== text) { console.error("docs/TOOL_ANNOTATIONS.md is stale; run node scripts/tool-annotations-doc.mjs"); process.exit(1) }
  console.log("docs/TOOL_ANNOTATIONS.md is current")
} else {
  writeFileSync(out, text)
  console.log(`wrote ${out} (${Object.keys(TOOL_TITLES).length} tools)`)
}
