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
            description: "Set the Ethora API URL and credentials for this MCP session.\n\nAuth: none required — this is the tool that establishes auth material.\nSide effects: stores values **in memory only**, scoped to this MCP process; nothing is written to disk and the values reset when the server restarts. Each call merges — fields you omit keep their previous value. An alternative to setting the same values via env vars (ETHORA_API_URL / ETHORA_APP_JWT / ETHORA_APP_TOKEN / ETHORA_B2B_TOKEN).\nIdempotent: yes.\nFailure modes: rarely fails; returns an error only if a value is structurally invalid.\nReturns: the resulting (redacted) client state. Follow with `ethora-status` to confirm, `ethora-doctor` to test connectivity, then an `ethora-auth-use-*` tool to pick the active mode.",
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
            description: "Report the current Ethora MCP session state: configured API URL, active auth mode, which credentials are present, and the currently selected appId/agentId.\n\nAuth: none required.\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: effectively none.\nReturns: a state object with booleans like `hasAppJwt` / `hasB2BToken` / `hasUserToken` (credential *values* are never echoed back). Use it to decide which `ethora-auth-use-*` tool to call next, or run `ethora-doctor` for an active connectivity check.",
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
            description: "Task-oriented orientation for this MCP server: explains the three Ethora auth modes (user / app-token / B2B) and recommends the next tool calls + one-click recipes based on the current session state.\n\nAuth: none required — inspects state, makes no API calls.\nSide effects: none — read-only.\nIdempotent: yes; recommendations change only as the session state changes.\nFailure modes: effectively none.\nWhen to use: call this first if you're unsure which auth mode or tool sequence fits your goal. To then run a recommended sequence, pass its recipe id to `ethora-run-recipe`.",
            inputSchema: {
                goal: z.enum(["auto", "b2b-bootstrap-ai", "broadcast", "sources-ingest", "files-upload", "bot-manage", "chat-test", "user-login"]).optional()
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
            description: "Execute a built-in recipe — an ordered sequence of this server's own tool calls — by id. Recipes capture common flows (B2B bootstrap, broadcast, sources ingest, etc.).\n\nAuth: depends on the recipe's steps; each step uses whatever auth mode/credentials it needs, so configure those first (see `ethora-help` for the right recipe + prerequisites).\nSide effects: runs entirely in-process — **no shell, no file writes**. Real side effects come only from the underlying tool steps (which may create apps, send messages, etc.). Use `dryRun: true` to preview the resolved steps without executing any of them.\nIdempotent: only as idempotent as the steps it runs — a recipe that calls `ethora-app-create` is not idempotent.\nFailure modes: stops at the first failing step and returns what completed plus the error; a missing required `vars` entry fails fast before any step runs.\nReturns: per-step results. Omit `recipeId` to list the runnable recipes for the given `goal` (or `goal: \"auto\"`).",
            inputSchema: {
                recipeId: z.string().min(1).optional().describe("Id of the recipe to run. Omit to instead list the runnable recipes for the selected `goal` (get ids from `ethora-help`)."),
                goal: z.enum(["auto", "b2b-bootstrap-ai", "broadcast", "sources-ingest", "files-upload", "bot-manage", "chat-test", "user-login"]).optional()
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
            description: "Diagnose the session: validate that the config is internally consistent for the active auth mode and actively ping the Ethora API.\n\nAuth: none required, but the report is tailored to whatever auth mode/credentials are currently set.\nSide effects: makes one real network call — `GET /v1/ping` against the configured API URL. No state is changed.\nIdempotent: yes.\nFailure modes: the tool itself rarely throws; instead it returns `suggestions` for misconfigurations and a `ping.ok: false` block (with the error) when the API is unreachable.\nReturns: `{ state, checks, ping, suggestions }`. Run this after `ethora-configure` to confirm everything is wired up before attempting real operations.",
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
            description: "Switch this session's active auth mode to app-token, so subsequent app-scoped calls authenticate with the configured `appToken`.\n\nAuth: requires an `appToken` to already be configured (via `ethora-configure`, the ETHORA_APP_TOKEN env var, or `ethora-app-select` with an `appToken`).\nSide effects: changes session state only (the active auth mode); no API call, no server-side change.\nIdempotent: yes.\nFailure modes: returns an error if no `appToken` is configured — set one first.\nWhen to use: after `ethora-app-select` when you want app-scoped convenience routes (`/v2/...` resolved against the selected app). For explicit tenant-actor routes use `ethora-auth-use-b2b` instead.",
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
            description: "Switch this session's active auth mode to user-session, so subsequent calls authenticate as a logged-in Ethora user.\n\nAuth: switching the mode itself needs nothing, but user-auth tools only work once `ethora-user-login` has stored a user token. Login also requires a configured `appJwt`.\nSide effects: changes session state only; no API call, no server-side change.\nIdempotent: yes.\nFailure modes: none on the switch itself; downstream user-auth tools return 401 until `ethora-user-login` succeeds.\nWhen to use: first-time local/manual use — switch to this mode, then call `ethora-user-login`. For repeatable automation prefer `ethora-auth-use-b2b`.",
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
            description: "Switch this session's active auth mode to B2B, so subsequent calls authenticate as a tenant actor via the `x-custom-token` header.\n\nAuth: requires a `b2bToken` to already be configured (via `ethora-configure` or the ETHORA_B2B_TOKEN env var) — a JWT with `type=server`.\nSide effects: changes session state only; no API call, no server-side change.\nIdempotent: yes.\nFailure modes: returns an error if no `b2bToken` is configured — set one first.\nWhen to use: server-side automation and partner provisioning. B2B tools take an explicit `appId` (or use the one from `ethora-app-select`). Pairs with `ethora-b2b-app-create`, `ethora-b2b-app-bootstrap-ai`, `ethora-users-batch-create-v2`, and the `ethora-app-tokens-*-v2` tools.",
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
            description: "Set the current app context for this session so app-scoped tools can omit their `appId` argument.\n\nAuth: none required to set the context; the tools you then call still need their own auth mode.\nSide effects: session state only — stores `currentAppId` and, if given, `appToken`. If `appToken` is supplied the active auth mode defaults to app-token unless `authMode` overrides it. No API call, no server-side change.\nIdempotent: yes — calling again just overwrites the selection.\nFailure modes: effectively none; passing an `appId` that doesn't exist is not validated here — the first app-scoped API call will surface the 404.\nWhen to use: once per app you're working with, before broadcast/sources/bot/agents tools. Pairs with `ethora-auth-use-app`.",
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
            description: "Set the current saved-agent context for this session, so agent-scoped tools can omit their `agentId` argument.\n\nAuth: none required to set the context.\nSide effects: session state only — stores `currentAgentId`. No API call, no server-side change.\nIdempotent: yes.\nFailure modes: effectively none; the `agentId` is not validated here — a bad id surfaces on the first agent-scoped API call.\nWhen to use: after `ethora-agents-list-v2` / `ethora-agents-create-v2`, before repeatedly calling `ethora-agents-get-v2`, `ethora-agents-update-v2`, `ethora-agents-clone-v2`, or `ethora-agents-activate-v2` against the same agent.",
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
            description: "Enqueue an asynchronous broadcast job that posts a message to one or more chat rooms of an app.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: creates a background job on the server and returns immediately with a `jobId` — the messages are **not** sent synchronously. Targeting is exclusive: pass `allRooms: true`, or a `chatIds` list, or a `chatNames` list — not a mix.\nIdempotent: no — each call enqueues a new job; calling twice broadcasts twice.\nFailure modes: 401/403 on missing/wrong auth; 400 if no target is specified or targets conflict; 404 if `appId` or a target room doesn't exist.\nReturns: `{ jobId, ... }`. Track it with `ethora-chats-broadcast-job-v2` (one-shot status) or `ethora-wait-broadcast-job-v2` (poll to completion).",
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
            description: "Fetch the current status and results of a broadcast job by `jobId` (one-shot, no polling).\n\nAuth: app-token mode OR B2B mode with an explicit `appId` — must match the auth used to enqueue the job.\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: 401/403 on missing/wrong auth; 404 if the `jobId` is unknown for this app.\nReturns: the job object including its `state` (`pending` / `running` / `completed` / `failed`) and per-room results. For a blocking wait-until-done, use `ethora-wait-broadcast-job-v2` instead of polling this yourself.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the job belongs to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                jobId: z.string().describe("Job id returned by `ethora-chats-broadcast-v2`."),
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
            description: "Block until a broadcast job reaches a terminal state (`completed` or `failed`), or until a timeout — a convenience wrapper around repeated `ethora-chats-broadcast-job-v2` calls.\n\nAuth: app-token mode OR B2B mode with an explicit `appId` — must match the auth used to enqueue the job.\nSide effects: none server-side — read-only polling. Blocks this MCP call for up to `timeoutMs`.\nIdempotent: yes.\nFailure modes: 401/403 on missing/wrong auth; 404 if the `jobId` is unknown.\nReturns: `{ done: true, state, job }` when the job finished, or `{ done: false, reason: \"timeout\", job }` if `timeoutMs` elapsed first (the job may still finish later — re-check with `ethora-chats-broadcast-job-v2`).",
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
            description: "Upload one or more files to the authenticated user's Ethora file storage (`POST /v2/files`).\n\nAuth: user-auth mode with an active user session (`ethora-user-login` first).\nSide effects: creates file records server-side owned by the logged-in user; each upload is a new record (no overwrite-by-name).\nIdempotent: no — re-uploading creates duplicate records.\nInput design: files are passed as base64 so the MCP server never touches your local filesystem. Client-side guardrail rejects any single file over 50MB before upload; the Ethora server enforces its own limits too.\nFailure modes: 401 if not logged in; 413 if the server's size limit is exceeded; 422 on an unsupported mime type. Per-call limit: 1–5 files.\nReturns: the created file records (with ids). Manage them with `ethora-files-get-v2` and `ethora-files-delete-v2`.",
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
            description: "List the authenticated user's files, or fetch one file's metadata by id (`GET /v2/files`).\n\nAuth: user-auth mode with an active user session.\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: 401 if not logged in; 404 if a specific `id` is given but not found / not owned by the user.\nReturns: an array of file records when `id` is omitted, or a single record when `id` is given. Use the ids with `ethora-files-delete-v2`.",
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
            description: "Permanently delete one of the authenticated user's files by id (`DELETE /v2/files/:id`).\n\nAuth: user-auth mode with an active user session.\nSide effects: removes the file record and its stored content. Not reversible.\nIdempotent: yes after success — a second call returns 404.\nFailure modes: 401 if not logged in; 403 if the file is not owned by the user; 404 if the `id` does not exist.\nGet ids from `ethora-files-get-v2`.",
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

function sourcesSiteCrawlTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-crawl",
        {
            description: "Crawl a website URL and ingest its content into an app's RAG sources, so the app's AI bot can answer from it (legacy user-auth route).\n\nAuth: user-auth mode with an active user session; the user must own the app.\nSide effects: starts a crawl + embedding job on the server; pages become queryable RAG context once indexing finishes (not synchronous). With `followLink: true` the crawler also follows in-domain links, which can ingest many pages.\nIdempotent: no — re-crawling the same URL adds/updates source records; combined with `followLink` it can fan out broadly.\nFailure modes: 401 if not logged in; 403 if the user doesn't own the app; 400 if `url` is malformed; 404 if `appId` is invalid.\nRelated: `ethora-sources-site-reindex` (refresh), `ethora-sources-site-delete-url` (remove), `ethora-sources-docs-upload` (ingest documents instead of a URL). For app-token / B2B flows use `ethora-sources-site-crawl-v2`.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to ingest into. Optional — defaults to the app set via `ethora-app-select`."),
                url: z.string().min(1).describe("Absolute URL to crawl, e.g. `https://example.com/docs`."),
                followLink: z.boolean().default(false).describe("If true, also crawl in-domain links reachable from `url`. Can ingest many pages — use with care. Default false (single page)."),
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
            description: "Re-crawl and re-embed a previously crawled URL by its `urlId`, refreshing the RAG content for that page (legacy user-auth route).\n\nAuth: user-auth mode with an active user session; the user must own the app.\nSide effects: starts a refresh job on the server; the page's existing source record is updated in place once indexing finishes (not synchronous).\nIdempotent: effectively yes — re-running just refreshes the same record again.\nFailure modes: 401 if not logged in; 403 if the user doesn't own the app; 404 if `appId` or `urlId` is unknown.\nWhen to use: the source page changed and you want the bot to pick up the new content. Get `urlId` values from `ethora-sources-site-list-v2`. For app-token / B2B flows use `ethora-sources-site-reindex-v2`.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the URL belongs to. Optional — defaults to the app set via `ethora-app-select`."),
                urlId: z.string().min(1).describe("Id of a previously crawled URL record. Get it from `ethora-sources-site-list-v2`."),
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
            description: "Remove a single crawled URL from an app's RAG sources, matched by its exact url string (legacy user-auth route).\n\nAuth: user-auth mode with an active user session; the user must own the app.\nSide effects: deletes the source record and its embeddings; the app's bot can no longer answer from that page. Not reversible (re-add via `ethora-sources-site-crawl`).\nIdempotent: yes — deleting an already-removed URL is a no-op / 404.\nFailure modes: 401 if not logged in; 403 if the user doesn't own the app; 404 if the exact `url` string isn't a crawled source.\nNote: matches on the exact URL string — get the stored value from `ethora-sources-site-list-v2`. To delete several at once use `ethora-sources-site-delete-records-v1`.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the URL belongs to. Optional — defaults to the app set via `ethora-app-select`."),
                url: z.string().min(1).describe("Exact crawled URL string to remove (must match what was stored — get it from `ethora-sources-site-list-v2`)."),
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
            description: "Bulk-remove crawled URLs from an app's RAG sources in one call, matched by exact url strings (legacy owner/admin user-auth route).\n\nAuth: user-auth mode with an active user session; the user must own the app.\nSide effects: deletes each matching source record and its embeddings. Not reversible.\nIdempotent: yes — URLs not present are skipped.\nFailure modes: 401 if not logged in; 403 if the user doesn't own the app; 404 if `appId` is invalid. Per-call limit: 1–100 URLs.\nWhen to use: cleaning up many pages at once. For the single-URL variant use `ethora-sources-site-delete-url`; for app-token / B2B flows use `ethora-sources-site-delete-url-v2-batch`.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the URLs belong to. Optional — defaults to the app set via `ethora-app-select`."),
                urls: z.array(z.string().min(1)).min(1).max(100).describe("Exact crawled URL strings to remove, 1–100 per call. Get the stored values from `ethora-sources-site-list-v2`."),
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
            description: "Upload documents (PDF, text, etc.) into an app's RAG sources so the app's AI bot can answer from them (legacy user-auth route).\n\nAuth: user-auth mode with an active user session; the user must own the app.\nSide effects: stores each document and starts a parse + embedding job; content becomes queryable RAG context once indexing finishes (not synchronous).\nIdempotent: no — re-uploading the same document creates another source record.\nInput design: files are base64 so the MCP server never reads your local filesystem. Client-side guardrail rejects any single file over 50MB; the server enforces its own limits too.\nFailure modes: 401 if not logged in; 403 if the user doesn't own the app; 413 if too large; 422 on an unsupported document type. Per-call limit: 1–5 files.\nRelated: `ethora-sources-docs-delete` (remove), `ethora-sources-site-crawl` (ingest a URL instead). For app-token / B2B flows use `ethora-sources-docs-upload-v2`.",
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
            description: "Remove a previously ingested document from an app's RAG sources by `docId` (legacy user-auth route).\n\nAuth: user-auth mode with an active user session; the user must own the app.\nSide effects: deletes the document record and its embeddings; the app's bot can no longer answer from it. Not reversible (re-add via `ethora-sources-docs-upload`).\nIdempotent: yes after success — a second call returns 404.\nFailure modes: 401 if not logged in; 403 if the user doesn't own the app; 404 if `docId` is unknown.\nGet `docId` values from `ethora-sources-docs-list-v2`. For app-token / B2B flows use `ethora-sources-docs-delete-v2`.",
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
            description: "Authenticate as an existing Ethora user with email + password.\n\nAuth: user-auth mode (call `ethora-auth-use-user` first) and a configured `appJwt` (env or `ethora-configure`).\nSide effects: stores the resulting user session token in this MCP session; unlocks user-auth tools (`ethora-app-list`, `ethora-app-create`, `ethora-files-*`, `ethora-wallet-*`).\nIdempotent: yes — safe to retry on transport failures.\nFailure modes: 401/403 on bad credentials; 404 if the email isn't registered; 429 if the Ethora server's per-IP login rate limit is hit (retry with backoff).\nRelated: `ethora-user-register` (create account first), `ethora-auth-use-user` (switch mode), `ethora-status` (verify session).",
            inputSchema: {
                email: z.string().email().describe("User's registered email address (RFC 5322). Must match an account created via `ethora-user-register` and verified via the link sent to that address."),
                password: z.string().describe("Plain-text password the user set during registration. Sent over TLS to the Ethora API; never echoed back or logged.")
            }
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
            description: "Register a new Ethora end-user account by email + first/last name.\n\nAuth: user-auth mode and a configured `appJwt` (env or `ethora-configure`) — the JWT tells the server which app the new user belongs to.\nSide effects: creates a pending user record on the Ethora server and triggers a verification email to the address; the user must click the link in that email before `ethora-user-login` will succeed.\nIdempotent: safe to retry on transport failures (server deduplicates by email within an app). Calling twice with a fresh email creates one account; calling with an already-registered email returns 422.\nFailure modes: 422 with a validation error if the email is already registered, if names violate server rules, or if the configured `appJwt` is invalid; 401 if no `appJwt` is configured.\nWhen to use: end-user self-serve sign-up flows. For bulk B2B user provisioning prefer `ethora-users-batch-create-v2`.",
            inputSchema: {
                email: z.string().email().describe("Email address for the new user. Must be RFC-5322 valid and not already registered within this app. The user will receive a verification link they must click before login works."),
                firstName: z.string().describe("First name shown in the user's profile and message attributions across chat rooms and the app UI."),
                lastName: z.string().describe("Last name shown in the user's profile. Required by the server; do not omit unless your Ethora deployment explicitly accepts empty strings.")
            }
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
            description: "List all Ethora apps (tenants) owned by the currently logged-in user.\n\nAuth: user-auth mode and an active user session (call `ethora-user-login` first).\nSide effects: none — read-only.\nIdempotent: yes — repeated calls return the same set unless an app is created/deleted in between.\nFailure modes: 401 if not logged in; returns an empty list if the user owns no apps.\nReturns: an array where each entry includes `appId` (24-char hex ObjectId), `displayName`, `domainName`, ownership and bot-status metadata. Pass `appId` into `ethora-app-update`, `ethora-app-delete`, or `ethora-app-select` for app-scoped flows.",
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
            description: "Create a new Ethora app (tenant) owned by the currently logged-in user.\n\nAuth: user-auth mode and an active user session (call `ethora-user-login` first).\nSide effects: provisions a new app record on the server, allocates a fresh 24-char hex `appId`, sets the caller as owner. Each app counts against the owner's plan limit.\nIdempotent: no — calling twice creates two apps. Use `ethora-app-list` first if you want to reuse an existing app.\nFailure modes: 401 if not logged in; 402/403 if the owner's plan limit is reached; 422 if `displayName` violates server rules.\nReturns: the new app object including `appId`. Pass it to `ethora-app-update` (set domainName/colors/bot), `ethora-app-select` (switch into app-token flows), or `ethora-app-delete` (remove).\nWhen to use: interactive setup by a logged-in user. For server-to-server provisioning prefer `ethora-b2b-app-create` or the one-call orchestrator `ethora-b2b-app-bootstrap-ai`.",
            inputSchema: {
                displayName: z.string().describe("Human-readable app name shown to users in the app picker and on the public landing page. Not required to be unique across accounts.")
            }
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
            description: "Permanently delete an Ethora app the caller owns.\n\n**Destructive and irreversible.** Gated behind `ETHORA_MCP_ENABLE_DANGEROUS_TOOLS=true`; the tool refuses to register otherwise.\nAuth: user-auth mode and an active user session; the caller must be the app owner.\nSide effects: removes the app record, its chat rooms, files, indexed RAG sources, and bot configuration. End users of the app are immediately signed out and their messages become inaccessible.\nIdempotent: the first successful call returns success; subsequent calls return 404. Safe to retry on 5xx after confirming the app is still present via `ethora-app-list`.\nFailure modes: 403 if the caller does not own the app; 404 if `appId` does not exist; 401 if not logged in.\nWhen to use: explicit tear-down. Prefer `ethora-app-update` with `botStatus: \"off\"` if you just want to deactivate the AI bot.",
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
            description: "Update mutable fields on an existing Ethora app the caller owns (displayName, domainName, appDescription, primaryColor, botStatus).\n\nAuth: user-auth mode and an active user session; the caller must own the app.\nSide effects: **partial update** — only the fields you pass are changed; omitted fields keep their previous values. `domainName` changes affect the public URL (`<domain>.ethora.com`) immediately. `botStatus: \"on\"` enables the bot only if the app has a configured prompt (use `ethora-bot-update-v2` / `ethora-bot-enable-v2` for the AI bot lifecycle).\nIdempotent: yes — repeating an update with the same values is a no-op.\nFailure modes: 401 if not logged in; 403 if not the owner; 404 if `appId` is invalid; 422 on field validation failure (e.g. `domainName` already taken, `primaryColor` not in `#RRGGBB` format).\nWhen to use: change branding, route the web app under a custom subdomain, or quickly toggle the bot on/off without re-running setup.",
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
            description: "List the default chat rooms (MUC rooms) of the currently selected Ethora app — every new user of the app auto-joins these.\n\nAuth: user-auth mode and an active user session. Operates against the currently selected app — call `ethora-app-select` first, or use `ethora-app-get-default-rooms-with-app-id` to pass `appId` explicitly.\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: 400 if no app is currently selected in this MCP session; 401 if not logged in.\nReturns: array of rooms with their JIDs and titles. Use the JIDs with `ethora-chats-broadcast-v2`, `ethora-app-create-chat` (add more), or `ethora-app-delete-chat` (remove).",
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
            description: "List the default chat rooms of a specific Ethora app, passed via `appId` (or defaulted to the currently selected app).\n\nAuth: user-auth mode and an active user session. The caller must have read access to the app — either ownership, or membership of at least one of its rooms.\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: 400 if neither `appId` is passed nor an app is currently selected; 401 if not logged in; 403 if the caller lacks read access; 404 if `appId` does not exist.\nReturns: array of rooms with their JIDs and titles. Use `ethora-app-get-default-rooms` for the simpler \"current app only\" variant.",
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
            description: "Create a new chat room (MUC room) inside an Ethora app the caller owns.\n\nAuth: user-auth mode and an active user session; the caller must own the app.\nSide effects: provisions a new MUC room with the given `title`. If `pinned: true` the room is added to the app's default rooms list — every new user of the app will auto-join it from that point on. Existing users are **not** auto-added; for that, see the chat membership v2 endpoints.\nIdempotent: no — calling twice with the same title creates two distinct rooms with different JIDs.\nFailure modes: 401 if not logged in; 403 if the caller does not own the app; 404 if `appId` is invalid; 422 if `title` is empty or violates server rules.\nReturns: the new room object including its JID. Use the JID with `ethora-chats-broadcast-v2` to send messages or `ethora-app-delete-chat` to remove.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex ObjectId of the app to create the chat room in. Optional — defaults to the app most recently passed to `ethora-app-select`."),
                title: z.string().describe("Display name for the new chat room. Visible to all members; not required to be unique within the app."),
                pinned: z.boolean().describe("If `true`, the room is added to the app's default rooms list — every new user of the app auto-joins it. If `false`, the room exists but users must be added explicitly."),
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
            description: "Permanently delete a chat room from an Ethora app the caller owns.\n\n**Destructive and irreversible.** Gated behind `ETHORA_MCP_ENABLE_DANGEROUS_TOOLS=true`; the tool refuses to register otherwise.\nAuth: user-auth mode and an active user session; the caller must own the app.\nSide effects: removes the MUC room, its message archive, and all member affiliations. Participants will see \"room destroyed\" on their next reconnect.\nIdempotent: yes after success — subsequent calls return 404.\nFailure modes: 401 if not logged in; 403 if not the owner; 404 if `chatJid` is not a room in the app.\nWhen to use: explicit room tear-down. To remove only from the default rooms list (without destroying the room) update the default-rooms config rather than deleting.",
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
            description: "Read the on-chain wallet balance for the currently authenticated user, across the ERC-20 token(s) the Ethora backend tracks for them.\n\nAuth: user-auth mode and an active user session (call `ethora-user-login` first).\nSide effects: none — read-only, no gas consumed.\nIdempotent: yes — safe to call repeatedly.\nFailure modes: 401 if not logged in; 503 if the wallet RPC is temporarily unreachable (safe to retry on 503 with backoff).\nReturns: balances in the units the Ethora backend reports (typically whole-token integers — confirm with your deployment). Pair with `ethora-wallet-erc20-transfer` to spend.",
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
            description: "Send ERC-20 tokens from the authenticated user's wallet to another wallet address.\n\n**Destructive and irreversible.** Gated behind `ETHORA_MCP_ENABLE_DANGEROUS_TOOLS=true`; the tool refuses to register otherwise.\nAuth: user-auth mode and an active user session (call `ethora-user-login` first).\nSide effects: submits a signed transaction on-chain; consumes the sender's gas/native-coin balance; reduces the sender's ERC-20 balance by `amount`; the recipient's balance increases asynchronously once the transaction is mined.\nIdempotent: **no** — calling twice sends twice. Confirm on-chain status (via `ethora-wallet-get-balance` or a block explorer) before retrying after a 5xx; do not auto-retry blindly.\nFailure modes: 400 on invalid `toWallet` address format; 401 if not logged in; 402 on insufficient ERC-20 balance or gas; 5xx on RPC failure.",
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
            description: "Create a new Ethora app (tenant) server-side using B2B auth — the partner/integrator equivalent of `ethora-app-create`.\n\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`).\nSide effects: provisions a new app record owned by the B2B tenant and allocates a fresh 24-char hex `appId`. Does not create tokens, rooms, or a bot.\nIdempotent: no — calling twice creates two apps.\nFailure modes: 401/403 if not in B2B mode or the `b2bToken` is invalid; 422 if `displayName` violates server rules.\nReturns: the new app object including `appId`. Next steps: `ethora-app-tokens-create-v2` (mint an appToken), `ethora-app-select` (set context), `ethora-bot-update-v2` (configure the bot). For the all-in-one path use `ethora-b2b-app-bootstrap-ai` or `ethora-b2b-app-provision`.",
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
            description: "Turn on the AI bot for an app via B2B auth (sets `botStatus: \"on\"` on the app record).\n\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`).\nSide effects: flips the app's bot status to on; the backend then makes a **best-effort** activation against the configured AI service. The bot only actually responds if the app already has a prompt + LLM configured (see `ethora-bot-update-v2`) and the Ethora backend has AI service URL/secret set.\nIdempotent: yes — enabling an already-enabled bot is a no-op.\nFailure modes: 401/403 if not in B2B mode; 404 if `appId` is invalid; 400 if no `appId` is given and none is selected.\nNote: this is a thin convenience over `ethora-app-update`. For full bot configuration (prompt, LLM, RAG, greeting) use `ethora-bot-update-v2`; `ethora-bot-enable-v2` is the app-token-friendly equivalent.",
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
            description: "Read the current AI bot configuration for an app: status, trigger, prompt, greeting, LLM provider/model, RAG settings, widget config.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` is invalid.\nReturns: the bot settings object. Use it to inspect before changing things with `ethora-bot-update-v2`, or to confirm an `ethora-agents-activate-v2` took effect.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode (the token determines the app)."),
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
            description: "Configure the AI bot for an app — its prompt, LLM, trigger, greeting, RAG behavior, identity, and public widget settings.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: **partial update** — only the fields you pass are changed; omitted fields keep their values. Setting `status: \"on\"` activates the bot (best-effort against the configured AI service — needs a prompt + LLM and a backend AI service configured).\nIdempotent: yes — re-sending the same values is a no-op.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` is invalid; 422 on field validation failure (e.g. an `llmProvider`/`llmModel` your backend doesn't have enabled).\nRelated: `ethora-bot-get-v2` (inspect first), `ethora-bot-enable-v2` / `ethora-bot-disable-v2` (just toggle status), `ethora-agents-activate-v2` (apply a saved agent's config instead of setting fields by hand).",
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
            description: "List the reusable saved agents owned by the current app (`GET /v2/agents`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`).\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: 401/403 if not in app-token mode or the appToken is invalid; returns an empty list if the app has no saved agents.\nReturns: an array of agents with their ids, names, and config. A saved agent is a reusable bot definition — use the ids with `ethora-agents-get-v2`, `ethora-agents-update-v2`, `ethora-agents-clone-v2`, or `ethora-agents-activate-v2`.",
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
            description: "Fetch one reusable saved agent's full config by id (`GET /v2/agents/:agentId`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`).\nSide effects: also sets this agent as the current agent context for the session (so later agent tools can omit `agentId`). No server-side change.\nIdempotent: yes.\nFailure modes: 401/403 on missing/wrong auth; 404 if `agentId` is not an agent of the current app.\nReturns: the agent object (prompt, LLM, RAG settings, visibility, etc.). Get ids from `ethora-agents-list-v2`.",
            inputSchema: {
                agentId: z.string().min(1).describe("Id of the saved agent to fetch. Get it from `ethora-agents-list-v2`."),
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
            description: "Create a new reusable saved agent — a named, reusable bot definition (prompt + LLM + RAG settings + identity) that can later be activated onto any app (`POST /v2/agents`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`).\nSide effects: creates an agent record owned by the current app; also sets it as the session's current agent context. Creating an agent does **not** activate it on the app — call `ethora-agents-activate-v2` for that.\nIdempotent: no — calling twice creates two agents.\nFailure modes: 401/403 on missing/wrong auth; 422 on field validation failure (e.g. duplicate `slug`, unsupported `llmProvider`/`llmModel`).\nReturns: the created agent including its id.",
            inputSchema: {
                name: z.string().optional().describe("Human-readable agent name."),
                slug: z.string().optional().describe("URL-safe unique identifier for the agent within the app. Lower-case alphanumerics and dashes."),
                summary: z.string().optional().describe("Short description of what the agent does."),
                prompt: z.string().optional().describe("System prompt defining the agent's persona and behavior."),
                greetingMessage: z.string().optional().describe("Message the agent posts when a conversation starts."),
                trigger: z.enum(["any_message", "/bot"]).optional().describe("When the agent responds: `any_message` (every message) or `/bot` (only /bot-prefixed messages)."),
                botDisplayName: z.string().optional().describe("Display name shown in chat when this agent is the active bot."),
                botAvatarUrl: z.string().optional().describe("Public URL of the agent's avatar image."),
                isRAG: z.boolean().optional().describe("If true, the agent retrieves from the app's indexed RAG sources when answering."),
                ragTags: z.array(z.string().min(1)).optional().describe("Restrict RAG retrieval to sources carrying these tags."),
                llmProvider: z.string().optional().describe("LLM provider, e.g. `openai` or `openai-compatible`. Must be enabled in your Ethora backend."),
                llmModel: z.string().optional().describe("LLM model id, e.g. `gpt-4o-mini`. Must be available for the chosen provider."),
                visibility: z.enum(["private", "public"]).optional().describe("`private` (only this app) or `public` (discoverable in the shared agent catalogue)."),
                isPublished: z.boolean().optional().describe("If true and visibility is public, the agent is listed in the public catalogue."),
                categories: z.array(z.string().min(1)).optional().describe("Catalogue categories for a public agent."),
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
            description: "Update fields on an existing reusable saved agent (`PUT /v2/agents/:agentId`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`).\nSide effects: **partial update** — only the fields you pass change; omitted fields keep their values. Also sets this agent as the session's current agent context. If the agent is currently activated on the app, changes take effect on the live bot.\nIdempotent: yes — re-sending the same values is a no-op.\nFailure modes: 401/403 on missing/wrong auth; 404 if `agentId` is not an agent of the current app; 422 on field validation failure.\nGet `agentId` from `ethora-agents-list-v2`.",
            inputSchema: {
                agentId: z.string().min(1).describe("Id of the saved agent to update. Get it from `ethora-agents-list-v2`."),
                name: z.string().optional().describe("Human-readable agent name."),
                slug: z.string().optional().describe("URL-safe unique identifier within the app. Lower-case alphanumerics and dashes."),
                summary: z.string().optional().describe("Short description of what the agent does."),
                prompt: z.string().optional().describe("System prompt defining the agent's persona and behavior."),
                greetingMessage: z.string().optional().describe("Message the agent posts when a conversation starts."),
                trigger: z.enum(["any_message", "/bot"]).optional().describe("When the agent responds: `any_message` (every message) or `/bot` (only /bot-prefixed messages)."),
                botDisplayName: z.string().optional().describe("Display name shown in chat when this agent is the active bot."),
                botAvatarUrl: z.string().optional().describe("Public URL of the agent's avatar image."),
                isRAG: z.boolean().optional().describe("If true, the agent retrieves from the app's indexed RAG sources when answering."),
                ragTags: z.array(z.string().min(1)).optional().describe("Restrict RAG retrieval to sources carrying these tags."),
                llmProvider: z.string().optional().describe("LLM provider, e.g. `openai` or `openai-compatible`. Must be enabled in your Ethora backend."),
                llmModel: z.string().optional().describe("LLM model id, e.g. `gpt-4o-mini`. Must be available for the chosen provider."),
                visibility: z.enum(["private", "public"]).optional().describe("`private` (only this app) or `public` (discoverable in the shared agent catalogue)."),
                isPublished: z.boolean().optional().describe("If true and visibility is public, the agent is listed in the public catalogue."),
                categories: z.array(z.string().min(1)).optional().describe("Catalogue categories for a public agent."),
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
            description: "Duplicate an existing saved agent into a new agent, optionally overriding its name/slug/summary (`POST /v2/agents/:agentId/clone`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`).\nSide effects: creates a new agent record copying the source agent's config; also sets the new agent as the session's current agent context. The source agent is unchanged.\nIdempotent: no — calling twice creates two clones.\nFailure modes: 401/403 on missing/wrong auth; 404 if the source `agentId` doesn't exist; 422 if an overridden `slug` collides.\nWhen to use: branch a working agent before experimenting, instead of mutating the original with `ethora-agents-update-v2`.",
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
            description: "Bind a saved agent as the active AI bot for the current app — copies the agent's config onto the app's bot (`POST /v2/agents/:agentId/activate`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`).\nSide effects: the app's live bot now uses this agent's prompt/LLM/RAG/identity. Replaces whatever bot config was there before. Also sets this agent as the session's current agent context. Does not by itself set `status: \"on\"` if the bot was off — pair with `ethora-bot-enable-v2` if needed.\nIdempotent: yes — activating the already-active agent is a no-op.\nFailure modes: 401/403 on missing/wrong auth; 404 if `agentId` is not an agent of the current app.\nVerify with `ethora-bot-get-v2` afterwards.",
            inputSchema: {
                agentId: z.string().min(1).describe("Id of the saved agent to activate as the app's bot. Get it from `ethora-agents-list-v2`."),
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
            description: "Turn the AI bot on for an app (sets bot `status: \"on\"`), optionally setting its trigger at the same time.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: activates the bot. It only actually responds if a prompt + LLM are configured (see `ethora-bot-update-v2` or `ethora-agents-activate-v2`) and the Ethora backend has an AI service configured.\nIdempotent: yes — enabling an already-on bot is a no-op.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` is invalid.\nThin convenience over `ethora-bot-update-v2` for the common \"just turn it on\" case. Pair with `ethora-bot-disable-v2` to turn it off.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                trigger: z.enum(["any_message", "/bot"]).optional().describe("When the bot responds: `any_message` (every message) or `/bot` (only /bot-prefixed messages). Omit to leave the existing trigger unchanged."),
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
            description: "Turn the AI bot off for an app (sets bot `status: \"off\"`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: deactivates the bot — it stops responding to messages. The bot's configured prompt/LLM/RAG and any activated agent are preserved, so re-enabling later restores the same behavior.\nIdempotent: yes — disabling an already-off bot is a no-op.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` is invalid.\nThin convenience over `ethora-bot-update-v2`. Pair with `ethora-bot-enable-v2` to turn it back on.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
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
            description: "Read the public chat-widget / embed configuration for the current app's bot (`GET /v2/bot/widget`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`).\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: 401/403 if not in app-token mode or the appToken is invalid.\nReturns: the widget config and the public widget URL metadata — what you need to embed the bot on a website. To enable/disable the public widget, set `widgetPublicEnabled` via `ethora-bot-update-v2`.",
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
            description: "Send a message through the app's chat/bot automation surface — useful for testing the bot or driving automated conversations.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`). Your Ethora backend must expose the chat automation surface on the same API host.\nSide effects: posts a real message into the app — in `private` mode to a 1:1 automation session keyed by `nickname`, in `group` mode into the room identified by `roomJid`. If the app's bot is enabled it will react to the message.\nIdempotent: no — each call posts another message.\nFailure modes: 401/403 on missing/wrong auth; 400 if `mode` is `group` but no `roomJid` is given (or `private` but no `nickname`); 404 if `roomJid` doesn't exist.\nRead back the resulting conversation with `ethora-chats-history-v2`. `ethora-bot-message-v2` is an identical alias.",
            inputSchema: {
                text: z.string().min(1).describe("Message body to send."),
                mode: z.enum(["private", "group"]).optional().describe("`private` = 1:1 automation session keyed by `nickname`; `group` = a room identified by `roomJid`. Defaults to the backend's default mode."),
                nickname: z.string().optional().describe("Sender/participant nickname for the private automation session. Required when `mode` is `private`."),
                roomJid: z.string().optional().describe("Room JID to post into. Required when `mode` is `group`. Get it from `ethora-app-get-default-rooms`."),
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
            description: "Read the persisted message history of a chat automation session — the conversation produced by `ethora-chats-message-v2` and the bot's replies.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`).\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: 401/403 on missing/wrong auth; 400 if the `mode`/`nickname`/`roomJid` combination is incomplete; 404 if the room/session doesn't exist.\nReturns: the most recent messages (up to `limit`) for the identified session. `ethora-bot-history-v2` is an identical alias.",
            inputSchema: {
                mode: z.enum(["private", "group"]).optional().describe("`private` = 1:1 automation session keyed by `nickname`; `group` = a room identified by `roomJid`. Should match what was used to send."),
                nickname: z.string().optional().describe("Participant nickname for the private automation session. Required when `mode` is `private`."),
                roomJid: z.string().optional().describe("Room JID to read history from. Required when `mode` is `group`."),
                limit: z.number().int().min(1).max(100).optional().describe("Maximum number of most-recent messages to return. 1–100. Defaults to the backend's default page size."),
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
            description: "Compatibility alias for `ethora-chats-message-v2` — identical behavior, kept for clients that expect a `bot-`prefixed name.\n\nSend a message through the app's chat/bot automation surface.\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`).\nSide effects: posts a real message into the app; the enabled bot will react to it. Not idempotent — each call posts another message.\nFailure modes: 401/403 on missing/wrong auth; 400 if the `mode`/`nickname`/`roomJid` combination is incomplete.\nPrefer `ethora-chats-message-v2` in new integrations.",
            inputSchema: {
                text: z.string().min(1).describe("Message body to send."),
                mode: z.enum(["private", "group"]).optional().describe("`private` = 1:1 automation session keyed by `nickname`; `group` = a room identified by `roomJid`."),
                nickname: z.string().optional().describe("Sender/participant nickname for the private automation session. Required when `mode` is `private`."),
                roomJid: z.string().optional().describe("Room JID to post into. Required when `mode` is `group`."),
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
            description: "Compatibility alias for `ethora-chats-history-v2` — identical behavior, kept for clients that expect a `bot-`prefixed name.\n\nRead the persisted message history of a chat automation session.\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`).\nSide effects: none — read-only. Idempotent: yes.\nFailure modes: 401/403 on missing/wrong auth; 400 if the `mode`/`nickname`/`roomJid` combination is incomplete.\nPrefer `ethora-chats-history-v2` in new integrations.",
            inputSchema: {
                mode: z.enum(["private", "group"]).optional().describe("`private` = 1:1 automation session keyed by `nickname`; `group` = a room identified by `roomJid`."),
                nickname: z.string().optional().describe("Participant nickname for the private automation session. Required when `mode` is `private`."),
                roomJid: z.string().optional().describe("Room JID to read history from. Required when `mode` is `group`."),
                limit: z.number().int().min(1).max(100).optional().describe("Maximum number of most-recent messages to return. 1–100."),
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
        { description: "Dot-namespaced alias for `ethora-auth-use-b2b` — switches the session's active auth mode to B2B (`x-custom-token`).\n\nAuth: requires a `b2bToken` to already be configured.\nSide effects: session state only; no API call.\nIdempotent: yes.\nProvided to reduce auth-mode mistakes for agents that prefer dotted names; behavior is identical to `ethora-auth-use-b2b`." },
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
        { description: "Dot-namespaced alias for `ethora-b2b-app-create` — create a new Ethora app server-side.\n\nAuth: B2B mode (`ethora.b2b.auth.use` / `ethora-auth-use-b2b` + a configured `b2bToken`).\nSide effects: provisions a new app record owned by the B2B tenant and allocates a fresh `appId`. Not idempotent — each call creates a new app.\nFailure modes: 401/403 if not in B2B mode; 422 on an invalid `displayName`.\nProvided for agents that prefer dotted names. Prefer `ethora-b2b-app-create` in new integrations.", inputSchema: { displayName: z.string().min(1).describe("Human-readable app name shown to users in the app picker and on the public landing page.") } },
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
        { description: "Dot-namespaced alias for `ethora-b2b-bot-enable` — turn on the AI bot for an app (sets `botStatus: \"on\"`).\n\nAuth: B2B mode (`ethora.b2b.auth.use` / `ethora-auth-use-b2b` + a configured `b2bToken`).\nSide effects: flips the app's bot status to on; the backend then makes a best-effort activation. The bot only responds if a prompt + LLM are configured and the backend has an AI service set up.\nIdempotent: yes — enabling an already-on bot is a no-op.\nFailure modes: 401/403 if not in B2B mode; 404 if `appId` is invalid; 400 if no `appId` is given and none is selected.\nProvided for agents that prefer dotted names. Prefer `ethora-b2b-bot-enable` in new integrations.", inputSchema: { appId: z.string().optional().describe("24-char hex appId whose bot to enable. Optional — defaults to the app set via `ethora-app-select`."), botTrigger: z.string().optional().describe("When the bot responds: `/bot` or `any_message`. Omit to leave the existing trigger unchanged.") } },
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
        { description: "Dot-namespaced sibling of `ethora-wait-broadcast-job-v2` — block until a broadcast job reaches a terminal state (`completed` / `failed`) or until a timeout.\n\nAuth: app-token mode (despite the `b2b` in the name, this variant uses app-token auth — `ethora-app-select` + `ethora-auth-use-app`). Use `ethora-wait-broadcast-job-v2` if you need the B2B-with-explicit-appId path.\nSide effects: none server-side — read-only polling. Blocks this MCP call for up to `timeoutMs`.\nIdempotent: yes.\nFailure modes: 401/403 if not in app-token mode; 404 if the `jobId` is unknown.\nReturns: `{ done: true, state, job }` when finished, or `{ done: false, reason: \"timeout\", job }` on timeout.", inputSchema: { jobId: z.string().min(1).describe("Job id returned by `ethora-chats-broadcast-v2`."), timeoutMs: z.number().int().min(1000).max(300000).optional().describe("Maximum time to wait, in milliseconds. Default 60000."), intervalMs: z.number().int().min(250).max(10000).optional().describe("Delay between status checks, in milliseconds. Default 1000.") } },
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
            description: "Dot-namespaced alias for `ethora-b2b-app-bootstrap-ai` — one-call B2B orchestrator: create an app, index RAG sources, then configure and enable its AI bot.\n\nAuth: B2B mode (`ethora.b2b.auth.use` / `ethora-auth-use-b2b` + a configured `b2bToken`).\nSide effects: runs multiple real operations in sequence (app create, source ingest, bot configure/enable); source ingestion and bot activation are best-effort, so the app is still created even if a later step fails. Not idempotent — each call creates a new app.\nFailure modes: aborts with the partial step log if app creation fails; previous auth mode restored best-effort on error.\nReturns: a per-step result log including the new `appId`. Provided for agents that prefer dotted names; behavior matches `ethora-b2b-app-bootstrap-ai`.",
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
            description: "One-call B2B orchestrator: create an app, set it as the current context, index RAG sources, then configure and enable its AI bot.\n\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`). Internally switches into app-token mode for the source-ingest steps and (if `setAsCurrent`) leaves the session pointed at the new app.\nSide effects: runs multiple real operations in sequence — `appCreate` (B2B), set current app, `/v2/sources/*` ingest (app-token), bot configure/enable. Source ingestion and bot activation are **best-effort**: the app is still created even if a later step fails. The crawl/embedding work continues asynchronously after this returns.\nIdempotent: no — each call creates a brand-new app.\nFailure modes: aborts and returns the partial step log if app creation fails; on a later-step failure the previous auth mode is restored best-effort. Bot activation needs an AI service configured on your Ethora backend.\nReturns: a per-step result log including the new `appId`. For the rooms+tokens variant use `ethora-b2b-app-provision`; for full manual control wire `ethora-b2b-app-create` + `ethora-sources-*-v2` + `ethora-bot-update-v2` yourself.",
            inputSchema: {
                displayName: z.string().min(1).describe("Display name for the new app."),
                setAsCurrent: z.boolean().optional().describe("If true (default), set the new app as the session's current app and switch to app-token auth so follow-up tools can omit appId."),
                crawlUrl: z.string().optional().describe("Optional website URL to crawl and index into the new app's RAG sources."),
                followLink: z.boolean().optional().describe("For `crawlUrl`: also follow in-domain links (default true). Can ingest many pages."),
                docs: z.array(z.object({
                    name: z.string().min(1).describe("Document file name including extension."),
                    mimeType: z.string().min(1).describe("MIME type, e.g. `application/pdf`."),
                    base64: z.string().min(1).describe("Document content, base64-encoded."),
                })).optional().describe("Optional documents to ingest into the new app's RAG sources."),
                savedAgentId: z.string().optional().describe("Optional id of an existing saved agent to bind as the new app's active bot, instead of configuring prompt/LLM by hand."),
                enableBot: z.boolean().optional().describe("If true, set the new app's bot to `status: on` (best-effort AI service activation)."),
                botTrigger: z.string().optional().describe("Bot trigger: `/bot` (only /bot-prefixed messages) or `any_message` (every message)."),
                llmProvider: z.string().optional().describe("LLM provider for the bot, e.g. `openai` or `openai-compatible`. Must be enabled in your Ethora backend."),
                llmModel: z.string().optional().describe("LLM model id for the bot, e.g. `gpt-4o-mini`. Must be available for the chosen provider."),
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
            description: "Generate a ready-to-paste React `App.tsx` snippet that mounts `@ethora/chat-component`.\n\nAuth: none required — this is a pure code generator, makes no API calls.\nSide effects: none — returns the snippet as text; **does not write any file**.\nIdempotent: yes — same inputs produce the same snippet.\nFailure modes: effectively none.\nReturns: `{ filename: \"App.tsx\", snippet }`. Any values you don't pass are emitted as clearly-marked placeholders. Security note: the snippet includes `appToken` inline only as a quickstart convenience — do not ship hardcoded tokens to production; have your backend issue short-lived credentials instead.",
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
            description: "Generate `.env.example` templates for the three common Ethora integration targets: the frontend chat component, the backend SDK, and this MCP server.\n\nAuth: none required — pure text generator, makes no API calls.\nSide effects: none — returns templates as text; **does not write any file**.\nIdempotent: yes.\nFailure modes: effectively none.\nReturns: a single `{ target, template }` when `target` is given, or `{ templates }` with all three when omitted. Templates contain placeholder values and inline security notes only — never real credentials.",
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
            description: "Generate a human-readable runbook listing this server's tool calls in the right order for a B2B bootstrap, with example payloads.\n\nAuth: none required — pure text generator, makes no API calls and runs nothing.\nSide effects: none — returns the runbook as text; **does not write any file or execute any step**.\nIdempotent: yes.\nFailure modes: effectively none.\nReturns: the runbook text with your supplied values substituted into the example payloads. This is documentation only — to actually run the sequence use `ethora-run-recipe`, or the one-call orchestrators `ethora-b2b-app-bootstrap-ai` / `ethora-b2b-app-provision`.",
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
            description: "Crawl a website URL and ingest its content into an app's RAG sources (app-token / B2B variant of `ethora-sources-site-crawl`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: starts a crawl + embedding job; pages become queryable RAG context once indexing finishes (not synchronous — this returns once the job is accepted). With `followLink: true` the crawler also follows in-domain links and can ingest many pages.\nIdempotent: no — re-crawling adds/updates source records.\nFailure modes: 401/403 on missing/wrong auth; 400 if `url` is malformed; 404 if `appId` is invalid.\nRelated: `ethora-sources-site-crawl-v2-wait` (block until done), `ethora-sources-site-list-v2` (see results), `ethora-sources-site-reindex-v2` (refresh), `ethora-sources-site-delete-url-v2` (remove).",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to ingest into. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                url: z.string().min(1).describe("Absolute URL to crawl, e.g. `https://example.com/docs`."),
                followLink: z.boolean().optional().describe("If true, also crawl in-domain links reachable from `url`. Can ingest many pages — use with care."),
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
            description: "Re-crawl and re-embed a previously crawled URL by its `urlId`, refreshing its RAG content (app-token / B2B variant of `ethora-sources-site-reindex`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: starts a refresh job; the existing source record is updated in place once indexing finishes (not synchronous).\nIdempotent: effectively yes — re-running just refreshes again.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` or `urlId` is unknown.\nGet `urlId` values from `ethora-sources-site-list-v2`. Use `ethora-sources-site-reindex-v2-wait` to block until done.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the URL belongs to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                urlId: z.string().min(1).describe("Id of a previously crawled URL record. Get it from `ethora-sources-site-list-v2`."),
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
            description: "Crawl a website URL and block until the server finishes the request — a single-call, long-timeout variant of `ethora-sources-site-crawl-v2`.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: same as `ethora-sources-site-crawl-v2` (crawl + embed into RAG sources), but this MCP call blocks for up to `timeoutMs` waiting for the server's response instead of returning as soon as the job is accepted.\nIdempotent: no — re-crawling adds/updates source records.\nFailure modes: 401/403 on missing/wrong auth; 400 if `url` is malformed; 504/timeout if the crawl takes longer than `timeoutMs` (the job may still complete server-side — check with `ethora-sources-site-list-v2`).\nReturns: `{ done: true, durationMs, result }`. Use the non-wait `ethora-sources-site-crawl-v2` if you'd rather not block.",
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
            description: "Re-crawl and re-embed a previously crawled URL and block until the server finishes — a single-call, long-timeout variant of `ethora-sources-site-reindex-v2`.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: same as `ethora-sources-site-reindex-v2` (refresh the source record's RAG content), but this MCP call blocks for up to `timeoutMs`.\nIdempotent: effectively yes.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` or `urlId` is unknown; 504/timeout if it takes longer than `timeoutMs` (the job may still complete server-side).\nReturns: `{ done: true, durationMs, result }`. Get `urlId` values from `ethora-sources-site-list-v2`.",
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
            description: "List an app's crawled website sources, including each source's id, URL, and current RAG tags.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` is invalid; returns an empty list if nothing has been crawled.\nReturns: site source records. Their ids feed `ethora-sources-site-tags-update-v2`, `ethora-sources-site-delete-url-v2-batch`, and `ethora-sources-site-reindex-v2` (`urlId`).",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to list sources for. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
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
            description: "Set the RAG retrieval tags on a crawled website source. Tags let the bot's `ragTags` setting narrow which sources it retrieves from.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: **replaces** the source's tag set with the provided `tags` array (it is not additive — pass the full desired set, or an empty array to clear all tags).\nIdempotent: yes — re-sending the same tags is a no-op.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` or `sourceId` is unknown.\nGet `sourceId` values from `ethora-sources-site-list-v2`. The doc equivalent is `ethora-sources-docs-tags-update-v2`.",
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
            description: "Provision many Ethora users in one asynchronous batch job — the bulk equivalent of `ethora-user-register`.\n\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`).\nSide effects: enqueues a background job (server responds HTTP 202) — users are **not** created synchronously. Each user is created under the B2B tenant's app. With `bypassEmailConfirmation: true` users are usable immediately; otherwise each receives a verification email.\nIdempotent: no — re-running re-attempts creation; the job itself reports per-user conflicts (already-registered emails) rather than failing the whole batch.\nFailure modes: 401/403 if not in B2B mode; 422 if the `usersList` fails validation. Per-call limit: 1–100 users.\nReturns: `{ jobId, statusUrl }`. Track it with `ethora-users-batch-job-v2` (one-shot) or `ethora-wait-users-batch-job-v2` (poll to completion).",
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
            description: "Fetch the current status and per-user results of a users batch job by `jobId` (one-shot, no polling).\n\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`) — must match the auth used to create the job.\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: 401/403 if not in B2B mode; 404 if the `jobId` is unknown.\nReturns: the job object including its `state` (`pending` / `running` / `completed` / `failed`) and per-user outcomes (created / conflict / error). For a blocking wait-until-done, use `ethora-wait-users-batch-job-v2`.",
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
            description: "Block until a users batch job reaches a terminal state (`completed` or `failed`), or until a timeout — a convenience wrapper around repeated `ethora-users-batch-job-v2` calls.\n\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`) — must match the auth used to create the job.\nSide effects: none server-side — read-only polling. Blocks this MCP call for up to `timeoutMs`.\nIdempotent: yes.\nFailure modes: 401/403 if not in B2B mode; 404 if the `jobId` is unknown.\nReturns: `{ done: true, state, job }` when finished, or `{ done: false, reason: \"timeout\", job }` if `timeoutMs` elapsed first (the job may still finish later — re-check with `ethora-users-batch-job-v2`).",
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
            description: "List the app tokens issued for an app — **metadata only**, the secret token values are never returned.\n\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`).\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: 401/403 if not in B2B mode; 400 if no `appId` is given and none is selected; 404 if `appId` is invalid.\nReturns: token records with `tokenId`, label, created/rotated timestamps, and status. The actual token strings are only ever shown once, at create/rotate time (`ethora-app-tokens-create-v2`, `ethora-app-tokens-rotate-v2`).",
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
            description: "Mint a new app token for an app.\n\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`).\nSide effects: creates a new app token server-side. **The secret token value is returned exactly once in this response and cannot be retrieved again** — capture it immediately (e.g. store it, or pass it to `ethora-app-select`).\nIdempotent: no — each call mints a distinct token.\nFailure modes: 401/403 if not in B2B mode; 400 if no `appId` is given and none is selected; 404 if `appId` is invalid.\nReturns: the new token including its one-time secret value and its `tokenId`. Manage it later with `ethora-app-tokens-list-v2`, `ethora-app-tokens-rotate-v2`, `ethora-app-tokens-revoke-v2`.",
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
            description: "Rotate an app token: revoke an existing token and issue a replacement in one step.\n\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`).\nSide effects: the old `tokenId` is revoked **immediately** — anything still using it stops working at once — and a new token is created. **The new secret value is returned exactly once** — capture it immediately.\nIdempotent: no — each call revokes and re-issues.\nFailure modes: 401/403 if not in B2B mode; 404 if `appId` or `tokenId` is unknown; 400 if no `appId` is given and none is selected.\nReturns: the new token including its one-time secret value and `tokenId`. Use `ethora-app-tokens-revoke-v2` if you only want to revoke without a replacement.",
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
            description: "Permanently revoke an app token by `tokenId`.\n\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`).\nSide effects: the token stops working **immediately** — any client, SDK, or MCP session still using it will start getting auth failures. No replacement is issued (use `ethora-app-tokens-rotate-v2` for revoke-and-replace).\nIdempotent: yes — revoking an already-revoked token succeeds as a no-op.\nFailure modes: 401/403 if not in B2B mode; 404 if `appId` is unknown; 400 if no `appId` is given and none is selected.\nGet `tokenId` values from `ethora-app-tokens-list-v2`.",
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
            description: "One-call B2B orchestrator: create an app, mint one or more app tokens, provision default chat rooms, then configure and enable its AI bot.\n\nAuth: B2B mode (`ethora-auth-use-b2b` + a configured `b2bToken`). Internally uses the first minted app token for the bot/room steps.\nSide effects: runs several real operations in sequence — `appCreate` (B2B), `app-tokens-create` (×N), room creation (×N), bot configure/enable. Returns a per-step log; later-step failures don't undo earlier steps (the app and any tokens already exist).\nIdempotent: no — each call creates a new app, new tokens, and new rooms.\nFailure modes: aborts with the partial step log if app creation fails; the previous auth mode is restored best-effort on error.\nReturns: a per-step result log including `appId` and the created tokens (tokens are returned **once** — capture them). Sibling orchestrator `ethora-b2b-app-bootstrap-ai` does sources+bot but not tokens/rooms.",
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
            description: "Remove a single crawled URL from an app's RAG sources, matched by its exact url string (app-token / B2B variant of `ethora-sources-site-delete-url`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: deletes the source record and its embeddings; the bot can no longer answer from that page. Not reversible (re-add via `ethora-sources-site-crawl-v2`).\nIdempotent: yes — deleting an already-removed URL is a no-op / 404.\nFailure modes: 401/403 on missing/wrong auth; 404 if the exact `url` isn't a crawled source.\nMatches on the exact URL string — get the stored value from `ethora-sources-site-list-v2`. To delete several by id use `ethora-sources-site-delete-url-v2-batch`.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the URL belongs to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                url: z.string().min(1).describe("Exact crawled URL string to remove (must match what was stored — get it from `ethora-sources-site-list-v2`)."),
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
            description: "Bulk-remove crawled website sources from an app in one call, matched by their source record ids.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: deletes each matching source record and its embeddings. Not reversible.\nIdempotent: yes — ids not present are skipped.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` is invalid. Per-call limit: 1–100 ids.\nNote: this variant matches on **source ids** (not URL strings) — get them from `ethora-sources-site-list-v2`. For single-URL deletion by url string use `ethora-sources-site-delete-url-v2`.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the sources belong to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                ids: z.array(z.string().min(1)).min(1).max(100).describe("Site source record ids to delete, 1–100 per call. Get them from `ethora-sources-site-list-v2`."),
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
            description: "Upload documents (PDF, text, etc.) into an app's RAG sources (app-token / B2B variant of `ethora-sources-docs-upload`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: stores each document and starts a parse + embedding job; content becomes queryable RAG context once indexing finishes (not synchronous).\nIdempotent: no — re-uploading the same document creates another source record.\nInput design: files are base64 so the MCP server never reads your local filesystem. Client-side guardrail rejects any single file over 50MB; the server enforces its own limits too.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` is invalid; 413 if too large; 422 on an unsupported document type. Per-call limit: 1–5 files.\nRelated: `ethora-sources-docs-list-v2` (see results), `ethora-sources-docs-delete-v2` (remove), `ethora-sources-docs-tags-update-v2` (tag).",
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
            description: "Remove a previously ingested document from an app's RAG sources by `docId` (app-token / B2B variant of `ethora-sources-docs-delete`).\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: deletes the document record and its embeddings; the bot can no longer answer from it. Not reversible (re-add via `ethora-sources-docs-upload-v2`).\nIdempotent: yes after success — a second call returns 404.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` or `docId` is unknown.\nGet `docId` values from `ethora-sources-docs-list-v2`.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId the document belongs to. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
                docId: z.string().min(1).describe("Id of the ingested document to delete. Get it from `ethora-sources-docs-list-v2`."),
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
            description: "List an app's ingested documents, including each document's id, name, and current RAG tags.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: none — read-only.\nIdempotent: yes.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` is invalid; returns an empty list if nothing has been uploaded.\nReturns: document records. Their ids feed `ethora-sources-docs-tags-update-v2` and `ethora-sources-docs-delete-v2`. The website-sources equivalent is `ethora-sources-site-list-v2`.",
            inputSchema: {
                appId: z.string().optional().describe("24-char hex appId to list documents for. Required in B2B mode unless already set via `ethora-app-select`; ignored in app-token mode."),
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
            description: "Set the RAG retrieval tags on an ingested document. Tags let the bot's `ragTags` setting narrow which sources it retrieves from.\n\nAuth: app-token mode (after `ethora-app-select` + `ethora-auth-use-app`) OR B2B mode with an explicit `appId`.\nSide effects: **replaces** the document's tag set with the provided `tags` array (it is not additive — pass the full desired set, or an empty array to clear all tags).\nIdempotent: yes — re-sending the same tags is a no-op.\nFailure modes: 401/403 on missing/wrong auth; 404 if `appId` or `docId` is unknown.\nGet `docId` values from `ethora-sources-docs-list-v2`. The website-source equivalent is `ethora-sources-site-tags-update-v2`.",
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