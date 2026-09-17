// Records which tool is executing, for the duration of the call.
//
// Outbound API calls carry `X-Ethora-Tool` so the backend can count usage per
// tool. Threading the name through every handler would touch ~90 call sites and
// a new tool would silently forget to do it, so it is set once here instead:
// wrapping the registered callback is the only point that reliably knows the
// name for exactly the span of the call, including the API requests the handler
// makes. Applied at build time alongside the annotation and scope passes.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { getSession } from "./session.js"

export function applyToolContext(server: McpServer): string[] {
  const reg: Record<string, any> = (server as any)._registeredTools || {}
  const wrapped: string[] = []

  for (const [name, tool] of Object.entries(reg)) {
    if (!tool || typeof tool.callback !== "function" || tool.__toolContext) continue
    const inner = tool.callback
    tool.callback = async (...args: any[]) => {
      const session = getSession()
      // Nested calls are not a thing (one tool per request), but restore the
      // previous value anyway so a future wrapper cannot be surprised.
      const previous = session.currentTool
      session.currentTool = name
      try {
        return await inner(...args)
      } finally {
        session.currentTool = previous
      }
    }
    tool.__toolContext = true
    wrapped.push(name)
  }

  return wrapped
}
