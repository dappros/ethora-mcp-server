#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// Load a local `.env` (cwd) before anything reads process.env. Real
// environment variables always win over the file. Tiny parser on purpose: no
// dotenv dependency for the npm CLI.
function loadDotEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8")
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq <= 0) continue
      const key = line.slice(0, eq).trim().replace(/^export\s+/, "")
      let value = line.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    // no .env, fine
  }
}
loadDotEnv()

const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js")
const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js")
const { registerTools } = await import("./tools.js")
const { registerPromptsAndResources } = await import("./prompts.js")
const { registerDocsSearch } = await import("./docsSearch.js")
const { isHostedMode } = await import("./session.js")
const { instructionsFor } = await import("./instructions.js")
const { applyScopeGuard } = await import("./scopeGuard.js")
const { applyToolMeta, removeStdioOnlyTools } = await import("./toolTitles.js")
const { applyAgentIdAliases } = await import("./agentIdAliases.js")
const { applyToolContext } = await import("./toolContext.js")

const SERVER_NAME = "Ethora MCP Server"
const SERVER_VERSION = "26.9.1"

export function buildServer(profile?: "open" | "authenticated" | "oauth") {
  // In HTTP mode this runs once per session, after setHostedMode(true); the
  // entry point (open, personal URL / bearer, OAuth) picks the instructions so
  // the model never tries to log in on a connection that is already authenticated.
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: instructionsFor(isHostedMode() ? (profile || "open") : "stdio") }
  )
  registerTools(server)
  registerPromptsAndResources(server)
  registerDocsSearch(server)
  // Hosted surface never offers money/crypto movement (directory review rule);
  // the stdio CLI keeps it behind ETHORA_MCP_ENABLE_DANGEROUS_TOOLS.
  if (isHostedMode()) removeStdioOnlyTools(server)
  // Titles + explicit annotation booleans on every tool (directory requirements),
  // then the agent-id aliases, then the scope guard, which reads the normalised
  // annotations and must wrap the outermost callback.
  applyToolMeta(server)
  applyAgentIdAliases(server)
  // Records the executing tool so outbound API calls carry X-Ethora-Tool.
  applyToolContext(server)
  applyScopeGuard(server)
  return server
}

// Kept for backwards compatibility with code importing `server` from index.
export const server = buildServer()

function wantsHttp() {
  if (process.argv.includes("--http")) return true
  if (process.argv.includes("--stdio")) return false
  return String(process.env.ETHORA_MCP_TRANSPORT || "").trim().toLowerCase() === "http"
}

async function runServer() {
  try {
    if (wantsHttp()) {
      const { startHttpServer } = await import("./httpServer.js")
      await startHttpServer({ name: SERVER_NAME, version: SERVER_VERSION, buildServer })
      return
    }

    console.error("Attempting to start Ethora MCP Server.")
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error("Successfully started Ethora MCP Server.")
  } catch (error) {
    console.error("Failed to start Ethora MCP Server.", error)
    process.exit(1)
  }
}

runServer().catch((error) => {
  console.error("Failed to start Ethora MCP Server.", error)
  process.exit(1)
})
