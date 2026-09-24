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

export const AUTH_MAP_MD = md`
## Ethora auth map (quick reference)

Ethora MCP has two common usage modes:

### A) Local developer / admin flow
- Typical user: developer, tenant admin, or app owner trying the MCP server from Cursor or Claude Desktop
- Main auth mode: \`user\`
- Bootstrap credential: **App JWT** via \`ETHORA_APP_JWT\`
- Session credential: user JWT returned by \`ethora-user-login\`

### B) Server / agent automation flow
- Typical user: backend integration, CI runner, or autonomous agent
- Main auth mode: \`b2b\` first, then often \`app\`
- Tenant-actor credential: **B2B token** via \`ETHORA_B2B_TOKEN\`
- App-scoped credential: **appToken** after app selection or token creation

Ethora uses multiple token types depending on the caller:

### 1) **App JWT** (\`appJwt\`)
- **Where it’s used**: login/register endpoints (user auth bootstrap)
- **How it’s provided**: env \`ETHORA_APP_JWT\` (or via \`ethora-session-configure\`)
- **Typical caller**: local MCP session doing \`ethora-user-login\`

### 2) **App Token** (\`appToken\`)
- **Where it’s used**: app-scoped automation after you already know the target app: broadcast, sources ingest, bot management
- **How it’s obtained**: created per-app (returned from app creation / visible in admin)
- **How it’s provided**: \`ethora-app-select { appId, appToken }\` then \`ethora-auth-mode-set\`

### 3) **B2B Token** (\`b2bToken\`)
- **Where it’s used**: server-to-server automation where you want to act “as the app owner” without a user session
- **How it’s sent**: header \`x-custom-token\` (JWT with \`type=server\`)
- **How it’s provided**: env \`ETHORA_B2B_TOKEN\` (or via \`ethora-session-configure\`), then \`ethora-auth-mode-set\`

### Rule of thumb
- First time using Ethora MCP locally → start with **User Auth**
- Need to **log in a user** → use **App JWT** then \`ethora-user-login\`
- Need to **create apps / manage tenant resources** from your own backend → use **B2B Token**
- Need to run **app-scoped operations for one app** (broadcast/sources/bot) → switch into **App Token**
`

export const CHAT_COMPONENT_QUICKSTART_MD = md`
## Vite/Next quickstart with \`@ethora/chat-component\`

\`@ethora/chat-component\` is the React component that renders Ethora rooms inside your own
web app: room list, messages, media, reactions, typing, the AI agents in the room. It works
in Vite, Next.js and Create React App projects. Full README with every prop and pattern:
https://github.com/dappros/ethora-chat-component. \`ethora-chat-component-app-generate { appId }\`
(tool group \`b2b\`) writes a ready \`App.tsx\` for one of your apps.

### 1. Install and render
\`\`\`bash
npm i @ethora/chat-component
\`\`\`
\`\`\`tsx
import { useMemo } from 'react';
import { Chat, XmppProvider } from '@ethora/chat-component';

const config = { baseUrl: 'https://api.chat.ethora.com/v1', colors: { primary: '#2f6feb' } };

export default function ChatPage() {
  const chatConfig = useMemo(() => config, []);
  return (
    <XmppProvider config={chatConfig}>
      <Chat config={chatConfig} />
    </XmppProvider>
  );
}
\`\`\`
Pass the same memoised \`config\` object to both \`XmppProvider\` and \`Chat\`.

### 2. Who is the user? Four patterns
- **Anonymous / demo**: nothing extra; fine for trying it.
- **Email + password** (\`user={{ email, password }}\`): an Ethora account the person already has.
- **Injected logged-in user** (\`config.userLogin\`): **the pattern for your own users.** Your backend signs the person into Ethora (see the backend SDK quickstart, \`createChatUserJwtToken\`) and hands the frontend the resulting user object (\`_id\`, \`appId\`, \`token\`, \`refreshToken\`, \`xmppPassword\`, names); the component then connects as that user with no Ethora login screen. Set \`config.userLogin = { enabled: true, user }\` and \`initBeforeLoad\` per the README.
- **Your own XMPP login**: guard external \`client.login()\` with \`initBeforeLoad\` as the README shows.

### 3. Which room
Rooms are created over MCP (\`ethora-chat-create\`) or by your backend (\`createChatRoom\`); the component lists the rooms the user has access to (\`grantUserAccessToChatRoom\`) and can be opened on one room via config. Room ids are JIDs: \`<appId>_<chatId>\`.

### Security
- Never put the app secret, a server token or another user's token in frontend code. The frontend gets one user's token from your backend, behind your session check.
- The public repo has demo credentials for scaffolding only.
`

export const BACKEND_SDK_QUICKSTART_MD = md`
## Backend integration quickstart with \`@ethora/sdk-backend\`

This is how your own users get into Ethora chat without an Ethora login: your backend
(Node.js 18+, any framework) holds the app credentials and creates the chat identities,
rooms and per-user tokens; your frontend only ever receives a token for the signed-in user.
Full guide with Express, NestJS and error-handling examples:
https://github.com/dappros/ethora-sdk-backend-integration (README.md and INTEGRATION.md).

### 1. Install and configure
\`\`\`bash
npm install @ethora/sdk-backend
\`\`\`
\`\`\`bash
ETHORA_CHAT_API_URL=https://api.chat.ethora.com
ETHORA_CHAT_APP_ID=<appId>          # from ethora-app-create (created.id)
ETHORA_CHAT_APP_SECRET=<app secret> # web dashboard, app settings, API tab (never returned over MCP)
\`\`\`
The SDK signs a B2B server token from these and sends it as \`x-custom-token\` on every call.

### 2. Initialise once
\`\`\`ts
import { getEthoraSDKService } from '@ethora/sdk-backend';
const chat = getEthoraSDKService(); // singleton; reads the env vars above
\`\`\`

### 3. Mirror your users and rooms
Call these from the places where your product creates users and workspaces:
\`\`\`ts
await chat.createUser(userId, { firstName, lastName, email });        // idempotent per userId
await chat.createChatRoom(workspaceId, { title: 'Project chat', uuid: workspaceId, type: 'group' });
await chat.grantUserAccessToChatRoom(workspaceId, userId);
\`\`\`
\`userId\` and \`workspaceId\` are your ids; Ethora keys its records by them, so no id mapping table is needed.

### 4. Hand the signed-in user a chat token
\`\`\`ts
// GET /api/chat-token, behind your own session check
const token = chat.createChatUserJwtToken(req.user.id);   // client JWT for this user only
res.json({ token });
\`\`\`
The frontend passes that user into \`@ethora/chat-component\` (see the chat component
quickstart, pattern "injected logged-in user"). Never ship the app secret or a server
token to the browser; the client JWT is scoped to one user.

### 5. Managing several apps from one backend
For a parent app that provisions child apps, the same SDK exposes the explicit tenant-admin
helpers: \`listApps\`, \`createApp\`, \`createUsersInApp\`, \`createChatRoomInApp\`,
\`grantUserAccessToChatRoomInApp\`, \`getUserChatsInApp\`, all against \`/v2/apps/{appId}/...\`.
Over MCP the equivalent tools are in the \`b2b\` and \`users-files\` groups.

### Which token is which
- App secret: signs everything; dashboard only.
- B2B server token: your backend to the Ethora API (\`x-custom-token\`); also mintable in the dashboard API tab and usable with \`ethora-auth-mode-set { mode: "b2b" }\`.
- Client JWT (\`createChatUserJwtToken\`): one user, for the chat client.
- User API key (MCP): a person's or agent's long-lived login for assistants; not for end users.
`

// Authoring reference for Agent.flowsYaml. Kept in sync with the compiler at
// services/api/src/modules/agents/flows/compileFlows.js - that file validates
// on save, this text is what an assistant reads before writing a script.
export const AGENT_FLOWS_MD = md`
# Agent flows (scripted conversations)

A flow is a deterministic script an agent follows instead of letting the model choose every turn.
Use one for anything with a fixed shape: an opening menu, an appointment request, an intake
questionnaire, a survey. The model still handles everything outside a flow.

Set it with \`ethora-agent-create\` or \`ethora-agent-update\`, field \`flowsYaml\`.
The server compiles and validates the YAML on save. If it does not compile you get
\`FLOWS_INVALID\` with per-problem details and **nothing is stored**, so a bad script cannot
break a live agent. Send an empty string to remove the script.

## Format

\`\`\`yaml
version: 1
flows:
  start:                          # reserved name: runs when a conversation opens
    steps:
      - say: "Hi! How can I help?"
        buttons:
          - { label: "Request appointment", goto: appointment }
          - { label: "Something else", end: true }
  appointment:
    description: "Collect an appointment request"
    trigger: { phrases: ["appointment", "book a visit"] }
    steps:
      - ask: "Which location suits you?"
        id: location
        options: [Downtown, Westside]
      - ask: "Best phone number to reach you?"
        id: phone
        type: phone
        retry: "That doesn't look like a phone number, could you check it?"
      - say: "Thanks, we'll call {phone} to confirm a slot at {location}."
      - end: true
\`\`\`

## Rules worth knowing

- **Step kinds**: \`say\` (send a message), \`ask\` (ask for one value and store it in a slot),
  \`goto\` (jump to another flow), \`end\` (finish).
- **\`start\` is reserved.** If present it fires when a conversation opens, which is how you get an
  opening menu. Without it, flows are entered by \`trigger.phrases\` or from a button.
- **Buttons** come from \`buttons:\` on a \`say\` step, or from \`options:\` on an \`ask\` step.
  A button carries \`label\` plus one of \`goto\` or \`end\`. Tapping one posts its value into the
  room as an ordinary message, so the answer reaches the agent through the normal path.
- **Slots**: \`ask\` stores the answer under its \`id\`. Refer to it later as \`{id}\` in any text.
  \`type\` validates the answer (for example \`phone\`) and \`retry\` is what the agent says when
  validation fails.
- **Conditions**: any step may carry \`when: "slot == value"\` or \`when: "slot != value"\` and is
  skipped when the condition is false.
- Collected slot values are readable afterwards through the API, so a flow doubles as a structured
  intake form.

## Suggested shape for a first script

Start with \`start\` plus one task flow. Keep \`say\` text short: it renders as chat bubbles, not a
page. Give every \`ask\` an \`id\` you will actually reference. Validate by saving and reading the
error details rather than guessing.
`

export const RECIPES_MD = md`
## Common recipes

### User-auth quickstart
1) \`ethora-session-configure\` with \`{ apiUrl, appJwt }\`
2) \`ethora-auth-mode-set\`
3) \`ethora-user-login\`
4) Use user-auth tools such as \`ethora-file-upload\`

### B2B bootstrap AI
1) \`ethora-session-configure\` with \`{ apiUrl, b2bToken }\`
2) \`ethora-auth-mode-set\`
3) \`ethora-b2b-app-bootstrap-ai\` with \`displayName\`, optional \`crawlUrl\` / \`docs[]\`, and optional \`llmProvider\` / \`llmModel\`
4) If you want app-scoped follow-up actions, call \`ethora-app-select\` with \`{ appId, appToken }\`, then \`ethora-auth-mode-set\`

### Broadcast (app-token)
1) \`ethora-app-select\` with \`{ appId, appToken }\`
2) \`ethora-auth-mode-set\`
3) \`ethora-broadcast-send\`
4) \`ethora-broadcast-job-wait\`

### Broadcast (B2B explicit appId)
1) \`ethora-session-configure\` with \`{ apiUrl, b2bToken }\`
2) \`ethora-auth-mode-set\`
3) \`ethora-broadcast-send\` with \`{ appId, ... }\`
4) \`ethora-broadcast-job-wait\` with \`{ appId, jobId }\`

### Sources ingest (app-token)
1) \`ethora-app-select\` with \`{ appId, appToken }\`
2) \`ethora-auth-mode-set\`
3) \`ethora-source-site-crawl\` or \`ethora-source-doc-upload\`
4) \`ethora-source-site-list\` / \`ethora-source-doc-list\`
5) \`ethora-source-site-tags-update\` / \`ethora-source-doc-tags-update\`

### AI agent for an app (user auth - the normal path)
1) \`ethora-app-select\` { appId }
2) \`ethora-chat-create\` { title: "Support", pinned: true } -> note the room \`jid\`
3) \`ethora-agent-create\` { name: "Helper", prompt: "..." }
4) \`ethora-agent-invite\` { agentIdOrAddress, chatJid: "<jid>" }
5) \`ethora-message-send\` { roomJid: "<jid>", text: "hello", waitForReplySec: 45 }

### AI chat widget on a website (user auth)
The embeddable widget answers with the app's ACTIVE bot (App.defaultBotInstanceId). API-created apps have none until an agent is activated:
1) \`ethora-agent-create { name, prompt }\`
2) \`ethora-chat-create { appId, title: "Website widget" }\` -> ROOM_JID
3) \`ethora-agent-invite { agentIdOrAddress, chatJid: ROOM_JID }\`
4) \`ethora-agent-activate { agentId, chatJid: ROOM_JID }\` (uses the appToken captured from \`ethora-app-create\`; or pass it to \`ethora-app-select\`)
5) \`ethora-widget-snippet-get { appId, botName }\` -> paste the \`<script id="chat-content-assistant" ...>\` tag into the site.
Until step 4 the widget's \`POST /v2/widget/sessions\` returns 422 \`App has no AI bot configured\`.

### Legacy per-app bot (only apps that already have one)
API/B2B-created apps have no legacy aiBot (\`ethora-bot-enable\` returns 422 BOT_NOT_INITIALIZED); use the agent recipe above.
1) \`ethora-app-select\` { appId }
2) \`ethora-bot-get\` / \`ethora-bot-update\` (user, B2B or app-token auth)

### Files upload (user)
1) \`ethora-auth-mode-set\`
2) \`ethora-user-login\`
3) \`ethora-file-upload\`

### AI Agents end-to-end (Phase 1)
Goal: from "no account" to "two AI agents conversing in one chat with you" purely via MCP.

Pre-req tokens (one of):
- App JWT + user credentials (developer flow), or
- B2B token (server flow)

1) \`ethora-user-register\` { email, firstName, lastName } (skip if already verified)
2) \`ethora-user-login\` { email, password } -- gets a user JWT
3) \`ethora-app-create\` { displayName: "My App" } -- get \`appId\`
4) \`ethora-app-select\` { appId } -- stay in user auth mode: the agents, rooms and
   message tools all accept the user token through \`/v2/apps/:appId/...\` routes.
   (App-token mode is for server integrations and is rejected by the agents routes.)
4b) Create a room to host the agents. API/B2B-created apps no longer seed a
    default "Main chat", so create one explicitly and note its \`roomJid\`:
   \`ethora-chat-create\` { title: "Salon", pinned: false } -> note the room JID
5) Create the first Agent:
   \`ethora-agent-create\` { name: "Freud", prompt: "You are a digital twin of Sigmund Freud..." }
6) Index Freud's RAG corpus (per-Agent namespace):
   \`ethora-source-site-crawl-wait\` { url: "https://en.wikipedia.org/wiki/Sigmund_Freud", followLink: true }
   (the API resolves agentId from App.defaultBotInstanceId; pass agentId explicitly if multiple agents share the App)
7) Create the second Agent:
   \`ethora-agent-create\` { name: "Jung", prompt: "You are a digital twin of Carl Jung..." }
8) Mark one agent public (optional cross-app demo):
   \`ethora-agent-visibility-set\` { agentIdOrAddress: "<freud-id>", visibility: "public" }
9) Invite both agents into the room created in step 4b (use its room JID):
   \`ethora-agent-invite\` { agentIdOrAddress: "<freud-id>", chatJid: "<roomJid>" }
   \`ethora-agent-invite\` { agentIdOrAddress: "<jung-id>", chatJid: "<roomJid>" }
10) Seed a message and wait for the first reply:
    \`ethora-message-send\` { roomJid: "<roomJid>", text: "Freud, what would you say to Jung about dreams?", waitForReplySec: 45 }
    Room ids: a room JID is \`${"${appId}_${chatId}"}\`; every room tool accepts the JID or the bare chatId.
11) Watch the agents converse (\`ethora-chat-history\` { roomJid }). The smart response gate prevents loops; only the addressed agent replies first.

### Build a new chat-based app
One Ethora app is one tenant: its own users, rooms, branding and a hosted web client that needs no code. Add an AI agent afterwards with the widget or multi-agent recipes.
1) \`ethora-app-create\` { displayName: "My App" } -> \`created.id\`, \`dashboardUrl\`, \`next\`
2) \`ethora-app-select\` { appId }
3) \`ethora-app-update\` { appId, appTagline: "Chat for our community", primaryColor: "#2f6feb" } (logo, domain and the rest of the branding: dashboard, app settings, Appearance)
4) \`ethora-chat-create\` { appId, title: "General", pinned: true } (\`pinned\` auto-joins every new user)
5) \`ethora-tools-enable\` { group: "users-files" } then \`ethora-user-batch-create\` { appId, usersList: [{ email, firstName, lastName }] }, or let people sign up in the web client
6) Open \`dashboardUrl\` to see the app, invite teammates and manage users.

### Add in-app chat to an existing app
Your UI, your users. Ethora holds the rooms and the chat identities; your product never shows an Ethora login.
1) \`ethora-app-create\` { displayName: "My Product Chat" } and \`ethora-app-select\` { appId }
2) \`ethora-chat-create\` { appId, title: "Support" } -> keep the \`jid\` for your UI
3) Web: render rooms with \`@ethora/chat-component\` (React): \`fetch\` { id: "doc:chat-component-quickstart" }; \`ethora-chat-component-app-generate\` { appId } writes a ready \`App.tsx\` (enable the \`b2b\` group)
4) Sign your own users in from your backend with \`@ethora/sdk-backend\`: \`fetch\` { id: "doc:sdk-backend-quickstart" }. It mints their chat tokens from the app credentials (\`ethora-app-credentials-reveal\` { appId, confirm: true }; the App Secret is in the dashboard API tab)
5) iOS / Android: the React Native app in the Ethora SDK monorepo (https://github.com/dappros/ethora), or the same REST + XMPP APIs from native code
6) Optional: an AI agent in those rooms, see the recipes above.

### Seed a room with several AI agents
Agents in one room answer people and each other. Turn-taking is driven by names.
1) \`ethora-chat-create\` { appId, title: "Salon" } -> ROOM_JID
2) \`ethora-agent-create\` { name: "Freud", prompt: "You are Sigmund Freud. Two sentences at most. End every message by addressing @Jung or the person who spoke.", responseMode: "smart" }
3) \`ethora-agent-create\` { name: "Jung", prompt: "...end every message by addressing @Freud or the person who spoke.", responseMode: "smart" }
4) \`ethora-agent-invite\` { agentIdOrAddress, chatJid: ROOM_JID } for each agent
5) \`ethora-message-send\` { roomJid: ROOM_JID, text: "Freud, what would you tell Jung about dreams?", waitForReplySec: 45 } -> \`replies[].senderName\`
6) \`ethora-chat-history\` { roomJid: ROOM_JID, limit: 20 } to watch it continue (\`results[].senderName\`, \`senderKind\`)
Rules: single-word display names (the mention matcher is exact); each prompt ends by @-mentioning who speaks next; \`responseMode: "mentioned"\` for strict turn order; \`cooldownSec\` and \`responseProbability\` to throttle. The response gate lets the addressed agent answer first and stops agents from talking over each other. Details in the next section.

### Controlling turn-taking (multi-agent rooms)
For free-form chats the default \`responseMode: 'smart'\` works well. For structured
scenarios with strict turn order (e.g. role-played wargames, debates, interviews
where you want clean handoffs) use \`responseMode: 'mentioned'\` on every agent:

  \`ethora-agent-create\` {
    name: "Hannibal",
    prompt: "You are Hannibal Barca... END EVERY MESSAGE by addressing @GameMaster.",
    responseMode: "mentioned",
    cooldownSec: 0
  }

Two rules that make this reliable:
- Use **single-word display names** (Hannibal, Varro, GameMaster) — the mention
  matcher uses exact display-name match with word boundary.
- In the system prompt, instruct each agent to **end every message with an
  @-mention of who speaks next**. That's how turn-handoff flows through the
  response gate without any orchestrator code. A "Game Master" / "moderator"
  agent in the middle of the loop is a useful pattern.

For richer worked examples (historical wargame with three agents + battle log)
see https://github.com/dappros/ethora-bots/tree/main/wargame-demo.

### One-shot bootstrap (B2B, including Agent)
\`ethora-b2b-app-bootstrap-ai\` {
  displayName: "Demo App",
  crawlUrl: "https://example.com",
  enableBot: false,
  agentDisplayName: "Freud",
  agentPrompt: "You are a digital twin of Sigmund Freud...",
  agentVisibility: "public",
  inviteToDefaultRoom: true
}
This single call: creates the app, provisions a room, indexes the URL, creates an Agent, marks it public,
and invites it into that room. Repeat with a second \`agentDisplayName\` against the SAME app to get
two agents in one room ready to converse.

### /invite chat command
End users with a chat session can also invite a public agent by typing in any room:
  \`/invite <agentAddress>\`
ai-service detects the command, asks the API to lazy-create a per-App BotInstance for the agent if one
does not exist yet, adds it to the room via MUC affiliation/invite, and posts a confirmation message.
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
      description: "Common MCP tool sequences for local user-auth and server-side B2B/app-token flows.",
      argsSchema: {},
    },
    () => ({
      messages: [{ role: "user", content: { type: "text", text: RECIPES_MD } }],
    })
  )

  // Phase 1 (Agents): dedicated prompt that walks an LLM through the full Agents flow.
  server.registerPrompt(
    "ethora-agents-quickstart",
    {
      title: "Ethora AI Agents quickstart (Phase 1)",
      description: "End-to-end recipe for creating Agents, indexing their RAG, marking them public, inviting them into rooms, and running the two-agents-in-one-room demo.",
      argsSchema: {
        appName: z.string().optional(),
        firstAgentName: z.string().optional(),
        secondAgentName: z.string().optional(),
      },
    },
    ({ appName, firstAgentName, secondAgentName }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: md`
## Goal: ${firstAgentName || "Freud"} and ${secondAgentName || "Jung"} chat with you in one room

You are an AI assistant operating the Ethora MCP server on behalf of a developer. Bootstrap an
App named "${appName || "AI Demo App"}" and stand up two AI Agents that will talk to the
developer in one chat. Strict order:

1) Verify auth via \`ethora-status\`. If \`authMode\` is empty, run \`ethora-auth-mode-set\` (server)
   or \`ethora-auth-mode-set\` + \`ethora-user-login\` (developer).
2) For the cleanest demo: \`ethora-b2b-app-bootstrap-ai\` { displayName: "${appName || "AI Demo App"}",
   agentDisplayName: "${firstAgentName || "Freud"}", agentPrompt: "...", agentVisibility: "public",
   inviteToDefaultRoom: true }
3) Repeat \`ethora-b2b-app-bootstrap-ai\` with a SECOND \`agentDisplayName\` AGAINST THE SAME APP --
   pass the same \`displayName\` so it returns the existing app, then it just creates the second
   agent and invites it into the SAME default room.
   (Alternatively: \`ethora-agent-create\` for the second agent + \`ethora-agent-invite\`
    with the same chatJid.)
4) Seed the conversation: \`ethora-message-send\` { roomJid: "<the default room JID>",
   text: "${firstAgentName || "Freud"}, what would you say to ${secondAgentName || "Jung"} about dreams?", waitForReplySec: 45 }
   (Without a B2B token, do the same in user mode: \`ethora-app-create\`, \`ethora-app-select\` { appId },
   \`ethora-chat-create\`, \`ethora-agent-create\` x2, \`ethora-agent-invite\` x2. Stay in user auth mode.)
5) Observe and report. Both agents now live as XMPP clients inside the ai-service process; thanks
   to the per-bot loop guard and smart response gate they will only reply when relevant.

Useful sanity checks:
- \`ethora-bot-instance-list\` { appId } -- both agents should be listed with status "on".
- \`ethora-agent-get\` { agentId } -- inspect persona / RAG / SOUL.MD.
- \`ethora-agent-soul-append\` { agentIdOrAddress, append: "..." } -- evolve an agent's identity.

Refer to \`ethora://docs/recipes\` for the full step-by-step.
`,
          },
        },
      ],
    })
  )
}


