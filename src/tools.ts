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
    sourcesSiteCrawl,
    sourcesSiteCrawlForAppV2,
    sourcesSiteCrawlV2,
    sourcesSiteDeleteBatchForAppV2,
    sourcesSiteDeleteUrl,
    sourcesSiteDeleteUrlForAppV2,
    sourcesSiteDeleteUrlV2,
    sourcesSiteDeleteUrlV2Batch,
    sourcesSiteDeleteUrlV2Single,
    sourcesSiteListForAppV2,
    sourcesSiteListV2,
    sourcesSiteReindex,
    sourcesSiteReindexForAppV2,
    sourcesSiteReindexV2,
    sourcesSiteTagsUpdateForAppV2,
    sourcesSiteTagsUpdateV2,
    userLogin,
    userRegistration,
    usersBatchCreateJobV2,
    usersBatchCreateV2,
    walletERC20Transfer,
    walletGetBalance,
} from "./apiClientEthora.js"
import { fail, ok } from "./mcpResponse.js"

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

    throw new Error("This tool requires app-token auth or B2B auth. Use `ethora-auth-use-app` for app-token flows or `ethora-auth-use-b2b` for explicit appId flows.")
}

function configureTool(server: McpServer) {
    server.registerTool(
        "ethora-configure",
        {
            description: "Configure Ethora API URL plus user-auth bootstrap and B2B/app credentials for this MCP session (in-memory).",
            inputSchema: {
                apiUrl: z.string().optional().describe("Ethora API URL (e.g. https://api.ethora.com/v1 or http://localhost:8080/v1)"),
                appJwt: z.string().optional().describe("Ethora App JWT used only for login/register bootstrap in user-auth mode."),
                appToken: z.string().optional().describe("Optional per-app appToken for broadcast, sources, and bot flows."),
                b2bToken: z.string().optional().describe("Ethora B2B token for x-custom-token auth (type=server)."),
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
            description: "Show current Ethora MCP client state, including the active auth mode and which credentials are present.",
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
            description: "Task-oriented help: explains the main Ethora auth modes and recommends next tool calls based on current state.",
            inputSchema: {
                goal: z.enum(["auto", "b2b-bootstrap-ai", "broadcast", "sources-ingest", "files-upload", "bot-manage", "chat-test", "user-login"]).optional()
                    .describe("Optional goal hint to tailor recommendations. Defaults to auto."),
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
                    if (!checks.hasCurrentAppId || !checks.hasAppToken) {
                        nextCalls.push({
                            tool: "ethora-app-select",
                            args: { appId: "<APP_ID>", appToken: "JWT <APP_TOKEN>" },
                            why: "App-scoped automation needs a selected app context plus appToken.",
                        })
                    }
                    if (state.authMode !== "app") {
                        nextCalls.push({ tool: "ethora-auth-use-app", why: "Switch from tenant-actor/B2B mode into app-token mode for app-scoped operations." })
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
                        nextCalls.push({
                            tool: "ethora-bot-get-v2",
                            why: "Inspect current bot status, prompt, widget state, and runtime LLM settings.",
                        })

                        recipes.push({
                            id: "bot-enable-and-tune",
                            title: "Enable bot + tune settings (v2)",
                            description: "Enable a bot for an app and update its prompt/greeting.",
                            steps: [
                                { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "JWT <APP_TOKEN>" } },
                                { tool: "ethora-auth-use-app" },
                                { tool: "ethora-bot-enable-v2", args: {} },
                                { tool: "ethora-bot-update-v2", args: { trigger: "/bot", prompt: "You are a helpful assistant.", greetingMessage: "Hello! Ask me anything.", llmProvider: "openai", llmModel: "gpt-4o-mini" } },
                            ],
                        })
                    }

                    if (effectiveGoal === "chat-test") {
                        nextCalls.push(
                            {
                                tool: "ethora-chats-message-v2",
                                args: { text: "Summarize the indexed FAQ in 3 bullets.", mode: "private", nickname: "SDK Tester" },
                                why: "Send a private automation/test message through the primary /v2/chats surface.",
                            },
                            {
                                tool: "ethora-chats-history-v2",
                                args: { mode: "private", nickname: "SDK Tester", limit: 10 },
                                why: "Read the saved automation/test history back after sending a message.",
                            }
                        )

                        recipes.push(
                            {
                                id: "chat-test-private",
                                title: "Test bot via private chat automation",
                                description: "Send a private test message and then read back the saved conversation history.",
                                steps: [
                                    { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "JWT <APP_TOKEN>" } },
                                    { tool: "ethora-auth-use-app" },
                                    { tool: "ethora-chats-message-v2", args: { text: "Summarize the indexed FAQ in 3 bullets.", mode: "private", nickname: "SDK Tester" } },
                                    { tool: "ethora-chats-history-v2", args: { mode: "private", nickname: "SDK Tester", limit: 10 } },
                                ],
                            },
                            {
                                id: "chat-test-group",
                                title: "Test bot via group-room automation",
                                description: "Send a test message into a room-style conversation and then fetch the resulting history.",
                                steps: [
                                    { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "JWT <APP_TOKEN>" } },
                                    { tool: "ethora-auth-use-app" },
                                    { tool: "ethora-chats-message-v2", args: { text: "What sources are currently indexed for this app?", mode: "group", roomJid: "<ROOM_JID>" } },
                                    { tool: "ethora-chats-history-v2", args: { mode: "group", roomJid: "<ROOM_JID>", limit: 10 } },
                                ],
                            },
                            {
                                id: "widget-config-v2",
                                title: "Fetch widget config",
                                description: "Read the widget/embed config and public widget metadata for the selected app.",
                                steps: [
                                    { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "JWT <APP_TOKEN>" } },
                                    { tool: "ethora-auth-use-app" },
                                    { tool: "ethora-bot-widget-v2", args: {} },
                                ],
                            }
                        )
                    }
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
                            args: { email: "user@example.com", password: "<password>" },
                            why: "You are in user auth mode but no user token is present.",
                        })
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
            ensureAppAuthForTool()
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
            ensureAppAuthForTool()
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
            ensureAppAuthForTool()
            const { url, followLink, knowledgeScope, savedAgentId } = args || {}
            const res = await sourcesSiteCrawlV2({ url: String(url || ""), followLink, knowledgeScope, savedAgentId })
            return res.data
        }
        case "ethora-sources-docs-upload-v2": {
            ensureAppAuthForTool()
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
            const res = await sourcesDocsUploadV2(form, { "Content-Type": "multipart/form-data" })
            return res.data
        }
        case "ethora-agents-list-v2": {
            ensureAppAuthForTool()
            const res = await agentsListV2()
            return res.data
        }
        case "ethora-agents-get-v2": {
            ensureAppAuthForTool()
            const { agentId } = args || {}
            const res = await agentsGetV2(String(agentId || ""))
            return res.data
        }
        case "ethora-agents-create-v2": {
            ensureAppAuthForTool()
            const res = await agentsCreateV2(args as any)
            return res.data
        }
        case "ethora-agents-update-v2": {
            ensureAppAuthForTool()
            const { agentId, ...payload } = args || {}
            const res = await agentsUpdateV2(String(agentId || ""), payload as any)
            return res.data
        }
        case "ethora-agents-clone-v2": {
            ensureAppAuthForTool()
            const { agentId, ...payload } = args || {}
            const res = await agentsCloneV2(String(agentId || ""), payload as any)
            return res.data
        }
        case "ethora-agents-activate-v2": {
            ensureAppAuthForTool()
            const { agentId } = args || {}
            const res = await agentsActivateV2(String(agentId || ""))
            return res.data
        }
        case "ethora-bot-enable-v2": {
            ensureAppAuthForTool()
            const { trigger } = args || {}
            const res = await botUpdateV2({ status: "on", trigger } as any)
            return res.data
        }
        case "ethora-bot-update-v2": {
            ensureAppAuthForTool()
            const res = await botUpdateV2(args as any)
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
            description: "Execute a built-in ethora-help recipe by id (sequential steps, no shell, no file writes).",
            inputSchema: {
                recipeId: z.string().min(1).optional().describe("Recipe id. If omitted, lists runnable recipes for the selected goal."),
                goal: z.enum(["auto", "b2b-bootstrap-ai", "broadcast", "sources-ingest", "files-upload", "bot-manage", "chat-test", "user-login"]).optional()
                    .describe("Optional goal scope to look up recipes; defaults to auto."),
                vars: z.record(z.any()).optional().describe("Variables to substitute (appId, appToken, b2bToken, appJwt, email, password, apiUrl, etc)."),
                dryRun: z.boolean().optional().describe("If true, only returns resolved steps without executing."),
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
                                id: "widget-config-v2",
                                title: "Fetch widget config",
                                description: "Read the widget/embed config and public widget metadata for the selected app.",
                                requiredVars: ["appId", "appToken"],
                                steps: [
                                    { tool: "ethora-app-select", args: { appId: "<APP_ID>", appToken: "<APP_TOKEN>" } },
                                    { tool: "ethora-auth-use-app" },
                                    { tool: "ethora-bot-widget-v2", args: {} },
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
            description: "Validate configuration and connectivity for both local user-auth and server-side B2B flows (pings /v1/ping via the configured API URL).",
            inputSchema: {
                timeoutMs: z.number().int().min(500).max(20000).optional().describe("HTTP timeout for the ping request"),
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
            description: "Switch auth mode to app-token (B2B) for subsequent API calls (requires appToken to be configured).",
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
            description: "Switch auth mode to user session for subsequent API calls (requires `ethora-user-login`).",
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
            description: "Switch auth mode to B2B (x-custom-token) for subsequent API calls (requires b2bToken).",
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
            description: "Select the current app context and optionally configure appToken. Many app-scoped tools can omit appId after this.",
            inputSchema: {
                appId: z.string().describe("Ethora appId to set as current context"),
                appToken: z.string().optional().describe("Optional per-app appToken. If provided, auth mode defaults to app-token."),
                authMode: z.enum(["app", "user", "b2b"]).optional().describe("Optional auth mode to keep after selecting the app context."),
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
            description: "Select current saved agent context for this MCP session.",
            inputSchema: {
                agentId: z.string().min(1),
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
            description: "Enqueue a v2 broadcast job for an app using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                // backend supports targeting by allRooms OR chatIds/chatNames
                text: z.string().min(1).describe("Message text to broadcast"),
                allRooms: z.boolean().optional().describe("If true, broadcast to all rooms in the app"),
                chatIds: z.array(z.string()).optional().describe("Optional list of chatIds to target"),
                chatNames: z.array(z.string()).optional().describe("Optional list of chat JIDs/localparts to target"),
            },
        },
        async function ({ appId, text, allRooms, chatIds, chatNames }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const payload: any = { text }
                if (typeof allRooms === "boolean") payload.allRooms = allRooms
                if (chatIds?.length) payload.chatIds = chatIds
                if (chatNames?.length) payload.chatNames = chatNames

                const res = ctx.mode === "b2b"
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
            description: "Fetch v2 broadcast job status/results using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                jobId: z.string().describe("Broadcast job id"),
            },
        },
        async function ({ appId, jobId }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "Poll broadcast job status until completed/failed using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                jobId: z.string().min(1),
                timeoutMs: z.number().int().min(1000).max(300000).optional().describe("Max wait time (default 60000)"),
                intervalMs: z.number().int().min(250).max(10000).optional().describe("Poll interval (default 1000)"),
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
                    const res = ctx.mode === "b2b"
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
            description: "Upload files via POST /v2/files (requires user auth). Input is base64 to avoid local filesystem access.",
            inputSchema: {
                files: z.array(z.object({
                    name: z.string().min(1),
                    mimeType: z.string().min(1),
                    base64: z.string().min(1).describe("Base64 content (may include data:...;base64, prefix)"),
                })).min(1).max(5),
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
            description: "List files or get file by id via GET /v2/files (requires user auth).",
            inputSchema: {
                id: z.string().optional().describe("Optional file id"),
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
            description: "Delete file by id via DELETE /v2/files/:id (requires user auth).",
            inputSchema: { id: z.string().min(1) },
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

function sourcesSiteCrawlTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-crawl",
        {
            description: "Crawl a site URL and ingest into Sources (requires user auth).",
            inputSchema: {
                appId: z.string().optional().describe("Defaults to current app if selected"),
                url: z.string().min(1),
                followLink: z.boolean().default(false),
            },
        },
        async function ({ appId, url, followLink }) {
            try {
                ensureUserAuthForTool()
                const effectiveAppId = appId || requireCurrentAppId()
                const res = await sourcesSiteCrawl(effectiveAppId, url, Boolean(followLink))
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-site-crawl")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-site-crawl")))
            }
        }
    )
}

function sourcesSiteReindexTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-reindex",
        {
            description: "Reindex a crawled URL by urlId (requires user auth).",
            inputSchema: {
                appId: z.string().optional().describe("Defaults to current app if selected"),
                urlId: z.string().min(1),
            },
        },
        async function ({ appId, urlId }) {
            try {
                ensureUserAuthForTool()
                const effectiveAppId = appId || requireCurrentAppId()
                const res = await sourcesSiteReindex(effectiveAppId, urlId)
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-site-reindex")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-site-reindex")))
            }
        }
    )
}

function sourcesSiteDeleteUrlTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-delete-url",
        {
            description: "Delete a crawled site URL by exact url string (requires user auth).",
            inputSchema: {
                appId: z.string().optional().describe("Defaults to current app if selected"),
                url: z.string().min(1),
            },
        },
        async function ({ appId, url }) {
            try {
                ensureUserAuthForTool()
                const effectiveAppId = appId || requireCurrentAppId()
                const res = await sourcesSiteDeleteUrl(effectiveAppId, url)
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-site-delete-url")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-site-delete-url")))
            }
        }
    )
}

function sourcesSiteDeleteUrlV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-delete-records-v1",
        {
            description: "Legacy owner/admin flow: delete multiple crawled source records through the pre-v2 user-auth route.",
            inputSchema: {
                appId: z.string().optional().describe("Defaults to current app if selected"),
                urls: z.array(z.string().min(1)).min(1).max(100),
            },
        },
        async function ({ appId, urls }) {
            try {
                ensureUserAuthForTool()
                const effectiveAppId = appId || requireCurrentAppId()
                const res = await sourcesSiteDeleteUrlV2(effectiveAppId, urls)
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-site-delete-records-v1")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-site-delete-records-v1")))
            }
        }
    )
}

function sourcesDocsUploadTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-docs-upload",
        {
            description: "Upload docs for ingestion (requires user auth). Input is base64 to avoid local filesystem access.",
            inputSchema: {
                appId: z.string().optional().describe("Defaults to current app if selected"),
                files: z.array(z.object({
                    name: z.string().min(1),
                    mimeType: z.string().min(1),
                    base64: z.string().min(1),
                })).min(1).max(5),
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
            description: "Delete an ingested doc by docId (requires user auth).",
            inputSchema: {
                appId: z.string().optional().describe("Defaults to current app if selected"),
                docId: z.string().min(1),
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
            description: 'Login to Ethora with email and password',
            inputSchema: { email: z.string().email().describe("email for login"), password: z.string().describe("password for login") }
        },
        async function ({ email, password }) {
            try {
                let result = await userLogin(email, password)
                return asToolResult(ok(result.data, getDefaultMeta("ethora-user-login")))
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
            description: 'Ethora registration with email (required), firstName (required), lastName (required)',
            inputSchema: { email: z.string().email(), firstName: z.string(), lastName: z.string() }
        },
        async function ({ email, firstName, lastName }) {
            try {
                await userRegistration(email, firstName, lastName)
            } catch (error) {
                if (error && typeof error === 'object' && 'response' in error) {
                    const axiosError = error as any;
                    if (axiosError.response?.status === 422) {
                        const errorData = axiosError.response.data;

                        return asToolResult(fail(new Error(String(errorData.error || "VALIDATION_ERROR")), getDefaultMeta("ethora-user-register")))
                    }

                } else {
                    return asToolResult(fail(error, getDefaultMeta("ethora-user-register")))
                }
            }

            return asToolResult(ok({ message: "Operation successful. Please follow the link in your email to complete the registration." }, getDefaultMeta("ethora-user-register")))
        }
    )
}

function appListTool(server: McpServer) {
    server.registerTool(
        'ethora-app-list',
        {
            description: 'List application, user should login first',
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
            description: 'Create a new app for the logged-in user.',
            inputSchema: { displayName: z.string().describe("display name for app") }
        },
        async function ({ displayName }) {
            try {
                let result = await appCreateV2(displayName)
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
            description: 'Delete an app by appId for the logged-in user',
            inputSchema: { appId: z.string().describe("appId for app") }
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
            description: 'Updates the application fields for the logged-in user who has created the app.',
            inputSchema: { 
                appId: z.string().optional().describe("appId for app (defaults to current app if selected)"),
                displayName: z.string().optional().describe("displayName of the application"),
                domainName: z.string().optional().describe("If the domainName is set to 'abcd', your web application will be available at abcd.ethora.com."),
                appDescription: z.string().optional().describe("Set the application description"),
                primaryColor: z.string().optional().describe("Set thie color of the application in #F54927 format"),
                botStatus: z.enum(["on", "off"]).optional().describe("Set the bot status to on or off, if on bot is enabled")
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
            description: 'Get the default rooms for Ethora application',
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
            description: 'Get the default rooms for the application by appId. You should have read access to the application.',
            inputSchema: {
                appId: z.string().optional().describe("appId for app (defaults to current app if selected)"),
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
            description: 'Create a new chat for the logged-in user who has created the app.',
            inputSchema: {
                appId: z.string().optional().describe("appId for app (defaults to current app if selected)"),
                title: z.string().describe("title for chat"),
                pinned: z.boolean().describe("pinned for chat"),
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
            description: 'Delete a chat for the logged-in user who has created the app.',
            inputSchema: {
                appId: z.string().optional().describe("appId for app (defaults to current app if selected)"),
                chatJid: z.string().describe("title for chat"),
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
            description: 'Retrieve the cryptocurrency wallet balance of the authenticated user'
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
            description: 'Transfer ERC20 tokens to another wallet',
            inputSchema: {
                toWallet: z.string().describe("to address for transfer"),
                amount: z.number().describe("amount for transfer"),
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
            description: "Create a new app using B2B auth (x-custom-token).",
            inputSchema: {
                displayName: z.string().min(1),
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
            description: "Enable AI bot for an app (B2B auth). This triggers backend best-effort activation against configured AI service.",
            inputSchema: {
                appId: z.string().optional().describe("Defaults to current app if selected"),
                botTrigger: z.string().optional().describe("Optional bot trigger (example: '/bot' or 'any_message')"),
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
            description: "Get bot status/settings using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
            },
        },
        async function ({ appId }) {
            const meta = getDefaultMeta("ethora-bot-get-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "Update bot settings using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                status: z.enum(["on", "off"]).optional(),
                savedAgentId: z.string().optional(),
                trigger: z.enum(["any_message", "/bot"]).optional(),
                prompt: z.string().optional(),
                greetingMessage: z.string().optional(),
                chatId: z.string().optional(),
                isRAG: z.boolean().optional(),
                botFirstName: z.string().optional(),
                botLastName: z.string().optional(),
                botDisplayName: z.string().optional(),
                botAvatarUrl: z.string().optional(),
                ragTags: z.array(z.string().min(1)).optional(),
                llmProvider: z.string().optional(),
                llmModel: z.string().optional(),
                widgetPublicEnabled: z.boolean().optional(),
                widgetPublicUrl: z.string().optional(),
            },
        },
        async function ({ appId, ...payload }) {
            const meta = getDefaultMeta("ethora-bot-update-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "List reusable saved agents for the current app owner via GET /v2/agents (app-token auth).",
        },
        async function () {
            const meta = getDefaultMeta("ethora-agents-list-v2")
            try {
                ensureAppAuthForTool()
                const res = await agentsListV2()
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
            description: "Get one reusable saved agent via GET /v2/agents/:agentId (app-token auth).",
            inputSchema: {
                agentId: z.string().min(1),
            },
        },
        async function ({ agentId }) {
            const meta = getDefaultMeta("ethora-agents-get-v2")
            try {
                ensureAppAuthForTool()
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
            description: "Create a reusable saved agent via POST /v2/agents (app-token auth).",
            inputSchema: {
                name: z.string().optional(),
                slug: z.string().optional(),
                summary: z.string().optional(),
                prompt: z.string().optional(),
                greetingMessage: z.string().optional(),
                trigger: z.enum(["any_message", "/bot"]).optional(),
                botDisplayName: z.string().optional(),
                botAvatarUrl: z.string().optional(),
                isRAG: z.boolean().optional(),
                ragTags: z.array(z.string().min(1)).optional(),
                llmProvider: z.string().optional(),
                llmModel: z.string().optional(),
                visibility: z.enum(["private", "public"]).optional(),
                isPublished: z.boolean().optional(),
                categories: z.array(z.string().min(1)).optional(),
            },
        },
        async function (payload) {
            const meta = getDefaultMeta("ethora-agents-create-v2")
            try {
                ensureAppAuthForTool()
                const res = await agentsCreateV2(payload as any)
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
            description: "Update a reusable saved agent via PUT /v2/agents/:agentId (app-token auth).",
            inputSchema: {
                agentId: z.string().min(1),
                name: z.string().optional(),
                slug: z.string().optional(),
                summary: z.string().optional(),
                prompt: z.string().optional(),
                greetingMessage: z.string().optional(),
                trigger: z.enum(["any_message", "/bot"]).optional(),
                botDisplayName: z.string().optional(),
                botAvatarUrl: z.string().optional(),
                isRAG: z.boolean().optional(),
                ragTags: z.array(z.string().min(1)).optional(),
                llmProvider: z.string().optional(),
                llmModel: z.string().optional(),
                visibility: z.enum(["private", "public"]).optional(),
                isPublished: z.boolean().optional(),
                categories: z.array(z.string().min(1)).optional(),
            },
        },
        async function ({ agentId, ...payload }) {
            const meta = getDefaultMeta("ethora-agents-update-v2")
            try {
                ensureAppAuthForTool()
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
            description: "Clone a reusable saved agent via POST /v2/agents/:agentId/clone (app-token auth).",
            inputSchema: {
                agentId: z.string().min(1),
                name: z.string().optional(),
                slug: z.string().optional(),
                summary: z.string().optional(),
            },
        },
        async function ({ agentId, ...payload }) {
            const meta = getDefaultMeta("ethora-agents-clone-v2")
            try {
                ensureAppAuthForTool()
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
            description: "Bind a saved agent as the active bot for the selected app via POST /v2/agents/:agentId/activate (app-token auth).",
            inputSchema: {
                agentId: z.string().min(1),
            },
        },
        async function ({ agentId }) {
            const meta = getDefaultMeta("ethora-agents-activate-v2")
            try {
                ensureAppAuthForTool()
                const res = await agentsActivateV2(agentId)
                selectAgent({ agentId })
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
            description: "Enable bot using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                trigger: z.enum(["any_message", "/bot"]).optional(),
            },
        },
        async function ({ appId, trigger }) {
            const meta = getDefaultMeta("ethora-bot-enable-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "Disable bot using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
            },
        },
        async function ({ appId }) {
            const meta = getDefaultMeta("ethora-bot-disable-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "Get widget/embed config via GET /v2/bot/widget (app-token auth).",
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
            description: "Send a test message through the app chat/bot automation surface (app-token auth).",
            inputSchema: {
                text: z.string().min(1),
                mode: z.enum(["private", "group"]).optional(),
                nickname: z.string().optional(),
                roomJid: z.string().optional(),
            },
        },
        async function ({ text, mode, nickname, roomJid }) {
            const meta = getDefaultMeta("ethora-chats-message-v2")
            try {
                ensureAppAuthForTool()
                const res = await chatsMessageCreateV2({ text, mode, nickname, roomJid })
                return asToolResult(ok(res.data, meta))
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
            description: "Read persisted chat automation history for private/group test sessions (app-token auth).",
            inputSchema: {
                mode: z.enum(["private", "group"]).optional(),
                nickname: z.string().optional(),
                roomJid: z.string().optional(),
                limit: z.number().int().min(1).max(100).optional(),
            },
        },
        async function ({ mode, nickname, roomJid, limit }) {
            const meta = getDefaultMeta("ethora-chats-history-v2")
            try {
                ensureAppAuthForTool()
                const res = await chatsHistoryGetV2({ mode, nickname, roomJid, limit })
                return asToolResult(ok(res.data, meta))
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
            description: "Compatibility alias for ethora-chats-message-v2 (app-token auth).",
            inputSchema: {
                text: z.string().min(1),
                mode: z.enum(["private", "group"]).optional(),
                nickname: z.string().optional(),
                roomJid: z.string().optional(),
            },
        },
        async function ({ text, mode, nickname, roomJid }) {
            const meta = getDefaultMeta("ethora-bot-message-v2")
            try {
                ensureAppAuthForTool()
                const res = await botMessageCreateV2({ text, mode, nickname, roomJid })
                return asToolResult(ok(res.data, meta))
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
            description: "Compatibility alias for ethora-chats-history-v2 (app-token auth).",
            inputSchema: {
                mode: z.enum(["private", "group"]).optional(),
                nickname: z.string().optional(),
                roomJid: z.string().optional(),
                limit: z.number().int().min(1).max(100).optional(),
            },
        },
        async function ({ mode, nickname, roomJid, limit }) {
            const meta = getDefaultMeta("ethora-bot-history-v2")
            try {
                ensureAppAuthForTool()
                const res = await botHistoryGetV2({ mode, nickname, roomJid, limit })
                return asToolResult(ok(res.data, meta))
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
}) {
    const { displayName, setAsCurrent, crawlUrl, followLink, docs, enableBot, botTrigger, llmProvider, llmModel, savedAgentId } = args

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
            const r = await botUpdateV2(payload)
            botEnableResult = r.data
            steps.push({ step: "botSetup", ok: true })
        }
    }

    // Final: set default auth mode for next steps
    if (shouldSetCurrent && appToken) setAuthMode("app")
    else setAuthMode("b2b")

    return { appId, appToken: appToken || undefined, app, crawl: crawlResult, docs: docsResult, bot: botEnableResult, steps, state: getClientState() }
}

// Minimal namespace aliases to reduce auth-mode mistakes for agents.
function b2bAliases(server: McpServer) {
    server.registerTool(
        "ethora.b2b.auth.use",
        { description: "Alias for ethora-auth-use-b2b" },
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
        { description: "Alias for ethora-b2b-app-create", inputSchema: { displayName: z.string().min(1) } },
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
        { description: "Alias for ethora-b2b-bot-enable", inputSchema: { appId: z.string().optional(), botTrigger: z.string().optional() } },
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
        { description: "Alias for ethora-wait-broadcast-job-v2", inputSchema: { jobId: z.string().min(1), timeoutMs: z.number().int().min(1000).max(300000).optional(), intervalMs: z.number().int().min(250).max(10000).optional() } },
        async function ({ jobId, timeoutMs, intervalMs }) {
            const meta = getDefaultMeta("ethora.b2b.broadcast.wait")
            try {
                ensureAppAuthForTool()
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
            description: "Alias for ethora-b2b-app-bootstrap-ai",
            inputSchema: {
                displayName: z.string().min(1),
                setAsCurrent: z.boolean().optional(),
                crawlUrl: z.string().optional(),
                followLink: z.boolean().optional(),
                docs: z.array(z.object({ name: z.string().min(1), mimeType: z.string().min(1), base64: z.string().min(1) })).optional(),
                enableBot: z.boolean().optional(),
                botTrigger: z.string().optional(),
                llmProvider: z.string().optional(),
                llmModel: z.string().optional(),
                savedAgentId: z.string().optional(),
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
            description: "One-call B2B flow: create app → set context → index sources → configure/enable bot, including runtime LLM selection.",
            inputSchema: {
                displayName: z.string().min(1).describe("New app display name"),
                setAsCurrent: z.boolean().optional().describe("If true (default), sets current app context + app-token auth"),
                crawlUrl: z.string().optional().describe("Optional website URL to crawl/index"),
                followLink: z.boolean().optional().describe("For crawlUrl: follow links (default true)"),
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
            },
        },
        async function ({ displayName, setAsCurrent, crawlUrl, followLink, docs, enableBot, botTrigger, llmProvider, llmModel, savedAgentId }) {
            const meta = getDefaultMeta("ethora-b2b-app-bootstrap-ai")
            const prev = (getClientState() as any).authMode as any
            try {
                const res = await runB2BAppBootstrapAi({ displayName, setAsCurrent, crawlUrl, followLink, docs, enableBot, botTrigger, llmProvider, llmModel, savedAgentId })
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
            description: "Generate a ready-to-paste React App.tsx snippet for @ethora/chat-component (no file writes).",
            inputSchema: {
                apiUrl: z.string().optional().describe("Ethora API base URL (example: https://api.ethoradev.com/v1)"),
                appToken: z.string().optional().describe("Ethora appToken (JWT ...) - DO NOT hardcode in production apps"),
                roomJid: z.string().optional().describe("Optional room JID to open directly"),
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
            description: "Generate .env.example templates for frontend, backend SDK integration, and MCP usage (no file writes).",
            inputSchema: {
                target: z.enum(["frontend-chat-component", "backend-sdk", "mcp"]).optional(),
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
            description: "Generate a minimal runbook (script-like steps) that calls MCP tools in the right order for B2B bootstrap.",
            inputSchema: {
                apiUrl: z.string().optional(),
                displayName: z.string().optional(),
                crawlUrl: z.string().optional(),
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
            description: "Crawl a site URL using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                url: z.string().min(1),
                followLink: z.boolean().optional(),
            },
        },
        async function ({ appId, url, followLink }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "Reindex a crawled URL by urlId using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                urlId: z.string().min(1),
            },
        },
        async function ({ appId, urlId }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "Wait for site crawl to finish using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                url: z.string().min(1),
                followLink: z.boolean().optional(),
                timeoutMs: z.number().int().min(1000).max(600000).optional().describe("HTTP timeout for the crawl request (default 120000)"),
            },
        },
        async function ({ appId, url, followLink, timeoutMs }) {
            const meta = getDefaultMeta("ethora-sources-site-crawl-v2-wait")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const started = Date.now()
                const res = ctx.mode === "b2b"
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
            description: "Wait for site reindex to finish using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                urlId: z.string().min(1),
                timeoutMs: z.number().int().min(1000).max(600000).optional().describe("HTTP timeout for the reindex request (default 120000)"),
            },
        },
        async function ({ appId, urlId, timeoutMs }) {
            const meta = getDefaultMeta("ethora-sources-site-reindex-v2-wait")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const started = Date.now()
                const res = ctx.mode === "b2b"
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
            description: "List crawled site sources and their tags using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
            },
        },
        async function ({ appId }) {
            const meta = getDefaultMeta("ethora-sources-site-list-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "Set tags for a crawled site source using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                sourceId: z.string().min(1),
                tags: z.array(z.string().min(1)).max(50),
            },
        },
        async function ({ appId, sourceId, tags }) {
            const meta = getDefaultMeta("ethora-sources-site-tags-update-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "Create an async v2 users batch job (B2B auth). Returns { jobId, statusUrl } with HTTP 202.",
            inputSchema: {
                bypassEmailConfirmation: z.boolean().optional(),
                usersList: z.array(z.object({
                    email: z.string().email(),
                    firstName: z.string().min(1),
                    lastName: z.string().min(1),
                    password: z.string().min(1).optional(),
                    uuid: z.string().min(1).optional(),
                })).min(1).max(100),
                timeoutMs: z.number().int().min(1000).max(600000).optional().describe("HTTP timeout for job creation request (default 30000)"),
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
            description: "Get status/results for a v2 users batch job (B2B auth).",
            inputSchema: {
                jobId: z.string().min(1),
                timeoutMs: z.number().int().min(500).max(60000).optional().describe("HTTP timeout (default 10000)"),
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
            description: "Poll v2 users batch job until completed/failed (B2B auth).",
            inputSchema: {
                jobId: z.string().min(1),
                timeoutMs: z.number().int().min(1000).max(300000).optional().describe("Max wait time (default 60000)"),
                intervalMs: z.number().int().min(250).max(10000).optional().describe("Poll interval (default 1000)"),
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
            description: "List app tokens (metadata only) for an appId (B2B auth).",
            inputSchema: {
                appId: z.string().optional().describe("Defaults to current app if selected"),
                timeoutMs: z.number().int().min(500).max(60000).optional(),
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
            description: "Create a new app token (returned once). Requires B2B auth.",
            inputSchema: {
                appId: z.string().optional().describe("Defaults to current app if selected"),
                label: z.string().optional(),
                timeoutMs: z.number().int().min(500).max(60000).optional(),
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
            description: "Rotate an app token: revoke old tokenId and return a new token once (B2B auth).",
            inputSchema: {
                appId: z.string().optional().describe("Defaults to current app if selected"),
                tokenId: z.string().min(1),
                label: z.string().optional(),
                timeoutMs: z.number().int().min(500).max(60000).optional(),
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
            description: "Revoke an app token by tokenId (idempotent). Requires B2B auth.",
            inputSchema: {
                appId: z.string().optional().describe("Defaults to current app if selected"),
                tokenId: z.string().min(1),
                timeoutMs: z.number().int().min(500).max(60000).optional(),
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
            description: "One-call B2B flow: create app → create one or more app tokens → provision default rooms → configure/enable bot, including runtime LLM selection.",
            inputSchema: {
                displayName: z.string().min(1).describe("New app display name"),
                // tokens
                tokenLabels: z.array(z.string().min(1)).min(1).max(5).optional().describe("Optional labels for new tokens. Default: ['default']"),
                // rooms
                rooms: z.array(z.object({
                    title: z.string().min(1),
                    pinned: z.boolean().optional(),
                })).max(20).optional().describe("Optional default rooms to create (B2B)."),
                // bot
                enableBot: z.boolean().optional().describe("If true, enables bot (app-token auth using first created token)."),
                savedAgentId: z.string().optional().describe("Optional saved agent to bind as the active bot for the new app."),
                botTrigger: z.enum(["any_message", "/bot"]).optional(),
                botPrompt: z.string().optional(),
                botGreetingMessage: z.string().optional(),
                llmProvider: z.string().optional().describe("Optional generation provider for the default AI bot."),
                llmModel: z.string().optional().describe("Optional generation model for the default AI bot."),
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
            description: "Delete one crawled site URL using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                url: z.string().min(1),
            },
        },
        async function ({ appId, url }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "Batch delete crawled source records by id using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                ids: z.array(z.string().min(1)).min(1).max(100).describe("Array of SiteSource ids returned by ethora-sources-site-list-v2."),
            },
        },
        async function ({ appId, ids }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "Upload docs for ingestion using app-token auth or B2B auth with explicit appId. Input is base64.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                files: z.array(z.object({
                    name: z.string().min(1),
                    mimeType: z.string().min(1),
                    base64: z.string().min(1),
                })).min(1).max(5),
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
                const res = ctx.mode === "b2b"
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
            description: "Delete an ingested doc by docId using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                docId: z.string().min(1),
            },
        },
        async function ({ appId, docId }) {
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "List ingested documents and their tags using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
            },
        },
        async function ({ appId }) {
            const meta = getDefaultMeta("ethora-sources-docs-list-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
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
            description: "Set tags for an ingested document using app-token auth or B2B auth with explicit appId.",
            inputSchema: {
                appId: z.string().optional().describe("Required in B2B mode unless already selected via ethora-app-select."),
                docId: z.string().min(1),
                tags: z.array(z.string().min(1)).max(50),
            },
        },
        async function ({ appId, docId, tags }) {
            const meta = getDefaultMeta("ethora-sources-docs-tags-update-v2")
            try {
                const ctx = resolveAppScopedV2Context(appId)
                const res = ctx.mode === "b2b"
                    ? await sourcesDocsTagsUpdateForAppV2(ctx.appId!, docId, tags)
                    : await sourcesDocsTagsUpdateV2(docId, tags)
                return asToolResult(ok(res.data, meta))
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
    sourcesSiteCrawlTool(server);
    sourcesSiteReindexTool(server);
    sourcesSiteDeleteUrlTool(server);
    sourcesSiteDeleteUrlV2Tool(server);
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
    chatsMessageCreateV2Tool(server);
    chatsHistoryGetV2Tool(server);
    botMessageCreateV2Tool(server);
    botHistoryGetV2Tool(server);
    b2bAliases(server);
    b2bAppBootstrapAiTool(server);
    generateChatComponentAppTsxTool(server);
    generateEnvExamplesTool(server);
    generateB2BBootstrapRunbookTool(server);
}