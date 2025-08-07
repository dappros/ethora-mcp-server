import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"
import { CallToolResult } from "@modelcontextprotocol/sdk/types"
import z from "zod"
import { appCreate, appCreateChat, appDelete, appDeleteChat, appGetDefaultRooms, appList, appUpdate, userLogin, userRegistration } from "./apiClientDappros.js"

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
                    content: [{ type: "text", text: "error: network error" }]
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
                    content: [{ type: "text", text: "error: network error" }]
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
                    content: [{ type: "text", text: "error: network error" }]
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
                    content: [{ type: "text", text: "error: network error" }]
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
                appId: z.string().describe("appId for app"),
                displayName: z.string().optional().describe("displayName of the application"),
                domainName: z.string().optional().describe("If the domainName is set to 'abcd', your web application will be available at abcd.ethora.com."),
                appDescription: z.string().optional().describe("Set the application description"),
                primaryColor: z.string().optional().describe("Set thie color of the application in #F54927 format"),
                botStatus: z.enum(["on", "off"]).describe("Set the bot status to on or off, if on bot is enabled")
            }
        },
        async function ({ appId, displayName, domainName, appDescription, primaryColor, botStatus }) {
            try {
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
                let result = await appUpdate(appId, changes)
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: "error: network error" }]
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
                    content: [{ type: "text", text: "error: network error" }]
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
                appId: z.string().describe("appId for app"),
                title: z.string().describe("title for chat"),
                pinned: z.boolean().describe("pinned for chat"),
            }
        },
        async function ({ appId, title, pinned }) {
            try {
                let result = await appCreateChat(appId, title, pinned)
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: "error: network error" }]
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
                appId: z.string().describe("appId for app"),
                chatJid: z.string().describe("title for chat"),
            }
        },
        async function ({ appId, chatJid }) {
            try {
                let result = await appDeleteChat(appId, chatJid)
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: JSON.stringify(result.data) }]
                }
                return toolRes
            } catch (error) {
                let toolRes: CallToolResult = {
                    content: [{ type: "text", text: "error: network error" }]
                }
                return toolRes
            }
        }
    )
}

export function registerTools(server: McpServer) {
    userLoginWithEmailTool(server);
    userRegisterWithEmailTool(server);
    appListTool(server);
    appCreateTool(server);
    appDeleteTool(server);
    appUpdateTool(server);
    appGetDefaultRoomsTool(server);
    craeteAppChatTool(server);
    appDeleteChatTool(server);
}