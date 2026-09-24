// The agent tools grew two names for the same argument: `agentId` on get,
// update, clone, activate and select, and `agentIdOrAddress` on invite, diag,
// soul, visibility, export and delete. A model that learns one name uses it
// everywhere and gets a schema rejection on half the family, which a QA sweep
// caught as the single most confusing thing in the agent surface.
//
// Renaming either name would break callers, so instead every agent tool accepts
// BOTH: the declared name keeps its place in the schema, the other is added as
// an optional alias, and the callback is wrapped to copy whichever arrived into
// both slots before the handler reads it. Applied centrally at build time, the
// way annotations and scopes are, so a new agent tool inherits the behaviour.
import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { fail } from "./mcpResponse.js"

const PRIMARY = "agentIdOrAddress"
const ALIAS = "agentId"

function isOptional(schema: any): boolean {
  try {
    return typeof schema?.isOptional === "function" ? schema.isOptional() : false
  } catch {
    return false
  }
}

/**
 * Make every agent tool accept `agentId` and `agentIdOrAddress` interchangeably.
 * Returns the names of the tools that were adjusted.
 */
export function applyAgentIdAliases(server: McpServer): string[] {
  const reg: Record<string, any> = (server as any)._registeredTools || {}
  const touched: string[] = []

  for (const [name, tool] of Object.entries(reg)) {
    const shape = tool?.inputSchema?.shape
    if (!shape) continue

    const hasPrimary = Boolean(shape[PRIMARY])
    const hasAlias = Boolean(shape[ALIAS])
    // Nothing to do when the tool takes neither, or already takes both.
    if (hasPrimary === hasAlias) continue

    const declared = hasPrimary ? PRIMARY : ALIAS
    const missing = hasPrimary ? ALIAS : PRIMARY
    const wasRequired = !isOptional(shape[declared])

    const nextShape: Record<string, any> = { ...shape }
    // Both names become optional in the schema; the callback enforces that one
    // of them arrived, so the caller still gets a clear error when neither does.
    if (wasRequired) nextShape[declared] = shape[declared].optional()
    nextShape[missing] = z
      .string()
      .min(1)
      .optional()
      .describe(`Alias for \`${declared}\` - either name is accepted, pass whichever you have.`)
    tool.inputSchema = z.object(nextShape)

    const inner = tool.callback
    tool.callback = async (args: any, extra: any) => {
      const next = { ...(args || {}) }
      const value = next[declared] ?? next[missing]
      if (!value && wasRequired) {
        // Both names are optional in the schema now, so this is where a missing
        // id is caught. Answer with the normal envelope rather than throwing,
        // which would surface as a protocol error with no code for the caller.
        const err = Object.assign(
          new Error(
            `\`${declared}\` is required. Pass the agent's Mongo _id or address as \`${declared}\` (or as \`${missing}\`, which is accepted as an alias). Get one from \`ethora-agent-list\`.`
          ),
          { code: "VALIDATION_ERROR" }
        )
        return { content: [{ type: "text", text: JSON.stringify(fail(err, { tool: name })) }] }
      }
      if (value) {
        next[declared] = value
        // Only the declared name goes through: tools that spread their
        // remaining arguments into the API body would otherwise send the
        // alias field too, and the API rejects unknown fields.
        delete next[missing]
      }
      return inner(next, extra)
    }

    touched.push(name)
  }

  return touched
}
