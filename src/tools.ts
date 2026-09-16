import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"
import { CallToolResult } from "@modelcontextprotocol/sdk/types"
import z from "zod"
import {
    agentsActivateV2,
    agentsCloneV2,
    agentsCreateV2,
    agentsGetV2,
    agentsListV2,
    agentsUpdateV2,
    // Phase 1 (Agents) additions
    agentsSetVisibilityV2,
    agentsSoulV2,
    agentsInviteToChatV2,
    appChatMessagesV2,
    appChatsListV2,
    botInstancesListV2,
    botInstanceGetV2,
    botInstanceStatusV2,
    // 2607 API parity additions
    agentsDeleteV2,
    agentsExportV2,
    agentsImportV2,
    agentBotInstanceDiagV2,
    agentBotInstanceTestMessageV2,
    agentBotInstanceLeaveChatV2,
    appMessagesSearchV2,
    appMessagesContextV2,
    appUsersUnreadCountsV2,
    appExportV2,
    appImportV2,
    appCreate,
    appCreateV2,
    appCreateChat,
    appDelete,
    appDeleteChat,
    appGetDefaultRooms,
    appGetDefaultRoomsWithAppId,
    appList,
    appProvisionV2,
    appTokensCreateV2,
    appTokensListV2,
    appTokensRevokeV2,
    appTokensRotateV2,
    appUpdate,
    apiPing,
    botGetForAppV2,
    botGetV2,
    botHistoryGetV2,
    botMessageCreateV2,
    botUpdateForAppV2,
    botUpdateV2,
    botWidgetGetV2,
    chatsBroadcastForAppV2,
    chatsBroadcastJobForAppV2,
    chatsBroadcastJobV2,
    chatsBroadcastV2,
    chatsHistoryGetV2,
    chatsMessageCreateV2,
    configureB2BToken,
    configureClient,
    filesDeleteV2,
    filesGetV2,
    filesUploadV2,
    getClientState,
    selectAgent,
    selectApp,
    setAuthMode,
    sourcesDocsDelete,
    sourcesDocsDeleteForAppV2,
    sourcesDocsDeleteV2,
    sourcesDocsListForAppV2,
    sourcesDocsListV2,
    sourcesDocsTagsUpdateForAppV2,
    sourcesDocsTagsUpdateV2,
    sourcesDocsUpload,
    sourcesDocsUploadForAppV2,
    sourcesDocsUploadV2,
    sourcesSiteCrawlForAppV2,
    sourcesSiteCrawlV2,
    sourcesSiteDeleteBatchForAppV2,
    sourcesSiteDeleteUrlForAppV2,
    sourcesSiteDeleteUrlV2Batch,
    sourcesSiteDeleteUrlV2Single,
    sourcesSiteListForAppV2,
    sourcesSiteListV2,
    sourcesSiteReindexForAppV2,
    sourcesSiteReindexV2,
    sourcesSiteTagsUpdateForAppV2,
    sourcesSiteTagsUpdateV2,
    userLogin,
    userRegistration,
    apiKeyCreate,
    apiKeyList,
    apiKeyRevoke,
    usersBatchCreateJobV2,
    usersBatchCreateV2,
    walletERC20Transfer,
    walletGetBalance,
    rememberAppToken,
    appTokenFor,
} from "./apiClientEthora.js"
import { appConfig } from "./config.js"
import { fail, ok } from "./mcpResponse.js"
import { ensureTenantActorAuth, splitRoomJid } from "./routeAuth.js"
import { connectorUrl, CONNECTOR_URL_NOTE } from "./publicUrl.js"

function errorToText(error: unknown) {
    // axios-style errors
    if (error && typeof error === "object" && "response" in error) {
        const e = error as any
        const status = e.response?.status
        const data = e.response?.data
        const msg = e.message
        return `error: ${msg || "request failed"}${status ? ` (status=${status})` : ""}${data ? ` data=${JSON.stringify(data)}` : ""}`
    }
    if (error instanceof Error) return `error: ${error.message}`
    return `error: ${String(error)}`
}

function asToolResult(envelope: any): CallToolResult {
    return { content: [{ type: "text", text: JSON.stringify(envelope) }] }
}

function getDefaultMeta(tool: string) {
    const state = getClientState() as any
    return {
        tool,
        apiUrl: state.apiUrl,
        authMode: state.authMode,
        currentAppId: state.currentAppId,
    }
}

function requireCurrentAppId() {
    const state = getClientState() as any
    const appId = String(state.currentAppId || "").trim()
    if (!appId) {
        throw new Error("No current app selected. Call `ethora-app-select` first (or pass appId where supported).")
    }
    return appId
}

function isDangerousToolsEnabled() {
    const state = getClientState() as any
    return Boolean(state.enableDangerousTools)
}

function isAliasesEnabled() {
    const state = getClientState() as any
    return Boolean(state.enableAliases)
}

function unwrapData(resp: any) {
    const body = resp?.data ?? resp
    if (body && typeof body === "object" && "data" in body && body.data && typeof body.data === "object") return body.data
    return body
}

function generatePassword(length = 20) {
    // Unambiguous alphabet; strong enough for an account an agent will drive
    // via API key from then on. Returned to the caller exactly once.
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*"
    const bytes = new Uint8Array(length)
    globalThis.crypto.getRandomValues(bytes)
    let out = ""
    for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]
    return out
}

async function issueApiKey(name?: string, ttlDays?: number) {
    const resp = await apiKeyCreate({ name, ttlDays })
    const d = unwrapData(resp) || {}
    return {
        id: d.id ?? d._id,
        name: d.name,
        token: d.token,
        expiresAt: d.expiresAt,
        createdAt: d.createdAt,
    }
}

// Attach the personal connector URL (hosted mode only) next to a freshly minted key.
function withConnectorUrl(data: any, token: string | undefined) {
    const url = connectorUrl(String(token || ""))
    if (url) {
        data.connectorUrl = url
        data.connectorUrlNote = CONNECTOR_URL_NOTE
    }
    return data
}

const API_KEY_USAGE_HINT = "Use the API key as a Bearer header on the hosted MCP endpoint (`Authorization: Bearer <token>`), or pass it to the stdio server. It is shown once; revoke it with `ethora-api-key-revoke`."

function normalizeBase64ToBuffer(input: string) {
    const raw = String(input || "")
    const b64 = raw.includes("base64,") ? raw.split("base64,").pop() || "" : raw
    return Buffer.from(b64, "base64")
}

function ensureUserAuthForTool() {
    const state = getClientState() as any
    if (state.authMode !== "user") {
        throw new Error("This tool requires user auth. Call `ethora-auth-use-user` (and `ethora-user-login`) first.")
    }
}

function ensureAppAuthForTool() {
    const state = getClientState() as any
    if (state.authMode !== "app") {
        throw new Error("This tool requires app-token auth. Call `ethora-auth-use-app` (and configure appToken via `ethora-app-select`) first.")
    }
}

function resolveAppScopedV2Context(passedAppId?: string) {
    const state = getClientState() as any
    const effectiveAppId = String(passedAppId || state.currentAppId || "").trim()

    if (state.authMode === "app") {
        if (!state.hasAppToken) {
            throw new Error("App-token auth is selected but appToken is missing. Call `ethora-app-select` with { appId, appToken } first.")
        }
        return { mode: "app" as const, appId: effectiveAppId || undefined }
    }

    if (state.authMode === "b2b") {
        if (!state.hasB2BToken) {
            throw new Error("B2B auth is selected but b2bToken is missing. Set env ETHORA_B2B_TOKEN or call `ethora-configure` with b2bToken.")
        }
        if (!effectiveAppId) {
            throw new Error("This tool needs appId in B2B mode. Pass appId or call `ethora-app-select` first.")
        }
        return { mode: "b2b" as const, appId: effectiveAppId }
    }

    // User mode (hosted server, login/register/API key/OAuth): tenant-scoped
    // routes accept the user token via their /v2/apps/:appId/... variants, so a
    // selected or passed appId is enough. Without one, callers fall back to the
    // bare route, which the backend scopes to the token's own app.
    if (state.authMode === "user") {
        if (!state.hasUserToken) {
            throw new Error("Not logged in. Call `ethora-user-login` or `ethora-user-register` first (or connect with an API key).")
        }
        return { mode: "user" as const, appId: effectiveAppId || undefined }
    }

    throw new Error("This tool requires user auth, app-token auth or B2B auth. Use `ethora-auth-use-user` (then `ethora-user-login`), `ethora-auth-use-app` or `ethora-auth-use-b2b`.")
}

// Resolve a room reference to the identifiers the v2 routes need. Rooms have
// two ids: the XMPP local part `${appId}_${suffix}` (a JID, used by broadcast
// `chatIds` and by invite `chatJid`) and the Mongo Chat `_id` (used by
// `/v2/apps/:appId/chats/:chatId/messages`). Callers may pass either; this
// looks the room up in the app's chat list to fill in the other.
async function resolveRoom(appIdHint: string | undefined, roomJidOrChatId: string | undefined) {
    const parsed = splitRoomJid(roomJidOrChatId, appIdHint)
    const res = await appChatsListV2(parsed.appId)
    const body = res.data?.data ?? res.data ?? {}
    const items: any[] = body.results || body.items || []
    const given = String(roomJidOrChatId || "").trim().split("@")[0]
    const rec = items.find((c) => String(c._id || c.id) === given)
        || items.find((c) => String(c.name) === parsed.roomName)
        || items.find((c) => String(c.name || "").endsWith(`_${parsed.chatId}`))
    if (!rec) {
        throw new Error(`Room not found in app ${parsed.appId}: ${given}. Pass the room JID returned by ethora-app-create-chat (\`${"${appId}_${chatId}"}\`) or a chat _id from the app's chat list.`)
    }
    const name = String(rec.name || parsed.roomName)
    const suffix = name.startsWith(`${parsed.appId}_`) ? name.slice(parsed.appId.length + 1) : name
    return { appId: parsed.appId, mongoId: String(rec._id || rec.id), roomName: name, suffix, roomJid: parsed.roomJid.includes("@") ? parsed.roomJid : name, title: rec.title || rec.chatName || "" }
}

function configureTool(server: McpServer) {
    server.registerTool(
        "ethora-configure",
        {
            description: "Set the Ethora API URL and credentials for this MCP session. Stores values in memory only; each call merges with omitted fields kept. Alternative to env vars (ETHORA_API_URL / ETHORA_APP_JWT / ETHORA_APP_TOKEN / ETHORA_B2B_TOKEN). On a hosted server `apiUrl` is fixed and cannot be changed; credentials are per session.\nAuth: none required — this establishes auth material. Errors: only if a value is structurally invalid. Follow with an `ethora-auth-use-*` tool to pick the active mode.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            inputSchema: {
                apiUrl: z.string().optional().describe("Full Ethora API URL including the version path, e.g. `https://api.chat.ethora.com/v1` or `http://localhost:8080/v1`. If you only have the host, set ETHORA_BASE_URL env instead and the server appends `/v1`."),
                appJwt: z.string().optional().describe("Ethora App JWT, used only to bootstrap login/register in user-auth mode. Usually starts with `JWT `. Secret — never commit it."),
                appToken: z.string().optional().describe("Per-app appToken for app-scoped flows (broadcast, sources, bot). Setting this makes app-token auth available via `ethora-auth-use-app`. Secret."),
                b2bToken: z.string().optional().describe("B2B server token for tenant-actor `x-custom-token` auth (a JWT with `type=server`). Required for B2B provisioning flows. Secret."),
            },
        },
        async function ({ apiUrl, appJwt, appToken, b2bToken }) {
            try {
                configureClient({ apiUrl, appJwt, appToken, b2bToken })
                return asToolResult(ok(getClientState(), getDefaultMeta("ethora-configure")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-configure")))
            }
        }
    )
}

function statusTool(server: McpServer) {
    server.registerTool(
        "ethora-status",
        {
            description: "Report the current Ethora MCP session state: configured API URL, active auth mode, which credentials are present (booleans like `hasAppJwt` — values never echoed), the selected appId/agentId, and `hosted`/`sessionId` on the hosted (Streamable HTTP) server.\nAuth: none required. Errors: effectively none. Related: `ethora-doctor` for an active connectivity check.",
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async function () {
            try {
                return asToolResult(ok(getClientState(), getDefaultMeta("ethora-status")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-status")))
            }
        }
    )
}

function helpTool(server: McpServer) {
    server.registerTool(
        "ethora-help",
        {
            description: "Task-oriented orientation for this MCP server: explains the three Ethora auth modes (user / app-token / B2B) and recommends next tool calls + recipes based on current session state.\nAuth: none required — inspects state, no API calls. Errors: effectively none. Related: pass a recommended recipe id to `ethora-run-recipe`.",
            annotations: { readOnlyHint: true, openWorldHint: false },
            inputSchema: {
                goal: z.enum(["auto", "b2b-bootstrap-ai", "broadcast", "sources-ingest", "files-upload", "bot-manage", "chat-test", "widget", "user-login"]).optional()
                    .describe("Goal hint to tailor the recommendations and recipe list. Omit or use `auto` to get recommendations inferred from the current session state."),
            },
        },
        async function ({ goal }) {
            const meta = getDefaultMeta("ethora-help")
            try {
                const state = getClientState() as any
                const availableAuthModes = ["user", "app", "b2b"] as const

                const checks: any = {
                    hasApiUrl: Boolean(state.apiUrl),
                    hasAppJwt: Boolean(state.hasAppJwt),
                    hasAppToken: Boolean(state.hasAppToken),
                    hasB2BToken: Boolean(state.hasB2BToken),
                    hasUserToken: Boolean(state.hasUserToken),
                    hasCurrentAppId: Boolean(state.currentAppId),
                    enableDangerousTools: Boolean(state.enableDangerousTools),
                }

                type NextCall = { tool: string; args?: any; why: string }
                const nextCalls: NextCall[] = []

                type RecipeStep = { tool: string; args?: any }
                type Recipe = { id: string; title: string; description: string; steps: RecipeStep[] }
                const recipes: Recipe[] = []
                const authModes = {
                    user: {
                        bestFor: "Developers, tenant admins, and app owners trying Ethora locally from Cursor or Claude Desktop.",
                        credentials: ["ETHORA_APP_JWT for login/register bootstrap", "user JWT + refresh token returned by ethora-user-login"],
                        typicalFlow: ["ethora-configure", "ethora-auth-use-user", "ethora-user-login"],
                    },
                    b2b: {
                        bestFor: "Permanent integrations, partner backends, and autonomous agents managing Ethora without a human user session.",
                        credentials: ["ETHORA_B2B_TOKEN for tenant-actor routes", "appToken after app selection for app-scoped automation"],
                        typicalFlow: ["ethora-configure", "ethora-auth-use-b2b", "ethora-b2b-app-create or ethora-b2b-app-bootstrap-ai", "ethora-app-select", "ethora-auth-use-app"],
                    },
                }

                // Always-start recommendations
                if (!checks.hasApiUrl) {
                    nextCalls.push({
                        tool: "ethora-configure",
                        args: { apiUrl: "https://api.ethoradev.com/v1" },
                        why: "Set the Ethora API URL for this MCP session.",
                    })
                }

                const effectiveGoal = goal || "auto"

                // Goal: user login flows (needs appJwt and user auth mode + login)
                if (effectiveGoal === "user-login" || effectiveGoal === "files-upload") {
                    if (!checks.hasAppJwt) {
                        nextCalls.push({
                            tool: "ethora-configure",
                            args: { appJwt: "JWT <APP_JWT_FOR_LOGIN_REGISTER>" },
                            why: "User-auth mode needs App JWT only for login/register bootstrap.",
                        })
                    }
                    if (state.authMode !== "user") {
                        nextCalls.push({ tool: "ethora-auth-use-user", why: "Switch to user-session auth mode." })
                    }
                    if (!checks.hasUserToken) {
                        nextCalls.push({
                            tool: "ethora-user-login",
                            args: { email: "user@example.com", password: "<password>" },
                            why: "Authenticate a user session token for local developer/admin flows such as files.",
                        })
                    }

                    recipes.push({
                        id: "user-login",
                        title: "User login (for user-auth tools like files)",
                        description: "Recommended first-run local flow for developers and admins using the MCP server on their own machine.",
                        steps: [
                            { tool: "ethora-configure", args: { apiUrl: String(state.apiUrl || "https://api.ethoradev.com/v1"), appJwt: "JWT <APP_JWT_FOR_LOGIN_REGISTER>" } },
                            { tool: "ethora-auth-use-user" },
                            { tool: "ethora-user-login", args: { email: "user@example.com", password: "<password>" } },
                        ],
                    })

                    recipes.push({
                        id: "files-upload-v2",
                        title: "Upload files (v2)",
                        description: "Use user-auth mode to upload user-owned files after logging in.",
                        steps: [
                            { tool: "ethora-auth-use-user" },
                            { tool: "ethora-user-login", args: { email: "user@example.com", password: "<password>" } },
                            { tool: "ethora-files-upload-v2", args: { files: [{ name: "example.txt", mimeType: "text/plain", base64: "<BASE64_CONTENT>" }] } },
                        ],
                    })
                }

                // Goal: B2B bootstrap AI
                if (effectiveGoal === "b2b-bootstrap-ai") {
                    if (state.authMode !== "b2b") {
                        nextCalls.push({ tool: "ethora-auth-use-b2b", why: "Use B2B auth mode (x-custom-token) for server-side provisioning and tenant-actor operations." })
                    }
                    if (!checks.hasB2BToken) {
                        nextCalls.push({
                            tool: "ethora-configure",
                            args: { b2bToken: "JWT <B2B_SERVER_TOKEN>" },
                            why: "B2B mode requires a server token sent as x-custom-token.",
                        })
                    }
                    nextCalls.push({
                        tool: "ethora-b2b-app-bootstrap-ai",
                        args: { displayName: "Acme AI Demo", crawlUrl: "https://example.com", enableBot: true, llmProvider: "openai", llmModel: "gpt-4o-mini" },
                        why: "Create app → ingest sources → enable bot in one repeatable automation flow.",
                    })

                    recipes.push({
                        id: "b2b-bootstrap-ai",
                        title: "B2B bootstrap: create app → ingest → enable bot",
                        description: "Recommended server-side flow when Ethora is being automated from your own backend or agent runner.",
                        steps: [
                            { tool: "ethora-configure", args: { apiUrl: String(state.apiUrl || "https://api.ethoradev.com/v1"), b2bToken: "JWT <B2B_SERVER_TOKEN>" } },
                            { tool: "ethora-auth-use-b2b" },
                            { tool: "ethora-b2b-app-bootstrap-ai", args: { displayName: "Acme AI Demo", crawlUrl: "https://example.com", enableBot: true, llmProvider: "openai", llmModel: "gpt-4o-mini" } },
                        ],
                    })

                    recipes.push({
                        id: "b2b-create-app-only",
                        title: "B2B: create app only",
                        description: "Create an app via B2B token (no sources/bot).",
                        steps: [
                            { tool: "ethora-configure", args: { apiUrl: String(state.apiUrl || "https://api.ethoradev.com/v1"), b2bToken: "JWT <B2B_SERVER_TOKEN>" } },
                            { tool: "ethora-auth-use-b2b" },
                            { tool: "ethora-b2b-app-create", args: { displayName: "My App" } },
                        ],
                    })
                }

                // Goal: app-token operations (broadcast/sources/bot/chat test)
                if (effectiveGoal === "broadcast" || effectiveGoal === "sources-ingest" || effectiveGoal === "bot-manage" || effectiveGoal === "chat-test") {
                    // User mode (hosted default) reaches every tenant-scoped route through
                    // /v2/apps/:appId/...; only a selected app is needed. App-token mode is
                    // for server integrations that hold an appToken.
                    if (!checks.hasCurrentAppId) {
                        nextCalls.push({
                            tool: "ethora-app-select",
                            args: { appId: "<APP_ID>" },
                            why: "App-scoped tools need a selected app context (appToken is optional in user mode).",
                        })
                    }

                    if (effectiveGoal === "broadcast") {
                        recipes.push({
                            id: "broadcast-v2",
                            title: "Broadcast to chat rooms (v2 job)",
                            description: "Select app + appToken, switch to app auth, enqueue broadcast, then poll for completion.",
                            steps: [
                                { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "JWT <APP_TOKEN>" } },
                                { tool: "ethora-auth-use-app" },
                                { tool: "ethora-chats-broadcast-v2", args: { text: "Hello from MCP!", allRooms: true } },
                                { tool: "ethora-wait-broadcast-job-v2", args: { jobId: "<JOB_ID_FROM_PREVIOUS_STEP>", timeoutMs: 60000, intervalMs: 2000 } },
                            ],
                        })
                    }

                    if (effectiveGoal === "sources-ingest") {
                        nextCalls.push({
                            tool: "ethora-sources-site-list-v2",
                            why: "Inspect crawled URLs and current tags for this app.",
                        })

                        recipes.push({
                            id: "sources-site-crawl-v2",
                            title: "Ingest website (Sources v2 crawl)",
                            description: "Crawl a website for RAG ingestion using app-token auth.",
                            steps: [
                                { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "JWT <APP_TOKEN>" } },
                                { tool: "ethora-auth-use-app" },
                                { tool: "ethora-sources-site-crawl-v2", args: { url: "https://example.com", followLink: true } },
                            ],
                        })

                        recipes.push({
                            id: "sources-docs-upload-v2",
                            title: "Upload docs for ingestion (Sources v2 docs)",
                            description: "Upload documents for parsing + embeddings using app-token auth.",
                            steps: [
                                { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "JWT <APP_TOKEN>" } },
                                { tool: "ethora-auth-use-app" },
                                { tool: "ethora-sources-docs-upload-v2", args: { files: [{ name: "doc.pdf", mimeType: "application/pdf", base64: "<BASE64_CONTENT>" }] } },
                            ],
                        })

                        recipes.push({
                            id: "sources-tag-site-v2",
                            title: "Tag a crawled source for segmented retrieval",
                            description: "List crawled sources, then assign tags used by RAG filtering.",
                            steps: [
                                { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "JWT <APP_TOKEN>" } },
                                { tool: "ethora-auth-use-app" },
                                { tool: "ethora-sources-site-list-v2", args: {} },
                                { tool: "ethora-sources-site-tags-update-v2", args: { sourceId: "<SOURCE_ID>", tags: ["support", "faq"] } },
                            ],
                        })
                    }

                    if (effectiveGoal === "bot-manage") {
                        nextCalls.push(
                            { tool: "ethora-agents-list-v2", why: "See the AI agents that already exist for the selected app." },
                            { tool: "ethora-agents-create-v2", args: { name: "Helper", prompt: "You are a polite support assistant for this app." }, why: "Create an AI agent persona (user auth; lands in the selected app)." },
                            { tool: "ethora-agent-invite-to-chat", args: { agentIdOrAddress: "<AGENT_ID>", chatJid: "<ROOM_JID>" }, why: "Put the agent into a room so it starts answering there." },
                            { tool: "ethora-bot-instances-list", args: { appId: String(state.currentAppId || "<APP_ID>") }, why: "Confirm the agent's bot instance is on." },
                        )
                        recipes.push({
                            id: "agent-create-and-invite",
                            title: "Create an AI agent and add it to a room (user auth)",
                            description: "The standard path for API-created apps: create a room, create an agent, invite it, then talk to it with ethora-chats-message-v2.",
                            steps: [
                                { tool: "ethora-app-select", args: { appId: "<APP_ID>" } },
                                { tool: "ethora-app-create-chat", args: { appId: "<APP_ID>", title: "Support", pinned: true } },
                                { tool: "ethora-agents-create-v2", args: { name: "Helper", prompt: "You are a polite support assistant for this app." } },
                                { tool: "ethora-agent-invite-to-chat", args: { agentIdOrAddress: "<AGENT_ID>", chatJid: "<ROOM_JID>" } },
                                { tool: "ethora-chats-message-v2", args: { roomJid: "<ROOM_JID>", text: "hello, is anyone there?", waitForReplySec: 45 } },
                            ],
                        })
                        recipes.push({
                            id: "legacy-bot-enable-and-tune",
                            title: "Legacy per-app bot (only for apps that already have one)",
                            description: "Apps created through the API or B2B have no legacy aiBot (ethora-bot-enable-v2 returns 422 BOT_NOT_INITIALIZED); use the agent recipe above instead.",
                            steps: [
                                { tool: "ethora-app-select", args: { appId: "<APP_ID>" } },
                                { tool: "ethora-bot-enable-v2", args: {} },
                                { tool: "ethora-bot-update-v2", args: { trigger: "/bot", prompt: "You are a helpful assistant.", greetingMessage: "Hello! Ask me anything." } },
                            ],
                        })
                    }
                    if (effectiveGoal === "chat-test") {
                        nextCalls.push(
                            {
                                tool: "ethora-chats-message-v2",
                                args: { roomJid: "<ROOM_JID>", text: "hello, is anyone there?", waitForReplySec: 45 },
                                why: "Post into the room as the app and wait for an invited AI agent to answer; replies come back in the result.",
                            },
                            {
                                tool: "ethora-chats-history-v2",
                                args: { roomJid: "<ROOM_JID>", limit: 20 },
                                why: "Read the room's archived messages (yours and the agent's).",
                            }
                        )
                        recipes.push(
                            {
                                id: "chat-test-room",
                                title: "Test an AI agent in a room",
                                description: "Post a message into a room the agent was invited to, wait for the reply, then read the history.",
                                steps: [
                                    { tool: "ethora-app-select", args: { appId: "<APP_ID>" } },
                                    { tool: "ethora-chats-message-v2", args: { roomJid: "<ROOM_JID>", text: "What can you help me with?", waitForReplySec: 45 } },
                                    { tool: "ethora-chats-history-v2", args: { roomJid: "<ROOM_JID>", limit: 20 } },
                                ],
                            },
                            {
                                id: "widget-embed",
                                title: "Embed the AI chat widget on a website",
                                description: "Agent -> room -> invite -> activate (binds the app's default bot instance) -> embed <script>. User auth; the activate step reuses the appToken captured from ethora-app-create.",
                                                                steps: [
                                    { tool: "ethora-app-select", args: { appId: "<APP_ID>" } },
                                    { tool: "ethora-agents-create-v2", args: { name: "Helper", prompt: "You are a polite support assistant for this website." } },
                                    { tool: "ethora-app-create-chat", args: { appId: "<APP_ID>", title: "Website widget" } },
                                    { tool: "ethora-agent-invite-to-chat", args: { agentIdOrAddress: "<AGENT_ID>", chatJid: "<ROOM_JID>" } },
                                    { tool: "ethora-agents-activate-v2", args: { agentId: "<AGENT_ID>", chatJid: "<ROOM_JID>" } },
                                    { tool: "ethora-widget-embed-snippet", args: { appId: "<APP_ID>", botName: "Helper" } },
                                ],
                            }
                        )
                    }
                }
                if (effectiveGoal === "widget") {
                    nextCalls.push(
                        { tool: "ethora-agents-create-v2", args: { name: "Helper", prompt: "You are a polite support assistant for this website." }, why: "The widget answers with an agent; create one (user auth)." },
                        { tool: "ethora-app-create-chat", args: { appId: String(state.currentAppId || "<APP_ID>"), title: "Website widget" }, why: "A room the agent is invited into becomes the widget chat." },
                        { tool: "ethora-agent-invite-to-chat", args: { agentIdOrAddress: "<AGENT_ID>", chatJid: "<ROOM_JID>" }, why: "Spawns the agent's bot instance for this app." },
                        { tool: "ethora-agents-activate-v2", args: { agentId: "<AGENT_ID>", chatJid: "<ROOM_JID>" }, why: "Sets the app's default bot instance; without it POST /v2/widget/sessions returns 422 and the widget stays silent. Uses the appToken captured from ethora-app-create." },
                        { tool: "ethora-widget-embed-snippet", args: { appId: String(state.currentAppId || "<APP_ID>"), botName: "Helper" }, why: "Returns the <script> tag to paste into the website plus prerequisites." },
                    )
                    recipes.push({
                        id: "widget-embed",
                        title: "Embed the AI chat widget on a website (user auth)",
                        description: "Create an agent, bind it as the app's active widget bot, then generate the embed script.",
                        steps: [
                            { tool: "ethora-app-select", args: { appId: "<APP_ID>" } },
                            { tool: "ethora-agents-create-v2", args: { name: "Helper", prompt: "You are a polite support assistant for this website." } },
                            { tool: "ethora-app-create-chat", args: { appId: "<APP_ID>", title: "Website widget" } },
                            { tool: "ethora-agent-invite-to-chat", args: { agentIdOrAddress: "<AGENT_ID>", chatJid: "<ROOM_JID>" } },
                            { tool: "ethora-agents-activate-v2", args: { agentId: "<AGENT_ID>", chatJid: "<ROOM_JID>" } },
                            { tool: "ethora-widget-embed-snippet", args: { appId: "<APP_ID>", botName: "Helper" } },
                        ],
                    })
                }
                // Auto mode: minimal “get unstuck” guidance
                if (effectiveGoal === "auto") {
                    if (!checks.hasApiUrl) {
                        // already suggested above
                    } else if (!checks.hasCurrentAppId) {
                        nextCalls.push({
                            tool: "ethora-app-select",
                            args: { appId: "<APP_ID>", appToken: "JWT <APP_TOKEN>" },
                            why: "Select an app to run app-scoped tools (broadcast/sources/bot).",
                        })
                    } else if (state.authMode === "app" && !checks.hasAppToken) {
                        nextCalls.push({
                            tool: "ethora-app-select",
                            args: { appId: String(state.currentAppId || "<APP_ID>"), appToken: "JWT <APP_TOKEN>" },
                            why: "You are in app auth mode but appToken is missing.",
                        })
                    } else if (state.authMode === "b2b" && !checks.hasB2BToken) {
                        nextCalls.push({
                            tool: "ethora-configure",
                            args: { b2bToken: "JWT <B2B_SERVER_TOKEN>" },
                            why: "You are in B2B auth mode but b2bToken is missing.",
                        })
                    } else if (state.authMode === "user" && !checks.hasUserToken) {
                        nextCalls.push({
                            tool: "ethora-user-login",
                            args: { email: "user@example.com", password: "<password>", createApiKey: true },
                            why: state.hosted
                                ? "Hosted server: no user token yet. Log in (or `ethora-user-register` for a new account) to bind this session; ask for an API key to reconnect later via `Authorization: Bearer <key>`."
                                : "You are in user auth mode but no user token is present.",
                        })
                        if (state.hosted) {
                            nextCalls.push({
                                tool: "ethora-user-register",
                                args: { email: "you@example.com", firstName: "First", lastName: "Last" },
                                why: "No account yet? Register, get logged in, and receive an API key in one call.",
                            })
                        }
                    } else {
                        nextCalls.push({ tool: "ethora-doctor", why: "Run connectivity checks and get fix suggestions." })
                    }

                    // Auto: include a couple of broadly useful recipes.
                    recipes.push({
                        id: "auto-auth-map",
                        title: "Auth map (quick reference)",
                        description: "Load the auth map into context (appJwt vs appToken vs b2bToken).",
                        steps: [{ tool: "ethora-auth-map" }],
                    })
                    recipes.push({
                        id: "auto-generate-env",
                        title: "Generate .env templates",
                        description: "Get copy/paste .env.example templates for MCP and SDK usage.",
                        steps: [{ tool: "ethora-generate-env-examples", args: {} }],
                    })
                    recipes.push({
                        id: "auto-chat-test-private",
                        title: "Test bot via private chat",
                        description: "Use the primary chats automation surface to send a test message and read history.",
                        steps: [
                            { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "JWT <APP_TOKEN>" } },
                            { tool: "ethora-auth-use-app" },
                            { tool: "ethora-chats-message-v2", args: { text: "Hello from MCP", mode: "private", nickname: "SDK Tester" } },
                            { tool: "ethora-chats-history-v2", args: { mode: "private", nickname: "SDK Tester", limit: 10 } },
                        ],
                    })
                }

                return asToolResult(ok({
                    hosted: state.hosted ? {
                        enabled: true,
                        apiUrl: state.apiUrl,
                        authPaths: [
                            "Connection header `Authorization: Bearer <user API key | appToken | b2b token>` (applied on every request; no tool call needed).",
                            "`ethora-user-login` with email + password (binds this MCP session; add `createApiKey: true` to get a reusable key).",
                            "`ethora-user-register` to create an account, log in and receive an API key in one step.",
                        ],
                        notes: [
                            "apiUrl is fixed per deployment; `ethora-configure` cannot change it here.",
                            "Sessions are private: nothing from another client's session is visible to you.",
                            "Manage keys with `ethora-api-key-create` / `ethora-api-key-list` / `ethora-api-key-revoke`.",
                        ],
                    } : undefined,
                    availableAuthModes,
                    authModes,
                    currentAuthMode: state.authMode,
                    checks,
                    recommendedNextCalls: nextCalls,
                    recipes,
                    notes: [
                        "Start with user auth for local manual exploration; use B2B + app-token for repeatable automation.",
                        "Tip: use goal='broadcast', goal='b2b-bootstrap-ai', or goal='chat-test' to tailor recommendations.",
                        "Dangerous tools are deny-by-default; see ETHORA_MCP_ENABLE_DANGEROUS_TOOLS in README.",
                    ],
                }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function resolveRecipeValue(value: any, vars: Record<string, any>, ctx: { lastJobId?: string }) {
    if (typeof value === "string") {
        const replacements: Record<string, any> = {
            "<API_URL>": vars.apiUrl,
            "<APP_JWT>": vars.appJwt,
            "<B2B_TOKEN>": vars.b2bToken,
            "<APP_ID>": vars.appId,
            "<APP_TOKEN>": vars.appToken,
            "<ROOM_JID>": vars.roomJid,
            "<SOURCE_ID>": vars.sourceId,
            "<EMAIL>": vars.email,
            "<PASSWORD>": vars.password,
            "<JOB_ID_FROM_PREVIOUS_STEP>": ctx.lastJobId,
        }
        let out = value
        for (const [k, v] of Object.entries(replacements)) {
            if (v === undefined || v === null) continue
            out = out.split(k).join(String(v))
        }
        return out
    }
    if (Array.isArray(value)) return value.map((v) => resolveRecipeValue(v, vars, ctx))
    if (value && typeof value === "object") {
        const out: any = {}
        for (const [k, v] of Object.entries(value)) out[k] = resolveRecipeValue(v, vars, ctx)
        return out
    }
    return value
}

async function executeRecipeStep(tool: string, args: any, ctx: { lastJobId?: string }) {
    // NOTE: this executes a small allow-list of tools used by built-in recipes.
    switch (tool) {
        case "ethora-configure": {
            const { apiUrl, appJwt, b2bToken } = args || {}
            const s = configureClient({ apiUrl, appJwt })
            if (typeof b2bToken === "string") configureB2BToken(b2bToken)
            return s
        }
        case "ethora-auth-use-user":
            return setAuthMode("user")
        case "ethora-auth-use-app":
            return setAuthMode("app")
        case "ethora-auth-use-b2b":
            return setAuthMode("b2b")
        case "ethora-user-login": {
            const { email, password } = args || {}
            const res = await userLogin(String(email || ""), String(password || ""))
            return res.data
        }
        case "ethora-app-select": {
            const { appId, appToken } = args || {}
            return selectApp({ appId: String(appId || ""), appToken: typeof appToken === "string" ? appToken : undefined })
        }
        case "ethora-b2b-app-create": {
            ensureB2BAuthForTool()
            const { displayName } = args || {}
            const res = await appCreateV2(String(displayName || "My App"))
            return res.data
        }
        case "ethora-b2b-app-bootstrap-ai": {
            const { displayName, crawlUrl, enableBot, followLink, docs, setAsCurrent, botTrigger, llmProvider, llmModel, savedAgentId } = args || {}
            return await runB2BAppBootstrapAi({
                displayName: String(displayName || "Acme AI Demo"),
                crawlUrl,
                enableBot,
                followLink,
                docs,
                setAsCurrent,
                botTrigger,
                llmProvider,
                llmModel,
                savedAgentId,
            } as any)
        }
        case "ethora-chats-broadcast-v2": {
            ensureTenantActorAuth()
            const { text, allRooms, chatIds, chatNames } = args || {}
            const payload: any = { text: String(text || "") }
            if (typeof allRooms === "boolean") payload.allRooms = allRooms
            if (Array.isArray(chatIds) && chatIds.length) payload.chatIds = chatIds
            if (Array.isArray(chatNames) && chatNames.length) payload.chatNames = chatNames
            const res = await chatsBroadcastV2(payload)
            const jobId = String(res?.data?.jobId || res?.data?.id || "")
            if (jobId) ctx.lastJobId = jobId
            return res.data
        }
        case "ethora-wait-broadcast-job-v2": {
            ensureTenantActorAuth()
            const { jobId, timeoutMs, intervalMs } = args || {}
            const timeout = timeoutMs ?? 60_000
            const interval = intervalMs ?? 1_000
            const started = Date.now()
            let last: any = null
            while (Date.now() - started < timeout) {
                const res = await chatsBroadcastJobV2(String(jobId || ctx.lastJobId || ""))
                last = res.data
                const state = String(last?.state || "")
                if (state === "completed" || state === "failed") return { done: true, state, job: last }
                await sleep(interval)
            }
            return { done: false, reason: "timeout", job: last }
        }
        case "ethora-sources-site-crawl-v2": {
            ensureTenantActorAuth()
            const { url, followLink, knowledgeScope, savedAgentId } = args || {}
            const actx = resolveAppScopedV2Context(undefined)
            const res = (actx.mode !== "app" && actx.appId)
                ? await sourcesSiteCrawlForAppV2(actx.appId, { url: String(url || ""), followLink, knowledgeScope, savedAgentId } as any)
                : await sourcesSiteCrawlV2({ url: String(url || ""), followLink, knowledgeScope, savedAgentId })
            return res.data
        }
        case "ethora-sources-docs-upload-v2": {
            ensureTenantActorAuth()
            const { files, knowledgeScope, savedAgentId } = args || {}
            const form = new FormData()
            for (const f of (files || [])) {
                const buf = normalizeBase64ToBuffer(f.base64)
                if (buf.length > 50 * 1024 * 1024) throw new Error(`File '${f.name}' exceeds 50MB limit`)
                const blob = new Blob([buf], { type: f.mimeType })
                form.append("files", blob, f.name)
            }
            if (knowledgeScope) form.append("knowledgeScope", knowledgeScope)
            if (savedAgentId) form.append("savedAgentId", savedAgentId)
            const actx = resolveAppScopedV2Context(undefined)
            const res = (actx.mode !== "app" && actx.appId) ? await sourcesDocsUploadForAppV2(actx.appId, form, { "Content-Type": "multipart/form-data" }) : await sourcesDocsUploadV2(form, { "Content-Type": "multipart/form-data" })
            return res.data
        }
        case "ethora-agents-list-v2": {
            ensureTenantActorAuth()
            const res = await agentsListV2(resolveAppScopedV2Context((args as any)?.appId).appId)
            return res.data
        }
        case "ethora-agents-get-v2": {
            ensureUserAuthForTool()
            const { agentId } = args || {}
            const res = await agentsGetV2(String(agentId || ""))
            return res.data
        }
        case "ethora-agents-create-v2": {
            ensureTenantActorAuth()
            const { appId: caseAppId, ...caseRest } = (args as any) || {}
            const res = await agentsCreateV2(caseRest as any, resolveAppScopedV2Context(caseAppId).appId)
            return res.data
        }
        case "ethora-agents-update-v2": {
            ensureUserAuthForTool()
            const { agentId, ...payload } = args || {}
            const res = await agentsUpdateV2(String(agentId || ""), payload as any)
            return res.data
        }
        case "ethora-agents-clone-v2": {
            ensureUserAuthForTool()
            const { agentId, ...payload } = args || {}
            const res = await agentsCloneV2(String(agentId || ""), payload as any)
            return res.data
        }
        case "ethora-agents-activate-v2": {
            const { agentId, chatJid, appId } = args || {}
            return await activateAgentForApp(String(agentId || ""), chatJid ? String(chatJid) : undefined, appId ? String(appId) : undefined)
        }
        case "ethora-bot-enable-v2": {
            ensureTenantActorAuth()
            const { trigger } = args || {}
            const actx = resolveAppScopedV2Context(undefined)
            const res = (actx.mode !== "app" && actx.appId)
                ? await botUpdateForAppV2(actx.appId, { status: "on", trigger } as any)
                : await botUpdateV2({ status: "on", trigger } as any)
            return res.data
        }
        case "ethora-bot-update-v2": {
            ensureTenantActorAuth()
            const actx = resolveAppScopedV2Context(undefined)
            const res = (actx.mode !== "app" && actx.appId) ? await botUpdateForAppV2(actx.appId, args as any) : await botUpdateV2(args as any)
            return res.data
        }
        case "ethora-files-upload-v2": {
            ensureUserAuthForTool()
            const { files } = args || {}
            const form = new FormData()
            for (const f of (files || [])) {
                const buf = normalizeBase64ToBuffer(f.base64)
                if (buf.length > 50 * 1024 * 1024) throw new Error(`File '${f.name}' exceeds 50MB limit`)
                const blob = new Blob([buf], { type: f.mimeType })
                form.append("files", blob, f.name)
            }
            const res = await filesUploadV2(form, { "Content-Type": "multipart/form-data" })
            return res.data
        }
        default:
            throw new Error(`ethora-run-recipe does not support step tool '${tool}'`)
    }
}

function runRecipeTool(server: McpServer) {
    server.registerTool(
        "ethora-run-recipe",
        {
            description: "Execute a built-in recipe — an ordered sequence of this server's own tool calls — by id. Recipes capture common flows (B2B bootstrap, broadcast, sources ingest). Use `dryRun: true` to preview resolved steps. Omit `recipeId` to list runnable recipes for a `goal`.\nAuth: depends on the recipe's steps — configure those first (see `ethora-help`). Errors: stops at the first failing step and returns the partial log; a missing required `vars` entry fails fast before any step runs.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                recipeId: z.string().min(1).optional().describe("Id of the recipe to run. Omit to instead list the runnable recipes for the selected `goal` (get ids from `ethora-help`)."),
                goal: z.enum(["auto", "b2b-bootstrap-ai", "broadcast", "sources-ingest", "files-upload", "bot-manage", "chat-test", "widget", "user-login"]).optional()
                    .describe("Goal scope used to look up recipes when `recipeId` is omitted. Defaults to `auto`."),
                vars: z.record(z.any()).optional().describe("Key/value substitutions injected into recipe steps (e.g. appId, appToken, b2bToken, appJwt, email, password, apiUrl). A recipe declares which vars it requires; missing required vars fail the run before any step executes."),
                dryRun: z.boolean().optional().describe("If true, resolve and return the step list with `vars` substituted but execute nothing. Use this to preview a recipe before running it for real."),
            },
        },
        async function ({ recipeId, goal, vars, dryRun }) {
            const meta = getDefaultMeta("ethora-run-recipe")
            try {
                const state = getClientState() as any
                const effectiveGoal = goal || "auto"

                // NOTE: We can't call the ethora-help tool implementation from here directly.
                // So we keep a small built-in recipe registry (runnable only) with stable IDs.
                const helpRes = await (async () => {
                    // Minimal subset of recipes: these IDs match ethora-help.
                    const out: any = { recipes: [] as any[] }
                    const apiUrl = String(state.apiUrl || "https://api.ethoradev.com/v1")
                    const includeAll = effectiveGoal === "auto"

                    if (includeAll || effectiveGoal === "b2b-bootstrap-ai") {
                        out.recipes.push(
                            {
                                id: "b2b-bootstrap-ai",
                                title: "B2B bootstrap: create app → ingest → configure bot",
                                description: "Best for partner automation and repeatable provisioning.",
                                requiredVars: ["b2bToken"],
                                steps: [
                                    { tool: "ethora-configure", args: { apiUrl, b2bToken: "<B2B_TOKEN>" } },
                                    { tool: "ethora-auth-use-b2b" },
                                    { tool: "ethora-b2b-app-bootstrap-ai", args: { displayName: "Acme AI Demo", crawlUrl: "https://example.com", enableBot: true, llmProvider: "openai", llmModel: "gpt-4o-mini" } },
                                ],
                            },
                            {
                                id: "b2b-create-app-only",
                                title: "B2B: create app only",
                                description: "Create an app via B2B token (no sources/bot).",
                                requiredVars: ["b2bToken"],
                                steps: [
                                    { tool: "ethora-configure", args: { apiUrl, b2bToken: "<B2B_TOKEN>" } },
                                    { tool: "ethora-auth-use-b2b" },
                                    { tool: "ethora-b2b-app-create", args: { displayName: "My App" } },
                                ],
                            }
                        )
                    }
                    if (includeAll || effectiveGoal === "broadcast") {
                        out.recipes.push({
                            id: "broadcast-v2",
                            title: "Broadcast to chat rooms (v2 job)",
                            description: "Select app + appToken, switch to app auth, enqueue broadcast, then poll for completion.",
                            requiredVars: ["appId", "appToken"],
                            steps: [
                                { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "<APP_TOKEN>" } },
                                { tool: "ethora-auth-use-app" },
                                { tool: "ethora-chats-broadcast-v2", args: { text: "Hello from MCP!", allRooms: true } },
                                { tool: "ethora-wait-broadcast-job-v2", args: { jobId: "<JOB_ID_FROM_PREVIOUS_STEP>", timeoutMs: 60000, intervalMs: 2000 } },
                            ],
                        })
                    }
                    if (includeAll || effectiveGoal === "sources-ingest") {
                        out.recipes.push(
                            {
                                id: "sources-site-crawl-v2",
                                title: "Ingest website (Sources v2 crawl)",
                                description: "Crawl a website for RAG ingestion using app-token auth.",
                                requiredVars: ["appId", "appToken"],
                                steps: [
                                    { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "<APP_TOKEN>" } },
                                    { tool: "ethora-auth-use-app" },
                                    { tool: "ethora-sources-site-crawl-v2", args: { url: "https://example.com", followLink: true } },
                                ],
                            }
                        )
                        out.recipes.push(
                            {
                                id: "sources-docs-upload-v2",
                                title: "Upload docs for ingestion (Sources v2 docs)",
                                description: "Upload documents for parsing + embeddings using app-token auth.",
                                requiredVars: ["appId", "appToken", "base64Content"],
                                steps: [
                                    { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "<APP_TOKEN>" } },
                                    { tool: "ethora-auth-use-app" },
                                    { tool: "ethora-sources-docs-upload-v2", args: { files: [{ name: "doc.pdf", mimeType: "application/pdf", base64: "<BASE64_CONTENT>" }] } },
                                ],
                            },
                            {
                                id: "sources-tag-site-v2",
                                title: "Tag a crawled source for segmented retrieval",
                                description: "List crawled sources, then assign tags used by RAG filtering.",
                                requiredVars: ["appId", "appToken"],
                                steps: [
                                    { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "<APP_TOKEN>" } },
                                    { tool: "ethora-auth-use-app" },
                                    { tool: "ethora-sources-site-list-v2", args: {} },
                                    { tool: "ethora-sources-site-tags-update-v2", args: { sourceId: "<SOURCE_ID>", tags: ["support", "faq"] } },
                                ],
                            }
                        )
                    }
                    if (includeAll || effectiveGoal === "bot-manage") {
                        out.recipes.push({
                            id: "bot-enable-and-tune",
                            title: "Enable bot + tune settings (v2)",
                            description: "Enable a bot for an app and update its prompt/greeting.",
                            requiredVars: ["appId", "appToken"],
                            steps: [
                                { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "<APP_TOKEN>" } },
                                { tool: "ethora-auth-use-app" },
                                { tool: "ethora-bot-enable-v2", args: {} },
                                { tool: "ethora-bot-update-v2", args: { trigger: "/bot", prompt: "You are a helpful assistant.", greetingMessage: "Hello! Ask me anything.", llmProvider: "openai", llmModel: "gpt-4o-mini" } },
                            ],
                        })
                    }
                    if (includeAll || effectiveGoal === "chat-test") {
                        out.recipes.push(
                            {
                                id: "chat-test-private",
                                title: "Test bot via private chat automation",
                                description: "Send a private test message and then read back the saved conversation history.",
                                requiredVars: ["appId", "appToken"],
                                steps: [
                                    { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "<APP_TOKEN>" } },
                                    { tool: "ethora-auth-use-app" },
                                    { tool: "ethora-chats-message-v2", args: { text: "Summarize the indexed FAQ in 3 bullets.", mode: "private", nickname: "SDK Tester" } },
                                    { tool: "ethora-chats-history-v2", args: { mode: "private", nickname: "SDK Tester", limit: 10 } },
                                ],
                            },
                            {
                                id: "chat-test-group",
                                title: "Test bot via group-room automation",
                                description: "Send a test message into a room-style conversation and then fetch the resulting history.",
                                requiredVars: ["appId", "appToken", "roomJid"],
                                steps: [
                                    { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "<APP_TOKEN>" } },
                                    { tool: "ethora-auth-use-app" },
                                    { tool: "ethora-chats-message-v2", args: { text: "What sources are currently indexed for this app?", mode: "group", roomJid: "<ROOM_JID>" } },
                                    { tool: "ethora-chats-history-v2", args: { mode: "group", roomJid: "<ROOM_JID>", limit: 10 } },
                                ],
                            },
                            {
                                id: "widget-embed",
                                title: "Embed the AI chat widget on a website",
                                description: "Agent -> room -> invite -> activate (binds the app's default bot instance) -> embed <script>. User auth; the activate step reuses the appToken captured from ethora-app-create.",
                                requiredVars: ["appId"],
                                steps: [
                                    { tool: "ethora-app-select", args: { appId: "<APP_ID>" } },
                                    { tool: "ethora-agents-create-v2", args: { name: "Helper", prompt: "You are a polite support assistant for this website." } },
                                    { tool: "ethora-app-create-chat", args: { appId: "<APP_ID>", title: "Website widget" } },
                                    { tool: "ethora-agent-invite-to-chat", args: { agentIdOrAddress: "<AGENT_ID>", chatJid: "<ROOM_JID>" } },
                                    { tool: "ethora-agents-activate-v2", args: { agentId: "<AGENT_ID>", chatJid: "<ROOM_JID>" } },
                                    { tool: "ethora-widget-embed-snippet", args: { appId: "<APP_ID>", botName: "Helper" } },
                                ],
                            }
                        )
                    }
                    if (includeAll || effectiveGoal === "user-login" || effectiveGoal === "files-upload") {
                        out.recipes.push(
                            {
                                id: "user-login",
                                title: "User login (for user-auth tools like files)",
                                description: "Configure appJwt (if needed), switch to user auth, and login.",
                                requiredVars: ["appJwt", "email", "password"],
                                steps: [
                                    { tool: "ethora-configure", args: { apiUrl, appJwt: "<APP_JWT>" } },
                                    { tool: "ethora-auth-use-user" },
                                    { tool: "ethora-user-login", args: { email: "<EMAIL>", password: "<PASSWORD>" } },
                                ],
                            },
                            {
                                id: "files-upload-v2",
                                title: "Upload files (v2)",
                                description: "Login a user, then call the v2 files upload tool.",
                                requiredVars: ["email", "password", "base64Content"],
                                steps: [
                                    { tool: "ethora-auth-use-user" },
                                    { tool: "ethora-user-login", args: { email: "<EMAIL>", password: "<PASSWORD>" } },
                                    { tool: "ethora-files-upload-v2", args: { files: [{ name: "example.txt", mimeType: "text/plain", base64: "<BASE64_CONTENT>" }] } },
                                ],
                            }
                        )
                    }
                    return out
                })()

                // List available runnable recipes when recipeId is omitted.
                if (!recipeId) {
                    return asToolResult(ok({ goal: effectiveGoal, recipes: helpRes?.recipes || [] }, meta))
                }

                const recipe = (helpRes?.recipes || []).find((r: any) => r.id === String(recipeId))
                if (!recipe) {
                    return asToolResult(fail(new Error(`Unknown recipeId '${recipeId}' for goal '${effectiveGoal}'. Call ethora-run-recipe without recipeId to list available recipes.`), meta))
                }

                const v = (vars && typeof vars === "object") ? (vars as any) : {}
                const ctx: { lastJobId?: string } = {}

                const resolvedSteps = recipe.steps.map((s: any) => ({
                    tool: s.tool,
                    args: resolveRecipeValue(s.args, v, ctx),
                }))

                if (dryRun) {
                    return asToolResult(ok({ recipeId: recipe.id, dryRun: true, steps: resolvedSteps }, meta))
                }

                const results: any[] = []
                for (let i = 0; i < resolvedSteps.length; i++) {
                    const step = resolvedSteps[i]
                    try {
                        const data = await executeRecipeStep(step.tool, step.args, ctx)
                        results.push({ i, tool: step.tool, args: step.args, ok: true, data })
                    } catch (e) {
                        results.push({ i, tool: step.tool, args: step.args, ok: false, error: errorToText(e) })
                        break
                    }
                }

                return asToolResult(ok({ recipeId: recipe.id, dryRun: false, steps: results, state: getClientState() }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function doctorTool(server: McpServer) {
    server.registerTool(
        "ethora-doctor",
        {
            description: "Diagnose the session: validate the config is internally consistent for the active auth mode and ping the Ethora API (`GET /v1/ping`). Returns `{ state, checks, ping, suggestions }`.\nAuth: none required; report is tailored to whatever credentials are set. Errors: rarely throws — instead returns `suggestions` and a `ping.ok: false` block when the API is unreachable.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                timeoutMs: z.number().int().min(500).max(20000).optional().describe("HTTP timeout in milliseconds for the ping request. Defaults to 3000. Raise it on slow links, lower it to fail fast."),
            },
        },
        async function ({ timeoutMs }) {
            const meta = getDefaultMeta("ethora-doctor")
            try {
                const state = getClientState() as any
                const checks: any = {
                    hasApiUrl: Boolean(state.apiUrl),
                    hasAppJwt: Boolean(state.hasAppJwt),
                    hasAppToken: Boolean(state.hasAppToken),
                    hasB2BToken: Boolean(state.hasB2BToken),
                    hasUserToken: Boolean(state.hasUserToken),
                }
                const suggestions: Array<{ severity: "info" | "warn"; message: string; action: string }> = []

                if (!checks.hasApiUrl) {
                    suggestions.push({
                        severity: "warn",
                        message: "ETHORA API URL is not configured.",
                        action: "Set env ETHORA_API_URL (or ETHORA_BASE_URL) or call `ethora-configure` with apiUrl.",
                    })
                }

                // Login/register endpoints require appJwt.
                if (!checks.hasAppJwt) {
                    suggestions.push({
                        severity: "info",
                        message: "App JWT is missing (needed only for user-auth login/register bootstrap).",
                        action: "Set env ETHORA_APP_JWT or call `ethora-configure` with appJwt.",
                    })
                }

                if (state.authMode === "app" && !checks.hasAppToken) {
                    suggestions.push({
                        severity: "warn",
                        message: "Auth mode is app-token but appToken is not configured.",
                        action: "Call `ethora-app-select` with { appId, appToken } or switch to user auth via `ethora-auth-use-user`.",
                    })
                }

                if (state.authMode === "b2b" && !checks.hasB2BToken) {
                    suggestions.push({
                        severity: "warn",
                        message: "Auth mode is B2B but b2bToken is not configured.",
                        action: "Set env ETHORA_B2B_TOKEN or call `ethora-configure` with b2bToken, or switch auth mode.",
                    })
                }

                if (state.authMode === "user" && !checks.hasUserToken) {
                    suggestions.push({
                        severity: "info",
                        message: "Auth mode is user-session but no user token is present.",
                        action: "Call `ethora-user-login` for the local developer/admin flow, or switch to B2B/app-token auth for automation.",
                    })
                }

                if (!state.currentAppId) {
                    suggestions.push({
                        severity: "info",
                        message: "No current app is selected.",
                        action: "Call `ethora-app-select` to set appId (and optionally appToken).",
                    })
                }

                if (!state.enableDangerousTools) {
                    suggestions.push({
                        severity: "info",
                        message: "Dangerous/destructive tools are disabled (deny-by-default).",
                        action: "If you need app deletion, wallet transfers, or bulk deletes, set env ETHORA_MCP_ENABLE_DANGEROUS_TOOLS=true and restart the MCP server.",
                    })
                }

                let ping: any = null
                try {
                    const pingRes = await apiPing(timeoutMs || 3000)
                    ping = { ok: true, status: pingRes.status, data: pingRes.data }
                } catch (pingErr) {
                    ping = { ok: false, ...fail(pingErr).error }
                    suggestions.push({
                        severity: "warn",
                        message: "API connectivity check failed (ping).",
                        action: "Verify ETHORA_API_URL points to a reachable Ethora API and that /v1/ping is exposed. Then rerun `ethora-doctor`.",
                    })
                }

                if (state.hosted) {
                    suggestions.push({
                        severity: "info",
                        message: "Hosted MCP server: identity comes from the `Authorization: Bearer` header or from `ethora-user-login` / `ethora-user-register` in this session.",
                        action: checks.hasUserToken ? "You are authenticated. Use `ethora-api-key-create` for a reusable key." : "Call `ethora-user-login` (existing account) or `ethora-user-register` (new account).",
                    })
                }
                return asToolResult(ok({ state, checks, ping, suggestions }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function authUseAppTool(server: McpServer) {
    server.registerTool(
        "ethora-auth-use-app",
        {
            description: "Switch this session's active auth mode to app-token, so subsequent app-scoped calls authenticate with the configured `appToken`.\nAuth: requires an `appToken` to already be configured (via `ethora-configure`, ETHORA_APP_TOKEN env, or `ethora-app-select`). Errors: returns an error if no `appToken` is configured. Related: use after `ethora-app-select`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async function () {
            try {
                return asToolResult(ok(setAuthMode("app"), getDefaultMeta("ethora-auth-use-app")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-auth-use-app")))
            }
        }
    )
}

function authUseUserTool(server: McpServer) {
    server.registerTool(
        "ethora-auth-use-user",
        {
            description: "Switch this session's active auth mode to user-session, so subsequent calls authenticate as a logged-in Ethora user.\nAuth: the switch needs nothing, but user-auth tools only work once `ethora-user-login` stores a user token (login also needs a configured `appJwt`). Errors: none on the switch; downstream tools return 401 until login succeeds. Related: follow with `ethora-user-login`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async function () {
            try {
                return asToolResult(ok(setAuthMode("user"), getDefaultMeta("ethora-auth-use-user")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-auth-use-user")))
            }
        }
    )
}

function authUseB2BTool(server: McpServer) {
    server.registerTool(
        "ethora-auth-use-b2b",
        {
            description: "Switch this session's active auth mode to B2B, so subsequent calls authenticate as a tenant actor via the `x-custom-token` header.\nAuth: requires a `b2bToken` (JWT with `type=server`) to already be configured (via `ethora-configure` or ETHORA_B2B_TOKEN env). Errors: returns an error if no `b2bToken` is configured. Related: server-side automation — pairs with `ethora-b2b-app-create`, `ethora-users-batch-create-v2`, `ethora-app-tokens-*-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async function () {
            try {
                return asToolResult(ok(setAuthMode("b2b"), getDefaultMeta("ethora-auth-use-b2b")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-auth-use-b2b")))
            }
        }
    )
}

function ensureB2BAuthForTool() {
    const state = getClientState() as any
    if (state.authMode !== "b2b") {
        throw new Error("This tool requires B2B auth. Call `ethora-auth-use-b2b` (and configure b2bToken via `ethora-configure`) first.")
    }
    if (!state.hasB2BToken) {
        throw new Error("B2B auth mode selected, but b2bToken is missing. Provide it via env ETHORA_B2B_TOKEN or `ethora-configure`.")
    }
}

function appSelectTool(server: McpServer) {
    server.registerTool(
        "ethora-app-select",
        {
            description: "Set the current app context for this session so app-scoped tools can omit their `appId` argument. Stores `currentAppId` and, if given, `appToken` (which defaults the auth mode to app-token unless `authMode` overrides).\nAuth: none required to set the context. Errors: effectively none — a non-existent `appId` is not validated here; the first app-scoped API call surfaces the 404. Related: pairs with `ethora-auth-use-app`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            inputSchema: {
                appId: z.string().describe("24-char hex Ethora appId to set as the current context. Get it from `ethora-app-list`, `ethora-app-create`, or a B2B create/provision response."),
                appToken: z.string().optional().describe("Per-app appToken to store alongside the appId. If provided, the active auth mode switches to app-token (unless `authMode` says otherwise). Secret."),
                authMode: z.enum(["app", "user", "b2b"]).optional().describe("Auth mode to keep after selecting the app. Omit to let the mode default to app-token when an `appToken` is given, or stay unchanged otherwise."),
            },
        },
        async function ({ appId, appToken, authMode }) {
            try {
                return asToolResult(ok(selectApp({ appId, appToken, authMode }), getDefaultMeta("ethora-app-select")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-app-select")))
            }
        }
    )
}

function agentSelectTool(server: McpServer) {
    server.registerTool(
        "ethora-agent-select",
        {
            description: "Set the current saved-agent context for this session, so agent-scoped tools can omit their `agentId` argument. Stores `currentAgentId` in session state.\nAuth: none required. Errors: effectively none — the `agentId` is not validated here; a bad id surfaces on the first agent-scoped API call. Related: use before repeated `ethora-agents-*-v2` calls.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            inputSchema: {
                agentId: z.string().min(1).describe("Id of a saved agent owned by the current app. Get it from `ethora-agents-list-v2` or the response of `ethora-agents-create-v2`."),
            },
        },
        async function ({ agentId }) {
            try {
                return asToolResult(ok(selectAgent({ agentId }), getDefaultMeta("ethora-agent-select")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-agent-select")))
            }
        }
    )
}

function chatsBroadcastTool(server: McpServer) {
    server.registerTool(
        "ethora-chats-broadcast-v2",
        {
            description: "Enqueue an asynchronous broadcast job posting a message to one or more chat rooms of an app — returns a `jobId`; messages are not sent synchronously. Targeting is exclusive: `allRooms`, `chatIds`, or `chatNames`, not a mix.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 400 no target or conflicting targets; 404 unknown `appId` or room. Related: track with `ethora-wait-broadcast-job-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to broadcast in. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode (the token determines the app)."),
                text: z.string().min(1).describe("Plain-text message body to broadcast to the targeted rooms."),
                allRooms: z.boolean().optional().describe("If true, broadcast to every room in the app. Mutually exclusive with `chatIds` and `chatNames`."),
                chatIds: z.array(z.string()).optional().describe("Explicit list of chat ids to target. Mutually exclusive with `allRooms` and `chatNames`."),
                chatNames: z.array(z.string()).optional().describe("Explicit list of chat JIDs or localparts to target. Mutually exclusive with `allRooms` and `chatIds`."),
            },
        },
        async function ({ appId, text, allRooms, chatIds, chatNames }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const payload: any = { text }
                if (typeof allRooms === "boolean") payload.allRooms = allRooms
                if (chatIds?.length) payload.chatIds = chatIds
                if (chatNames?.length) payload.chatNames = chatNames

                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await chatsBroadcastForAppV2(ctx.appId!, payload)
                    : await chatsBroadcastV2(payload)
                return asToolResult(ok(res.data, getDefaultMeta("ethora-chats-broadcast-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-chats-broadcast-v2")))
            }
        }
    )
}

function chatsBroadcastJobTool(server: McpServer) {
    server.registerTool(
        "ethora-chats-broadcast-job-v2",
        {
            description: "Fetch the current status and per-room results of a broadcast job by `jobId` (one-shot, no polling). Returns the job object with its `state` (pending/running/completed/failed).\nAuth: app-token mode OR B2B mode with an explicit `appId` — must match the auth used to enqueue the job. Errors: 401/403 wrong auth; 404 unknown `jobId`. Related: `ethora-wait-broadcast-job-v2` for a blocking wait.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the job belongs to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                jobId: z.string().describe("Job id returned by `ethora-chats-broadcast-v2`."),
            },
        },
        async function ({ appId, jobId }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await chatsBroadcastJobForAppV2(ctx.appId!, jobId)
                    : await chatsBroadcastJobV2(jobId)
                return asToolResult(ok(res.data, getDefaultMeta("ethora-chats-broadcast-job-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-chats-broadcast-job-v2")))
            }
        }
    )
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitBroadcastJobTool(server: McpServer) {
    server.registerTool(
        "ethora-wait-broadcast-job-v2",
        {
            description: "Block until a broadcast job reaches a terminal state (`completed` or `failed`) or until `timeoutMs` — read-only polling wrapper around `ethora-chats-broadcast-job-v2`. Returns `{ done, state, job }`, or `{ done: false, reason: \"timeout\" }` on timeout.\nAuth: app-token mode OR B2B mode with an explicit `appId` — must match the auth used to enqueue the job. Errors: 401/403 wrong auth; 404 unknown `jobId`.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the job belongs to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                jobId: z.string().min(1).describe("Job id returned by `ethora-chats-broadcast-v2`."),
                timeoutMs: z.number().int().min(1000).max(300000).optional().describe("Maximum time to wait, in milliseconds. Default 60000. Caps at 300000 (5 min)."),
                intervalMs: z.number().int().min(250).max(10000).optional().describe("Delay between status checks, in milliseconds. Default 1000. Lower = more responsive but more API calls."),
            },
        },
        async function ({ appId, jobId, timeoutMs, intervalMs }) {
            const meta = getDefaultMeta("ethora-wait-broadcast-job-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const timeout = timeoutMs ?? 60_000
                const interval = intervalMs ?? 1_000
                const started = Date.now()
                let last: any = null
                while (Date.now() - started < timeout) {
                    const res = (ctx.mode !== "app" && ctx.appId)
                        ? await chatsBroadcastJobForAppV2(ctx.appId!, jobId)
                        : await chatsBroadcastJobV2(jobId)
                    last = res.data
                    const state = String(last?.state || "")
                    if (state === "completed" || state === "failed") {
                        return asToolResult(ok({ done: true, state, job: last }, meta))
                    }
                    await sleep(interval)
                }
                return asToolResult(ok({ done: false, reason: "timeout", job: last }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function filesUploadV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-files-upload-v2",
        {
            description: "Upload 1–5 files to the authenticated user's Ethora file storage (`POST /v2/files`). Each upload is a new record (no overwrite-by-name); files passed as base64, 50MB max each.\nAuth: user-auth mode with an active user session (`ethora-user-login` first). Errors: 401 not logged in; 413 size limit exceeded; 422 unsupported mime type. Related: manage with `ethora-files-get-v2` / `ethora-files-delete-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                files: z.array(z.object({
                    name: z.string().min(1).describe("File name including extension, e.g. `report.pdf`."),
                    mimeType: z.string().min(1).describe("MIME type of the content, e.g. `application/pdf`, `image/png`, `text/plain`."),
                    base64: z.string().min(1).describe("File content, base64-encoded. A `data:...;base64,` prefix is accepted and stripped. Max 50MB decoded per file."),
                })).min(1).max(5).describe("1 to 5 files to upload in this call."),
            },
        },
        async function ({ files }) {
            try {
                ensureUserAuthForTool()
                const form = new FormData()
                for (const f of files) {
                    const buf = normalizeBase64ToBuffer(f.base64)
                    // lightweight client-side guardrail (server has its own limits too)
                    if (buf.length > 50 * 1024 * 1024) {
                        throw new Error(`File '${f.name}' exceeds 50MB limit`)
                    }
                    const blob = new Blob([buf], { type: f.mimeType })
                    form.append("files", blob, f.name)
                }
                const res = await filesUploadV2(form, { "Content-Type": "multipart/form-data" })
                return asToolResult(ok(res.data, getDefaultMeta("ethora-files-upload-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-files-upload-v2")))
            }
        }
    )
}

function filesGetV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-files-get-v2",
        {
            description: "List the authenticated user's files, or fetch one file's metadata by id (`GET /v2/files`). Returns an array when `id` is omitted, a single record when given.\nAuth: user-auth mode with an active user session. Errors: 401 not logged in; 404 unknown `id` or not owned by the user.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                id: z.string().optional().describe("File id to fetch a single record. Omit to list all files owned by the logged-in user."),
            },
        },
        async function ({ id }) {
            try {
                ensureUserAuthForTool()
                const res = await filesGetV2(id)
                return asToolResult(ok(res.data, getDefaultMeta("ethora-files-get-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-files-get-v2")))
            }
        }
    )
}

function filesDeleteV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-files-delete-v2",
        {
            description: "Permanently delete one of the authenticated user's files by id (`DELETE /v2/files/:id`). Removes the record and its stored content; not reversible.\nAuth: user-auth mode with an active user session. Errors: 401 not logged in; 403 not owned by the user; 404 unknown `id`. Related: get ids from `ethora-files-get-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
            inputSchema: { id: z.string().min(1).describe("Id of the file to delete. Get it from `ethora-files-get-v2`.") },
        },
        async function ({ id }) {
            try {
                ensureUserAuthForTool()
                const res = await filesDeleteV2(id)
                return asToolResult(ok(res.data, getDefaultMeta("ethora-files-delete-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-files-delete-v2")))
            }
        }
    )
}

function sourcesDocsUploadTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-docs-upload",
        {
            description: "Upload documents (1–5; PDF, text, etc.) into an app's RAG sources (legacy user-auth route). Async — content becomes queryable once indexing finishes; files passed as base64, 50MB max each.\nAuth: user-auth mode, active session; the user must own the app. Errors: 401 not logged in; 403 not owner; 413 too large; 422 unsupported document type. Related: app-token/B2B flows use `ethora-sources-docs-upload-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to ingest into. Optional — defaults to the app set via `ethora-app-select`."),
                files: z.array(z.object({
                    name: z.string().min(1).describe("Document file name including extension, e.g. `handbook.pdf`."),
                    mimeType: z.string().min(1).describe("MIME type, e.g. `application/pdf`, `text/plain`, `text/markdown`."),
                    base64: z.string().min(1).describe("Document content, base64-encoded. A `data:...;base64,` prefix is accepted. Max 50MB decoded per file."),
                })).min(1).max(5).describe("1 to 5 documents to ingest in this call."),
            },
        },
        async function ({ appId, files }) {
            try {
                ensureUserAuthForTool()
                const effectiveAppId = appId || requireCurrentAppId()
                const form = new FormData()
                for (const f of files) {
                    const buf = normalizeBase64ToBuffer(f.base64)
                    if (buf.length > 50 * 1024 * 1024) {
                        throw new Error(`File '${f.name}' exceeds 50MB limit`)
                    }
                    const blob = new Blob([buf], { type: f.mimeType })
                    form.append("files", blob, f.name)
                }
                const res = await sourcesDocsUpload(effectiveAppId, form, { "Content-Type": "multipart/form-data" })
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-docs-upload")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-docs-upload")))
            }
        }
    )
}

function sourcesDocsDeleteTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-docs-delete",
        {
            description: "Remove a previously ingested document from an app's RAG sources by `docId` (legacy user-auth route). Deletes the document record and its embeddings; not reversible.\nAuth: user-auth mode, active session; the user must own the app. Errors: 401 not logged in; 403 not owner; 404 unknown `docId`. Related: get `docId` from `ethora-sources-docs-list-v2`; app-token/B2B uses `ethora-sources-docs-delete-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the document belongs to. Optional — defaults to the app set via `ethora-app-select`."),
                docId: z.string().min(1).describe("Id of the ingested document to delete. Get it from `ethora-sources-docs-list-v2`."),
            },
        },
        async function ({ appId, docId }) {
            try {
                ensureUserAuthForTool()
                const effectiveAppId = appId || requireCurrentAppId()
                const res = await sourcesDocsDelete(effectiveAppId, docId)
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-docs-delete")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-docs-delete")))
            }
        }
    )
}

function userLoginWithEmailTool(server: McpServer) {
    server.registerTool(
        'ethora-user-login',
        {
            description: "Authenticate as an existing Ethora user with email + password. Stores the user session token in this MCP session and unlocks user-auth tools (`ethora-app-list`, `ethora-files-*`, `ethora-wallet-*`).\nAuth: user-auth mode (`ethora-auth-use-user` first) and a configured `appJwt`. Errors: 401/403 bad credentials; 404 email not registered; 429 per-IP rate limit — retry with backoff.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                email: z.string().email().describe("User's registered email address (RFC 5322). Must match an account created via `ethora-user-register`."),
                password: z.string().describe("Plain-text password the user set during registration. Sent over TLS to the Ethora API; never echoed back or logged."),
                createApiKey: z.boolean().optional().describe("When true, also mint a long-lived API key for this user and return it once, so headless clients / agents can reconnect with `Authorization: Bearer <key>` instead of logging in again. Default false."),
                apiKeyName: z.string().optional().describe("Label for the API key when `createApiKey` is true (e.g. `claude-code-laptop`)."),
                apiKeyTtlDays: z.number().int().min(1).max(365).optional().describe("Lifetime of the API key in days when `createApiKey` is true. Server default applies when omitted."),
            }
        },
        async function ({ email, password, createApiKey, apiKeyName, apiKeyTtlDays }) {
            try {
                let result = await userLogin(email, password)
                const data: any = { ...(result.data || {}) }
                if (createApiKey) {
                    try {
                        data.apiKey = await issueApiKey(apiKeyName, apiKeyTtlDays)
                        data.apiKeyUsage = API_KEY_USAGE_HINT
                        withConnectorUrl(data, data.apiKey?.token)
                    } catch (e) {
                        data.apiKeyError = errorToText(e)
                    }
                }
                return asToolResult(ok(data, getDefaultMeta("ethora-user-login")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-user-login")))
            }
        }
    )
}

function userRegisterWithEmailTool(server: McpServer) {
    server.registerTool(
        'ethora-user-register',
        {
            title: 'Ethora registration',
            description: "Create a new Ethora user account by email + first/last name, then log in and bind the session. A password is generated when omitted and returned once. By default also mints a long-lived API key so an agent can reconnect later with `Authorization: Bearer <key>` (no human step needed).\nAuth: user-auth mode and a configured `appJwt` (on a hosted server this is preset). Errors: 401 no `appJwt`; 422 email already registered or password shorter than 6 chars; 429 rate limited. Related: bulk provisioning uses `ethora-users-batch-create-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                email: z.string().email().describe("Email address for the new user. Must be RFC-5322 valid and not already registered within this app. No confirmation click is required to log in; the address is used for password reset."),
                firstName: z.string().describe("First name shown in the user's profile and message attributions across chat rooms and the app UI."),
                lastName: z.string().describe("Last name shown in the user's profile."),
                password: z.string().min(6).optional().describe("Password for the account (min 6 chars). Omit to have a strong random password generated and returned once in the result."),
                createApiKey: z.boolean().optional().describe("Mint a long-lived API key right after signup and return it once. Default true. Set false if you only need this session."),
                apiKeyName: z.string().optional().describe("Label for the API key (default `mcp-signup`)."),
                apiKeyTtlDays: z.number().int().min(1).max(365).optional().describe("API key lifetime in days. Server default applies when omitted."),
            }
        },
        async function ({ email, firstName, lastName, password, createApiKey, apiKeyName, apiKeyTtlDays }) {
            const meta = getDefaultMeta("ethora-user-register")
            const generated = !password
            const effectivePassword = password || generatePassword()
            try {
                await userRegistration(email, firstName, lastName, effectivePassword)
            } catch (error) {
                if (error && typeof error === 'object' && 'response' in error) {
                    const axiosError = error as any;
                    if (axiosError.response?.status === 422) {
                        const errorData = axiosError.response.data || {}
                        return asToolResult(fail(new Error(String(errorData.error || "VALIDATION_ERROR")), meta))
                    }
                }
                return asToolResult(fail(error, meta))
            }

            const data: any = {
                email,
                registered: true,
                ...(generated ? { password: effectivePassword, passwordNote: "Generated password; shown once. Store it if you need to log in again without an API key." } : {}),
            }

            try {
                const login = await userLogin(email, effectivePassword)
                const u = login.data?.user || {}
                data.loggedIn = true
                data.userId = u._id || u.id
                data.appId = u.appId
            } catch (e) {
                data.loggedIn = false
                data.loginError = errorToText(e)
                data.next = "Account created but automatic login failed. Call `ethora-user-login` with the email and password."
                return asToolResult(ok(data, meta))
            }

            if (createApiKey !== false) {
                try {
                    data.apiKey = await issueApiKey(apiKeyName || "mcp-signup", apiKeyTtlDays)
                    data.apiKeyUsage = API_KEY_USAGE_HINT
                    withConnectorUrl(data, data.apiKey?.token)
                } catch (e) {
                    data.apiKeyError = errorToText(e)
                }
            }
            data.next = "You are logged in for this MCP session. Next: `ethora-app-create` to create an app, then `ethora-app-select`."
            return asToolResult(ok(data, meta))
        }
    )
}

function apiKeyTools(server: McpServer) {
    server.registerTool(
        "ethora-api-key-create",
        {
            description: "Mint a long-lived, revocable API key for the currently logged-in user. The key is a user token: send it as `Authorization: Bearer <key>` to the hosted MCP endpoint (or set it in the stdio client) to skip `ethora-user-login`. Shown once.\nAuth: user auth (logged in). Errors: 401 not logged in; 404 on backends without API key support.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                name: z.string().optional().describe("Label to recognise the key later (e.g. `ci-runner`, `claude-desktop`)."),
                ttlDays: z.number().int().min(1).max(365).optional().describe("Lifetime in days. Server default applies when omitted."),
            },
        },
        async function ({ name, ttlDays }) {
            const meta = getDefaultMeta("ethora-api-key-create")
            try {
                const key = await issueApiKey(name, ttlDays)
                return asToolResult(ok(withConnectorUrl({ apiKey: key, usage: API_KEY_USAGE_HINT }, key.token), meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )

    server.registerTool(
        "ethora-api-key-list",
        {
            description: "List the current user's API keys (id, name, createdAt, expiresAt). Token values are never returned.\nAuth: user auth.",
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async function () {
            const meta = getDefaultMeta("ethora-api-key-list")
            try {
                const resp = await apiKeyList()
                const d = unwrapData(resp)
                const items = Array.isArray(d) ? d : (d?.items || d?.keys || [])
                return asToolResult(ok({ items }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )

    server.registerTool(
        "ethora-api-key-revoke",
        {
            description: "Revoke one of the current user's API keys by id. Clients using that key stop working immediately.\nAuth: user auth. Errors: 404 unknown id.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                id: z.string().describe("API key id as returned by `ethora-api-key-create` / `ethora-api-key-list`."),
            },
        },
        async function ({ id }) {
            const meta = getDefaultMeta("ethora-api-key-revoke")
            try {
                const resp = await apiKeyRevoke(id)
                return asToolResult(ok(unwrapData(resp) ?? { ok: true }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function appListTool(server: McpServer) {
    server.registerTool(
        'ethora-app-list',
        {
            description: "List all Ethora apps (tenants) owned by the currently logged-in user. Returns an array with `appId` (24-char hex), `displayName`, `domainName`, ownership and bot-status metadata.\nAuth: user-auth mode, active session (`ethora-user-login` first). Errors: 401 not logged in; empty list if the user owns no apps. Related: feed `appId` into `ethora-app-update` / `ethora-app-select`.",
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async function () {
            try {
                let result = await appList()
                return asToolResult(ok(result.data, getDefaultMeta("ethora-app-list")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-app-list")))
            }
        }
    )
}

function appCreateTool(server: McpServer) {
    server.registerTool(
        'ethora-app-create',
        {
            description: "Create a new Ethora app (tenant) owned by the currently logged-in user. Allocates a fresh 24-char hex `appId` and sets the caller as owner; counts against the owner's plan limit. Returns the new app object including `appId`.\nAuth: user-auth mode, active session (`ethora-user-login` first). Errors: 401 not logged in; 402/403 plan limit reached; 422 invalid `displayName`. Related: server-side provisioning uses `ethora-b2b-app-create`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                displayName: z.string().describe("Human-readable app name shown to users in the app picker and on the public landing page. Not required to be unique across accounts.")
            }
        },
        async function ({ displayName }) {
            try {
                let result = await appCreateV2(displayName)
                // Keep the new app's appToken for app-token-only routes (widget
                // activation) so a user session never has to switch auth mode.
                const created: any = result.data || {}
                const createdApp = created.app || created.result || created
                const createdId = createdApp?._id || createdApp?.appId || created.appId
                const createdToken = created.appToken || createdApp?.appToken
                if (createdId && createdToken) rememberAppToken(String(createdId), String(createdToken))
                return asToolResult(ok(result.data, getDefaultMeta("ethora-app-create")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-app-create")))
            }
        }
    )
}

function appDeleteTool(server: McpServer) {
    server.registerTool(
        'ethora-app-delete',
        {
            description: "Permanently delete an Ethora app the caller owns — removes its chat rooms, files, indexed RAG sources, and bot config; end users are immediately signed out. Irreversible; gated behind ETHORA_MCP_ENABLE_DANGEROUS_TOOLS=true.\nAuth: user-auth mode, active session; the caller must own the app. Errors: 401 not logged in; 403 not owner; 404 unknown `appId`. Related: to just deactivate the bot use `ethora-app-update` with `botStatus: \"off\"`.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().describe("24-char hex MongoDB ObjectId of the app to delete. Obtain from `ethora-app-list` or the response of `ethora-app-create`.")
            }
        },
        async function ({ appId }) {
            try {
                let result = await appDelete(appId)
                return asToolResult(ok(result.data, getDefaultMeta("ethora-app-delete")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-app-delete")))
            }
        }
    )
}

function appUpdateTool(server: McpServer) {
    server.registerTool(
        'ethora-app-update',
        {
            description: "Update mutable fields on an app the caller owns (displayName, domainName, appDescription, primaryColor, botStatus). Partial update — omitted fields are left unchanged.\nAuth: user-auth mode, active session; the caller must own the app. Errors: 401 not logged in; 403 not owner; 404 unknown `appId`; 422 validation (e.g. `domainName` taken, `primaryColor` not `#RRGGBB`).",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex ObjectId of the app to update. Optional — defaults to the app most recently passed to `ethora-app-select`."),
                displayName: z.string().optional().describe("New human-readable app name. Visible in the app picker and on the public landing page."),
                domainName: z.string().optional().describe("Subdomain to host the web app at. Setting `abcd` makes the web app available at `abcd.ethora.com`. Must be unique across all Ethora apps; lower-case alphanumerics and dashes only."),
                appDescription: z.string().optional().describe("Long-form description shown on the public app landing page."),
                primaryColor: z.string().optional().describe("Primary brand color in hex `#RRGGBB` format (e.g. `#F54927`). Used throughout the app UI."),
                botStatus: z.enum(["on", "off"]).optional().describe("`on` enables the AI bot for new conversations (requires a configured prompt — see `ethora-bot-update-v2`); `off` disables it. Does not change the bot's configured prompt or sources.")
            }
        },
        async function ({ appId, displayName, domainName, appDescription, primaryColor, botStatus }) {
            try {
                const state = getClientState() as any
                const effectiveAppId = appId || state.currentAppId
                if (!effectiveAppId) {
                    throw new Error("appId is required (pass appId or call `ethora-app-select` first)")
                }
                let changes: any = {}

                if (displayName) {
                    changes.displayName = displayName
                }
                if (domainName) {
                    changes.domainName = domainName
                }
                if (appDescription) {
                    changes.appDescription = appDescription
                }
                if (primaryColor) {
                    changes.primaryColor = primaryColor
                }
                if (botStatus) {
                    changes.botStatus = botStatus
                }
                let result = await appUpdate(effectiveAppId, changes)
                return asToolResult(ok(result.data, getDefaultMeta("ethora-app-update")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-app-update")))
            }
        }
    )
}

function appGetDefaultRoomsTool(server: McpServer) {
    server.registerTool(
        'ethora-app-get-default-rooms',
        {
            description: "List the default chat rooms (MUC rooms) of the currently selected Ethora app — every new user auto-joins these. Returns rooms with their JIDs and titles.\nAuth: user-auth mode, active session; operates against the app set via `ethora-app-select`. Errors: 400 no app currently selected; 401 not logged in. Related: `ethora-app-get-default-rooms-with-app-id` to pass `appId` explicitly.",
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async function () {
            try {
                let result = await appGetDefaultRooms()
                return asToolResult(ok(result.data, getDefaultMeta("ethora-app-get-default-rooms")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-app-get-default-rooms")))
            }
        }
    )
}

function getDefaultRoomsWithAppIdTool(server: McpServer) {
    server.registerTool(
        'ethora-app-get-default-rooms-with-app-id',
        {
            description: "List the default chat rooms of a specific Ethora app, passed via `appId` (or the currently selected app). Returns rooms with their JIDs and titles.\nAuth: user-auth mode, active session; the caller needs read access (ownership or room membership). Errors: 400 no `appId` and none selected; 401 not logged in; 403 no read access; 404 unknown `appId`.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex ObjectId of the app whose default rooms you want to read. Optional — defaults to the app most recently passed to `ethora-app-select`."),
            }
        },
        async function ({ appId }) {
            try {
                const state = getClientState() as any
                const effectiveAppId = appId || state.currentAppId
                if (!effectiveAppId) {
                    throw new Error("appId is required (pass appId or call `ethora-app-select` first)")
                }
                let result = await appGetDefaultRoomsWithAppId(effectiveAppId)
                return asToolResult(ok(result.data, getDefaultMeta("ethora-app-get-default-rooms-with-app-id")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-app-get-default-rooms-with-app-id")))
            }
        }
    )
}

function craeteAppChatTool(server: McpServer) {
    server.registerTool(
        'ethora-app-create-chat',
        {
            description: "Create a new chat room (MUC room) inside an app the caller owns. Every room created this way is listed in the app's rooms (`defaultRooms`); `pinned: true` additionally makes new users auto-join it (existing users are not added), `pinned: false` (default) keeps it opt-in. Returns the new room object including its JID.\nAuth: user-auth mode, active session; the caller must own the app. Errors: 401 not logged in; 403 not owner; 404 unknown `appId`; 422 invalid `title`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex ObjectId of the app to create the chat room in. Optional — defaults to the app most recently passed to `ethora-app-select`."),
                title: z.string().describe("Display name for the new chat room. Visible to all members; not required to be unique within the app."),
                pinned: z.boolean().optional().default(false).describe("If `true`, the room is added to the app's default rooms list — every new user of the app auto-joins it. If `false`, the room exists but users must be added explicitly."),
            }
        },
        async function ({ appId, title, pinned }) {
            try {
                const state = getClientState() as any
                const effectiveAppId = appId || state.currentAppId
                if (!effectiveAppId) {
                    throw new Error("appId is required (pass appId or call `ethora-app-select` first)")
                }
                let result = await appCreateChat(effectiveAppId, title, pinned)
                return asToolResult(ok(result.data, getDefaultMeta("ethora-app-create-chat")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-app-create-chat")))
            }
        }
    )
}

function appDeleteChatTool(server: McpServer) {
    server.registerTool(
        'ethora-app-delete-chat',
        {
            description: "Permanently delete a chat room from an app the caller owns — removes the MUC room, its message archive, and all member affiliations. Irreversible; gated behind ETHORA_MCP_ENABLE_DANGEROUS_TOOLS=true.\nAuth: user-auth mode, active session; the caller must own the app. Errors: 401 not logged in; 403 not owner; 404 `chatJid` not a room in the app.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex ObjectId of the app the chat room belongs to. Optional — defaults to the app most recently passed to `ethora-app-select`."),
                chatJid: z.string().describe("Room JID (XMPP address) of the chat to delete, e.g. `<roomId>@conference.<host>`. Obtain from `ethora-app-get-default-rooms` or the response of `ethora-app-create-chat`."),
            }
        },
        async function ({ appId, chatJid }) {
            try {
                const state = getClientState() as any
                const effectiveAppId = appId || state.currentAppId
                if (!effectiveAppId) {
                    throw new Error("appId is required (pass appId or call `ethora-app-select` first)")
                }
                let result = await appDeleteChat(effectiveAppId, chatJid)
                return asToolResult(ok(result.data, getDefaultMeta("ethora-app-delete-chat")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-app-delete-chat")))
            }
        }
    )
}

function walletGetBalanceTool(server: McpServer) {  
    server.registerTool(
        'ethora-wallet-get-balance',
        {
            description: "Read the authenticated user's on-chain ERC-20 wallet balance(s). Auth: user-auth (log in first). Errors: 401 not logged in; 503 wallet RPC unreachable — retry with backoff.",
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async function () {
            try {
                let result = await walletGetBalance()
                return asToolResult(ok(result.data, getDefaultMeta("ethora-wallet-get-balance")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-wallet-get-balance")))
            }
        }
    )
}

function walletERC20TransferTool(server: McpServer) {
    server.registerTool(
        'ethora-wallet-erc20-transfer',
        {
            description: "STDIO ONLY: not available on the hosted server (directory rules forbid connectors that move money or crypto). Send ERC-20 tokens from the authenticated user's wallet to another address — submits a signed on-chain transaction; consumes gas and reduces the sender's balance. Irreversible and NOT idempotent (calling twice sends twice — do not auto-retry blindly). Gated behind ETHORA_MCP_ENABLE_DANGEROUS_TOOLS=true.\nAuth: user-auth mode, active session. Errors: 400 invalid `toWallet` format; 401 not logged in; 402 insufficient balance or gas; 5xx RPC failure.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                toWallet: z.string().describe("Recipient wallet address. Must be a valid 0x-prefixed 40-character hex string. Double-check before calling — transfers cannot be reversed."),
                amount: z.number().describe("Amount to transfer, in the same units returned by `ethora-wallet-get-balance` (typically whole-token integers — confirm with your deployment)."),
            }
        },
        async function ({ toWallet, amount }) {
            try {
                let result = await walletERC20Transfer(toWallet, amount)
                return asToolResult(ok(result.data, getDefaultMeta("ethora-wallet-erc20-transfer")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-wallet-erc20-transfer")))
            }
        }
    )
}

function b2bAppCreateTool(server: McpServer) {
    server.registerTool(
        "ethora-b2b-app-create",
        {
            description: "Create a new Ethora app (tenant) server-side using B2B auth — the partner/integrator equivalent of `ethora-app-create`. Allocates a fresh 24-char hex `appId`; does not create tokens, rooms, or a bot. Returns the new app object including `appId`.\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`). Errors: 401/403 not in B2B mode or invalid `b2bToken`; 422 invalid `displayName`. Related: all-in-one path is `ethora-b2b-app-bootstrap-ai` / `ethora-b2b-app-provision`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                displayName: z.string().min(1).describe("Human-readable app name shown to users in the app picker and on the public landing page."),
            },
        },
        async function ({ displayName }) {
            try {
                ensureB2BAuthForTool()
                const res = await appCreateV2(displayName)
                return asToolResult(ok(res.data, getDefaultMeta("ethora-b2b-app-create")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-b2b-app-create")))
            }
        }
    )
}

function b2bBotEnableTool(server: McpServer) {
    server.registerTool(
        "ethora-b2b-bot-enable",
        {
            description: "Enable the LEGACY per-app aiBot (B2B auth). NOTE: apps created via the API/B2B no longer auto-provision a legacy aiBot, so this returns 422 BOT_NOT_INITIALIZED on a clean app. The forward path for B2B AI is the Agents API — use `ethora-b2b-app-bootstrap-ai` or `ethora-agents-create-v2` + `ethora-agent-invite-to-chat`. This tool remains valid for apps that already have a legacy aiBot (e.g. admin-panel apps created with a default chat).",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId whose bot to enable. Optional — defaults to the app set via `ethora-app-select`."),
                botTrigger: z.string().optional().describe("When the bot responds: `/bot` (only messages starting with /bot) or `any_message` (every message). Omit to leave the existing trigger unchanged."),
            },
        },
        async function ({ appId, botTrigger }) {
            try {
                ensureB2BAuthForTool()
                const state = getClientState() as any
                const effectiveAppId = appId || state.currentAppId
                if (!effectiveAppId) {
                    throw new Error("appId is required (pass appId or call `ethora-app-select` first)")
                }
                const changes: any = { botStatus: "on" }
                if (botTrigger) changes.botTrigger = botTrigger
                const res = await appUpdate(effectiveAppId, changes)
                return asToolResult(ok(res.data, getDefaultMeta("ethora-b2b-bot-enable")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-b2b-bot-enable")))
            }
        }
    )
}

function botGetV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-bot-get-v2",
        {
            description: "Read the current AI bot configuration for an app: status, trigger, prompt, greeting, LLM provider/model, RAG settings, widget config.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 unknown `appId`. Related: change config with `ethora-bot-update-v2`.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode (the token determines the app)."),
            },
        },
        async function ({ appId }) {
            const meta = getDefaultMeta("ethora-bot-get-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await botGetForAppV2(ctx.appId!)
                    : await botGetV2()
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function botUpdateV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-bot-update-v2",
        {
            description: "Configure the AI bot for an app — prompt, LLM, trigger, greeting, RAG behavior, identity, and public widget settings. Partial update — omitted fields are left unchanged. `status: \"on\"` activates the bot (best-effort; needs a prompt + LLM and a backend AI service).\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 unknown `appId`; 422 validation (e.g. an `llmProvider`/`llmModel` not enabled). Related: `ethora-bot-get-v2`, `ethora-agents-activate-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                status: z.enum(["on", "off"]).optional().describe("`on` activates the bot, `off` deactivates it. Omit to leave the current status unchanged."),
                savedAgentId: z.string().optional().describe("Id of a saved agent whose config should back this bot. Alternative to setting prompt/LLM/RAG fields individually."),
                trigger: z.enum(["any_message", "/bot"]).optional().describe("When the bot responds: `any_message` (replies to every message) or `/bot` (only messages starting with /bot)."),
                prompt: z.string().optional().describe("System prompt that defines the bot's persona and behavior."),
                greetingMessage: z.string().optional().describe("Message the bot posts when a conversation starts."),
                chatId: z.string().optional().describe("Restrict the bot to a single chat by id. Omit to apply app-wide."),
                isRAG: z.boolean().optional().describe("If true, the bot retrieves from the app's indexed RAG sources (see the `ethora-sources-*` tools) when answering."),
                botFirstName: z.string().optional().describe("Bot's first name in its user profile."),
                botLastName: z.string().optional().describe("Bot's last name in its user profile."),
                botDisplayName: z.string().optional().describe("Bot's display name shown in chat."),
                botAvatarUrl: z.string().optional().describe("Public URL of the bot's avatar image."),
                ragTags: z.array(z.string().min(1)).optional().describe("Restrict RAG retrieval to sources tagged with these tags (see `ethora-sources-site-tags-update-v2` / `ethora-sources-docs-tags-update-v2`)."),
                llmProvider: z.string().optional().describe("LLM provider, e.g. `openai` or `openai-compatible`. Must be enabled in your Ethora backend's AI service config."),
                llmModel: z.string().optional().describe("LLM model id, e.g. `gpt-4o-mini`. Must be available for the chosen `llmProvider`."),
                widgetPublicEnabled: z.boolean().optional().describe("If true, expose the bot through a public embeddable chat widget."),
                widgetPublicUrl: z.string().optional().describe("Public URL for the embeddable widget. Usually read via `ethora-bot-widget-v2` rather than set here."),
            },
        },
        async function ({ appId, ...payload }) {
            const meta = getDefaultMeta("ethora-bot-update-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await botUpdateForAppV2(ctx.appId!, payload as any)
                    : await botUpdateV2(payload as any)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentsListV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-agents-list-v2",
        {
            description: "List the reusable saved agents of an app (`GET /v2/apps/:appId/agents`, or `GET /v2/agents` for the token's own app) — a saved agent is a reusable bot definition. Returns an array of agents with ids, names, and config.\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`). Errors: 401/403 not in app-token mode or invalid appToken; empty list if the app has no saved agents.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId whose agents to list (`GET /v2/apps/:appId/agents`). Defaults to the app selected with `ethora-app-select`; without either, lists the agents of the token's own app."),
            },
        },
        async function ({ appId }) {
            const meta = getDefaultMeta("ethora-agents-list-v2")
            try {
                ensureTenantActorAuth()
                const ctx = resolveAppScopedV2Context(appId)
                const res = await agentsListV2(ctx.appId)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentsGetV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-agents-get-v2",
        {
            description: "Fetch one reusable saved agent's full config by id (`GET /v2/agents/:agentId`) — prompt, LLM, RAG settings, visibility. Also sets this agent as the session's current agent context (no server-side change).\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`). Errors: 401/403 wrong auth; 404 `agentId` not an agent of the current app. Related: get ids from `ethora-agents-list-v2`.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                agentId: z.string().min(1).describe("Id of the saved agent to fetch. Get it from `ethora-agents-list-v2`."),
            },
        },
        async function ({ agentId }) {
            const meta = getDefaultMeta("ethora-agents-get-v2")
            try {
                ensureUserAuthForTool()
                const res = await agentsGetV2(agentId)
                selectAgent({ agentId })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentsCreateV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-agents-create-v2",
        {
            description: "Create a reusable AI agent (POST /v2/apps/:appId/agents). Works in user auth mode (the normal hosted mode) or B2B mode; app-token mode is not accepted by the backend. Each agent is a persona — name, avatar, system prompt, LLM config, plus response-gate settings (responseMode, cooldownSec) that control when it speaks in a room. For multi-agent scenarios (two or more personas conversing in one chat) create each one separately, then `ethora-agent-invite-to-chat` them into the same room. See the `ethora-agents-quickstart` prompt for the end-to-end recipe.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the agent belongs to (`POST /v2/apps/:appId/agents`). Defaults to the app selected with `ethora-app-select`. Pass it when you just created an app so the agent lands there rather than in the token's own app."),
                name: z.string().optional().describe("Short display name. For multi-agent scenarios, prefer single-word names (e.g. 'Hannibal', 'Varro') — the @-mention matcher uses the exact display name with word-boundary matching."),
                slug: z.string().optional().describe("URL-safe slug (auto-generated from name if omitted)."),
                summary: z.string().optional().describe("Short bio shown in agent lists."),
                prompt: z.string().optional().describe("System prompt — the agent's persona, role, style of speech, and behaviour rules. For multi-agent scenarios, instruct the agent to end every message with an @-mention of who speaks next; that's how turn-handoff works through the response gate."),
                greetingMessage: z.string().optional().describe("Optional message the agent posts when it first joins a room."),
                trigger: z.enum(["any_message", "/bot"]).optional().describe("Legacy trigger field. Prefer the newer `responseMode` for new agents."),
                responseMode: z.enum(["always", "mentioned", "smart", "probability"]).optional().describe("When the agent decides to reply. 'always' = every room message; 'mentioned' = only when @-mentioned by display name or via /bot (recommended for multi-agent turn-taking); 'smart' = a mini LLM gate decides per-message; 'probability' = coin-flip per message using `responseProbability`."),
                responseProbability: z.number().min(0).max(1).optional().describe("If responseMode='probability', odds (0-1) of replying to each message. Damped 0.6x for bot-to-bot messages."),
                cooldownSec: z.number().int().min(0).optional().describe("Minimum seconds between this agent's replies in a given room. Damped 2x for bot-to-bot. Set 0 for quick turn-taking in multi-agent scenarios."),
                botDisplayName: z.string().optional().describe("Display name used inside the chat UI. Defaults to `name`."),
                botAvatarUrl: z.string().optional().describe("URL of the avatar image shown next to bot messages."),
                isRAG: z.boolean().optional().describe("Enable retrieval-augmented generation from indexed sources."),
                ragTags: z.array(z.string().min(1)).optional().describe("Optional RAG tag filter — restrict retrieval to sources matching these tags."),
                llmProvider: z.string().optional().describe("LLM provider override (e.g. 'openai'). Defaults to the app's configured provider."),
                llmModel: z.string().optional().describe("LLM model override (e.g. 'gpt-4o-mini')."),
                visibility: z.enum(["private", "public"]).optional().describe("'private' (only invitable inside the owning app) or 'public' (cross-app invitable)."),
                isPublished: z.boolean().optional().describe("Convenience alias for setting visibility='public'."),
                categories: z.array(z.string().min(1)).optional().describe("Free-form category tags for agent directory listings."),
                flowsYaml: z.string().optional().describe('Deterministic scripted conversation for this agent, as YAML. Drives the agent through a fixed sequence (opening menu, appointment request, intake questionnaire, survey) instead of leaving every turn to the model. Compiled and validated server-side on save: an invalid script is rejected with code `FLOWS_INVALID` and per-line details, and nothing is stored. A flow named `start` is reserved and fires when a conversation opens. Buttons are authored here (`buttons:` on a `say` step, or `options:` on an `ask` step). Call `fetch` with id `doc:agent-flows` for the full authoring format before writing one. Pass an empty string to clear the script.'),
            },
        },
        async function (payload) {
            const meta = getDefaultMeta("ethora-agents-create-v2")
            try {
                ensureTenantActorAuth()
                const { appId, ...rest } = payload as any
                const ctx = resolveAppScopedV2Context(appId)
                const res = await agentsCreateV2(rest as any, ctx.appId)
                const createdId = String(res?.data?.agent?.id || res?.data?.agent?._id || "")
                if (createdId) selectAgent({ agentId: createdId })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentsUpdateV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-agents-update-v2",
        {
            description: "Update a saved AI agent (PUT /v2/agents/:agentId). All fields are optional — only what you pass is updated. Common uses: tune the system `prompt` after a test run, switch `responseMode` to control turn-taking in multi-agent rooms, or adjust `cooldownSec`. See `ethora-agents-quickstart` prompt for the end-to-end recipe.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                agentId: z.string().min(1).describe("Mongo _id (24 hex chars) of the agent to update."),
                name: z.string().optional().describe("New display name. For multi-agent scenarios prefer single-word names — the @-mention matcher uses exact display-name match with word-boundary."),
                slug: z.string().optional().describe("URL-safe slug."),
                summary: z.string().optional().describe("Short bio."),
                prompt: z.string().optional().describe("Updated system prompt (persona + behaviour). For multi-agent rooms instruct the agent to end every message with an @-mention of the next speaker — that's how turn-handoff works through the response gate."),
                greetingMessage: z.string().optional().describe("Message the agent posts when it first joins a new room."),
                trigger: z.enum(["any_message", "/bot"]).optional().describe("Legacy trigger field. Prefer `responseMode`."),
                responseMode: z.enum(["always", "mentioned", "smart", "probability"]).optional().describe("When the agent replies. 'always' = every message; 'mentioned' = only @-mention or /bot (best for multi-agent turn-taking); 'smart' = mini-LLM decides; 'probability' = coin-flip using `responseProbability`."),
                responseProbability: z.number().min(0).max(1).optional().describe("If responseMode='probability', odds (0-1) of replying. Damped 0.6x for bot-to-bot."),
                cooldownSec: z.number().int().min(0).optional().describe("Minimum seconds between this agent's replies in a given room. Damped 2x for bot-to-bot. Set 0 for quick turn-taking."),
                botDisplayName: z.string().optional().describe("Display name in chat UI."),
                botAvatarUrl: z.string().optional().describe("Avatar image URL."),
                isRAG: z.boolean().optional().describe("Enable RAG retrieval."),
                ragTags: z.array(z.string().min(1)).optional().describe("RAG tag filter."),
                llmProvider: z.string().optional().describe("LLM provider override."),
                llmModel: z.string().optional().describe("LLM model override."),
                visibility: z.enum(["private", "public"]).optional().describe("'private' or 'public' (cross-app invitable)."),
                isPublished: z.boolean().optional().describe("Convenience alias for visibility='public'."),
                categories: z.array(z.string().min(1)).optional().describe("Category tags for directory listings."),
                flowsYaml: z.string().optional().describe('Deterministic scripted conversation for this agent, as YAML. Drives the agent through a fixed sequence (opening menu, appointment request, intake questionnaire, survey) instead of leaving every turn to the model. Compiled and validated server-side on save: an invalid script is rejected with code `FLOWS_INVALID` and per-line details, and nothing is stored. A flow named `start` is reserved and fires when a conversation opens. Buttons are authored here (`buttons:` on a `say` step, or `options:` on an `ask` step). Call `fetch` with id `doc:agent-flows` for the full authoring format before writing one. Pass an empty string to clear the script.'),
            },
        },
        async function ({ agentId, ...payload }) {
            const meta = getDefaultMeta("ethora-agents-update-v2")
            try {
                ensureUserAuthForTool()
                const res = await agentsUpdateV2(agentId, payload as any)
                selectAgent({ agentId })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentsCloneV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-agents-clone-v2",
        {
            description: "Duplicate an existing saved agent into a new agent, optionally overriding its name/slug/summary (`POST /v2/agents/:agentId/clone`). The source agent is unchanged; the new clone becomes the session's current agent context.\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`). Errors: 401/403 wrong auth; 404 source `agentId` not found; 422 overridden `slug` collides.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                agentId: z.string().min(1).describe("Id of the source agent to clone. Get it from `ethora-agents-list-v2`."),
                name: z.string().optional().describe("Name for the clone. Omit to inherit the source agent's name."),
                slug: z.string().optional().describe("URL-safe unique slug for the clone. Omit to let the server derive one; must not collide with an existing agent."),
                summary: z.string().optional().describe("Summary for the clone. Omit to inherit the source agent's summary."),
            },
        },
        async function ({ agentId, ...payload }) {
            const meta = getDefaultMeta("ethora-agents-clone-v2")
            try {
                ensureUserAuthForTool()
                const res = await agentsCloneV2(agentId, payload as any)
                const createdId = String(res?.data?.agent?.id || res?.data?.agent?._id || "")
                if (createdId) selectAgent({ agentId: createdId })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentsActivateV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-agents-activate-v2",
        {
            description: "Make an agent the app's ACTIVE widget bot: sets `App.defaultBotInstanceId` (and `botStatus: on`), which is what `POST /v2/widget/sessions` uses to decide who answers website visitors. Required before an embedded widget can answer on an API-created app. Preconditions: the agent was invited into a room of this app with `ethora-agent-invite-to-chat` (that creates its bot instance). Works in user auth (app update route); falls back to the app-token `/v2/agents/:id/activate` route when an appToken is stored.\nAuth: user session (owner of the app). Errors: 404 no bot instance for this agent in the app (invite first); 403 not the app owner. Related: `ethora-widget-embed-snippet` next, `ethora-bot-instances-list` to inspect.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                agentId: z.string().min(1).describe("Id (or address) of the agent to activate. Get it from `ethora-agents-list-v2` / `ethora-agents-create-v2`."),
                chatJid: z.string().optional().describe("Room JID `${appId}_${chatId}` (with or without `@conference...`) that becomes the widget chat. Required for API-created apps; omit only for dashboard-created apps that already have an AI Widget chat bound."),
                appId: z.string().optional().describe("App to activate the agent for. Defaults to the app from `ethora-app-select`."),
            },
        },
        async function ({ agentId, chatJid, appId }) {
            const meta = getDefaultMeta("ethora-agents-activate-v2")
            try {
                const result = await activateAgentForApp(agentId, chatJid, appId)
                return asToolResult(ok({ ...result, next: "The agent now answers the app's widget. Call `ethora-widget-embed-snippet` for the <script> tag to paste into a website." }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

// ----------------------------------------------------------------------------
// Phase 1 (Agents) — additional tools.
// ----------------------------------------------------------------------------

function agentSetVisibilityTool(server: McpServer) {
    server.registerTool(
        "ethora-agent-set-visibility",
        {
            description: "Set an Agent's visibility (private | unlisted | public). Public agents can be invited cross-app by anyone who knows the address.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                agentIdOrAddress: z.string().min(1),
                visibility: z.enum(["private", "unlisted", "public"]),
            },
        },
        async function ({ agentIdOrAddress, visibility }) {
            const meta = getDefaultMeta("ethora-agent-set-visibility")
            try {
                ensureUserAuthForTool()
                const res = await agentsSetVisibilityV2(agentIdOrAddress, visibility)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentInviteToChatTool(server: McpServer) {
    server.registerTool(
        "ethora-agent-invite-to-chat",
        {
            description: "Invite an Agent into a chat room. Multiple agents can coexist in the same room — call this tool once per agent and they will all appear as members able to converse. Lazily creates a per-App BotInstance (an Ethora user with isBot:true) if one does not already exist for (agent, app). Spawns the XMPP client live; no ai-service restart required. For the full multi-agent recipe see the `ethora-agents-quickstart` prompt.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                agentIdOrAddress: z.string().min(1).describe("Either Mongo _id (24 hex chars) or EOA-style address."),
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                chatId: z.string().optional().describe("Mongo Chat _id (preferred when invoking from admin)."),
                chatJid: z.string().optional().describe("Room JID `${appId}_${chatId}` (optionally with `@conference.<host>`), exactly the `jid` returned by `ethora-app-create-chat`. Preferred over `chatId`."),
            },
        },
        async function ({ agentIdOrAddress, appId, chatId, chatJid }) {
            const meta = getDefaultMeta("ethora-agent-invite-to-chat")
            try {
                ensureTenantActorAuth()
                const ctx = resolveAppScopedV2Context(appId)
                const payload: any = { chatId, chatJid }
                if (ctx.mode !== "app" && ctx.appId) payload.appId = ctx.appId
                const res = await agentsInviteToChatV2(agentIdOrAddress, payload)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentSoulAppendTool(server: McpServer) {
    server.registerTool(
        "ethora-agent-soul-append",
        {
            description: "Append a fragment to an Agent's SOUL.MD (its evolving identity / private notes). Operator-driven; the Agent itself can also self-edit via the same endpoint when called by ai-service.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                agentIdOrAddress: z.string().min(1),
                append: z.string().min(1),
            },
        },
        async function ({ agentIdOrAddress, append }) {
            const meta = getDefaultMeta("ethora-agent-soul-append")
            try {
                ensureUserAuthForTool()
                const res = await agentsSoulV2(agentIdOrAddress, { append })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentSoulSetTool(server: McpServer) {
    server.registerTool(
        "ethora-agent-soul-set",
        {
            description: "Replace an Agent's SOUL.MD with the provided markdown. Operator-driven; alternative to -append.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                agentIdOrAddress: z.string().min(1),
                soulMd: z.string().min(0).describe("Replace SOUL.MD contents. Pass empty string to clear."),
            },
        },
        async function ({ agentIdOrAddress, soulMd }) {
            const meta = getDefaultMeta("ethora-agent-soul-set")
            try {
                ensureUserAuthForTool()
                const res = await agentsSoulV2(agentIdOrAddress, { soulMd })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function botInstancesListTool(server: McpServer) {
    server.registerTool(
        "ethora-bot-instances-list",
        {
            description: "List BotInstances. Filter by appId (caller's App by default) and/or agentId.",
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional(),
                agentId: z.string().optional(),
            },
        },
        async function ({ appId, agentId }) {
            const meta = getDefaultMeta("ethora-bot-instances-list")
            try {
                ensureUserAuthForTool()
                const res = await botInstancesListV2({ appId, agentId })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function botInstanceStatusTool(server: McpServer) {
    server.registerTool(
        "ethora-bot-instance-status",
        {
            description: "Turn a specific BotInstance on or off. Off detaches it from XMPP; on re-spawns the XMPP client live.",
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                botInstanceId: z.string().min(1),
                status: z.enum(["on", "off"]),
            },
        },
        async function ({ botInstanceId, status }) {
            const meta = getDefaultMeta("ethora-bot-instance-status")
            try {
                ensureUserAuthForTool()
                const res = await botInstanceStatusV2(botInstanceId, status)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

// ----------------------------------------------------------------------------
// 2607 API parity — Agents full lifecycle + app-scoped chat reads + bundles.
// ----------------------------------------------------------------------------

function agentsDeleteV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-agents-delete-v2",
        {
            description: "Delete an Agent (DELETE /v2/agents/:idOrAddress). Destructive — removes the saved Agent and its BotInstances. Gated behind ETHORA_MCP_ENABLE_DANGEROUS_TOOLS.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                agentIdOrAddress: z.string().min(1).describe("Mongo _id (24 hex chars) or EOA-style address."),
            },
        },
        async function ({ agentIdOrAddress }) {
            const meta = getDefaultMeta("ethora-agents-delete-v2")
            try {
                ensureUserAuthForTool()
                const res = await agentsDeleteV2(agentIdOrAddress)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentsExportV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-agents-export-v2",
        {
            description: "Export an Agent as a portable bundle (GET /v2/agents/:idOrAddress/export). format=json returns the bundle object directly; feed it back to `ethora-agents-import-v2` to recreate the Agent in another App/tenant.",
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                agentIdOrAddress: z.string().min(1),
                format: z.enum(["json", "zip"]).optional().describe("Defaults to json. Prefer json for MCP round-trips."),
            },
        },
        async function ({ agentIdOrAddress, format }) {
            const meta = getDefaultMeta("ethora-agents-export-v2")
            try {
                ensureUserAuthForTool()
                const res = await agentsExportV2(agentIdOrAddress, format || "json")
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentsImportV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-agents-import-v2",
        {
            description: "Import an Agent from a bundle produced by `ethora-agents-export-v2` (POST /v2/agents/import, application/json body IS the bundle). Optionally scope the new Agent to an owning App via ownerAppId.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                // Typed rather than z.any(). z.any() is optional in Zod, so the tool
                // advertised no required arguments, an agent could call it empty, and
                // the API answered with an opaque schemaVersion error. The shape below
                // matches a real `ethora-agents-export-v2` bundle; passthrough keeps it
                // forward compatible with fields added to the bundle later.
                bundle: z
                    .object({
                        schemaVersion: z.string().min(1).describe("Bundle schema version, e.g. `ethora.agent.bundle.v1`. Every export carries one."),
                        kind: z.string().optional().describe("Bundle kind: `agent` for agent exports."),
                        agent: z.record(z.any()).describe("The agent definition carried by the bundle: displayName, prompt, llmProvider, llmModel and so on."),
                    })
                    .passthrough()
                    .describe("The bundle object returned by `ethora-agents-export-v2` with format=json. Pass it through unchanged."),
                ownerAppId: z.string().optional().describe("Owning App for the imported Agent (defaults server-side)."),
            },
        },
        async function ({ bundle, ownerAppId }) {
            const meta = getDefaultMeta("ethora-agents-import-v2")
            try {
                ensureUserAuthForTool()
                const res = await agentsImportV2(bundle, ownerAppId)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentBotInstanceDiagTool(server: McpServer) {
    server.registerTool(
        "ethora-bot-instance-diag",
        {
            description: "Diagnose a specific BotInstance for an Agent (GET /v2/agents/:idOrAddress/bot-instances/:botInstanceId/diag). Returns live XMPP/ai-service status and recent activity for troubleshooting.",
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                agentIdOrAddress: z.string().min(1),
                botInstanceId: z.string().min(1),
            },
        },
        async function ({ agentIdOrAddress, botInstanceId }) {
            const meta = getDefaultMeta("ethora-bot-instance-diag")
            try {
                ensureUserAuthForTool()
                const res = await agentBotInstanceDiagV2(agentIdOrAddress, botInstanceId)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentBotInstanceTestMessageTool(server: McpServer) {
    server.registerTool(
        "ethora-bot-instance-test-message",
        {
            description: "Send a test message from a BotInstance (POST /v2/agents/:idOrAddress/bot-instances/:botInstanceId/test-message). Omit roomJid to fan out to every room the BotInstance is in. Requires the ai-service to be running.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                agentIdOrAddress: z.string().min(1),
                botInstanceId: z.string().min(1),
                text: z.string().max(2000).optional().describe("Message body. Optional/empty is allowed."),
                roomJid: z.string().optional().describe("Target a specific room JID; omit to broadcast to all the bot's rooms."),
            },
        },
        async function ({ agentIdOrAddress, botInstanceId, text, roomJid }) {
            const meta = getDefaultMeta("ethora-bot-instance-test-message")
            try {
                ensureUserAuthForTool()
                const res = await agentBotInstanceTestMessageV2(agentIdOrAddress, botInstanceId, { text, roomJid })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function agentBotInstanceLeaveChatTool(server: McpServer) {
    server.registerTool(
        "ethora-bot-instance-leave-chat",
        {
            description: "Remove a BotInstance from a chat room (POST /v2/agents/:idOrAddress/bot-instances/:botInstanceId/leave-chat). The inverse of `ethora-agent-invite-to-chat`.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                agentIdOrAddress: z.string().min(1),
                botInstanceId: z.string().min(1),
                chatJid: z.string().min(1).describe("Fully-qualified room JID to leave."),
            },
        },
        async function ({ agentIdOrAddress, botInstanceId, chatJid }) {
            const meta = getDefaultMeta("ethora-bot-instance-leave-chat")
            try {
                ensureUserAuthForTool()
                const res = await agentBotInstanceLeaveChatV2(agentIdOrAddress, botInstanceId, { chatJid })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function messagesSearchV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-messages-search-v2",
        {
            description: "Search an App's chat messages (GET /v2/apps/:appId/messages/search). B2B / tenant-actor auth. Filter by room (chatId), author (fromUserId), and time window.",
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                q: z.string().min(1).max(500).describe("Search query."),
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                mode: z.enum(["substring", "fulltext"]).optional(),
                chatId: z.string().optional(),
                fromUserId: z.string().optional(),
                since: z.string().optional().describe("ISO date lower bound."),
                until: z.string().optional().describe("ISO date upper bound."),
                sort: z.enum(["relevance", "date"]).optional(),
                limit: z.number().int().min(1).max(100).optional(),
                offset: z.number().int().min(0).optional(),
            },
        },
        async function ({ q, appId, mode, chatId, fromUserId, since, until, sort, limit, offset }) {
            const meta = getDefaultMeta("ethora-messages-search-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                if (!ctx.appId) throw new Error("appId is required (pass appId or call `ethora-app-select` first).")
                const res = await appMessagesSearchV2(ctx.appId, { q, mode, chatId, fromUserId, since, until, sort, limit, offset })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function messagesContextV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-messages-context-v2",
        {
            description: "Fetch the messages surrounding a target message (GET /v2/apps/:appId/chats/:chatId/messages/context). Provide either aroundStanzaId or aroundMessageId; radius controls how many messages before/after.",
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                chatId: z.string().min(1),
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                aroundStanzaId: z.string().optional(),
                aroundMessageId: z.string().optional(),
                radius: z.number().int().min(0).max(50).optional(),
            },
        },
        async function ({ chatId, appId, aroundStanzaId, aroundMessageId, radius }) {
            const meta = getDefaultMeta("ethora-messages-context-v2")
            try {
                if (!aroundStanzaId && !aroundMessageId) {
                    throw new Error("Provide either aroundStanzaId or aroundMessageId.")
                }
                const ctx = resolveAppScopedV2Context(appId)
                if (!ctx.appId) throw new Error("appId is required (pass appId or call `ethora-app-select` first).")
                const res = await appMessagesContextV2(ctx.appId, chatId, { aroundStanzaId, aroundMessageId, radius })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function unreadCountsV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-unread-counts-v2",
        {
            description: "Batch per-room unread message counts for a set of users (POST /v2/apps/:appId/users/unread-counts). mode=count returns numbers (capped); mode=flag returns booleans. Requires Mongo message archiving enabled on the deployment.",
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                userIds: z.array(z.string().min(1)).min(1).max(200).describe("uuid / Mongo _id / xmppUsername, 1..200."),
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                mode: z.enum(["count", "flag"]).optional(),
                cap: z.number().int().min(1).max(1000).optional(),
                concurrency: z.number().int().min(1).max(32).optional(),
            },
        },
        async function ({ userIds, appId, mode, cap, concurrency }) {
            const meta = getDefaultMeta("ethora-unread-counts-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                if (!ctx.appId) throw new Error("appId is required (pass appId or call `ethora-app-select` first).")
                const res = await appUsersUnreadCountsV2(ctx.appId, { userIds, mode, cap, concurrency })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function appExportV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-app-export-v2",
        {
            description: "Export an App as a portable bundle (GET /v2/apps/:appId/export). format=json returns the bundle object directly. Use `include` to select sections (e.g. 'chats,users,sources,botInstances'). Feed the result to `ethora-app-import-v2`.",
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                format: z.enum(["json", "zip"]).optional(),
                include: z.string().optional().describe("Comma-separated sections to include, e.g. 'chats,users,sources,botInstances'."),
            },
        },
        async function ({ appId, format, include }) {
            const meta = getDefaultMeta("ethora-app-export-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                if (!ctx.appId) throw new Error("appId is required (pass appId or call `ethora-app-select` first).")
                const res = await appExportV2(ctx.appId, { format: format || "json", include })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function appImportV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-app-import-v2",
        {
            description: "Import an App from a bundle produced by `ethora-app-export-v2` (POST /v2/apps/import, application/json body IS the bundle). B2B / tenant-actor auth. domainNameOverride renames the imported App's domain.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                bundle: z.any().describe("The exported bundle object (the json export output)."),
                domainNameOverride: z.string().optional().describe("Rename the imported App's domainName."),
            },
        },
        async function ({ bundle, domainNameOverride }) {
            const meta = getDefaultMeta("ethora-app-import-v2")
            try {
                // App import is tenant-actor auth and takes no appId in the path,
                // so accept either app-token or B2B auth without demanding a
                // current appId.
                const state = getClientState() as any
                if (state.authMode !== "app" && state.authMode !== "b2b") {
                    throw new Error("This tool requires app-token or B2B auth. Use `ethora-auth-use-app` or `ethora-auth-use-b2b` first.")
                }
                const res = await appImportV2(bundle, domainNameOverride)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function botEnableV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-bot-enable-v2",
        {
            description: "Enable the LEGACY per-app aiBot using app-token or B2B auth. NOTE: clean API/B2B-created apps have no legacy aiBot, so this returns 422 BOT_NOT_INITIALIZED there — use the Agents API (`ethora-agents-create-v2` + `ethora-agent-invite-to-chat`, or `ethora-b2b-app-bootstrap-ai`) for B2B AI. Valid for apps that already have a legacy aiBot.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                trigger: z.enum(["any_message", "/bot"]).optional().describe("When the bot responds: `any_message` (every message) or `/bot` (only /bot-prefixed messages). Omit to leave the existing trigger unchanged."),
            },
        },
        async function ({ appId, trigger }) {
            const meta = getDefaultMeta("ethora-bot-enable-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await botUpdateForAppV2(ctx.appId!, { status: "on", trigger } as any)
                    : await botUpdateV2({ status: "on", trigger } as any)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function botDisableV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-bot-disable-v2",
        {
            description: "Turn the AI bot off for an app (sets bot `status: \"off\"`) — it stops responding. The configured prompt/LLM/RAG and any activated agent are preserved, so re-enabling restores the same behavior.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 unknown `appId`. Related: `ethora-bot-enable-v2` to turn back on.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
            },
        },
        async function ({ appId }) {
            const meta = getDefaultMeta("ethora-bot-disable-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await botUpdateForAppV2(ctx.appId!, { status: "off" } as any)
                    : await botUpdateV2({ status: "off" } as any)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function botWidgetGetV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-bot-widget-v2",
        {
            description: "LEGACY: read the per-app bot widget config (`GET /v2/bot/widget`); only apps that already have a legacy aiBot have one, API-created apps get 422. For the embeddable AI chat widget use `ethora-widget-embed-snippet` instead — the widget config and public widget URL metadata needed to embed the bot on a website.\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`). Errors: 401/403 not in app-token mode or invalid appToken. Related: enable/disable via `widgetPublicEnabled` in `ethora-bot-update-v2`.",
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async function () {
            const meta = getDefaultMeta("ethora-bot-widget-v2")
            try {
                ensureAppAuthForTool()
                const res = await botWidgetGetV2()
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function chatsMessageCreateV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-chats-message-v2",
        {
            description: "Post a message into a chat room of an app (POST /v2/apps/:appId/chats/broadcast targeting one room). The message is attributed to the app's broadcast sender (override the shown name with `senderName`). Use it to seed or test a conversation, e.g. right after `ethora-agent-invite-to-chat`, and set `waitForReplySec` (up to 60) to wait for an AI agent's answer; replies are returned in `replies`. Identify the room by `roomJid` (`${appId}_${chatId}`, exactly what `ethora-app-create-chat` returns as `jid`) or by the bare `chatId` plus the selected app.\nAuth: user auth (the default on the hosted server) or B2B; app-token mode is not accepted by this route. Errors: 401 not logged in; 403 not the app owner; 404 unknown app/room; 422 empty text. Reply detection needs the message archive (MAM) on the deployment; when it is unavailable `replies` is null and `historyUnavailable` is true.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                text: z.string().min(1).max(4000).describe("Message body to post (1-4000 chars)."),
                roomJid: z.string().optional().describe("Room JID `${appId}_${chatId}` (optionally with `@conference.<host>`), as returned by `ethora-app-create-chat`. Either this or `chatId` is required."),
                chatId: z.string().optional().describe("Chat id: either the Mongo chat `_id` (as listed by the app's chat list) or the suffix after `${appId}_` in the room JID. Needs an app: pass `appId` or select one with `ethora-app-select`."),
                appId: z.string().optional().describe("24-char hex appId. Optional when `roomJid` carries it or an app is selected."),
                senderName: z.string().max(60).optional().describe("Display name shown as the message sender (defaults to the app's broadcast sender / app name)."),
                waitForReplySec: z.number().int().min(0).max(60).optional().describe("Seconds to wait for a reply from someone else in the room (an AI agent, typically). 0 (default) returns right after posting."),
            },
        },
        async function ({ text, roomJid, chatId, appId, senderName, waitForReplySec }) {
            const meta = getDefaultMeta("ethora-chats-message-v2")
            try {
                ensureTenantActorAuth()
                const ctx = resolveAppScopedV2Context(appId)
                const room = await resolveRoom(ctx.appId, roomJid || chatId)
                const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms))
                const readHistory = async (limit: number) => {
                    const h = await appChatMessagesV2(room.appId, room.mongoId, { limit })
                    const body = h.data?.data ?? h.data ?? {}
                    return { rows: (body.results || []) as any[], unavailable: Boolean(body.mamUnavailable) }
                }
                // Snapshot the newest archived message so only later ones count as replies.
                let baselineTs = 0
                let historyUnavailable = false
                try {
                    const snap = await readHistory(5)
                    historyUnavailable = snap.unavailable
                    baselineTs = snap.rows.reduce((m, r) => Math.max(m, Number(r.ts) || 0), 0)
                } catch {
                    historyUnavailable = true
                }
                const payload: any = { text, chatNames: [room.roomName] }
                if (senderName) payload.sender = { firstName: senderName }
                const res = await chatsBroadcastForAppV2(room.appId, payload)
                const out: any = {
                    posted: true,
                    appId: room.appId,
                    chatId: room.mongoId,
                    roomJid: room.roomJid,
                    job: res.data?.data ?? res.data,
                    replies: null as any,
                    historyUnavailable,
                }
                const wait = Math.min(60, Math.max(0, Number(waitForReplySec) || 0))
                if (wait > 0 && !historyUnavailable) {
                    const deadline = Date.now() + wait * 1000
                    const replies: any[] = []
                    let postedTs = 0
                    while (Date.now() < deadline) {
                        await sleepMs(3000)
                        try {
                            const h = await readHistory(30)
                            if (h.unavailable) { historyUnavailable = true; break }
                            const later = h.rows.filter((r) => (Number(r.ts) || 0) > baselineTs)
                            const mine = later.find((r) => String(r.body || "") === String(text))
                            if (mine) postedTs = Number(mine.ts) || postedTs
                            const others = later.filter((r) => String(r.body || "") !== String(text) && (Number(r.ts) || 0) >= postedTs)
                            if (others.length) { replies.push(...others); break }
                        } catch (e: any) {
                            if (e?.response?.status === 502) { historyUnavailable = true; break }
                        }
                    }
                    out.waitedSec = wait
                    out.historyUnavailable = historyUnavailable
                    out.postedVisibleInHistory = postedTs > 0
                    out.replies = replies.map((r) => ({ from: r.nick || r.from, text: r.body, ts: r.ts }))
                    if (!replies.length) out.note = historyUnavailable
                        ? "Message archive unavailable on this deployment; cannot observe replies."
                        : `No reply from another participant within ${wait}s. Agents reply only if invited into this room (ethora-agent-invite-to-chat) and their response gate allows it; check ethora-bot-instances-list.`
                }
                return asToolResult(ok(out, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}
function chatsHistoryGetV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-chats-history-v2",
        {
            description: "Read the archived messages of a chat room (GET /v2/apps/:appId/chats/:chatId/messages, newest last). Returns `results` with `from`, `nick`, `body`, `ts` (ms) plus a `nextBefore` cursor for older pages. Identify the room by `roomJid` (`${appId}_${chatId}`) or bare `chatId` plus the selected app.\nAuth: user auth (default on the hosted server) or B2B; app-token mode is not accepted. Errors: 401 not logged in; 403 not the app owner; 404 unknown app/room; 502 MAM_READ_FAILED or `mamUnavailable: true` when the deployment has no message archive.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                roomJid: z.string().optional().describe("Room JID `${appId}_${chatId}` (optionally with `@conference.<host>`). Either this or `chatId` is required."),
                chatId: z.string().optional().describe("Bare chat id. Needs an app: pass `appId` or select one with `ethora-app-select`."),
                appId: z.string().optional().describe("24-char hex appId. Optional when `roomJid` carries it or an app is selected."),
                limit: z.number().int().min(1).max(500).optional().describe("Maximum number of most-recent messages to return (default 100)."),
                before: z.number().int().min(0).optional().describe("Pagination cursor: only messages older than this timestamp (ms), from a previous `nextBefore`."),
            },
        },
        async function ({ roomJid, chatId, appId, limit, before }) {
            const meta = getDefaultMeta("ethora-chats-history-v2")
            try {
                ensureTenantActorAuth()
                const ctx = resolveAppScopedV2Context(appId)
                const room = await resolveRoom(ctx.appId, roomJid || chatId)
                const res = await appChatMessagesV2(room.appId, room.mongoId, { limit, before })
                return asToolResult(ok({ appId: room.appId, chatId: room.mongoId, roomJid: room.roomJid, ...(res.data?.data ?? res.data) }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}
function botMessageCreateV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-bot-message-v2",
        {
            description: "DEPRECATED alias of `ethora-chats-message-v2` (the old /v2/chats/messages automation route no longer exists). Posts a message into a room by `roomJid` or `chatId`; prefer `ethora-chats-message-v2`, which also supports `waitForReplySec`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                text: z.string().min(1).max(4000).describe("Message body to post."),
                roomJid: z.string().optional().describe("Room JID `${appId}_${chatId}`."),
                chatId: z.string().optional().describe("Bare chat id (needs a selected app or `appId`)."),
                appId: z.string().optional().describe("24-char hex appId."),
            },
        },
        async function ({ text, roomJid, chatId, appId }) {
            const meta = getDefaultMeta("ethora-bot-message-v2")
            try {
                ensureTenantActorAuth()
                const ctx = resolveAppScopedV2Context(appId)
                const room = await resolveRoom(ctx.appId, roomJid || chatId)
                const res = await chatsBroadcastForAppV2(room.appId, { text, chatNames: [room.roomName] })
                return asToolResult(ok({ posted: true, roomJid: room.roomJid, job: res.data?.data ?? res.data, deprecated: "use ethora-chats-message-v2" }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}
function botHistoryGetV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-bot-history-v2",
        {
            description: "DEPRECATED alias of `ethora-chats-history-v2` (the old /v2/chats/history automation route no longer exists). Reads a room's archived messages by `roomJid` or `chatId`.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                roomJid: z.string().optional().describe("Room JID `${appId}_${chatId}`."),
                chatId: z.string().optional().describe("Bare chat id (needs a selected app or `appId`)."),
                appId: z.string().optional().describe("24-char hex appId."),
                limit: z.number().int().min(1).max(500).optional().describe("Maximum number of most-recent messages."),
            },
        },
        async function ({ roomJid, chatId, appId, limit }) {
            const meta = getDefaultMeta("ethora-bot-history-v2")
            try {
                ensureTenantActorAuth()
                const ctx = resolveAppScopedV2Context(appId)
                const room = await resolveRoom(ctx.appId, roomJid || chatId)
                const res = await appChatMessagesV2(room.appId, room.mongoId, { limit })
                return asToolResult(ok({ roomJid: room.roomJid, ...(res.data?.data ?? res.data), deprecated: "use ethora-chats-history-v2" }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}
async function runB2BAppBootstrapAi(args: {
    displayName: string
    setAsCurrent?: boolean
    crawlUrl?: string
    followLink?: boolean
    docs?: Array<{ name: string; mimeType: string; base64: string }>
    enableBot?: boolean
    botTrigger?: string
    llmProvider?: string
    llmModel?: string
    savedAgentId?: string
    // Phase 1 (Agents) extensions: optionally create a brand-new Agent inside the new
    // App and invite it into the App's first default room as part of the bootstrap.
    agentDisplayName?: string
    agentPrompt?: string
    agentVisibility?: "private" | "unlisted" | "public"
    inviteToDefaultRoom?: boolean
}) {
    const { displayName, setAsCurrent, crawlUrl, followLink, docs, enableBot, botTrigger, llmProvider, llmModel, savedAgentId,
        agentDisplayName, agentPrompt, agentVisibility, inviteToDefaultRoom } = args

    ensureB2BAuthForTool()

    const steps: any[] = []

    // 1) Create app (B2B)
    setAuthMode("b2b")
    const created = await appCreateV2(displayName)
    const app = created?.data?.app
    const appId = String(app?._id || app?.id || "").trim()
    const appToken = String(app?.appToken || "").trim()
    steps.push({ step: "appCreate", ok: true, appId })
    if (!appId) throw new Error("Create app succeeded but no appId found in response")
    if (!appToken) {
        // appToken is needed for v2 sources app-token endpoints
        steps.push({ step: "warning", ok: false, message: "No appToken returned; app-token sources endpoints may not work" })
    }

    // 2) Optionally set context to this app (app-token auth)
    const shouldSetCurrent = setAsCurrent !== false
    if (shouldSetCurrent && appToken) {
        selectApp({ appId, appToken, authMode: "app" })
        steps.push({ step: "appSelect", ok: true, authMode: "app" })
    } else if (shouldSetCurrent) {
        // at least set current appId, even without token
        selectApp({ appId, authMode: "b2b" })
        steps.push({ step: "appSelect", ok: true, authMode: "b2b" })
    }

    // 2.5) Ensure the app has a room to host the AI agent / back the widget.
    // API/B2B-created apps no longer seed a default "Main chat" room (that
    // default was inverted off for API/B2B callers). Reuse an existing room when
    // the app already has one — this keeps repeat bootstrap calls (same app,
    // second agent) landing both agents in the SAME room — otherwise provision
    // one. Best-effort: recorded as a skip on failure.
    let bootstrapRoomChatId: string | null = null
    let bootstrapRoomJid: string | null = null
    try {
        let firstRoom: any = null
        try {
            const existing = await appGetDefaultRoomsWithAppId(appId)
            firstRoom = existing?.data?.result?.[0] || existing?.data?.[0] || null
        } catch { /* no existing rooms readable — fall through to provision */ }
        if (firstRoom) {
            bootstrapRoomChatId = String(firstRoom?._id || firstRoom?.chatId || "").trim() || null
            bootstrapRoomJid = String(firstRoom?.jid || "").trim() || null
            steps.push({ step: "provisionRoom", ok: true, reused: true, chatId: bootstrapRoomChatId, jid: bootstrapRoomJid })
        } else {
            const prov = await appProvisionV2(appId, { rooms: [{ title: `${displayName} Main`, pinned: false }] }, { timeoutMs: 60_000 })
            const room = Array.isArray(prov?.data?.details) ? prov.data.details[0]?.room : undefined
            bootstrapRoomChatId = String(room?._id || room?.chatId || "").trim() || null
            bootstrapRoomJid = String(room?.jid || "").trim() || null
            steps.push({ step: "provisionRoom", ok: true, reused: false, chatId: bootstrapRoomChatId, jid: bootstrapRoomJid })
        }
    } catch (e: any) {
        steps.push({ step: "provisionRoom", ok: false, error: e?.message || String(e) })
    }

    // 3) Index website (app-token sources v2)
    let crawlResult: any = null
    if (crawlUrl) {
        if (!appToken) throw new Error("crawlUrl requested but no appToken available for app-token auth")
        setAuthMode("app")
        const r = await sourcesSiteCrawlV2({ url: crawlUrl, followLink: typeof followLink === "boolean" ? followLink : true })
        crawlResult = r.data
        steps.push({ step: "sourcesSiteCrawlV2", ok: true })
    }

    // 4) Ingest docs (app-token sources v2)
    let docsResult: any = null
    if (Array.isArray(docs) && docs.length) {
        if (!appToken) throw new Error("docs requested but no appToken available for app-token auth")
        setAuthMode("app")
        const form = new FormData()
        for (const f of docs) {
            const buf = normalizeBase64ToBuffer(f.base64)
            if (buf.length > 50 * 1024 * 1024) throw new Error(`File '${f.name}' exceeds 50MB limit`)
            const blob = new Blob([buf], { type: f.mimeType })
            form.append("files", blob, f.name)
        }
        const r = await sourcesDocsUploadV2(form, { "Content-Type": "multipart/form-data" })
        docsResult = r.data
        steps.push({ step: "sourcesDocsUploadV2", ok: true, files: docs.length })
    }

    // 5) Enable bot (B2B)
    let botEnableResult: any = null
    if (savedAgentId || enableBot || botTrigger || llmProvider || llmModel) {
        if (!appToken) throw new Error("Bot setup requested but no appToken available for app-token bot management")
        setAuthMode("app")
        if (savedAgentId) {
            const activated = await agentsActivateV2(savedAgentId)
            botEnableResult = activated.data
            steps.push({ step: "agentsActivateV2", ok: true, savedAgentId })
        }
        const payload: any = {}
        if (enableBot) payload.status = "on"
        if (botTrigger) payload.trigger = botTrigger
        if (llmProvider) payload.llmProvider = llmProvider
        if (llmModel) payload.llmModel = llmModel
        if (Object.keys(payload).length > 0) {
            try {
                const r = await botUpdateV2(payload)
                botEnableResult = r.data
                steps.push({ step: "botSetup", ok: true })
            } catch (e: any) {
                // On current backends a clean B2B app has no legacy aiBot to
                // update (PUT /v2/bot => 422 BOT_NOT_INITIALIZED). The forward
                // path is the Agents API (created + invited below), so treat the
                // legacy call as a skip rather than failing the whole bootstrap.
                const status = e?.response?.status
                const code = e?.response?.data?.code
                if (status === 422 || code === "BOT_NOT_INITIALIZED") {
                    steps.push({
                        step: "botSetup",
                        ok: false,
                        skipped: true,
                        reason: "legacy_bot_not_initialized",
                        message: "Legacy aiBot is not provisioned for B2B apps; using the Agents API instead.",
                    })
                } else {
                    throw e
                }
            }
        }
    }

    // 6) Phase 1 (Agents): create a fresh Agent and (optionally) invite it into the App's
    //    default room. This is the path the AI-assisted Phase 1 demo uses when bootstrapping
    //    an App with an Agent that has its own persona + RAG, separate from the legacy aiBot.
    let agentResult: any = null
    let inviteResult: any = null
    // Create an Agent when one is explicitly requested, OR when the caller asked
    // to enable a bot but did not point at a saved agent — on current backends
    // the Agents API is the only working AI path for a clean B2B app, so
    // "enableBot: true" is fulfilled by creating + inviting a fresh Agent.
    const wantAgent = Boolean(agentDisplayName || agentPrompt || (enableBot && !savedAgentId))
    if (wantAgent) {
        if (!appToken) throw new Error("Agent creation requested but no appToken available")
        setAuthMode("app")
        try {
            const created = await agentsCreateV2({
                name: agentDisplayName || `${displayName} Bot`,
                prompt: agentPrompt || "You are a helpful assistant.",
                visibility: agentVisibility === "unlisted" ? "private" : (agentVisibility || "private") as any,
                trigger: (botTrigger as any) || undefined,
                llmProvider: llmProvider || undefined,
                llmModel: llmModel || undefined,
            } as any)
            agentResult = created.data?.agent
            steps.push({ step: "agentsCreateV2", ok: true, agentId: agentResult?.id })

            // unlisted -> set after create (createSchema accepts only private|public via legacy alias path).
            if (agentVisibility === "unlisted" && agentResult?.id) {
                await agentsSetVisibilityV2(agentResult.id, "unlisted")
                steps.push({ step: "agentsSetVisibilityV2", ok: true, visibility: "unlisted" })
            }

            if (inviteToDefaultRoom !== false && agentResult?.id) {
                // Prefer the room we provisioned above. Fall back to the legacy
                // default-room lookup for older backends that still seed one.
                let chatId: string | undefined = bootstrapRoomChatId || undefined
                let chatJid: string | undefined = bootstrapRoomJid || undefined
                if (!chatId && !chatJid) {
                    const rooms = await appGetDefaultRoomsWithAppId(appId)
                    const firstRoom = rooms?.data?.result?.[0] || rooms?.data?.[0]
                    chatId = firstRoom?._id || firstRoom?.chatId
                }
                if (chatId || chatJid) {
                    const r = await agentsInviteToChatV2(agentResult.id, { appId, chatId, chatJid })
                    inviteResult = r.data
                    steps.push({ step: "agentInviteToChat", ok: true, chatId, chatJid })
                } else {
                    steps.push({ step: "agentInviteToChat", ok: false, message: "no room available to invite into" })
                }
            }
        } catch (e: any) {
            steps.push({ step: "agentBootstrap", ok: false, error: e?.message || String(e) })
        }
    }

    // Final: set default auth mode for next steps
    if (shouldSetCurrent && appToken) setAuthMode("app")
    else setAuthMode("b2b")

    return { appId, appToken: appToken || undefined, app, crawl: crawlResult, docs: docsResult, bot: botEnableResult, agent: agentResult, invite: inviteResult, steps, state: getClientState() }
}

// Minimal namespace aliases to reduce auth-mode mistakes for agents.
function b2bAliases(server: McpServer) {
    server.registerTool(
        "ethora.b2b.auth.use",
        { description: "Dot-namespaced alias for `ethora-auth-use-b2b` — switches the session's active auth mode to B2B (`x-custom-token`). Behavior is identical.\nAuth: requires a `b2bToken` to already be configured. Errors: returns an error if no `b2bToken` is configured.", annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
        async function () {
            try {
                return asToolResult(ok(setAuthMode("b2b"), getDefaultMeta("ethora.b2b.auth.use")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora.b2b.auth.use")))
            }
        }
    )
    server.registerTool(
        "ethora.b2b.app.create",
        { description: "Dot-namespaced alias for `ethora-b2b-app-create` — create a new Ethora app server-side, allocating a fresh `appId`.\nAuth: B2B mode (`ethora.b2b.auth.use` / `ethora-auth-use-b2b` + a configured `b2bToken`). Errors: 401/403 not in B2B mode; 422 invalid `displayName`. Related: prefer `ethora-b2b-app-create` in new integrations.", annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }, inputSchema: { displayName: z.string().min(1).describe("Human-readable app name shown to users in the app picker and on the public landing page.") } },
        async function ({ displayName }) {
            try {
                ensureB2BAuthForTool()
                const res = await appCreate(displayName)
                return asToolResult(ok(res.data, getDefaultMeta("ethora.b2b.app.create")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora.b2b.app.create")))
            }
        }
    )
    server.registerTool(
        "ethora.b2b.bot.enable",
        { description: "Dot-namespaced alias for `ethora-b2b-bot-enable` — turn on the AI bot for an app (sets `botStatus: \"on\"`). The bot only responds if a prompt + LLM are configured and the backend has an AI service.\nAuth: B2B mode (`ethora.b2b.auth.use` / `ethora-auth-use-b2b` + a configured `b2bToken`). Errors: 401/403 not in B2B mode; 400 no `appId` and none selected; 404 unknown `appId`. Related: prefer `ethora-b2b-bot-enable` in new integrations.", annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }, inputSchema: { appId: z.string().optional().describe("24-char hex appId whose bot to enable. Optional — defaults to the app set via `ethora-app-select`."), botTrigger: z.string().optional().describe("When the bot responds: `/bot` or `any_message`. Omit to leave the existing trigger unchanged.") } },
        async function ({ appId, botTrigger }) {
            try {
                ensureB2BAuthForTool()
                const state = getClientState() as any
                const effectiveAppId = appId || state.currentAppId
                if (!effectiveAppId) {
                    throw new Error("appId is required (pass appId or call `ethora-app-select` first)")
                }
                const changes: any = { botStatus: "on" }
                if (botTrigger) changes.botTrigger = botTrigger
                const res = await appUpdate(effectiveAppId, changes)
                return asToolResult(ok(res.data, getDefaultMeta("ethora.b2b.bot.enable")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora.b2b.bot.enable")))
            }
        }
    )
    server.registerTool(
        "ethora.b2b.broadcast.wait",
        { description: "Dot-namespaced sibling of `ethora-wait-broadcast-job-v2` — block until a broadcast job reaches a terminal state (`completed` / `failed`) or `timeoutMs`. Read-only polling. Returns `{ done, state, job }`, or `{ done: false, reason: \"timeout\" }` on timeout.\nAuth: app-token mode (despite `b2b` in the name — `ethora-app-select` + `ethora-auth-use-app`). Errors: 401/403 not in app-token mode; 404 unknown `jobId`.", annotations: { readOnlyHint: true, openWorldHint: true }, inputSchema: { jobId: z.string().min(1).describe("Job id returned by `ethora-chats-broadcast-v2`."), timeoutMs: z.number().int().min(1000).max(300000).optional().describe("Maximum time to wait, in milliseconds. Default 60000."), intervalMs: z.number().int().min(250).max(10000).optional().describe("Delay between status checks, in milliseconds. Default 1000.") } },
        async function ({ jobId, timeoutMs, intervalMs }) {
            const meta = getDefaultMeta("ethora.b2b.broadcast.wait")
            try {
                ensureTenantActorAuth()
                const timeout = timeoutMs ?? 60_000
                const interval = intervalMs ?? 1_000
                const started = Date.now()
                let last: any = null
                while (Date.now() - started < timeout) {
                    const res = await chatsBroadcastJobV2(jobId)
                    last = res.data
                    const state = String(last?.state || "")
                    if (state === "completed" || state === "failed") {
                        return asToolResult(ok({ done: true, state, job: last }, meta))
                    }
                    await sleep(interval)
                }
                return asToolResult(ok({ done: false, reason: "timeout", job: last }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )

    server.registerTool(
        "ethora.b2b.app.bootstrap-ai",
        {
            description: "Dot-namespaced alias for `ethora-b2b-app-bootstrap-ai` — one-call B2B orchestrator: create an app, index RAG sources, then configure and enable its AI bot. Source ingest and bot activation are best-effort (the app is still created if a later step fails). Returns a per-step log including the new `appId`.\nAuth: B2B mode (`ethora.b2b.auth.use` / `ethora-auth-use-b2b` + a configured `b2bToken`). Errors: aborts with the partial step log if app creation fails; previous auth mode restored best-effort.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                displayName: z.string().min(1).describe("Display name for the new app."),
                setAsCurrent: z.boolean().optional().describe("If true (default), set the new app as the session's current app and switch to app-token auth."),
                crawlUrl: z.string().optional().describe("Optional website URL to crawl and index into the new app's RAG sources."),
                followLink: z.boolean().optional().describe("For `crawlUrl`: also follow in-domain links (default true). Can ingest many pages."),
                docs: z.array(z.object({
                    name: z.string().min(1).describe("Document file name including extension."),
                    mimeType: z.string().min(1).describe("MIME type, e.g. `application/pdf`."),
                    base64: z.string().min(1).describe("Document content, base64-encoded."),
                })).optional().describe("Optional documents to ingest into the new app's RAG sources."),
                enableBot: z.boolean().optional().describe("If true, set the new app's bot to `status: on` (best-effort AI service activation)."),
                botTrigger: z.string().optional().describe("Bot trigger: `/bot` or `any_message`."),
                llmProvider: z.string().optional().describe("LLM provider for the bot, e.g. `openai` or `openai-compatible`. Must be enabled in your Ethora backend."),
                llmModel: z.string().optional().describe("LLM model id for the bot, e.g. `gpt-4o-mini`. Must be available for the chosen provider."),
                savedAgentId: z.string().optional().describe("Optional id of an existing saved agent to bind as the new app's active bot."),
            },
        },
        async function (args) {
            const meta = getDefaultMeta("ethora.b2b.app.bootstrap-ai")
            const prev = (getClientState() as any).authMode as any
            try {
                const res = await runB2BAppBootstrapAi(args as any)
                return asToolResult(ok(res, meta))
            } catch (error) {
                try { setAuthMode(prev) } catch (_) {}
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function b2bAppBootstrapAiTool(server: McpServer) {
    server.registerTool(
        "ethora-b2b-app-bootstrap-ai",
        {
            description: "One-call B2B orchestrator: create an app, set it as the current context, index RAG sources, then configure and enable its AI bot. Source ingest and bot activation are best-effort (the app is still created if a later step fails); crawl/embedding continues asynchronously after this returns. Returns a per-step log including the new `appId`.\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`); internally switches to app-token mode for source-ingest steps. Errors: aborts with the partial step log if app creation fails; previous auth mode restored best-effort. Related: rooms+tokens variant is `ethora-b2b-app-provision`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                displayName: z.string().min(1).describe("Display name for the new app."),
                setAsCurrent: z.boolean().optional().describe("If true (default), set the new app as the session's current app and switch to app-token auth so follow-up tools can omit appId."),
                crawlUrl: z.string().optional().describe("Optional website URL to crawl and index into the new app's RAG sources."),
                followLink: z.boolean().optional().describe("For `crawlUrl`: also follow in-domain links (default true). Can ingest many pages."),
                docs: z.array(z.object({
                    name: z.string().min(1),
                    mimeType: z.string().min(1),
                    base64: z.string().min(1),
                })).optional().describe("Optional docs to ingest (base64)"),
                savedAgentId: z.string().optional().describe("Optional saved agent to bind as the active bot for the new app."),
                enableBot: z.boolean().optional().describe("If true, enables botStatus=on (best-effort AI service activation)"),
                botTrigger: z.string().optional().describe("Optional bot trigger (e.g. '/bot' or 'any_message')"),
                llmProvider: z.string().optional().describe("Optional generation provider for the default AI bot (example: 'openai' or 'openai-compatible')."),
                llmModel: z.string().optional().describe("Optional generation model for the default AI bot (example: 'gpt-4o-mini')."),
                // Phase 1 (Agents) extensions
                agentDisplayName: z.string().optional().describe("Phase 1: create a new Agent with this display name as part of bootstrap."),
                agentPrompt: z.string().optional().describe("Phase 1: persona/instructions for the newly-created Agent."),
                agentVisibility: z.enum(["private", "unlisted", "public"]).optional().describe("Phase 1: visibility for the newly-created Agent."),
                inviteToDefaultRoom: z.boolean().optional().describe("Phase 1: if true (default), invite the newly-created Agent into the App's first default room."),
            },
        },
        async function ({ displayName, setAsCurrent, crawlUrl, followLink, docs, enableBot, botTrigger, llmProvider, llmModel, savedAgentId,
            agentDisplayName, agentPrompt, agentVisibility, inviteToDefaultRoom }) {
            const meta = getDefaultMeta("ethora-b2b-app-bootstrap-ai")
            const prev = (getClientState() as any).authMode as any
            try {
                const res = await runB2BAppBootstrapAi({ displayName, setAsCurrent, crawlUrl, followLink, docs, enableBot, botTrigger, llmProvider, llmModel, savedAgentId,
                    agentDisplayName, agentPrompt, agentVisibility, inviteToDefaultRoom })
                return asToolResult(ok(res, meta))
            } catch (error) {
                // restore previous mode best-effort
                try { setAuthMode(prev) } catch (_) {}
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function generateChatComponentAppTsxTool(server: McpServer) {
    server.registerTool(
        "ethora-generate-chat-component-app-tsx",
        {
            description: "Generate a ready-to-paste React `App.tsx` snippet that mounts `@ethora/chat-component`. Returns `{ filename: \"App.tsx\", snippet }`; unpassed values are emitted as placeholders. Does not write any file.\nAuth: none required — pure code generator, no API calls. Errors: effectively none. Security note: the snippet includes `appToken` inline only as a quickstart convenience — do not ship hardcoded tokens to production.",
            annotations: { readOnlyHint: true, openWorldHint: false },
            inputSchema: {
                apiUrl: z.string().optional().describe("Ethora API base URL to embed in the snippet, e.g. `https://api.chat.ethora.com/v1`. Omit to emit a placeholder."),
                appToken: z.string().optional().describe("appToken to embed in the snippet for quickstart testing. Omit to emit a placeholder. Do NOT hardcode real tokens in production source."),
                roomJid: z.string().optional().describe("Room JID to open on load. Omit to emit a commented-out placeholder."),
            },
        },
        async function ({ apiUrl, appToken, roomJid }) {
            const meta = getDefaultMeta("ethora-generate-chat-component-app-tsx")
            try {
                const snippet = [
                    `import { Chat } from \"@ethora/chat-component\";`,
                    `import \"./App.css\";`,
                    ``,
                    `export default function App() {`,
                    `  return (`,
                    `    <Chat`,
                    `      config={{`,
                    `        // Replace with your Ethora API base URL`,
                    `        baseUrl: ${JSON.stringify(apiUrl || "https://api.ethoradev.com/v1")},`,
                    `        // SECURITY: do not hardcode tokens in production. Prefer your own backend/session.`,
                    `        appToken: ${JSON.stringify(appToken || "JWT <YOUR_APP_TOKEN_HERE>")},`,
                    `      }}`,
                    roomJid ? `      roomJID=${JSON.stringify(roomJid)}` : `      // roomJID=\"...\"`,
                    `    />`,
                    `  );`,
                    `}`,
                    ``,
                ].join("\n")
                return asToolResult(ok({ filename: "App.tsx", snippet }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function generateEnvExamplesTool(server: McpServer) {
    server.registerTool(
        "ethora-generate-env-examples",
        {
            description: "Generate `.env.example` templates for the three common Ethora integration targets: the frontend chat component, the backend SDK, and this MCP server. Returns `{ target, template }` when `target` is given, or `{ templates }` with all three. Placeholder values only; does not write any file.\nAuth: none required — pure text generator, no API calls. Errors: effectively none.",
            annotations: { readOnlyHint: true, openWorldHint: false },
            inputSchema: {
                target: z.enum(["frontend-chat-component", "backend-sdk", "mcp"]).optional().describe("Which template to return: `frontend-chat-component` (Vite env), `backend-sdk` (@ethora/sdk-backend env), or `mcp` (this server's env). Omit to return all three."),
            },
        },
        async function ({ target }) {
            const meta = getDefaultMeta("ethora-generate-env-examples")
            try {
                const templates: any = {
                    "frontend-chat-component": [
                        `# @ethora/chat-component (Vite example)`,
                        `# Use VITE_ vars in Vite projects`,
                        `VITE_APP_API_URL=https://api.ethoradev.com/v1`,
                        `VITE_APP_DOMAIN_NAME=ethoradev.com`,
                        `VITE_APP_XMPP_BASEDOMAIN=xmpp.ethoradev.com`,
                        ``,
                        `# SECURITY NOTE: do NOT hardcode appToken/user tokens in frontend source for production.`,
                        `# Prefer your backend issuing short-lived credentials or using your own session.`,
                        ``,
                    ].join("\n"),
                    "backend-sdk": [
                        `# @ethora/sdk-backend integration`,
                        `ETHORA_CHAT_API_URL=https://api.ethoradev.com`,
                        `ETHORA_CHAT_APP_ID=<APP_ID>`,
                        `ETHORA_CHAT_APP_SECRET=<APP_SECRET>`,
                        `# Optional: bot JID for some flows`,
                        `# ETHORA_CHAT_BOT_JID=<bot_jid@xmpp.domain>`,
                        ``,
                    ].join("\n"),
                    "mcp": [
                        `# @ethora/mcp-server`,
                        `ETHORA_API_URL=https://api.ethoradev.com/v1`,
                        `# Local developer/admin flow: needed only for login/register bootstrap`,
                        `ETHORA_APP_JWT=JWT <APP_JWT_FOR_LOGIN_REGISTER>`,
                        `# Server-side B2B flow: tenant-actor token sent as x-custom-token`,
                        `ETHORA_B2B_TOKEN=JWT <B2B_SERVER_TOKEN>`,
                        `# appToken is usually selected at runtime via ethora-app-select after you know the app`,
                        ``,
                    ].join("\n"),
                }

                if (target) {
                    return asToolResult(ok({ target, template: templates[target] }, meta))
                }
                return asToolResult(ok({ templates }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function generateB2BBootstrapRunbookTool(server: McpServer) {
    server.registerTool(
        "ethora-generate-b2b-bootstrap-runbook",
        {
            description: "Generate a human-readable runbook listing this server's tool calls in the right order for a B2B bootstrap, with example payloads. Documentation only — does not write any file or execute any step.\nAuth: none required — pure text generator, no API calls. Errors: effectively none. Related: to actually run the sequence use `ethora-run-recipe` or `ethora-b2b-app-bootstrap-ai`.",
            annotations: { readOnlyHint: true, openWorldHint: false },
            inputSchema: {
                apiUrl: z.string().optional().describe("Ethora API base URL to show in the runbook's configure step. Omit to emit a placeholder."),
                displayName: z.string().optional().describe("App display name to show in the runbook's create-app step. Omit to emit a placeholder."),
                crawlUrl: z.string().optional().describe("Website URL to show in the runbook's source-ingest step. Omit to emit a placeholder."),
            },
        },
        async function ({ apiUrl, displayName, crawlUrl }) {
            const meta = getDefaultMeta("ethora-generate-b2b-bootstrap-runbook")
            try {
                const runbook = [
                    `# B2B bootstrap runbook (MCP tool call order)`,
                    ``,
                    `# This is the server-side / automation path.`,
                    `# For a first local test with a human user, start with user auth instead:`,
                    `# ethora-configure { apiUrl, appJwt } -> ethora-auth-use-user -> ethora-user-login`,
                    ``,
                    `## 1) Configure`,
                    `Call: ethora-configure`,
                    `Payload: ${JSON.stringify({ apiUrl: apiUrl || "https://api.ethoradev.com/v1", b2bToken: "JWT <B2B_SERVER_TOKEN>" }, null, 2)}`,
                    ``,
                    `## 2) Switch to B2B auth`,
                    `Call: ethora-auth-use-b2b`,
                    `Payload: {}`,
                    ``,
                    `## 3) Bootstrap app + AI`,
                    `Call: ethora-b2b-app-bootstrap-ai`,
                    `Payload: ${JSON.stringify({ displayName: displayName || "Acme AI Demo", crawlUrl: crawlUrl || "https://example.com", enableBot: true, llmProvider: "openai", llmModel: "gpt-4o-mini" }, null, 2)}`,
                    ``,
                    `## 4) Optional: switch into app-token mode for app-scoped follow-up`,
                    `# After bootstrap, use the returned appId/appToken to run broadcast, sources, and bot tools conveniently.`,
                    `Call: ethora-app-select`,
                    `Payload: ${JSON.stringify({ appId: "<APP_ID>", appToken: "JWT <APP_TOKEN>" }, null, 2)}`,
                    ``,
                    `Call: ethora-auth-use-app`,
                    `Payload: {}`,
                    ``,
                    `## 5) Optional: tune bot`,
                    `Call: ethora-bot-update-v2`,
                    `Payload: ${JSON.stringify({ trigger: "/bot", prompt: "You are a helpful assistant.", greetingMessage: "Hello! Ask me anything." }, null, 2)}`,
                    ``,
                ].join("\n")
                return asToolResult(ok({ runbook }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function sourcesSiteCrawlV2AppTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-crawl-v2",
        {
            description: "Crawl a website URL and ingest its content into an app's RAG sources (app-token / B2B variant of `ethora-sources-site-crawl`). Async — returns once the job is accepted; `followLink: true` follows in-domain links and can ingest many pages.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 400 malformed `url`; 404 unknown `appId`. Related: `ethora-sources-site-crawl-v2-wait` (block until done).",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to ingest into. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                url: z.string().min(1).describe("Absolute URL to crawl, e.g. `https://example.com/docs`."),
                followLink: z.boolean().optional().describe("If true, also crawl in-domain links reachable from `url`. Can ingest many pages — use with care."),
            },
        },
        async function ({ appId, url, followLink }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await sourcesSiteCrawlForAppV2(ctx.appId!, { url, followLink })
                    : await sourcesSiteCrawlV2({ url, followLink })
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-site-crawl-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-site-crawl-v2")))
            }
        }
    )
}

function sourcesSiteReindexV2AppTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-reindex-v2",
        {
            description: "Re-crawl and re-embed a previously crawled URL by its `urlId`, refreshing its RAG content (app-token / B2B variant of `ethora-sources-site-reindex`). Async — the existing source record is updated in place once indexing finishes.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 unknown `appId` or `urlId`. Related: get `urlId` from `ethora-sources-site-list-v2`; `ethora-sources-site-reindex-v2-wait` blocks until done.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the URL belongs to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                urlId: z.string().min(1).describe("Id of a previously crawled URL record. Get it from `ethora-sources-site-list-v2`."),
            },
        },
        async function ({ appId, urlId }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await sourcesSiteReindexForAppV2(ctx.appId!, { urlId })
                    : await sourcesSiteReindexV2({ urlId })
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-site-reindex-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-site-reindex-v2")))
            }
        }
    )
}

function sourcesSiteCrawlV2WaitTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-crawl-v2-wait",
        {
            description: "Crawl a website URL and block until the server finishes — a single-call, long-timeout variant of `ethora-sources-site-crawl-v2` (same crawl + embed effect). Returns `{ done: true, durationMs, result }`.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 400 malformed `url`; 504/timeout if it takes longer than `timeoutMs` (the job may still complete server-side — check with `ethora-sources-site-list-v2`).",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to ingest into. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                url: z.string().min(1).describe("Absolute URL to crawl, e.g. `https://example.com/docs`."),
                followLink: z.boolean().optional().describe("If true, also crawl in-domain links reachable from `url`. Can ingest many pages — use with care."),
                timeoutMs: z.number().int().min(1000).max(600000).optional().describe("How long to wait for the crawl to finish, in milliseconds. Default 120000. Caps at 600000 (10 min)."),
            },
        },
        async function ({ appId, url, followLink, timeoutMs }) {
            const meta = getDefaultMeta("ethora-sources-site-crawl-v2-wait")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const started = Date.now()
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await sourcesSiteCrawlForAppV2(ctx.appId!, { url, followLink }, { timeoutMs: timeoutMs ?? 120_000 })
                    : await sourcesSiteCrawlV2({ url, followLink }, { timeoutMs: timeoutMs ?? 120_000 })
                return asToolResult(ok({ done: true, durationMs: Date.now() - started, result: res.data }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function sourcesSiteReindexV2WaitTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-reindex-v2-wait",
        {
            description: "Re-crawl and re-embed a previously crawled URL and block until the server finishes — a single-call, long-timeout variant of `ethora-sources-site-reindex-v2` (same refresh effect). Returns `{ done: true, durationMs, result }`.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 unknown `appId` or `urlId`; 504/timeout if it takes longer than `timeoutMs` (the job may still complete server-side). Related: get `urlId` from `ethora-sources-site-list-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the URL belongs to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                urlId: z.string().min(1).describe("Id of a previously crawled URL record. Get it from `ethora-sources-site-list-v2`."),
                timeoutMs: z.number().int().min(1000).max(600000).optional().describe("How long to wait for the reindex to finish, in milliseconds. Default 120000. Caps at 600000 (10 min)."),
            },
        },
        async function ({ appId, urlId, timeoutMs }) {
            const meta = getDefaultMeta("ethora-sources-site-reindex-v2-wait")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const started = Date.now()
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await sourcesSiteReindexForAppV2(ctx.appId!, { urlId }, { timeoutMs: timeoutMs ?? 120_000 })
                    : await sourcesSiteReindexV2({ urlId }, { timeoutMs: timeoutMs ?? 120_000 })
                return asToolResult(ok({ done: true, durationMs: Date.now() - started, result: res.data }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function sourcesSiteListV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-list-v2",
        {
            description: "List an app's crawled website sources, including each source's id, URL, and current RAG tags. Their ids feed `ethora-sources-site-tags-update-v2`, `ethora-sources-site-delete-url-v2-batch`, and `ethora-sources-site-reindex-v2`.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 unknown `appId`; empty list if nothing has been crawled.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to list sources for. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
            },
        },
        async function ({ appId }) {
            const meta = getDefaultMeta("ethora-sources-site-list-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await sourcesSiteListForAppV2(ctx.appId!)
                    : await sourcesSiteListV2()
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function sourcesSiteTagsUpdateV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-tags-update-v2",
        {
            description: "Set the RAG retrieval tags on a crawled website source — replaces the source's tag set with the provided `tags` array (not additive; pass `[]` to clear all). Tags let the bot's `ragTags` narrow retrieval.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 unknown `appId` or `sourceId`. Related: get `sourceId` from `ethora-sources-site-list-v2`; doc equivalent is `ethora-sources-docs-tags-update-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the source belongs to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                sourceId: z.string().min(1).describe("Id of the crawled site source to tag. Get it from `ethora-sources-site-list-v2`."),
                tags: z.array(z.string().min(1)).max(50).describe("The complete desired tag set for this source (replaces any existing tags). Up to 50 tags; pass `[]` to clear all."),
            },
        },
        async function ({ appId, sourceId, tags }) {
            const meta = getDefaultMeta("ethora-sources-site-tags-update-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await sourcesSiteTagsUpdateForAppV2(ctx.appId!, sourceId, tags)
                    : await sourcesSiteTagsUpdateV2(sourceId, tags)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function usersBatchCreateV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-users-batch-create-v2",
        {
            description: "Provision many Ethora users (1–100) in one asynchronous batch job — the bulk equivalent of `ethora-user-register`. Enqueues a background job (HTTP 202); the job reports per-user conflicts rather than failing the whole batch. Returns `{ jobId, statusUrl }`.\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`). Errors: 401/403 not in B2B mode; 422 `usersList` validation. Related: track with `ethora-wait-users-batch-job-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                bypassEmailConfirmation: z.boolean().optional().describe("If true, created users skip email verification and are immediately usable. If false/omitted, each user receives a verification link."),
                usersList: z.array(z.object({
                    email: z.string().email().describe("User's email address. Must be RFC-5322 valid."),
                    firstName: z.string().min(1).describe("User's first name, shown in their profile."),
                    lastName: z.string().min(1).describe("User's last name, shown in their profile."),
                    password: z.string().min(1).optional().describe("Optional initial password. If omitted, the server generates one / relies on the verification flow."),
                    uuid: z.string().min(1).optional().describe("Optional caller-supplied id to correlate this user with your own system in the job results."),
                })).min(1).max(100).describe("The users to create, 1–100 per batch."),
                timeoutMs: z.number().int().min(1000).max(600000).optional().describe("HTTP timeout for the job-creation request (not the job itself), in milliseconds. Default 30000."),
            },
        },
        async function ({ bypassEmailConfirmation, usersList, timeoutMs }) {
            const meta = getDefaultMeta("ethora-users-batch-create-v2")
            try {
                ensureB2BAuthForTool()
                const res = await usersBatchCreateV2({ bypassEmailConfirmation, usersList }, { timeoutMs: timeoutMs ?? 30_000 })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function usersBatchCreateJobV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-users-batch-job-v2",
        {
            description: "Fetch the current status and per-user results of a users batch job by `jobId` (one-shot, no polling). Returns the job object with its `state` (pending/running/completed/failed) and per-user outcomes.\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`) — must match the auth used to create the job. Errors: 401/403 not in B2B mode; 404 unknown `jobId`. Related: `ethora-wait-users-batch-job-v2` for a blocking wait.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                jobId: z.string().min(1).describe("Job id returned by `ethora-users-batch-create-v2`."),
                timeoutMs: z.number().int().min(500).max(60000).optional().describe("HTTP timeout for this status request, in milliseconds. Default 10000."),
            },
        },
        async function ({ jobId, timeoutMs }) {
            const meta = getDefaultMeta("ethora-users-batch-job-v2")
            try {
                ensureB2BAuthForTool()
                const res = await usersBatchCreateJobV2(jobId, { timeoutMs: timeoutMs ?? 10_000 })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function waitUsersBatchCreateJobV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-wait-users-batch-job-v2",
        {
            description: "Block until a users batch job reaches a terminal state (`completed` or `failed`) or `timeoutMs` — read-only polling wrapper around `ethora-users-batch-job-v2`. Returns `{ done, state, job }`, or `{ done: false, reason: \"timeout\" }` on timeout.\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`) — must match the auth used to create the job. Errors: 401/403 not in B2B mode; 404 unknown `jobId`.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                jobId: z.string().min(1).describe("Job id returned by `ethora-users-batch-create-v2`."),
                timeoutMs: z.number().int().min(1000).max(300000).optional().describe("Maximum time to wait, in milliseconds. Default 60000. Caps at 300000 (5 min)."),
                intervalMs: z.number().int().min(250).max(10000).optional().describe("Delay between status checks, in milliseconds. Default 1000."),
            },
        },
        async function ({ jobId, timeoutMs, intervalMs }) {
            const meta = getDefaultMeta("ethora-wait-users-batch-job-v2")
            try {
                ensureB2BAuthForTool()
                const timeout = timeoutMs ?? 60_000
                const interval = intervalMs ?? 1_000
                const started = Date.now()
                let last: any = null
                while (Date.now() - started < timeout) {
                    const res = await usersBatchCreateJobV2(jobId, { timeoutMs: 10_000 })
                    last = res.data
                    const state = String(last?.state || "")
                    if (state === "completed" || state === "failed") {
                        return asToolResult(ok({ done: true, state, job: last }, meta))
                    }
                    await sleep(interval)
                }
                return asToolResult(ok({ done: false, reason: "timeout", job: last }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function appTokensListV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-app-tokens-list-v2",
        {
            description: "List the app tokens issued for an app — metadata only (`tokenId`, label, created/rotated timestamps, status); the secret token values are never returned (only shown once at create/rotate time).\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`). Errors: 401/403 not in B2B mode; 400 no `appId` and none selected; 404 unknown `appId`.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to list tokens for. Optional — defaults to the app set via `ethora-app-select`."),
                timeoutMs: z.number().int().min(500).max(60000).optional().describe("HTTP timeout for this request, in milliseconds. Default 10000."),
            },
        },
        async function ({ appId, timeoutMs }) {
            const meta = getDefaultMeta("ethora-app-tokens-list-v2")
            try {
                ensureB2BAuthForTool()
                const effectiveAppId = String(appId || (getClientState() as any).currentAppId || "").trim()
                if (!effectiveAppId) throw new Error("appId is required (pass appId or call `ethora-app-select` first)")
                const res = await appTokensListV2(effectiveAppId, { timeoutMs: timeoutMs ?? 10_000 })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function appTokensCreateV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-app-tokens-create-v2",
        {
            description: "Mint a new app token for an app. The secret token value is returned exactly once and cannot be retrieved again — capture it immediately. Returns the new token including its one-time secret value and `tokenId`.\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`). Errors: 401/403 not in B2B mode; 400 no `appId` and none selected; 404 unknown `appId`. Related: manage with `ethora-app-tokens-list-v2` / `-rotate-v2` / `-revoke-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to mint the token for. Optional — defaults to the app set via `ethora-app-select`."),
                label: z.string().optional().describe("Human-readable label to identify this token later (e.g. `staging`, `ci`). Shown in `ethora-app-tokens-list-v2`."),
                timeoutMs: z.number().int().min(500).max(60000).optional().describe("HTTP timeout for this request, in milliseconds. Default 10000."),
            },
        },
        async function ({ appId, label, timeoutMs }) {
            const meta = getDefaultMeta("ethora-app-tokens-create-v2")
            try {
                ensureB2BAuthForTool()
                const effectiveAppId = String(appId || (getClientState() as any).currentAppId || "").trim()
                if (!effectiveAppId) throw new Error("appId is required (pass appId or call `ethora-app-select` first)")
                const res = await appTokensCreateV2(effectiveAppId, { label }, { timeoutMs: timeoutMs ?? 10_000 })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function appTokensRotateV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-app-tokens-rotate-v2",
        {
            description: "Rotate an app token: revoke an existing token and issue a replacement in one step. The old `tokenId` is revoked immediately — anything using it stops working at once. The new secret value is returned exactly once — capture it immediately.\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`). Errors: 401/403 not in B2B mode; 400 no `appId` and none selected; 404 unknown `appId` or `tokenId`. Related: `ethora-app-tokens-revoke-v2` to revoke without a replacement.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the token belongs to. Optional — defaults to the app set via `ethora-app-select`."),
                tokenId: z.string().min(1).describe("Id of the token to revoke and replace. Get it from `ethora-app-tokens-list-v2`."),
                label: z.string().optional().describe("Label for the replacement token. Omit to inherit the old token's label."),
                timeoutMs: z.number().int().min(500).max(60000).optional().describe("HTTP timeout for this request, in milliseconds. Default 10000."),
            },
        },
        async function ({ appId, tokenId, label, timeoutMs }) {
            const meta = getDefaultMeta("ethora-app-tokens-rotate-v2")
            try {
                ensureB2BAuthForTool()
                const effectiveAppId = String(appId || (getClientState() as any).currentAppId || "").trim()
                if (!effectiveAppId) throw new Error("appId is required (pass appId or call `ethora-app-select` first)")
                const res = await appTokensRotateV2(effectiveAppId, tokenId, { label }, { timeoutMs: timeoutMs ?? 10_000 })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function appTokensRevokeV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-app-tokens-revoke-v2",
        {
            description: "Permanently revoke an app token by `tokenId` — it stops working immediately; any client, SDK, or MCP session still using it gets auth failures. No replacement is issued.\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`). Errors: 401/403 not in B2B mode; 400 no `appId` and none selected; 404 unknown `appId`. Related: get `tokenId` from `ethora-app-tokens-list-v2`; `ethora-app-tokens-rotate-v2` for revoke-and-replace.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the token belongs to. Optional — defaults to the app set via `ethora-app-select`."),
                tokenId: z.string().min(1).describe("Id of the token to revoke. Get it from `ethora-app-tokens-list-v2`."),
                timeoutMs: z.number().int().min(500).max(60000).optional().describe("HTTP timeout for this request, in milliseconds. Default 10000."),
            },
        },
        async function ({ appId, tokenId, timeoutMs }) {
            const meta = getDefaultMeta("ethora-app-tokens-revoke-v2")
            try {
                ensureB2BAuthForTool()
                const effectiveAppId = String(appId || (getClientState() as any).currentAppId || "").trim()
                if (!effectiveAppId) throw new Error("appId is required (pass appId or call `ethora-app-select` first)")
                const res = await appTokensRevokeV2(effectiveAppId, tokenId, { timeoutMs: timeoutMs ?? 10_000 })
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function b2bAppProvisionTool(server: McpServer) {
    server.registerTool(
        "ethora-b2b-app-provision",
        {
            description: "One-call B2B orchestrator: create an app, mint one or more app tokens, provision default chat rooms, then configure and enable its AI bot. Later-step failures don't undo earlier steps. Returns a per-step log including `appId` and the created tokens (returned once — capture them).\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`). Errors: aborts with the partial step log if app creation fails; previous auth mode restored best-effort. Related: `ethora-b2b-app-bootstrap-ai` does sources+bot but not tokens/rooms.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                displayName: z.string().min(1).describe("Display name for the new app."),
                tokenLabels: z.array(z.string().min(1)).min(1).max(5).optional().describe("Labels for the app tokens to mint, one token per label. Default: ['default']. 1–5 tokens."),
                rooms: z.array(z.object({
                    title: z.string().min(1).describe("Display name of the room."),
                    pinned: z.boolean().optional().describe("If true, add the room to the app's default rooms (new users auto-join)."),
                })).max(20).optional().describe("Default chat rooms to create in the new app. Up to 20."),
                enableBot: z.boolean().optional().describe("If true, enable the new app's bot using the first minted app token."),
                savedAgentId: z.string().optional().describe("Optional id of an existing saved agent to bind as the new app's active bot, instead of setting prompt fields by hand."),
                botTrigger: z.enum(["any_message", "/bot"]).optional().describe("Bot trigger: `any_message` (every message) or `/bot` (only /bot-prefixed messages)."),
                botPrompt: z.string().optional().describe("System prompt for the new app's bot."),
                botGreetingMessage: z.string().optional().describe("Greeting message the bot posts when a conversation starts."),
                llmProvider: z.string().optional().describe("LLM provider for the bot, e.g. `openai` or `openai-compatible`. Must be enabled in your Ethora backend."),
                llmModel: z.string().optional().describe("LLM model id for the bot, e.g. `gpt-4o-mini`. Must be available for the chosen provider."),
            },
        },
        async function ({ displayName, tokenLabels, rooms, enableBot, savedAgentId, botTrigger, botPrompt, botGreetingMessage, llmProvider, llmModel }) {
            const meta = getDefaultMeta("ethora-b2b-app-provision")
            const prev = (getClientState() as any).authMode as any
            try {
                ensureB2BAuthForTool()

                const steps: any[] = []

                // 1) Create app (B2B)
                setAuthMode("b2b")
                const created = await appCreateV2(displayName)
                const app = created?.data?.app
                const appId = String(app?._id || app?.id || "").trim()
                if (!appId) throw new Error("Create app succeeded but no appId found in response")
                steps.push({ step: "appCreate", ok: true, appId })

                // 2) Create tokens (B2B)
                const labels = Array.isArray(tokenLabels) && tokenLabels.length ? tokenLabels : ["default"]
                const createdTokens: any[] = []
                for (const label of labels) {
                    const r = await appTokensCreateV2(appId, { label }, { timeoutMs: 10_000 })
                    createdTokens.push(r.data)
                }
                const primaryToken = String(createdTokens?.[0]?.token || "").trim()
                steps.push({ step: "appTokensCreate", ok: true, count: createdTokens.length })

                // 3) Provision rooms (B2B)
                let provisionRes: any = null
                if (Array.isArray(rooms) && rooms.length) {
                    const r = await appProvisionV2(appId, { rooms }, { timeoutMs: 60_000 })
                    provisionRes = r.data
                    steps.push({ step: "appProvisionRooms", ok: true, requested: rooms.length })
                }

                // 4) Configure bot (app-token using first created token)
                let botRes: any = null
                if (savedAgentId || enableBot || botTrigger || botPrompt || botGreetingMessage || llmProvider || llmModel) {
                    if (!primaryToken) throw new Error("Bot config requested but no app token was created")
                    selectApp({ appId, appToken: primaryToken, authMode: "app" })
                    setAuthMode("app")
                    if (savedAgentId) {
                        const activated = await agentsActivateV2(savedAgentId)
                        botRes = activated.data
                        steps.push({ step: "agentsActivateV2", ok: true, savedAgentId })
                    }
                    const payload: any = {}
                    if (enableBot) payload.status = "on"
                    if (botTrigger) payload.trigger = botTrigger
                    if (botPrompt) payload.prompt = botPrompt
                    if (botGreetingMessage) payload.greetingMessage = botGreetingMessage
                    if (llmProvider) payload.llmProvider = llmProvider
                    if (llmModel) payload.llmModel = llmModel
                    if (Object.keys(payload).length > 0) {
                        const r = await botUpdateV2(payload)
                        botRes = r.data
                        steps.push({ step: "botUpdateV2", ok: true })
                    }
                }

                return asToolResult(ok({
                    appId,
                    app,
                    tokens: createdTokens,
                    provision: provisionRes,
                    bot: botRes,
                    steps,
                    state: getClientState(),
                }, meta))
            } catch (error) {
                try { setAuthMode(prev) } catch (_) {}
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function sourcesSiteDeleteUrlV2AppTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-delete-url-v2",
        {
            description: "Remove a single crawled URL from an app's RAG sources, matched by its exact url string (app-token / B2B variant of `ethora-sources-site-delete-url`). Deletes the source record and its embeddings; not reversible. Matches on the exact stored URL string.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 `url` not a crawled source. Related: get the stored value from `ethora-sources-site-list-v2`; bulk-by-id is `ethora-sources-site-delete-url-v2-batch`.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the URL belongs to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                url: z.string().min(1).describe("Exact crawled URL string to remove (must match what was stored — get it from `ethora-sources-site-list-v2`)."),
            },
        },
        async function ({ appId, url }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await sourcesSiteDeleteUrlForAppV2(ctx.appId!, { url })
                    : await sourcesSiteDeleteUrlV2Single({ url })
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-site-delete-url-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-site-delete-url-v2")))
            }
        }
    )
}

function sourcesSiteDeleteUrlV2BatchAppTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-delete-url-v2-batch",
        {
            description: "Bulk-remove crawled website sources (1–100) from an app in one call, matched by their source record ids. Deletes each matching record and its embeddings; not reversible. Ids not present are skipped.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 unknown `appId`. Related: matches on source ids (not URL strings) — get them from `ethora-sources-site-list-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the sources belong to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                ids: z.array(z.string().min(1)).min(1).max(100).describe("Site source record ids to delete, 1–100 per call. Get them from `ethora-sources-site-list-v2`."),
            },
        },
        async function ({ appId, ids }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await sourcesSiteDeleteBatchForAppV2(ctx.appId!, { ids })
                    : await sourcesSiteDeleteUrlV2Batch({ urls: ids })
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-site-delete-url-v2-batch")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-site-delete-url-v2-batch")))
            }
        }
    )
}

function sourcesDocsUploadV2AppTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-docs-upload-v2",
        {
            description: "Upload documents (1–5; PDF, text, etc.) into an app's RAG sources (app-token / B2B variant of `ethora-sources-docs-upload`). Async — content becomes queryable once indexing finishes; files passed as base64, 50MB max each.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 unknown `appId`; 413 too large; 422 unsupported document type. Related: `ethora-sources-docs-list-v2`, `ethora-sources-docs-delete-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to ingest into. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                files: z.array(z.object({
                    name: z.string().min(1).describe("Document file name including extension, e.g. `handbook.pdf`."),
                    mimeType: z.string().min(1).describe("MIME type, e.g. `application/pdf`, `text/plain`, `text/markdown`."),
                    base64: z.string().min(1).describe("Document content, base64-encoded. A `data:...;base64,` prefix is accepted. Max 50MB decoded per file."),
                })).min(1).max(5).describe("1 to 5 documents to ingest in this call."),
            },
        },
        async function ({ appId, files }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const form = new FormData()
                for (const f of files) {
                    const buf = normalizeBase64ToBuffer(f.base64)
                    if (buf.length > 50 * 1024 * 1024) {
                        throw new Error(`File '${f.name}' exceeds 50MB limit`)
                    }
                    const blob = new Blob([buf], { type: f.mimeType })
                    form.append("files", blob, f.name)
                }
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await sourcesDocsUploadForAppV2(ctx.appId!, form, { "Content-Type": "multipart/form-data" })
                    : await sourcesDocsUploadV2(form, { "Content-Type": "multipart/form-data" })
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-docs-upload-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-docs-upload-v2")))
            }
        }
    )
}

function sourcesDocsDeleteV2AppTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-docs-delete-v2",
        {
            description: "Remove a previously ingested document from an app's RAG sources by `docId` (app-token / B2B variant of `ethora-sources-docs-delete`). Deletes the document record and its embeddings; not reversible.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 unknown `appId` or `docId`. Related: get `docId` from `ethora-sources-docs-list-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the document belongs to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                docId: z.string().min(1).describe("Id of the ingested document to delete. Get it from `ethora-sources-docs-list-v2`."),
            },
        },
        async function ({ appId, docId }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await sourcesDocsDeleteForAppV2(ctx.appId!, docId)
                    : await sourcesDocsDeleteV2(docId)
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-docs-delete-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-docs-delete-v2")))
            }
        }
    )
}

function sourcesDocsListV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-sources-docs-list-v2",
        {
            description: "List an app's ingested documents, including each document's id, name, and current RAG tags. Their ids feed `ethora-sources-docs-tags-update-v2` and `ethora-sources-docs-delete-v2`.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 unknown `appId`; empty list if nothing has been uploaded. Related: website-sources equivalent is `ethora-sources-site-list-v2`.",
            annotations: { readOnlyHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to list documents for. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
            },
        },
        async function ({ appId }) {
            const meta = getDefaultMeta("ethora-sources-docs-list-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await sourcesDocsListForAppV2(ctx.appId!)
                    : await sourcesDocsListV2()
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

function sourcesDocsTagsUpdateV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-sources-docs-tags-update-v2",
        {
            description: "Set the RAG retrieval tags on an ingested document — replaces the document's tag set with the provided `tags` array (not additive; pass `[]` to clear all). Tags let the bot's `ragTags` narrow retrieval.\nAuth: app-token mode OR B2B mode with an explicit `appId`. Errors: 401/403 wrong auth; 404 unknown `appId` or `docId`. Related: get `docId` from `ethora-sources-docs-list-v2`; website-source equivalent is `ethora-sources-site-tags-update-v2`.",
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the document belongs to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                docId: z.string().min(1).describe("Id of the ingested document to tag. Get it from `ethora-sources-docs-list-v2`."),
                tags: z.array(z.string().min(1)).max(50).describe("The complete desired tag set for this document (replaces any existing tags). Up to 50 tags; pass `[]` to clear all."),
            },
        },
        async function ({ appId, docId, tags }) {
            const meta = getDefaultMeta("ethora-sources-docs-tags-update-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = (ctx.mode !== "app" && ctx.appId)
                    ? await sourcesDocsTagsUpdateForAppV2(ctx.appId!, docId, tags)
                    : await sourcesDocsTagsUpdateV2(docId, tags)
                return asToolResult(ok(res.data, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

// Bind an agent as the app's active widget bot. Preferred path (user or B2B
// session): find the agent's BotInstance for this app (created by
// `ethora-agent-invite-to-chat`) and set App.defaultBotInstanceId + botStatus
// through the app update route, which is what the admin "Active agent for AI
// Widget" dropdown does. Fallback: the app-token-only /v2/agents/:id/activate
// route with the stored appToken (that route refuses agents it does not own
// with AGENT_PRIVATE, so it only helps for public/unlisted agents).
async function activateAgentForApp(agentId: string, chatJid: string | undefined, appIdArg: string | undefined) {
    const state = getClientState() as any
    const appId = String(appIdArg || state.currentAppId || "").trim()
    if (!appId) throw new Error("No app selected. Pass `appId` or call `ethora-app-select` first.")
    const id = String(agentId || "").trim()
    let userPathError: any = null
    if (state.authMode !== "app") {
        try {
            const list = await botInstancesListV2({ appId, agentId: id })
            const d: any = list.data || {}
            const items: any[] = Array.isArray(d) ? d : (d.items || d.botInstances || d.results || d.data?.items || [])
            const match = items.find((bi: any) => String(bi.agentId || bi.agent?._id || bi.agent?.id || "") === id && (!bi.appId || String(bi.appId) === appId)) || items.find((bi: any) => String(bi.agentId || "") === id) || (items.length === 1 ? items[0] : null)
            if (!match) {
                throw new Error(`No bot instance of agent ${id} exists in app ${appId} yet. Call \`ethora-agent-invite-to-chat { agentIdOrAddress: "${id}", chatJid: "${chatJid || "<ROOM_JID>"}" }\` first, then retry.`)
            }
            const botInstanceId = String(match._id || match.id)
            const upd = await appUpdate(appId, { defaultBotInstanceId: botInstanceId, botStatus: "on" })
            selectAgent({ agentId: id })
            return { method: "app-update", appId, agentId: id, defaultBotInstanceId: botInstanceId, botInstanceStatus: match.status, appUpdate: upd.data }
        } catch (e: any) {
            userPathError = e
            if (!appTokenFor(appId)) throw e
        }
    }
    if (!appTokenFor(appId)) {
        throw new Error(`No appToken stored for app ${appId}. Call \`ethora-app-select { appId: "${appId}", appToken: "<appToken>" }\` (the appToken is in the \`ethora-app-create\` result or the admin UI) and retry.`)
    }
    try {
        const res = await agentsActivateV2(id, { chatJid, appId })
        selectAgent({ agentId: id })
        return { method: "activate-route", appId, agentId: id, ...(res.data || {}) }
    } catch (e) {
        throw userPathError || e
    }
}

// ----------------------------------------------------------------------------
// AI chat widget embed
// ----------------------------------------------------------------------------
function widgetTools(server: McpServer) {
    server.registerTool(
        "ethora-widget-embed-snippet",
        {
            description: "Generate the <script> tag that embeds the Ethora AI chat widget (the floating launcher + chat panel that website visitors use) for an app, plus the prerequisites that must hold before it answers. No API call; pure generator using this deployment's hosted widget URL and public API base. The widget answers with the app's ACTIVE bot: for API-created apps run `ethora-agents-create-v2` -> `ethora-agent-invite-to-chat` -> `ethora-agents-activate-v2 { agentId, chatJid }` first, otherwise `POST /v2/widget/sessions` returns 422 and the widget stays silent.\nAuth: none required (uses the selected app when `appId` is omitted). Errors: effectively none; when no hosted widget is configured the snippet carries a `<WIDGET_URL>` placeholder. Related: `ethora-agents-activate-v2`, `ethora-bot-widget-v2` (legacy per-app bot only).",
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            inputSchema: {
                appId: z.string().optional().describe("App the widget belongs to (24-char hex). Defaults to the app from `ethora-app-select`."),
                botName: z.string().optional().describe("Display name shown in the widget header (`data-bot-name`), e.g. the agent's name."),
                botAvatar: z.string().optional().describe("Avatar image URL shown for the bot (`data-bot-avatar`)."),
                botId: z.string().optional().describe("Legacy `data-bot-id` (bot XMPP address); only for old embeds. Prefer `appId`: the backend picks the active agent from the app."),
                primaryColor: z.string().optional().describe("Brand colour for launcher and bubbles (`data-primary-color`), e.g. `#0052CC`."),
                locale: z.string().optional().describe("UI locale (`data-locale`), e.g. `en`, `fr`, `es`."),
                greeting: z.string().optional().describe("Greeting shown when the panel opens (`data-greeting-message`)."),
                position: z.enum(["right", "left"]).optional().describe("Launcher corner (`data-position`)."),
                apiBase: z.string().optional().describe("Override the public API base (`data-api-base`). Defaults to this deployment's public API URL."),
                widgetUrl: z.string().optional().describe("Override the widget bundle base URL (the script is `<widgetUrl>/assistant.js`)."),
            },
        },
        async function ({ appId, botName, botAvatar, botId, primaryColor, locale, greeting, position, apiBase, widgetUrl }) {
            const meta = getDefaultMeta("ethora-widget-embed-snippet")
            try {
                const state = getClientState() as any
                const targetAppId = String(appId || state.currentAppId || "").trim()
                const base = String(widgetUrl || appConfig.widgetUrl || "").trim().replace(/\/+$/, "")
                const api = String(apiBase || appConfig.publicApiUrl || "").trim().replace(/\/+$/, "")
                const scriptSrc = base ? `${base}/assistant.js` : "<WIDGET_URL>/assistant.js"
                const attributes: Record<string, string> = {}
                attributes["data-app-id"] = targetAppId || "<APP_ID>"
                if (api) attributes["data-api-base"] = api
                if (botId) attributes["data-bot-id"] = String(botId)
                if (botName) attributes["data-bot-name"] = String(botName)
                if (botAvatar) attributes["data-bot-avatar"] = String(botAvatar)
                if (primaryColor) attributes["data-primary-color"] = String(primaryColor)
                if (locale) attributes["data-locale"] = String(locale)
                if (greeting) attributes["data-greeting-message"] = String(greeting)
                if (position) attributes["data-position"] = String(position)
                const esc = (v: string) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
                const attrText = Object.entries(attributes).map(([k, v]) => `${k}="${esc(v)}"`).join("\n  ")
                const snippet = `<script id="chat-content-assistant" src="${esc(scriptSrc)}"\n  ${attrText}\n  defer></script>`
                const prerequisites = [
                    "The app must have an ACTIVE bot: on API-created apps run `ethora-agents-create-v2`, invite the agent into a room with `ethora-agent-invite-to-chat`, then `ethora-agents-activate-v2 { agentId, chatJid }` (sets App.defaultBotInstanceId). Dashboard-created apps may already have one (AI Widget tab). Without it the widget's `POST /v2/widget/sessions` returns 422 `App has no AI bot configured`.",
                    "The agent's bot instance must be on (`ethora-bot-instances-list` shows status=on) and the deployment's ai-service must be running.",
                    "`data-api-base` must be the API URL browsers can reach (this deployment: " + (api || "<not configured; set ETHORA_MCP_PUBLIC_API_URL or pass apiBase>") + "); the API allows cross-origin requests from any website by default.",
                    "The `<script>` tag must keep id=\"chat-content-assistant\": the bundle locates its own tag by that id to read the data-* attributes.",
                    "Widget sessions are rate limited per visitor IP (RATE_LIMIT_WIDGET_SESSION_MAX); each visitor gets a private room that persists in their browser storage.",
                ]
                const notes = [
                    base ? `Bundle: ${scriptSrc}` : "No hosted widget is configured on this MCP deployment (ETHORA_MCP_WIDGET_URL empty); replace <WIDGET_URL> with your widget host, or use the admin UI's AI Widget tab which bundles the widget with the web app.",
                    "Test: paste the snippet into any HTML page, open it, click the launcher and send a message; the active agent should reply within a few seconds. Optional attributes: data-title, data-greeting-title, data-secondary-color, data-launcher-icon, data-launcher-size, data-width, data-height, data-font-size, data-google-font, data-hide-system-messages, data-disable-media, data-start-fullscreen.",
                    "Cosmetic attributes can also be overridden per page via URL query `?ethora-<attr>=...`; appId and apiBase cannot.",
                    "Docs: https://github.com/dappros/ethora-mcp-server#readme (Widget embed) and https://github.com/dappros/ethora-ai-chat-widget#readme",
                ]
                return asToolResult(ok({ appId: targetAppId || null, snippet, attributes, prerequisites, notes }, meta))
            } catch (error) {
                return asToolResult(fail(error, meta))
            }
        }
    )
}

export function registerTools(server: McpServer) {
    configureTool(server);
    statusTool(server);
    helpTool(server);
    runRecipeTool(server);
    doctorTool(server);
    authUseAppTool(server);
    authUseUserTool(server);
    authUseB2BTool(server);
    appSelectTool(server);
    chatsBroadcastTool(server);
    chatsBroadcastJobTool(server);
    waitBroadcastJobTool(server);
    filesUploadV2Tool(server);
    filesGetV2Tool(server);
    filesDeleteV2Tool(server);
    sourcesDocsUploadTool(server);
    sourcesDocsDeleteTool(server);
    sourcesSiteCrawlV2AppTool(server);
    sourcesSiteReindexV2AppTool(server);
    sourcesSiteCrawlV2WaitTool(server);
    sourcesSiteReindexV2WaitTool(server);
    sourcesSiteListV2Tool(server);
    sourcesSiteTagsUpdateV2Tool(server);
    sourcesSiteDeleteUrlV2AppTool(server);
    sourcesDocsUploadV2AppTool(server);
    sourcesDocsListV2Tool(server);
    sourcesDocsTagsUpdateV2Tool(server);
    sourcesDocsDeleteV2AppTool(server);
    usersBatchCreateV2Tool(server);
    usersBatchCreateJobV2Tool(server);
    waitUsersBatchCreateJobV2Tool(server);
    appTokensListV2Tool(server);
    appTokensCreateV2Tool(server);
    appTokensRotateV2Tool(server);
    appTokensRevokeV2Tool(server);
    b2bAppProvisionTool(server);
    userLoginWithEmailTool(server);
    userRegisterWithEmailTool(server);
    apiKeyTools(server);
    widgetTools(server);
    appListTool(server);
    appCreateTool(server);
    appUpdateTool(server);
    appGetDefaultRoomsTool(server);
    craeteAppChatTool(server);
    appDeleteChatTool(server);
    getDefaultRoomsWithAppIdTool(server);
    walletGetBalanceTool(server);
    if (isDangerousToolsEnabled()) {
        // Destructive tools are deny-by-default. Enable only when explicitly allowed.
        appDeleteTool(server);
        walletERC20TransferTool(server);
        // Bulk deletes
        sourcesSiteDeleteUrlV2BatchAppTool(server);
        // Agent delete (removes saved Agent + its BotInstances)
        agentsDeleteV2Tool(server);
    }
    b2bAppCreateTool(server);
    b2bBotEnableTool(server);
    botGetV2Tool(server);
    botUpdateV2Tool(server);
    botEnableV2Tool(server);
    botDisableV2Tool(server);
    botWidgetGetV2Tool(server);
    agentsListV2Tool(server);
    agentsGetV2Tool(server);
    agentsCreateV2Tool(server);
    agentsUpdateV2Tool(server);
    agentsCloneV2Tool(server);
    agentsActivateV2Tool(server);
    // Phase 1 (Agents) additions: visibility, soul.md, invite-to-chat, BotInstance lifecycle.
    agentSetVisibilityTool(server);
    agentInviteToChatTool(server);
    agentSoulAppendTool(server);
    agentSoulSetTool(server);
    botInstancesListTool(server);
    botInstanceStatusTool(server);
    // 2607 API parity: agents full lifecycle + app-scoped chat reads + bundles.
    agentsExportV2Tool(server);
    agentsImportV2Tool(server);
    agentBotInstanceDiagTool(server);
    agentBotInstanceTestMessageTool(server);
    agentBotInstanceLeaveChatTool(server);
    messagesSearchV2Tool(server);
    messagesContextV2Tool(server);
    unreadCountsV2Tool(server);
    appExportV2Tool(server);
    appImportV2Tool(server);
    chatsMessageCreateV2Tool(server);
    chatsHistoryGetV2Tool(server);
    if (isAliasesEnabled()) {
        // Back-compat alias tools are off-by-default to keep the tool surface lean.
        // The canonical tools (ethora-chats-message-v2 / -history-v2, ethora-b2b-* ,
        // ethora-auth-use-b2b, ethora-wait-broadcast-job-v2) cover the same ground.
        // Enable with ETHORA_MCP_ENABLE_ALIASES=true.
        botMessageCreateV2Tool(server);
        botHistoryGetV2Tool(server);
        b2bAliases(server);
    }
    b2bAppBootstrapAiTool(server);
    generateChatComponentAppTsxTool(server);
    generateEnvExamplesTool(server);
    generateB2BBootstrapRunbookTool(server);
}
