import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"
import { CallToolResult } from "@modelcontextprotocol/sdk/types"
import z from "zod"
import { appCreate, appCreateChat, appDelete, appDeleteChat, appGetDefaultRooms, appGetDefaultRoomsWithAppId, appList, appUpdate, apiPing, botGetV2, botUpdateV2, chatsBroadcastJobV2, chatsBroadcastV2, configureB2BToken, configureClient, filesDeleteV2, filesGetV2, filesUploadV2, getClientState, selectApp, setAuthMode, sourcesDocsDelete, sourcesDocsDeleteV2, sourcesDocsUpload, sourcesDocsUploadV2, sourcesSiteCrawl, sourcesSiteCrawlV2, sourcesSiteDeleteUrl, sourcesSiteDeleteUrlV2, sourcesSiteDeleteUrlV2Batch, sourcesSiteDeleteUrlV2Single, sourcesSiteReindex, sourcesSiteReindexV2, userLogin, userRegistration, walletERC20Transfer, walletGetBalance } from "./apiClientDappros.js"
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

function configureTool(server: McpServer) {
    server.registerTool(
        "ethora-configure",
        {
            description: "Configure Ethora API base URL and App JWT for this MCP session (in-memory).",
            inputSchema: {
                apiUrl: z.string().optional().describe("Ethora API URL (e.g. https://api.ethora.com/v1 or http://localhost:8080/v1)"),
                appJwt: z.string().optional().describe("Ethora App JWT (used for login/register endpoints)."),
                b2bToken: z.string().optional().describe("Ethora B2B token for x-custom-token auth (type=server)."),
            },
        },
        async function ({ apiUrl, appJwt, b2bToken }) {
            try {
                const state = configureClient({ apiUrl, appJwt })
                if (typeof b2bToken === "string") {
                    configureB2BToken(b2bToken)
                }
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
            description: "Show current Ethora MCP client state (configured base URL + auth presence).",
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

function doctorTool(server: McpServer) {
    server.registerTool(
        "ethora-doctor",
        {
            description: "Validate configuration and connectivity (pings /v1/ping via the configured API URL).",
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
                        message: "App JWT is missing (needed for ethora-user-login / ethora-user-register).",
                        action: "Set env ETHORA_APP_JWT (or ETHORA_APP_TOKEN) or call `ethora-configure` with appJwt.",
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
                        action: "Call `ethora-user-login` or switch to app-token auth via `ethora-auth-use-app`.",
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
            description: "Select the current app context (and optionally configure appToken). Many app-scoped tools can omit appId after this.",
            inputSchema: {
                appId: z.string().describe("Ethora appId to set as current context"),
                appToken: z.string().optional().describe("Optional App token/JWT for B2B auth. If provided, auth mode defaults to app-token."),
                authMode: z.enum(["app", "user"]).optional().describe("Explicitly set auth mode after selecting app."),
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
            description: "Fetch v2 broadcast job status/results. Requires app-token auth.",
            inputSchema: {
                jobId: z.string().describe("Broadcast job id"),
            },
        },
        async function ({ jobId }) {
            try {
                ensureAppAuthForTool()
                const res = await chatsBroadcastJobV2(jobId)
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
            description: "Poll broadcast job status until completed/failed (app-token auth).",
            inputSchema: {
                jobId: z.string().min(1),
                timeoutMs: z.number().int().min(1000).max(300000).optional().describe("Max wait time (default 60000)"),
                intervalMs: z.number().int().min(250).max(10000).optional().describe("Poll interval (default 1000)"),
            },
        },
        async function ({ jobId, timeoutMs, intervalMs }) {
            const meta = getDefaultMeta("ethora-wait-broadcast-job-v2")
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
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-site-delete-url-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-site-delete-url-v2")))
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
                let result = await appCreate(displayName)
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
                const res = await appCreate(displayName)
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
            description: "Get bot status/settings via GET /v2/bot (app-token auth).",
        },
        async function () {
            const meta = getDefaultMeta("ethora-bot-get-v2")
            try {
                ensureAppAuthForTool()
                const res = await botGetV2()
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
            description: "Update bot settings via PUT /v2/bot (app-token auth).",
            inputSchema: {
                status: z.enum(["on", "off"]).optional(),
                trigger: z.enum(["any_message", "/bot"]).optional(),
                prompt: z.string().optional(),
                greetingMessage: z.string().optional(),
                chatId: z.string().optional(),
                isRAG: z.boolean().optional(),
                botFirstName: z.string().optional(),
                botLastName: z.string().optional(),
            },
        },
        async function (payload) {
            const meta = getDefaultMeta("ethora-bot-update-v2")
            try {
                ensureAppAuthForTool()
                const res = await botUpdateV2(payload as any)
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
            description: "Enable bot via PUT /v2/bot (app-token auth).",
            inputSchema: { trigger: z.enum(["any_message", "/bot"]).optional() },
        },
        async function ({ trigger }) {
            const meta = getDefaultMeta("ethora-bot-enable-v2")
            try {
                ensureAppAuthForTool()
                const res = await botUpdateV2({ status: "on", trigger } as any)
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
            description: "Disable bot via PUT /v2/bot (app-token auth).",
        },
        async function () {
            const meta = getDefaultMeta("ethora-bot-disable-v2")
            try {
                ensureAppAuthForTool()
                const res = await botUpdateV2({ status: "off" } as any)
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
}) {
    const { displayName, setAsCurrent, crawlUrl, followLink, docs, enableBot, botTrigger } = args

    ensureB2BAuthForTool()

    const steps: any[] = []

    // 1) Create app (B2B)
    setAuthMode("b2b")
    const created = await appCreate(displayName)
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
    if (enableBot) {
        if (!appToken) throw new Error("enableBot requested but no appToken available for app-token bot management")
        setAuthMode("app")
        const payload: any = { status: "on" }
        if (botTrigger) payload.trigger = botTrigger
        const r = await botUpdateV2(payload)
        botEnableResult = r.data
        steps.push({ step: "botEnable", ok: true })
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
            description: "One-call B2B flow: create app → set context → index sources → enable bot (best-effort).",
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
                enableBot: z.boolean().optional().describe("If true, enables botStatus=on (best-effort AI service activation)"),
                botTrigger: z.string().optional().describe("Optional bot trigger (e.g. '/bot' or 'any_message')"),
            },
        },
        async function ({ displayName, setAsCurrent, crawlUrl, followLink, docs, enableBot, botTrigger }) {
            const meta = getDefaultMeta("ethora-b2b-app-bootstrap-ai")
            const prev = (getClientState() as any).authMode as any
            try {
                const res = await runB2BAppBootstrapAi({ displayName, setAsCurrent, crawlUrl, followLink, docs, enableBot, botTrigger })
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
                        `# Needed for login/register tools`,
                        `ETHORA_APP_JWT=JWT <APP_JWT_FOR_LOGIN_REGISTER>`,
                        `# Needed for partner automation (x-custom-token)`,
                        `ETHORA_B2B_TOKEN=JWT <B2B_SERVER_TOKEN>`,
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
                    `Payload: ${JSON.stringify({ displayName: displayName || "Acme AI Demo", crawlUrl: crawlUrl || "https://example.com", enableBot: true }, null, 2)}`,
                    ``,
                    `## 4) Optional: tune bot`,
                    `Call: ethora-auth-use-app`,
                    `Payload: {}`,
                    ``,
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
            description: "Reindex a crawled URL by urlId via /v2/sources/site-crawl-reindex (app-token auth).",
            inputSchema: {
                urlId: z.string().min(1),
            },
        },
        async function ({ urlId }) {
            try {
                ensureAppAuthForTool()
                const res = await sourcesSiteReindexV2({ urlId })
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-site-reindex-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-site-reindex-v2")))
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
            description: "Batch delete crawled URLs via /v2/sources/site-crawl-v2/url (app-token auth).",
            inputSchema: {
                urls: z.array(z.string().min(1)).min(1).max(100),
            },
        },
        async function ({ urls }) {
            try {
                ensureAppAuthForTool()
                const res = await sourcesSiteDeleteUrlV2Batch({ urls })
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
            description: "Delete an ingested doc by docId via /v2/sources/docs/:docId (app-token auth).",
            inputSchema: {
                docId: z.string().min(1),
            },
        },
        async function ({ docId }) {
            try {
                ensureAppAuthForTool()
                const res = await sourcesDocsDeleteV2(docId)
                return asToolResult(ok(res.data, getDefaultMeta("ethora-sources-docs-delete-v2")))
            } catch (error) {
                return asToolResult(fail(error, getDefaultMeta("ethora-sources-docs-delete-v2")))
            }
        }
    )
}

export function registerTools(server: McpServer) {
    configureTool(server);
    statusTool(server);
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
    sourcesSiteDeleteUrlV2AppTool(server);
    sourcesDocsUploadV2AppTool(server);
    sourcesDocsDeleteV2AppTool(server);
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
    b2bAliases(server);
    b2bAppBootstrapAiTool(server);
    generateChatComponentAppTsxTool(server);
    generateEnvExamplesTool(server);
    generateB2BBootstrapRunbookTool(server);
}