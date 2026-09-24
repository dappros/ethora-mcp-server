// Backend auth requirements of the v2 endpoints this server calls, taken from
// ethora-backend services/api/src/routes/v2/index.js. Three middleware kinds
// matter for tool gating:
//
//   user        Authorization: Bearer <user access token> (login, register,
//               API key, OAuth). App tokens and B2B tokens are rejected.
//   tenantActor a B2B `x-custom-token` OR a user access token (likePassport).
//               App tokens are rejected.
//   app         Authorization: <app token> only.
//
// Endpoint                                              auth         tool mode
// /v2/agents, /v2/agents/:id[/...] (list/get/create/    user         user
//   update/clone/visibility/soul/delete/export/import,
//   bot-instances, test-message, leave-chat, invite)
// /v2/bot-instances[/:id[/status]]                      user         user
// /v2/apps/:appId/agents (list/create), .../invite      tenantActor  user | b2b
// /v2/apps/:appId/chats/* (list/create/messages/        tenantActor  user | b2b
//   messages/context/broadcast/users)
// /v2/apps/:appId/bot-instances, /messages/search,      tenantActor  user | b2b
//   /export, /sources/*, /tokens, /users/batch, /bot
// /v2/apps, /v2/apps/import, /v2/chats/broadcast        tenantActor  user | b2b
// /v2/bot, /v2/bot/widget, /v2/sources/* (no appId)     app          app
// /v2/agents/:id/activate                               app          app
//
// Rule of thumb for hosted sessions: stay in user mode; every tenant-scoped
// route has a /v2/apps/:appId/... variant that accepts the user token.

import { getClientState } from "./apiClientDappros.js"

/** Routes with authMw('tenantActor'): a user token or a B2B token, never an app token. */
export function ensureTenantActorAuth() {
    const state = getClientState() as any
    if (state.authMode === "app") {
        throw new Error("This tool does not accept app-token auth: the backend route wants a user token or a B2B token. Call `ethora-auth-mode-set` (you are already logged in) or `ethora-auth-mode-set`.")
    }
    if (state.authMode === "user" && !state.hasUserToken) {
        throw new Error("Not logged in. Call `ethora-user-login` or `ethora-user-register` first (or connect with an API key).")
    }
    if (state.authMode === "b2b" && !state.hasB2BToken) {
        throw new Error("B2B auth is selected but no b2bToken is configured. Set ETHORA_B2B_TOKEN or call `ethora-session-configure`.")
    }
}

/**
 * Ethora room JIDs are `${appId}_${chatId}` (optionally followed by
 * `@conference.<xmpp host>`). Tools accept either the full JID or the bare
 * chatId; this normalises both.
 */
export function splitRoomJid(roomJidOrChatId: string | undefined, fallbackAppId?: string): { appId: string; chatId: string; roomName: string; roomJid: string } {
    const raw = String(roomJidOrChatId || "").trim()
    if (!raw) throw new Error("A room is required: pass `roomJid` (`${appId}_${chatId}`) or `chatId`.")
    const local = raw.split("@")[0]
    const domain = raw.includes("@") ? raw.slice(raw.indexOf("@")) : ""
    const idx = local.indexOf("_")
    let appId = ""
    let chatId = local
    if (idx > 0 && /^[a-f0-9]{24}$/i.test(local.slice(0, idx))) {
        appId = local.slice(0, idx)
        chatId = local.slice(idx + 1)
    }
    if (!appId) appId = String(fallbackAppId || "").trim()
    if (!appId) throw new Error("Cannot determine the appId for this room: pass a full roomJid (`${appId}_${chatId}`) or select an app with `ethora-app-select`.")
    if (!chatId) throw new Error("Room id is empty.")
    const roomName = `${appId}_${chatId}`
    return { appId, chatId, roomName, roomJid: domain ? `${roomName}${domain}` : roomName }
}
