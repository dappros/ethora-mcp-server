import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"
import z from "zod"
import { AUTH_MAP_MD, CHAT_COMPONENT_QUICKSTART_MD, BACKEND_SDK_QUICKSTART_MD, RECIPES_MD, AGENT_FLOWS_MD } from "./prompts.js"
import { HOSTED_INSTRUCTIONS } from "./instructions.js"
import { groupOf, TOOL_GROUPS, CORE_GROUP } from "./toolGroups.js"

// Built from the group table so the doc can never drift from the code.
const TOOL_GROUPS_MD = [
  "# Tool groups: what is listed by default and how to enable more",
  "",
  "A session lists only the `core` group at first. Every other group is registered but hidden until `ethora-tools-enable { group }` is called (or `{ group: \"all\" }`); the tool list then refreshes on its own. Hidden tools are still described here, each naming its group.",
  "",
  ...Object.entries(TOOL_GROUPS).map(([g, def]) => `## ${g}${g === CORE_GROUP ? " (listed by default)" : ""}\n${def.summary}\nTools: ${def.tools.map((t) => `\`${t}\``).join(", ")}`),
].join("\n")

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
  // A whole markdown document under its bare id; sections are listed
  // separately, so term search prefers those and this serves fetch.
  whole?: boolean
}

const CREDENTIALS_MD = `
# Credentials: which one for what

## App ID
Public identifier of an app (24-char hex). Safe to share; every app-scoped call needs it.

## appToken
App-scoped JWT used by the chat component, the AI chat widget and app-token automation.
Never included in tool results (they show \`[redacted]\`). Reveal it on purpose with
\`ethora-app-credentials-reveal { appId, confirm: true }\`; rotate it with \`ethora-app-token-rotate\`.

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
    if (!t) continue
    // Tools hidden by the group profile stay documented (the doc says how to
    // enable them); tools hidden for another reason (OAuth identity tools) do not.
    if (t.enabled === false && !t._hiddenByGroup) continue
    const parts: string[] = [String(t.description || "")]
    const group = groupOf(name)
    if (group) {
      parts.push(t._hiddenByGroup
        ? `Tool group: ${group}. Not in the default tool list on this session; call ethora-tools-enable { group: "${group}" } first, then the tool appears.`
        : `Tool group: ${group}.`)
    }
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

// What is not available over MCP (yet), said plainly, with where it does exist.
// Newcomers ask for these; a search that returns unrelated tools reads as a
// broken product, an honest "no, here is where" does not.
const NOT_AVAILABLE_MD = `
# Not available over MCP (and where it lives instead)

## Webhooks and message events
There is no webhook or event subscription over MCP. To react to messages, poll \`ethora-chat-history\` (it returns a \`nextBefore\` cursor) or \`ethora-message-search\`, or run your own listener with the backend SDK, which connects to the room over XMPP. \`ethora-message-send { waitForReplySec }\` covers the common "post and wait for the agent's answer" case.

## Push notifications
Mobile push (Firebase, APNs) is configured per app in the web dashboard under the app's settings, where the service credentials are uploaded. Nothing to call over MCP.

## Moderation, bans and blocking
Banning or blocking users and deleting other people's messages happen in the web client and dashboard (app users list, room member menus); they are not exposed as MCP tools yet. \`ethora-chat-delete\` removes a whole room; \`ethora-app-delete\` removes an app.

## Billing, custom domains, logo
Plans and billing, a custom domain and the logo images are managed in the web dashboard (Billing; the app's Appearance settings). \`ethora-app-update\` covers the display name, tagline and primary colour.

## Voice, video, file previews
Calls and media are features of the chat clients (web client, React Native app, chat component); MCP manages the apps, rooms, users and agents behind them.
`

// Phrases newcomers use and the documents that actually answer them. Applied
// on top of term scoring so intent wins over word overlap ("branding" should
// reach ethora-app-update, not every tool with "app" in its name).
const INTENTS: Array<{ match: RegExp; ids: string[] }> = [
  // Order matters: the first matching intent leads the results.
  { match: /\b(end[- ]?users?|my users|customers?|sso|single sign|log ?in|sign ?in|token)s?\b.*\b(chat|log|sign|auth)/i, ids: ["doc:sdk-backend-quickstart", "doc:recipes#add-in-app-chat-to-an-existing-app", "doc:auth-map"] },
  { match: /\b(in[- ]?app|existing (app|product|site)|my (app|product|react|next|vue|angular|ios|android|react native|mobile)|chat component|embed(ded)? chat|add chat)\b/i, ids: ["doc:recipes#add-in-app-chat-to-an-existing-app", "doc:chat-component-quickstart", "doc:sdk-backend-quickstart", "tool:ethora-chat-component-app-generate"] },
  { match: /\b(widget|website|web ?page|wordpress|landing page|floating|launcher)\b/i, ids: ["doc:recipes#ai-chat-widget-on-a-website-user-auth", "tool:ethora-widget-snippet-get", "tool:ethora-agent-activate"] },
  { match: /\b(agents? (talk|chat|speak|debat|convers|reply)|several agents|multiple agents|two agents|each other|multi[- ]?agent|turn[- ]?taking|personas?|round ?table|debate)\b/i, ids: ["doc:recipes#seed-a-room-with-several-ai-agents", "doc:recipes#controlling-turn-taking-multi-agent-rooms", "doc:recipes#ai-agents-end-to-end-phase-1", "tool:ethora-agent-create"] },
  { match: /\b(new (chat )?app|from scratch|brand(ing|ed)?|logo|colou?r|tagline|tenant|my own app|white[- ]?label)\b/i, ids: ["doc:recipes#build-a-new-chat-based-app", "tool:ethora-app-create", "tool:ethora-app-update"] },
  { match: /\b(react native|ios|android|mobile app|flutter|swift|kotlin)\b/i, ids: ["doc:recipes#add-in-app-chat-to-an-existing-app", "doc:not-available#voice-video-file-previews"] },
  { match: /\b(webhook|callback|event|subscribe|listen|notify me|on message|when a message)\b/i, ids: ["doc:not-available#webhooks-and-message-events", "tool:ethora-chat-history", "tool:ethora-message-send"] },
  { match: /\b(push|apns|fcm|firebase|notification)s?\b/i, ids: ["doc:not-available#push-notifications"] },
  { match: /\b(moderat|ban|block|kick|mute|report|abuse|spam)/i, ids: ["doc:not-available#moderation-bans-and-blocking"] },
  { match: /\b(billing|plan|pricing|subscription|custom domain|dns)\b/i, ids: ["doc:not-available#billing-custom-domains-logo"] },
  { match: /\b(knowledge|rag|crawl|index|documents?|pdf|faq|train)\b/i, ids: ["tool:ethora-source-site-crawl-wait", "tool:ethora-source-doc-upload", "doc:recipes#sources-ingest-app-token"] },
  { match: /\b(api key|personal url|connector|claude\.ai|chatgpt|cursor|reconnect)\b/i, ids: ["doc:api-keys", "doc:hosted-guide"] },
]

function buildCorpus(server: McpServer): Doc[] {
  const docs: Doc[] = [
    { id: "doc:hosted-guide", title: "Ethora MCP: getting started (hosted server)", text: HOSTED_INSTRUCTIONS, url: README_URL, kind: "doc", guide: true },
    ...splitMarkdown("api-keys", "API keys", API_KEYS_MD).map((d) => ({ ...d, guide: true })),
    ...splitMarkdown("credentials", "Credentials: which one for what", CREDENTIALS_MD).map((d) => ({ ...d, guide: true })),
    ...splitMarkdown("feedback", "Feedback: reporting a problem or a request", FEEDBACK_MD).map((d) => ({ ...d, guide: true })),
    ...splitMarkdown("tool-groups", "Tool groups: what is listed by default and how to enable more", TOOL_GROUPS_MD).map((d) => ({ ...d, guide: true })),
    ...splitMarkdown("auth-map", "Ethora auth map", AUTH_MAP_MD),
    ...splitMarkdown("chat-component-quickstart", "Chat component quickstart", CHAT_COMPONENT_QUICKSTART_MD),
    ...splitMarkdown("sdk-backend-quickstart", "Backend SDK quickstart", BACKEND_SDK_QUICKSTART_MD),
    ...splitMarkdown("recipes", "Ethora recipes", RECIPES_MD),
    ...splitMarkdown("agent-flows", "Agent flows (scripted conversations)", AGENT_FLOWS_MD),
    ...splitMarkdown("not-available", "Not available over MCP (and where it lives instead)", NOT_AVAILABLE_MD).map((d) => ({ ...d, guide: true })),
    ...toolDocs(server),
  ]
  // Whole documents by their bare id (`doc:recipes`, `doc:auth-map`), which is
  // how the README and the recipes refer to them. Sections stay as they are;
  // the whole document is what a reader asking for "the recipes" wants.
  const wholes: Array<[string, string, string]> = [
    ["recipes", "Ethora recipes", RECIPES_MD],
    ["auth-map", "Ethora auth map", AUTH_MAP_MD],
    ["chat-component-quickstart", "Chat component quickstart", CHAT_COMPONENT_QUICKSTART_MD],
    ["sdk-backend-quickstart", "Backend SDK quickstart", BACKEND_SDK_QUICKSTART_MD],
    ["agent-flows", "Agent flows (scripted conversations)", AGENT_FLOWS_MD],
    ["credentials", "Credentials: which one for what", CREDENTIALS_MD],
    ["feedback", "Feedback: reporting a problem or a request", FEEDBACK_MD],
    ["tool-groups", "Tool groups: what is listed by default and how to enable more", TOOL_GROUPS_MD],
    ["not-available", "Not available over MCP (and where it lives instead)", NOT_AVAILABLE_MD],
    ["api-keys", "API keys", API_KEYS_MD],
  ]
  // splitMarkdown may already have emitted the bare id for the text before
  // the first heading (often just the title line); the whole document wins.
  const wholeIds = new Set(wholes.map(([id]) => `doc:${id}`))
  const kept = docs.filter((d) => !wholeIds.has(d.id))
  for (const [id, title, md] of wholes) kept.push({ id: `doc:${id}`, title, text: md.trim(), url: README_URL, kind: "doc", whole: true, guide: docs.some((d) => d.id === `doc:${id}` && d.guide) })
  return kept
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
          .filter((d) => !d.whole)
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
      // Intent matches go first, then the term-scored results, without repeats.
      const byId = new Map(docs.map((d) => [d.id, d]))
      const intentIds = INTENTS.filter((i) => i.match.test(String(query || ""))).flatMap((i) => i.ids)
      if (intentIds.length) {
        const ordered: Doc[] = []
        for (const id of intentIds) { const d = byId.get(id); if (d && !ordered.includes(d)) ordered.push(d) }
        for (const d of results) if (!ordered.includes(d)) ordered.push(d)
        results = ordered.slice(0, 8)
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
