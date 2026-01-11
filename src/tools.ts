import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"
import { CallToolResult } from "@modelcontextprotocol/sdk/types"
import z from "zod"
import { appCreate, appCreateChat, appDelete, appDeleteChat, appGetDefaultRooms, appGetDefaultRoomsWithAppId, appList, appUpdate, chatsBroadcastJobV2, chatsBroadcastV2, configureClient, filesDeleteV2, filesGetV2, filesUploadV2, getClientState, selectApp, setAuthMode, sourcesDocsDelete, sourcesDocsDeleteV2, sourcesDocsUpload, sourcesDocsUploadV2, sourcesSiteCrawl, sourcesSiteCrawlV2, sourcesSiteDeleteUrl, sourcesSiteDeleteUrlV2, sourcesSiteDeleteUrlV2Batch, sourcesSiteDeleteUrlV2Single, sourcesSiteReindex, sourcesSiteReindexV2, userLogin, userRegistration, walletERC20Transfer, walletGetBalance } from "./apiClientDappros.js"

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

function requireCurrentAppId() {
    const state = getClientState() as any
    const appId = String(state.currentAppId || "").trim()
    if (!appId) {
        throw new Error("No current app selected. Call `ethora-app-select` first (or pass appId where supported).")
    }
    return appId
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

function configureTool(server: McpServer) {
    server.registerTool(
        "ethora-configure",
        {
            description: "Configure Ethora API base URL and App JWT for this MCP session (in-memory).",
            inputSchema: {
                apiUrl: z.string().optional().describe("Ethora API URL (e.g. https://api.ethora.com/v1 or http://localhost:8080/v1)"),
                appJwt: z.string().optional().describe("Ethora App JWT (used for login/register endpoints)."),
            },
        },
        async function ({ apiUrl, appJwt }) {
            try {
                const state = configureClient({ apiUrl, appJwt })
                return { content: [{ type: "text", text: JSON.stringify(state) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
            }
        }
    )
}

function statusTool(server: McpServer) {
    server.registerTool(
        "ethora-status",
        {
            description: "Show current Ethora MCP client state (configured base URL + auth presence).",
        },
        async function () {
            try {
                return { content: [{ type: "text", text: JSON.stringify(getClientState()) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
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
                return { content: [{ type: "text", text: JSON.stringify(setAuthMode("app")) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
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
                return { content: [{ type: "text", text: JSON.stringify(setAuthMode("user")) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
            }
        }
    )
}

function appSelectTool(server: McpServer) {
    server.registerTool(
        "ethora-app-select",
        {
            description: "Select the current app context (and optionally configure appToken). Many app-scoped tools can omit appId after this.",
            inputSchema: {
                appId: z.string().describe("Ethora appId to set as current context"),
                appToken: z.string().optional().describe("Optional App token/JWT for B2B auth. If provided, auth mode defaults to app-token."),
                authMode: z.enum(["app", "user"]).optional().describe("Explicitly set auth mode after selecting app."),
            },
        },
        async function ({ appId, appToken, authMode }) {
            try {
                return { content: [{ type: "text", text: JSON.stringify(selectApp({ appId, appToken, authMode })) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
            }
        }
    )
}

function chatsBroadcastTool(server: McpServer) {
    server.registerTool(
        "ethora-chats-broadcast-v2",
        {
            description: "Enqueue a v2 broadcast job (XMPP system message) for an app. Requires app-token auth.",
            inputSchema: {
                // backend supports targeting by allRooms OR chatIds/chatNames
                text: z.string().min(1).describe("Message text to broadcast"),
                allRooms: z.boolean().optional().describe("If true, broadcast to all rooms in the app"),
                chatIds: z.array(z.string()).optional().describe("Optional list of chatIds to target"),
                chatNames: z.array(z.string()).optional().describe("Optional list of chat JIDs/localparts to target"),
            },
        },
        async function ({ text, allRooms, chatIds, chatNames }) {
            try {
                ensureAppAuthForTool()
                const payload: any = { text }
                if (typeof allRooms === "boolean") payload.allRooms = allRooms
                if (chatIds?.length) payload.chatIds = chatIds
                if (chatNames?.length) payload.chatNames = chatNames

                const res = await chatsBroadcastV2(payload)
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
            }
        }
    )
}

function chatsBroadcastJobTool(server: McpServer) {
    server.registerTool(
        "ethora-chats-broadcast-job-v2",
        {
            description: "Fetch v2 broadcast job status/results. Requires app-token auth.",
            inputSchema: {
                jobId: z.string().describe("Broadcast job id"),
            },
        },
        async function ({ jobId }) {
            try {
                ensureAppAuthForTool()
                const res = await chatsBroadcastJobV2(jobId)
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
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
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
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
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
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
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
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
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
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
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
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
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
            }
        }
    )
}

function sourcesSiteDeleteUrlV2Tool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-delete-url-v2",
        {
            description: "Delete multiple crawled URLs (requires user auth).",
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
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
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
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
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
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
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
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: errorToText(error) }]
                }
                return toolRes
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

                        return {
                            content: [{ type: "text", text: `Error: ${errorData.error}` }]
                        }
                    }

                } else {
                    return {
                        content: [{ type: "text", text: 'An error occurred during user registration.' }]
                    }
                }
            }

            return {
                content: [{ type: "text", text: `Operation successful. Please follow the link in your email to complete the registration.` }]
            }
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
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: errorToText(error) }]
                }
                return toolRes
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
                let result = await appCreate(displayName)
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: errorToText(error) }]
                }
                return toolRes
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
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: errorToText(error) }]
                }
                return toolRes
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
                botStatus: z.enum(["on", "off"]).describe("Set the bot status to on or off, if on bot is enabled")
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
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: errorToText(error) }]
                }
                return toolRes
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
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: errorToText(error) }]
                }
                return toolRes
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
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: errorToText(error) }]
                }
                return toolRes
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
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: errorToText(error) }]
                }
                return toolRes
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
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: errorToText(error) }]
                }
                return toolRes
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
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: errorToText(error) }]
                }
                return toolRes
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
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: errorToText(error) }]
                }
                return toolRes
            }
        }
    )
}

function sourcesSiteCrawlV2AppTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-crawl-v2",
        {
            description: "Crawl a site URL via /v2/sources/site-crawl (app-token auth; no user credentials).",
            inputSchema: {
                url: z.string().min(1),
                followLink: z.boolean().optional(),
            },
        },
        async function ({ url, followLink }) {
            try {
                ensureAppAuthForTool()
                const res = await sourcesSiteCrawlV2({ url, followLink })
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
            }
        }
    )
}

function sourcesSiteReindexV2AppTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-reindex-v2",
        {
            description: "Reindex a crawled URL by urlId via /v2/sources/site-crawl-reindex (app-token auth).",
            inputSchema: {
                urlId: z.string().min(1),
            },
        },
        async function ({ urlId }) {
            try {
                ensureAppAuthForTool()
                const res = await sourcesSiteReindexV2({ urlId })
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
            }
        }
    )
}

function sourcesSiteDeleteUrlV2AppTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-delete-url-v2",
        {
            description: "Delete a crawled site URL via /v2/sources/site-crawl/url (app-token auth).",
            inputSchema: {
                url: z.string().min(1),
            },
        },
        async function ({ url }) {
            try {
                ensureAppAuthForTool()
                const res = await sourcesSiteDeleteUrlV2Single({ url })
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
            }
        }
    )
}

function sourcesSiteDeleteUrlV2BatchAppTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-site-delete-url-v2-batch",
        {
            description: "Batch delete crawled URLs via /v2/sources/site-crawl-v2/url (app-token auth).",
            inputSchema: {
                urls: z.array(z.string().min(1)).min(1).max(100),
            },
        },
        async function ({ urls }) {
            try {
                ensureAppAuthForTool()
                const res = await sourcesSiteDeleteUrlV2Batch({ urls })
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
            }
        }
    )
}

function sourcesDocsUploadV2AppTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-docs-upload-v2",
        {
            description: "Upload docs for ingestion via /v2/sources/docs (app-token auth). Input is base64.",
            inputSchema: {
                files: z.array(z.object({
                    name: z.string().min(1),
                    mimeType: z.string().min(1),
                    base64: z.string().min(1),
                })).min(1).max(5),
            },
        },
        async function ({ files }) {
            try {
                ensureAppAuthForTool()
                const form = new FormData()
                for (const f of files) {
                    const buf = normalizeBase64ToBuffer(f.base64)
                    if (buf.length > 50 * 1024 * 1024) {
                        throw new Error(`File '${f.name}' exceeds 50MB limit`)
                    }
                    const blob = new Blob([buf], { type: f.mimeType })
                    form.append("files", blob, f.name)
                }
                const res = await sourcesDocsUploadV2(form, { "Content-Type": "multipart/form-data" })
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
            }
        }
    )
}

function sourcesDocsDeleteV2AppTool(server: McpServer) {
    server.registerTool(
        "ethora-sources-docs-delete-v2",
        {
            description: "Delete an ingested doc by docId via /v2/sources/docs/:docId (app-token auth).",
            inputSchema: {
                docId: z.string().min(1),
            },
        },
        async function ({ docId }) {
            try {
                ensureAppAuthForTool()
                const res = await sourcesDocsDeleteV2(docId)
                return { content: [{ type: "text", text: JSON.stringify(res.data) }] }
            } catch (error) {
                return { content: [{ type: "text", text: errorToText(error) }] }
            }
        }
    )
}

export function registerTools(server: McpServer) {
    configureTool(server);
    statusTool(server);
    authUseAppTool(server);
    authUseUserTool(server);
    appSelectTool(server);
    chatsBroadcastTool(server);
    chatsBroadcastJobTool(server);
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
    sourcesSiteDeleteUrlV2AppTool(server);
    sourcesSiteDeleteUrlV2BatchAppTool(server);
    sourcesDocsUploadV2AppTool(server);
    sourcesDocsDeleteV2AppTool(server);
    userLoginWithEmailTool(server);
    userRegisterWithEmailTool(server);
    appListTool(server);
    appCreateTool(server);
    appDeleteTool(server);
    appUpdateTool(server);
    appGetDefaultRoomsTool(server);
    craeteAppChatTool(server);
    appDeleteChatTool(server);
    getDefaultRoomsWithAppIdTool(server);
    walletGetBalanceTool(server);
    walletERC20TransferTool(server);
}