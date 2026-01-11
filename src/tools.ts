import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"
import { CallToolResult } from "@modelcontextprotocol/sdk/types"
import z from "zod"
import { appCreate, appCreateChat, appDelete, appDeleteChat, appGetDefaultRooms, appGetDefaultRoomsWithAppId, appList, appUpdate, configureClient, getClientState, selectApp, setAuthMode, userLogin, userRegistration, walletERC20Transfer, walletGetBalance } from "./apiClientDappros.js"

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

export function registerTools(server: McpServer) {
    configureTool(server);
    statusTool(server);
    authUseAppTool(server);
    authUseUserTool(server);
    appSelectTool(server);
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