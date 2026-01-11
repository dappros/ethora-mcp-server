import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"
import z from "zod"

function md(strings: TemplateStringsArray, ...values: any[]) {
  let out = ""
  for (let i = 0; i < strings.length; i++) {
    out += strings[i]
    if (i < values.length) out += String(values[i] ?? "")
  }
  return out.trim() + "\n"
}

const AUTH_MAP_MD = md`
## Ethora auth map (quick reference)

Ethora has multiple token types depending on the caller:

### 1) **App JWT** (\`appJwt\`)
- **Where it’s used**: login/register endpoints (user auth bootstrap)
- **How it’s provided**: env \`ETHORA_APP_JWT\` (or via \`ethora-configure\`)
- **Typical caller**: frontend app / SDK / MCP when doing \`ethora-user-login\`

### 2) **App Token** (\`appToken\`)
- **Where it’s used**: app-scoped B2B operations (preferred for partners): broadcast, sources ingest, bot management
- **How it’s obtained**: created per-app (returned from app creation / visible in admin)
- **How it’s provided**: \`ethora-app-select { appId, appToken }\` then \`ethora-auth-use-app\`

### 3) **B2B Token** (\`b2bToken\`)
- **Where it’s used**: server-to-server automation where you want to act “as the app owner” without a user session
- **How it’s sent**: header \`x-custom-token\` (JWT with \`type=server\`)
- **How it’s provided**: env \`ETHORA_B2B_TOKEN\` (or via \`ethora-configure\`), then \`ethora-auth-use-b2b\`

### Rule of thumb
- Need to **log in a user** → use **App JWT**
- Need to run **B2B operations for one app** (broadcast/sources/bot) → use **App Token**
- Need to **create apps / bootstrap** in a partner integration → use **B2B Token** first, then switch into **App Token**
`

const CHAT_COMPONENT_QUICKSTART_MD = md`
## Vite/Next quickstart with \`@ethora/chat-component\`

The fastest path is:
1) Create a Vite/Next app
2) \`npm i @ethora/chat-component\`
3) Render \`<Chat />\`

### Important security note
The chat component repo contains **demo credentials** for quick scaffolding. For production:
- **Do not** hardcode \`appToken\` or user tokens into your app source.
- Provide app context via configuration and/or your backend.

### Recommended production pattern
- Your backend holds \`appId/appSecret\` and issues user tokens / app tokens as needed
- Frontend only receives short-lived credentials or uses your own session
`

const BACKEND_SDK_QUICKSTART_MD = md`
## Backend integration quickstart with \`@ethora/sdk-backend\`

Use \`@ethora/sdk-backend\` for server-to-server integration patterns:
- create user
- create chat room
- grant access to chat room
- create client/user JWT tokens

Typical env vars:
\`\`\`bash
ETHORA_CHAT_API_URL=https://api.ethoradev.com
ETHORA_CHAT_APP_ID=your_app_id
ETHORA_CHAT_APP_SECRET=your_app_secret
\`\`\`
`

const RECIPES_MD = md`
## Common recipes

### Broadcast (app-token)
1) \`ethora-app-select\` with \`{ appId, appToken }\`
2) \`ethora-auth-use-app\`
3) \`ethora-chats-broadcast-v2\`
4) \`ethora-wait-broadcast-job-v2\`

### Sources ingest (app-token)
1) \`ethora-app-select\` with \`{ appId, appToken }\`
2) \`ethora-auth-use-app\`
3) \`ethora-sources-site-crawl-v2\` or \`ethora-sources-docs-upload-v2\`

### Files upload (user)
1) \`ethora-auth-use-user\`
2) \`ethora-user-login\`
3) \`ethora-files-upload-v2\`

### Bot management (app-token)
1) \`ethora-app-select\` with \`{ appId, appToken }\`
2) \`ethora-auth-use-app\`
3) \`ethora-bot-get-v2\` / \`ethora-bot-update-v2\`
`

export function registerPromptsAndResources(server: McpServer) {
  // Static resources (markdown)
  server.registerResource(
    "ethora-auth-map",
    "ethora://docs/auth-map",
    { title: "Ethora Auth Map", description: "appJwt vs appToken vs b2bToken", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, text: AUTH_MAP_MD }] })
  )

  server.registerResource(
    "ethora-chat-component-quickstart",
    "ethora://docs/chat-component/quickstart",
    { title: "Chat Component Quickstart", description: "Vite/Next quickstart + replacing demo tokens", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, text: CHAT_COMPONENT_QUICKSTART_MD }] })
  )

  server.registerResource(
    "ethora-backend-sdk-quickstart",
    "ethora://docs/sdk-backend/quickstart",
    { title: "Backend SDK Quickstart", description: "@ethora/sdk-backend quickstart", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, text: BACKEND_SDK_QUICKSTART_MD }] })
  )

  server.registerResource(
    "ethora-recipes",
    "ethora://docs/recipes",
    { title: "Ethora Recipes", description: "Common MCP recipes", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, text: RECIPES_MD }] })
  )

  // Prompts (for LLM/agent usage)
  server.registerPrompt(
    "ethora-vite-quickstart",
    {
      title: "Vite quickstart with @ethora/chat-component",
      description: "Explains how to add chat component to a Vite app, and how to avoid demo tokens in production.",
      argsSchema: { appName: z.string().optional() },
    },
    ({ appName }) => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: md`${CHAT_COMPONENT_QUICKSTART_MD}\n\nApp name: ${appName || "my-app"}` },
        },
      ],
    })
  )

  server.registerPrompt(
    "ethora-nextjs-quickstart",
    {
      title: "Next.js quickstart with @ethora/chat-component",
      description: "Explains how to add chat component to a Next.js app and handle auth safely.",
      argsSchema: { appName: z.string().optional() },
    },
    ({ appName }) => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: md`${CHAT_COMPONENT_QUICKSTART_MD}\n\nApp name: ${appName || "my-next-app"}` },
        },
      ],
    })
  )

  server.registerPrompt(
    "ethora-backend-sdk-quickstart",
    {
      title: "Backend SDK quickstart (@ethora/sdk-backend)",
      description: "Shows how to integrate Ethora backend SDK in a Node.js backend.",
      argsSchema: {},
    },
    () => ({
      messages: [{ role: "user", content: { type: "text", text: BACKEND_SDK_QUICKSTART_MD } }],
    })
  )

  server.registerPrompt(
    "ethora-auth-map",
    {
      title: "Ethora auth map",
      description: "Explains appJwt vs appToken vs b2bToken and when to use each.",
      argsSchema: {},
    },
    () => ({
      messages: [{ role: "user", content: { type: "text", text: AUTH_MAP_MD } }],
    })
  )

  server.registerPrompt(
    "ethora-recipes",
    {
      title: "Ethora recipes",
      description: "Common MCP tool sequences: broadcast, sources ingest, files upload, bot management.",
      argsSchema: {},
    },
    () => ({
      messages: [{ role: "user", content: { type: "text", text: RECIPES_MD } }],
    })
  )
}


