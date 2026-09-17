import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"
import z from "zod"
import { AUTH_MAP_MD, CHAT_COMPONENT_QUICKSTART_MD, BACKEND_SDK_QUICKSTART_MD, RECIPES_MD, AGENT_FLOWS_MD } from "./prompts.js"
import { HOSTED_INSTRUCTIONS } from "./instructions.js"

// `search` + `fetch`: the two-tool convention ChatGPT connectors expect, also
// useful to any assistant answering "how do I ..." questions about Ethora.
// The corpus is in-memory: the markdown resources split by heading, one
// document per registered tool, and two hosted-mode guides.

const README_URL = "https://github.com/dappros/ethora-mcp-server#readme"
const TOOLS_URL = "https://github.com/dappros/ethora-mcp-server#tools"

type Doc = {
  id: string
  title: string
  text: string
  url: string
  kind: "doc" | "tool"
  guide?: boolean
}

const CREDENTIALS_MD = `
# Credentials: which one for what

## App ID
Public identifier of an app (24-char hex). Safe to share; every app-scoped call needs it.

## appToken
App-scoped JWT used by the chat component, the AI chat widget and app-token automation.
Never included in tool results (they show \`[redacted]\`). Reveal it on purpose with
\`ethora-app-credentials { appId, confirm: true }\`; rotate it with \`ethora-app-tokens-rotate-v2\`.

## App Secret and tenant secret
Signing keys for the app's tokens. Never returned over MCP. Available only to the app owner
in the web dashboard (app settings, API tab). Anything holding the secret can act as the app.

## User API key
A long-lived user token for assistants and agents (\`ethora-api-key-create\`, \`-list\`,
\`-revoke\`, or the dashboard Account > AI Assistants tab). Shown once; revocation is immediate.

## Server (B2B) token
For your own backend acting as the app (sent as the \`x-custom-token\` header). Minted and
revoked in the dashboard API tab, so no code has to hold the App Secret.
`

const FEEDBACK_MD = `
# Feedback: reporting a problem or a request

Use \`ethora-feedback-submit\` when something does not work, behaves differently from what a
tool description promised, is missing, or is documented wrongly. It reaches the Ethora team
directly. Prefer it over silently giving up: a failure nobody reports is a failure nobody fixes.

## What to send
\`category\` is one of \`bug\`, \`unexpected\`, \`feature\`, \`docs\`, \`other\`, and \`message\` is what
was attempted, what was expected and what happened instead, in the user's own words where
possible.

## What is attached for you
With \`includeRecentErrors\` (the default) the session's last few tool failures travel with the
report: the tool name, the error code and the API request id. That is why a report from here is
worth more than a web form, since the team can join it straight to the server-side log entry.

## Rules
Works signed in or not, so a problem that blocks sign-up can still be reported; when signed in
the report is attributed to that account. Never put credentials, API keys or end-user personal
data in \`message\`. Credential-shaped values in the attached context are redacted before sending.
`

const API_KEYS_MD = `
## API keys (hosted MCP server)

An API key is a long-lived, revocable user credential for automation clients (agents, CI, headless MCP clients).
- \`ethora-user-register\` and \`ethora-user-login\` (with createApiKey: true) return a key exactly once.
- \`ethora-api-key-create { name?, ttlDays? }\` mints another key for the logged-in user (default 90 days, max 365, at most 20 active keys).
- \`ethora-api-key-list\` lists key ids, names and expiry; token values are never returned.
- \`ethora-api-key-revoke { id }\` revokes a key; clients using it stop working immediately.
- Send the key as \`Authorization: Bearer <key>\` on the MCP connection (Claude Code, Cursor, SDK clients) to skip login. Web assistants that cannot set headers use \`ethora-user-login\` inside the session instead.
`

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
}

function splitMarkdown(id: string, title: string, md: string): Doc[] {
  const out: Doc[] = []
  const lines = md.split("\n")
  let curTitle = title
  let buf: string[] = []
  const flush = () => {
    const text = buf.join("\n").trim()
    if (text) {
      const sec = curTitle === title ? "" : `#${slug(curTitle)}`
      out.push({ id: `doc:${id}${sec}`, title: curTitle === title ? title : `${title}: ${curTitle}`, text, url: README_URL, kind: "doc" })
    }
    buf = []
  }
  for (const line of lines) {
    const m = line.match(/^#{2,3}\s+(.+)$/)
    if (m) {
      flush()
      curTitle = m[1].replace(/[`*_]/g, "").trim()
    } else {
      buf.push(line)
    }
  }
  flush()
  return out
}

function toolDocs(server: McpServer): Doc[] {
  // McpServer keeps its registry private; read it defensively so a future
  // SDK change degrades to "no tool docs" rather than a crash.
  const reg: Record<string, any> = (server as any)._registeredTools || {}
  const docs: Doc[] = []
  for (const [name, t] of Object.entries(reg)) {
    if (!t || t.enabled === false) continue
    const parts: string[] = [String(t.description || "")]
    const shape = t.inputSchema?.shape ?? t.inputSchema?._def?.shape?.()
    if (shape && typeof shape === "object") {
      const fields = Object.entries(shape as Record<string, any>).map(([k, v]) => {
        const d = v?.description || v?._def?.description || ""
        return d ? `- ${k}: ${d}` : `- ${k}`
      })
      if (fields.length) parts.push("Inputs:\n" + fields.join("\n"))
    }
    const a = t.annotations || {}
    const flags = [a.readOnlyHint ? "read-only" : "", a.destructiveHint ? "destructive" : "", a.idempotentHint ? "idempotent" : ""].filter(Boolean)
    if (flags.length) parts.push(`Annotations: ${flags.join(", ")}`)
    docs.push({ id: `tool:${name}`, title: name, text: parts.join("\n\n"), url: TOOLS_URL, kind: "tool" })
  }
  return docs
}

function buildCorpus(server: McpServer): Doc[] {
  const docs: Doc[] = [
    { id: "doc:hosted-guide", title: "Ethora MCP: getting started (hosted server)", text: HOSTED_INSTRUCTIONS, url: README_URL, kind: "doc", guide: true },
    ...splitMarkdown("api-keys", "API keys", API_KEYS_MD).map((d) => ({ ...d, guide: true })),
    ...splitMarkdown("credentials", "Credentials: which one for what", CREDENTIALS_MD).map((d) => ({ ...d, guide: true })),
    ...splitMarkdown("feedback", "Feedback: reporting a problem or a request", FEEDBACK_MD).map((d) => ({ ...d, guide: true })),
    ...splitMarkdown("auth-map", "Ethora auth map", AUTH_MAP_MD),
    ...splitMarkdown("chat-component-quickstart", "Chat component quickstart", CHAT_COMPONENT_QUICKSTART_MD),
    ...splitMarkdown("sdk-backend-quickstart", "Backend SDK quickstart", BACKEND_SDK_QUICKSTART_MD),
    ...splitMarkdown("recipes", "Ethora recipes", RECIPES_MD),
    ...splitMarkdown("agent-flows", "Agent flows (scripted conversations)", AGENT_FLOWS_MD),
    ...toolDocs(server),
  ]
  return docs
}

const STOPWORDS = new Set(["a", "an", "the", "to", "of", "in", "on", "for", "and", "or", "with", "how", "do", "i", "my", "me", "is", "it", "can", "what", "does", "from", "into", "via", "be", "by", "at", "as"])

function terms(q: string) {
  return String(q || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

function countHits(hay: string, term: string) {
  let n = 0, i = 0
  while ((i = hay.indexOf(term, i)) !== -1) { n++; i += term.length }
  return n
}

export function registerDocsSearch(server: McpServer) {
  // Built lazily on first use so every tool registered by then is included.
  let corpus: Doc[] | null = null
  const getCorpus = () => (corpus ||= buildCorpus(server))

  server.registerTool(
    "search",
    {
      description: "Search the Ethora documentation and tool reference: auth model (app JWT vs app token vs B2B token vs API keys), hosted-server getting started, chat-component and backend SDK quickstarts, recipes, and a reference entry for every tool with its inputs. Use it for any \"how do I ...\" question about Ethora before guessing; then call `fetch` with a result id to read the full text.\nAuth: none required.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        query: z.string().describe("Free-text query, e.g. 'create an app', 'invite agent to chat', 'api key bearer header'. Empty returns the getting-started guides."),
      },
    },
    async ({ query }) => {
      const docs = getCorpus()
      const ts = terms(query)
      let results: Doc[]
      if (!ts.length) {
        results = docs.filter((d) => d.guide)
      } else {
        results = docs
          .map((d) => {
            // Exact title tokens weigh most (a tool named ethora-app-create should
            // win "create an app"), text hits are capped so long documents do not
            // drown short precise ones, and covering every query term earns a bonus.
            const titleTokens = new Set(terms(d.title))
            const text = d.text.toLowerCase()
            let score = 0, found = 0
            for (const t of ts) {
              const inTitle = titleTokens.has(t)
              const textHits = Math.min(countHits(text, t), 3)
              if (inTitle) score += 5
              score += textHits
              if (inTitle || textHits) found++
            }
            if (ts.length) score += Math.round((found / ts.length) * 4)
            if (found === 0) score = 0
            return { d, score }
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score || a.d.text.length - b.d.text.length)
          .slice(0, 8)
          .map((x) => x.d)
      }
      const payload = { results: results.map((d) => ({ id: d.id, title: d.title, url: d.url })) }
      return { content: [{ type: "text", text: JSON.stringify(payload) }] }
    }
  )

  server.registerTool(
    "fetch",
    {
      description: "Fetch the full text of a documentation section or tool reference entry by the id returned from `search` (e.g. `tool:ethora-app-create`, `doc:auth-map#app-jwt`, `doc:hosted-guide`).\nAuth: none required. Errors: unknown id.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        id: z.string().describe("Document id from a `search` result."),
      },
    },
    async ({ id }) => {
      const doc = getCorpus().find((d) => d.id === String(id || "").trim())
      if (!doc) {
        return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: `Unknown document id: ${id}`, hint: "Call `search` to get valid ids." } }) }], isError: true }
      }
      const payload = { id: doc.id, title: doc.title, text: doc.text, url: doc.url, metadata: { kind: doc.kind } }
      return { content: [{ type: "text", text: JSON.stringify(payload) }] }
    }
  )
}
